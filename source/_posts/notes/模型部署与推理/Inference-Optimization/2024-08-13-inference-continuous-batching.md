---
title: "连续批处理与动态调度"
date: 2024-08-13
categories:
  - [模型部署与推理, Inference-Optimization]
tags: [推理优化, 批处理]
description: "静态批处理让 GPU 空转，连续批处理在 token 粒度动态拼批——吞吐提升的引擎级手段。"
abbrlink: 1301934435
---

KV Cache 解决了单请求的重复计算，但多个并发请求仍可能让 GPU 闲着：每个请求解码速度不同，有的快有的慢，一起等最慢的？浪费。**连续批处理（Continuous Batching）**是推理引擎把吞吐拉高 5~20 倍的核心机制。这一篇讲清它和传统静态批处理的区别。

## 静态批处理的问题：短板效应

最简单的批处理：攒够 N 个请求，一起前向，一起结束。问题立刻暴露——**一个批里只要有请求生成长、别的生成短，短的也要等长的全部结束才能释放**：

```text
静态批：A(要生成200词) B(只生成10词) 同时进批
→ B 生成完 10 词也只能干等 A 生成完 200 词 → GPU 在空转等 A
```

另一个浪费：请求长短不一，要 padding 到一样长，填充的全是无效计算。

## 连续批处理：token 粒度动态拼批

连续批处理（也叫 iteration-level scheduling）的思路：**不再按"整个请求"调度，而是按"每一步"调度**——每一轮解码，把所有"此刻需要算下一个 token"的请求动态拼成一个批：

```text
第 t 轮：批里是 [A,B,C]（都还在生成）
第 t+1 轮：B 生成完了 → 移出批，把新来的 D 补进来
         → 批变成 [A,C,D]——GPU 每轮都在服务最多请求
```

效果：

1. **没有短板效应**：生成完的请求立刻让位，新请求随时插队，GPU 每轮都满载；
2. **无需 padding**：每个请求按自己进度走，不强制对齐；
3. **吞吐跃升**：同样硬件，吞吐可提升 5~20 倍（vLLM 官方对比 HuggingFace/静态方案的数字）。

## 谁在调度：推理引擎的调度器

连续批处理不是写几行代码就能实现的——它需要引擎级调度器。调度器维护所有进行中的请求，每轮决定：

```text
哪些请求该算下一步（还没生成完的）
哪些新请求能进批（显存够不够放它的 KV Cache）
哪些请求该被换出/抢占（显存不足时）
```

```python
# 伪代码：调度器每轮的决策
def schedule_round(active_requests, waiting_requests):
    batch = []
    for req in active_requests:      # 没生成完的继续
        if req.not_finished and kv_memory_available(req):
            batch.append(req)
    while waiting_requests and kv_memory_available():
        batch.append(waiting_requests.pop())   # 新请求插进来
    return batch                     # 这批一起做一次前向
```

这也解释了为什么 vLLM 这类引擎"调度不可见却价值巨大"——**吞吐的提升来自引擎内部对每一步的调度，而不是模型本身**。

## KV Cache 显存是调度的硬约束

连续批处理能拼多大批，取决于**KV Cache 显存**（见 KV Cache 篇）：每个请求占一段 KV 显存，显存耗尽就不能再接新请求。调度器因此总在权衡：**新请求的收益 vs KV 显存的消耗**。这也是为什么：

- 调大 `max-model-len` 会减少可并行请求数；
- vLLM 的 KV 显存利用率（PagedAttention）直接影响并发上限。

## 用 vLLM 体验连续批处理

连续批处理已被 vLLM 等引擎内建，你不需要自己实现，只需要并发请求就能吃到红利：

```python
import asyncio
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

async def ask(i):
    resp = await client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct",
        messages=[{"role": "user", "content": f"问题 {i}：解释一下 RAG"}],
        max_tokens=64,
    )
    return resp.choices[0].message.content

# 同时发 100 个请求——引擎内部用连续批处理把它们高效拼批
async def main():
    results = await asyncio.gather(*[ask(i) for i in range(100)])
    print(f"完成 {len(results)} 个并发请求")

asyncio.run(main())
```

**测试吞吐的正确姿势是并发，不是串行**——引擎的价值在并发下才显现。

## 小结

连续批处理把调度的粒度从"请求"细化到"token 步"：**每轮动态拼批、完成即让位、新请求随时补入**，GPU 永不空转，吞吐提升 5~20 倍。它需要引擎级调度器支持，KV 显存是调度的硬约束。这是推理引擎（vLLM）相对朴素方案的最大价值来源，也是并发测试必要性的原因。

批处理把吞吐拉满了，但单个请求的延迟还在。下一篇换个思路：投机解码——让大模型一次"猜"好几个 token。
