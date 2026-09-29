---
title: "vLLM 核心参数：上下文、并发与显存"
date: 2025-01-20
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, 参数]
description: "max-model-len、gpu-memory-utilization、max-num-seqs 三个旋钮怎么联动，配置的底层逻辑。"
abbrlink: 4269724044
---

vLLM 有几十个参数，但九成场景只需要理解**三个联动旋钮**：`--max-model-len`（上下文）、`--gpu-memory-utilization`（显存）、`--max-num-seqs`（并发）。它们不是孤立的——调一个影响另外两个。这一篇讲清联动逻辑，你就能给任何模型/卡配出合理起步参数。

## 显存是怎么分配的

理解参数前先看显存账：vLLM 把显存分成两块——

```text
GPU 显存 = 模型权重（固定）
        + KV Cache 预留（动态分配，vLLM 自动按剩余显存预留）
        + 运行时开销
```

`--gpu-memory-utilization 0.90` 的意思是：vLLM 最多使用 90% 显存，其中**先装模型，剩下的全部预留给 KV Cache**。KV Cache 能存多少 token，直接决定并发上限。

## 三旋钮联动关系

```text
max-model-len ↑ → 每个请求最长占用更多 KV 空间 → 并发能力 ↓
gpu-memory-utilization ↑ → KV 预留更多 → 能并发更多 / 支持更长上下文，但风险 OOM
max-num-seqs ↑ → 允许同时处理的请求更多 → 吞吐↑，但每个请求等得更久（延迟↑）
```

**核心矛盾**：KV Cache 显存就那么多，被"单请求长度 × 并发数"瓜分：

```text
KV 总容量 ≈ 每 token KV 大小 × (平均请求长度 × 并发数)
```

## 参数配置的思考顺序

给一个具体模型和卡配参数，按顺序想：

```python
# 例：7B 模型（权重 ~14GB FP16）+ 24GB 单卡
# 1. 业务要多长上下文？RAG 检索塞多长 prompt？
#    短问答 → 4096 够；带长文档 → 8192 起
--max-model-len 8192

# 2. 显存留多少给 vLLM？（要留系统/其他进程余量）
--gpu-memory-utilization 0.90

# 3. 并发上限设多少？先设个值，压测再调
--max-num-seqs 256
```

**把需求想清楚再配**：上下文长度是业务决定的（RAG 要能塞下检索内容），显存利用率是硬件决定的，并发上限是压测决定的。

## 从显存倒推能并多少

一个实用的粗算方法（帮助设 max-num-seqs）：

```text
可用 KV 显存 ≈ gpu_memory_utilization × 总显存 - 模型权重
每 token KV ≈ 2 × 层数 × KV 头数 × 头维度 × 字节数（7B 约 1~2KB）
单请求 KV ≈ 每 token KV × max-model-len
最大并发 ≈ 可用 KV 显存 / 单请求 KV（理想上限）
```

vLLM 启动日志会打印 `Maximum concurrency for ... tokens = N`，直接看它给的数，再乘个安全系数。

## 常见配置组合示例

```bash
# 场景一：短问答 API（主打并发吞吐）
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --gpu-memory-utilization 0.92 \
  --max-model-len 4096 \
  --max-num-seqs 512

# 场景二：RAG 长文档（prompt 长，保上下文牺牲并发）
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --gpu-memory-utilization 0.95 \
  --max-model-len 32768 \
  --max-num-seqs 128

# 场景三：小显存跑大模型（配量化）
vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ \
  --quantization awq \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192
```

注意场景差异：**长上下文场景 KV 占用大，并发上限自然低**——想两者兼得只能上更大显存或 KV 量化。

## 调参方法论：压测驱动

参数别拍脑袋，用推理性能度量篇的压测方法迭代：

```python
# 每个候选配置跑同一压测，对比 p50/p95/吞吐/OOM 情况
# 输出对比表：
#   config | 吞吐 | p95 延迟 | 是否 OOM
#   4096/512 | 高 | 中等 | 否   ← 短问答甜点
#   32768/128 | 低 | 高 | 否     ← 长上下文必须
# 选：满足业务延迟要求下，吞吐最高的配置
```

**只调一个变量、重新测量**——不要同时改三个参数，不然出了问题不知道是哪个引起的。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 启动即 OOM | `gpu-memory-utilization` 过高 / 权重就超显存 |
| 运行时 OOM | 实际并发超过 KV 容量（降 max-num-seqs 或上下文） |
| 长 prompt 报 length 错误 | `max-model-len` 小于实际输入 |
| 吞吐上不去 | 并发不够（客户端串行）或 max-num-seqs 太小 |

## 小结

vLLM 三旋钮的底层逻辑一句话：**显存 = 权重 + KV Cache，KV Cache 被"单请求长度 × 并发"瓜分**。配置顺序是：先按业务定上下文（max-model-len）→ 按硬件定显存利用率 → 压测定并发上限。理解联动、用压测驱动，比背任何"推荐值"都可靠。原理篇继续——下一篇看 vLLM 内部：PagedAttention 与连续批处理到底怎么工作。
