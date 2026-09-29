---
title: "vLLM 简介：LLM 推理服务引擎"
date: 2024-12-22
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, 推理服务]
description: "把 PagedAttention、连续批处理、OpenAI 兼容 API 打包成开箱即用的推理服务。"
abbrlink: 703673596
---

前两章分别讲了推理优化的原理（KV Cache、批处理、投机解码）和模型压缩（量化）——但生产环境没人自己把这些拼起来，而是用一个**推理服务引擎**：vLLM。它把 PagedAttention、连续批处理、量化支持、OpenAI 兼容 API 全部内建，让你一条命令把模型变成可并发调用的服务。这一篇讲清它解决什么、凭什么快、何时选它。

## vLLM 是什么

vLLM（UC Berkeley 开源）是一个**LLM 推理与服务引擎**：加载模型、接受并发请求、高效生成、按 OpenAI API 格式输出。对使用者来说，它把"部署一个能扛并发的大模型服务"从工程难题变成两条命令。

```bash
pip install vllm
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000
```

启动后就有了一个 OpenAI 兼容的推理服务（`http://localhost:8000/v1`），任何 OpenAI 客户端都能直接连。

## 它凭什么比"裸跑模型"快

前两章的优化，vLLM 全部内建且做到了极致：

| 优化 | vLLM 的实现 | 效果 |
| --- | --- | --- |
| 连续批处理 | token 粒度动态拼批（引擎级调度） | 吞吐提升 5~20× |
| PagedAttention | KV Cache 按"页"管理（像虚拟内存） | KV 显存利用率近 100%，碎片几乎为 0 |
| 前缀缓存 | 相同前缀只算一次 | 长/重复前缀场景吞吐暴涨 |
| 量化支持 | GPTQ/AWQ/FP8/GGUF 直接加载 | 小显存跑大模型 |
| 投机解码 | 草稿模型/ngram 模式 | 单请求延迟降 2~3× |

**PagedAttention 是它的招牌**：传统 KV Cache 要连续内存、长度不定导致碎片浪费严重；vLLM 把缓存切成固定大小的"页"，按需分配、可共享——同样的显存能服务多得多的并发请求。这是它吞吐碾压朴素方案的核心。

## 为什么"OpenAI 兼容"很关键

vLLM 对外提供的是 **OpenAI 兼容 API**（`/v1/chat/completions`、`/v1/completions`、`/v1/models`）。意义在于生态：任何为 OpenAI 写的客户端（Python SDK、LangChain、RAG 框架、各种 Agent 工具）只需把 `base_url` 指过来就能用——**部署的模型和云上 API 无缝替换**：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",   # 本地 vLLM
    api_key="EMPTY",                        # vLLM 默认不鉴权
)
resp = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "你好"}],
)
```

这个"drop-in 替换"能力，让本地部署、私有化部署的成本大幅下降——业务代码完全不用为"换了模型后端"而改。

## 何时选 vLLM，何时不选

| 场景 | 选什么 |
| --- | --- |
| 高并发 API、多用户服务 | ✅ vLLM（吞吐优势明显） |
| 自建 RAG/Agent 的模型底座 | ✅ vLLM（OpenAI 兼容、好接入） |
| 单机个人用、显存小 | 可试 vLLM 量化版；或 Ollama/llama.cpp（更轻） |
| 只需把 GGUF 跑起来 | llama.cpp 系更简单 |

**选型判断**：要"扛并发、接业务"，vLLM 是主流答案；只是本地玩、显存很紧，Ollama 起步更省事。生产级自建推理服务，vLLM 是当前事实标准。

## 和前后文的关系

把整个「模型部署与推理」版块串起来看 vLLM 的位置：

```text
推理优化原理（KV Cache/批处理/投机解码）
   + 模型量化（INT4/FP8 权重与 KV）
        ↓ 全部内建
   vLLM（引擎化、服务化、OpenAI 兼容）
        ↓ 面向业务
   RAG/Agent 应用（拿它当模型底座）
```

前两章是"为什么"，vLLM 是"开箱即用的答案"。接下来的几篇：从一条命令起服务，到核心参数、原理、调优、生产部署，最后接一个 RAG 问答实战。

## 小结

vLLM = **推理优化的引擎化封装 + OpenAI 兼容的服务出口**：PagedAttention 与连续批处理带来 5~20 倍吞吐，量化与投机解码让它省显存、降延迟，兼容 API 让它无缝接进任何应用。高并发自建推理服务，它是当前首选。理解前两章的原理，你现在看 vLLM 的每个特性都能对上号——下一篇开始动手：装它、用它跑起第一个模型服务。
