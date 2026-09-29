---
title: "量化实战：跑起一个 4bit 模型"
date: 2024-12-07
categories:
  - [模型部署与推理, Quantization]
tags: [模型量化, 实战]
description: "选模型、下权重、起服务、做评测——把 7B 模型跑进 4GB 显存的完整实战。"
abbrlink: 3173496541
---

量化系列前五篇把原理与评估讲完，这一篇落地：**在一张显存有限的卡上，把一个 7B 模型以 4bit 跑起来，并验证它质量可接受**。全程使用现成工具，你会看到"量化"在今天已经是被工程化的能力——你负责选型与验证，工具负责实现。

## 选模型：优先量化友好的现成权重

选型顺序：

1. **首选社区已量化好的版本**（省掉自己量化的环节）——HF 上带 `-AWQ`/`-GPTQ` 后缀的模型；
2. 没有现成的私有/小众模型，才自己量化；
3. 优先 Qwen、Llama 这类量化生态成熟、社区验证多的系列。

```python
# 以 Qwen2.5-7B 的 AWQ 版为例（社区已验证）
model_id = "Qwen/Qwen2.5-7B-Instruct-AWQ"   # 约 4GB 权重
```

## 用 vLLM 直接起 4bit 服务

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --quantization awq \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192
```

启动时观察显存：

```bash
nvidia-smi
# 7B AWQ：模型约 4GB + KV Cache + 运行时开销 ≈ 6~7GB
# 对比 FP16 的 ~15GB——一张 8GB 卡现在能跑了
```

没有现成 AWQ 权重时，用 AutoGPTQ 自己量化（见 GPTQ/AWQ 篇），或退一步用社区 8bit 版本先验证流程。

## 验证服务可用

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct-AWQ",
    "messages": [{"role": "user", "content": "用一句话解释什么是 RAG"}],
    "max_tokens": 128
  }'
```

## 跑正式评估：质量与性能双验证

**质量**（用评估篇的方法）：

```python
# 同一个领域评测集，对比两版：
#   FP16（如果显存允许跑基线）或 vs 量化前该模型的公开得分
eval_questions = [...]        # 你的 50~100 条领域题
answers_int4 = evaluate("http://localhost:8000/v1", eval_questions)
# 检查：答案正确率、格式合规率、边界题表现
```

**性能**（用压测脚本）：

```python
import asyncio, time, statistics
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

async def one():
    t0 = time.perf_counter()
    r = await client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct-AWQ",
        messages=[{"role": "user", "content": "解释 RAG"}],
        max_tokens=128)
    return time.perf_counter() - t0

async def bench(n=50):
    ts = await asyncio.gather(*[one() for _ in range(n)])
    print(f"p50={statistics.median(ts):.2f}s  p95={sorted(ts)[int(n*0.95)]:.2f}s")

asyncio.run(bench())
```

## 一张表记录结果并做决策

把结果整理成对比表（这是量化实战的最终交付物）：

| 版本 | 显存 | 吞吐 | 质量分 | 决策 |
| --- | --- | --- | --- | --- |
| FP16 | ~15GB | 基线 | 基线 | 显存不足，不可用 |
| **INT4 (AWQ)** | ~6GB | +30~50% | -2% | ✅ 可接受，上线 |

**决策规则**：显存能装下 + 质量退化在业务容忍线内 → 用量化版；退化超线 → 换更大原模型或调量化方案。

## 常见坑与排查

| 症状 | 原因 |
| --- | --- |
| 启动报 `--quantization` 与权重不匹配 | 权重是 AWQ 却写了 gptq（或反之） |
| 加载后 OOM | `gpu-memory-utilization` 太高，留出 KV 余量 |
| 输出乱码/空白 | 模型没走量化分支加载（检查日志 dtype） |
| 质量明显差 | 校准/权重来源问题，换官方量化版对比 |

## 小结

量化实战 = **选现成权重 → 引擎起服务 → 质量/性能双评估 → 对比表做决策**。今天的量化已经是"拿来即用"的工程能力：你不需要自己实现量化算法，但要会选型、会验证、会判断"这笔精度换显存的交易值不值"。这也是整个 Quantization 篇章的落点——把原理变成能交付的服务。

Quantization 六篇收官。最后一个板块登场：把推理优化与量化全部内建的引擎——vLLM。
