---
title: "KV Cache：让长上下文跑得动的关键"
date: 2024-07-30
categories:
  - [模型部署与推理, Inference-Optimization]
tags: [推理优化, KV Cache]
description: "生成每个词都把历史注意力重算一遍？KV Cache 把'已算过'的结果存下来复用。"
abbrlink: 2882191380
---

KV Cache 是 LLM 推理里性价比最高的优化，几乎所有推理引擎（vLLM、HF 的 generate）都默认开启。理解它，就理解了"为什么对话越长，显存占用越大"这个常见现象。这一篇从"重复计算"讲起，把 KV Cache 的原理和代价讲透。

## 先看重复计算有多浪费

回顾注意力的计算：生成第 N 个词时，要算"新词作为 Q，去匹配历史所有词的 K/V"。关键洞察：**历史词的 K、V 是固定的**——它们不随新词变化。但如果不缓存，第 N 步会把第 1~N-1 步算过的 K/V **全部重新算一遍**：

```text
生成第 100 个词时：
  真正要新算的：第 100 个词的 Q、K、V
  被浪费重算的：第 1~99 个词的 K、V（每次生成都在重复算它们！）
```

长度越长，浪费越惊人——生成到第 1000 个词时，每一步有 999/1000 的计算是重复的。

## KV Cache：把中间结果存下来

解决思路直白：**把每步算出来的 K、V 存进缓存，下一步只算新 token 的 K/V，拼到缓存后面**：

```text
第 1 步：算 token1 的 K1,V1 → 缓存 [K1,V1]
第 2 步：只算 token2 的 K2,V2 → 缓存 [K1,K2] [V1,V2]
第 3 步：只算 token3 的 K3,V3 → 缓存 [K1,K2,K3]...
```

每一步的计算量从"全量重算"降到"只算一个新 token"，**生成阶段的理论计算量直接除以序列长度**。这也是为什么同样长度的输入，缓存开启后解码快一个数量级。

## 代码视角：vLLM/Transformers 里它默认就在

用 Transformers 生成时，KV Cache 默认开启，只是你感知不到：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct")
tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct")

# use_cache=True 是默认——past_key_values 会在生成中传递复用
out = model.generate(
    **tok("什么是 RAG", return_tensors="pt"),
    max_new_tokens=128,
    use_cache=True,          # False 会退化成每步全量重算，慢得多
)
```

推理引擎（vLLM）内部把 KV Cache 的管理做到极致（显存分页），这是它的核心能力之一，后面 vLLM 篇章细讲。

## KV Cache 的代价：显存

天下没有免费午餐。KV Cache 的代价是**显存**：

```text
每层每 token 的 KV 大小 = 2（K和V）× 层数 × 头数 × 头维度 × 字节数
7B 模型示例：约 1~2 KB / token
1000 token 对话 ≈ 1~2 MB（单序列）
批量 + 长上下文时：显存被 KV Cache 吃满
```

这就是两个常见现象的根源：

1. **对话越长越可能 OOM**——新 token 持续往缓存里加，显存持续涨；
2. **`max_length` 决定并发上限**——上下文窗口越大，每个请求占的 KV 显存越多，能并行的请求越少。

所以推理引擎里 `max-model-len` 和显存是联动关系（vLLM 篇章会看到这个权衡）。

## 工程上的 KV Cache 三个进阶点

| 方向 | 做什么 | 场景 |
| --- | --- | --- |
| 前缀缓存 | 相同前缀（system prompt）只算一次 | 多轮对话、批量评测 |
| KV Cache 量化 | 用 INT8/FP8 存 K/V 省显存 | 超长上下文/大并发 |
| 分页管理 | 不连续内存、按需分配（PagedAttention） | 高并发下避免碎片化 |

这些是"KV Cache 之后"的优化，对应后续篇章（前缀缓存、量化、vLLM）。

## 小结

KV Cache 用**显存换算力**：把历史 K/V 缓存下来，让解码每步只算新 token，理论加速随序列长度放大。代价是显存随上下文增长——这决定了"窗口越长、并发越少"的工程权衡。理解它，你就看懂了推理引擎一半的设计逻辑（另一半是批处理，下一篇）。

缓存解决了重复计算，但单序列的串行还在。下一篇：连续批处理——让 GPU 同时服务几百个请求。
