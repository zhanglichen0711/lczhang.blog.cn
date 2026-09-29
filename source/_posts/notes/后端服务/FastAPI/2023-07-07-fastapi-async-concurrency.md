---
title: "FastAPI 异步与并发"
date: 2023-07-07
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, 异步, 并发]
description: "async def 与普通 def 怎么选，等待时不阻塞、并发别串行、外部调用必须限流和超时。"
abbrlink: 1515942306
---

AI 服务的接口大多在"等"：等数据库、等向量库、等大模型。一个请求可能占住好几秒。如果框架处理不好等待，这几秒里 CPU 空转、线程被占满，后面的请求全部排队。FastAPI 的异步模型就是为了让"等待"不成为瓶颈。这一篇把最容易被误解的点讲清楚。

## 先纠正一个误解

很多人以为 `async def` 能让代码"跑得更快"。**不是**。`async def` 的价值是：**在等待 I/O 时主动让出，让事件循环去处理别的请求**——提升的是并发吞吐，不是单次速度。

类比餐厅：服务员（事件循环）给客人 A 点完单（发起请求）后，不需要站在 A 桌等菜做好，而是转身去服务 B、C。做菜（I/O）的时间被重叠利用了。

## async def 还是 def

FastAPI 的判断规则很简单，记两句话：

- 路由里做**等待型**操作（调 HTTP 接口、查数据库、读网络、调大模型）→ 用 `async def`；
- 路由里做 **CPU 密集**计算（本地跑模型推理、大批量处理数据）→ 用普通 `def`，FastAPI 会把它丢到线程池里跑，不阻塞事件循环。

```python
import httpx


@app.get("/proxy")          # 等待外部 HTTP → 异步
async def proxy():
    async with httpx.AsyncClient() as client:
        r = await client.get("https://api.example.com/data")
    return r.json()


@app.get("/local")          # 本地 CPU 重计算 → 普通 def，走线程池
def local():
    result = heavy_local_compute()
    return {"result": result}
```

**最常见的反模式**：`async def` 里写 `time.sleep(3)`。`time.sleep` 是同步阻塞，放在异步函数里会真的卡死整个事件循环三秒——期间**所有**请求都进不来。要模拟等待必须用异步版本 `await asyncio.sleep()`：

```python
import asyncio
import time


@app.get("/wrong")
async def wrong():
    time.sleep(3)          # 灾难：阻塞整个进程 3 秒

@app.get("/right")
async def right():
    await asyncio.sleep(3) # 正确：让出，期间别人能跑
```

## 多个独立等待：别串行

调大模型发 3 个互相独立的问题，最差的写法是一个个等：

```python
# 反模式：总耗时 = 3 个请求之和
answers = []
for q in questions:
    answers.append(await llm.acomplete(q))
```

`await` 会把循环变成串行——第 2 个问题要等第 1 个回来才开始。用 `asyncio.gather` 同时发出，总耗时 ≈ 最慢的那一个：

```python
async def ask_all(questions: list[str]) -> list[str]:
    async with httpx.AsyncClient(timeout=30) as client:
        async def one(q: str):
            r = await client.post(
                "http://llm:8000/v1/chat",
                json={"question": q},
            )
            return r.json()["answer"]

        return await asyncio.gather(*(one(q) for q in questions))
```

经验法则：**多个等待之间没有依赖关系，就并发；有依赖（下一步要上一步的结果），才串行**。典型的 RAG 检索多路召回（关键词 + 向量 + 知识图谱并行查，再合并）就是 gather 的用武之地。

## 并发要限流：Semaphore

`gather` 会一次性把任务全发出去。如果问题有 100 个，上游大模型服务会被瞬间打爆。给并发上限用 `Semaphore`：

```python
async def ask_many(questions: list[str], limit: int = 5) -> list[str]:
    sem = asyncio.Semaphore(limit)
    async with httpx.AsyncClient(timeout=30) as client:
        async def one(q: str):
            async with sem:              # 同时最多 limit 个在飞
                r = await client.post("http://llm:8000/v1/chat", json={"question": q})
                return r.json()["answer"]

        return await asyncio.gather(*(one(q) for q in questions))
```

`Semaphore` 相当于并发闸门：放行 `limit` 个，其余排队等空位。调外部付费 API 时这几乎是必配——不然一个批量任务就能刷爆配额。

## 超时必须有

外部调用不设超时，等于在进程里养僵尸请求：服务挂着、连接占着、用户永远等不到结果。用 `asyncio.timeout` 兜底（Python 3.11+）：

```python
import asyncio

from fastapi import HTTPException


async def call_llm(prompt: str) -> str:
    try:
        async with asyncio.timeout(30):          # 30 秒内必须返回
            return await llm.acomplete(prompt)
    except TimeoutError:
        raise HTTPException(status_code=504, detail="模型服务超时")
```

超时之后还要能兜住异常——把 `TimeoutError` 转成 504，调用方拿到明确信号而不是傻等。**任何一条离开本服务的调用，都要问自己一句：它最长等多久？等不到怎么办？**

## 判断口诀汇总

| 场景 | 写法 |
| --- | --- |
| 等待 HTTP / 数据库 / LLM | `async def` + `await` |
| 本地 CPU 密集计算 | 普通 `def`（框架走线程池） |
| 多个相互独立的等待 | `asyncio.gather` 并发 |
| 上游扛不住并发 | `asyncio.Semaphore` 限流 |
| 外部可能不响应 | 必须设超时，超时转明确错误码 |

## 小结

异步不是让代码变快，而是**把等待时间重叠起来**。选对 `async def` / `def`、并发不串行、并发必限流、调用必超时——这四条做到，你的服务在"一堆请求都在等大模型"的高压下才不会崩。

并发模型理顺后，下一篇做真章：用 SSE 把大模型的回答一个字一个字推给用户，先看到字、再等它说完。
