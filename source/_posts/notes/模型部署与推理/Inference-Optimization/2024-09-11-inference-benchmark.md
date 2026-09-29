---
title: "推理性能度量：吞吐、延迟与首 token 时间"
date: 2024-09-11
categories:
  - [模型部署与推理, Inference-Optimization]
tags: [推理优化, 性能度量]
description: "优化前先会测：延迟、吞吐、TTFT、并发曲线——推理性能的四把尺子与测试方法。"
abbrlink: 2502766995
---

推理优化做得对不对，不能靠"感觉变快了"。这一篇建立推理性能的度量体系：**测什么指标、怎么测、怎么看结果**。没有这把尺子，前面的 KV Cache、批处理、投机解码全是空中楼阁。

## 四个核心指标

| 指标 | 含义 | 服务类型的关注度 |
| --- | --- | --- |
| **TTFT**（首 token 时间） | 请求发出到第一个字返回 | 交互型最关心（"转圈多久"） |
| **TPOT / ITL**（每 token 间隔） | 后续每个字之间隔多久 | 流式体验（打字机是否流畅） |
| **总延迟** | 整个请求完成耗时 | 交互型 |
| **吞吐（Tokens/s）** | 单位时间生成的总 token 数 | 批量型最关心（成本） |

**交互型服务盯延迟，批量型服务盯吞吐**——两个服务形态的优化目标不同（优化全景篇已提），度量侧重点也随之不同。

## 度量工具：压测脚本

真实的性能测试必须**并发压测**（串行请求测不出引擎价值）。用 vLLM + OpenAI 客户端写个简单压测：

```python
import asyncio, time, statistics
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

async def one(concurrency):
    t0 = time.perf_counter()
    resp = await client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct",
        messages=[{"role": "user", "content": "用一段话解释 RAG"}],
        max_tokens=128,          # 固定输出长度，才有可比性
    )
    dt = time.perf_counter() - t0
    n_tokens = resp.usage.completion_tokens
    return dt, n_tokens

async def bench(concurrency: int, n_requests: int = 100):
    latencies, tokens = [], []
    for i in range(0, n_requests, concurrency):
        batch = [one(concurrency) for _ in range(min(concurrency, n_requests - i))]
        for dt, nt in await asyncio.gather(*batch):
            latencies.append(dt); tokens.append(nt)
    total_tokens = sum(tokens)
    total_time = max(latencies)
    print(f"并发={concurrency}: p50={statistics.median(latencies):.2f}s "
          f"p95={sorted(latencies)[int(len(latencies)*0.95)]:.2f}s "
          f"吞吐={total_tokens/total_time:.0f} tok/s")

asyncio.run(bench(1))     # 串行基线
asyncio.run(bench(32))    # 32 并发（引擎价值在这里显现）
```

**测试纪律**：

1. **固定输出长度**（max_tokens）——否则长短不一的请求没法比；
2. **看 p50/p95，不看平均**——平均会被极端值带偏；
3. **逐级加压**（1→8→32→64 并发）——画出延迟与吞吐随并发变化的曲线，才知道系统的甜点和极限。

## 看并发曲线：吞吐与延迟的权衡

压测后把不同并发下的结果画成曲线，会看到规律：

```text
低并发区：吞吐随并发线性涨（GPU 还没吃饱）
甜点区：吞吐继续涨、延迟还可接受
过载区：延迟暴涨、吞吐停滞甚至下降（队列堆积）
```

**生产调优的本质是找甜点**：你的并发预期落在哪、p95 延迟能不能接受。vLLM 的 `--max-num-seqs` 等参数就是用来把系统控制在甜点区的。

## TTFT 怎么单独测

流式接口要单独测首 token 时间（total 延迟会掩盖它）：

```python
t0 = time.perf_counter()
resp = await client.chat.completions.create(..., stream=True)
first = True
async for chunk in resp:
    if first and chunk.choices[0].delta.content:
        print(f"TTFT: {(time.perf_counter()-t0)*1000:.0f} ms")
        first = False
```

TTFT 主要受**预填充（Prefill）长度**影响：prompt 越长 TTFT 越久。RAG 场景把大段检索上下文塞进 prompt 时，TTFT 会明显上升——这是检索增强与延迟的直接冲突点。

## 常见坑

| 坑 | 后果 | 对策 |
| --- | --- | --- |
| 只测串行 | 低估引擎价值 | 必须并发压测 |
| 只报平均延迟 | 长尾问题被掩盖 | 报 p50/p95 |
| 测试 prompt 太短 | 低估 Prefill 开销 | 用接近生产的 prompt 长度 |
| 输出长度不固定 | 数据不可比 | 固定 max_tokens |
| 同机压测（客户端与服务端同机） | 抢占算力 | 客户端与推理机分开 |

## 小结

推理度量四把尺：**TTFT 管首字、ITL 管流式、总延迟管体验、吞吐管成本**。方法铁律：并发压测、看 p50/p95、固定输出长度、逐级加压看曲线。先把这把尺子立起来，再谈优化——这也解释了为什么专业团队都把 benchmark 脚本当基础设施维护。

推理优化的方法论篇到此收官。接下来从"优化原理"进入"工具实战"：模型量化——用精度换显存与速度最直接的手段。
