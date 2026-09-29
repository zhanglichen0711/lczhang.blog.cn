---
title: "vLLM 安装与首个 OpenAI 兼容服务"
date: 2025-01-05
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, 推理服务]
description: "装 vLLM、起服务、用 OpenAI 客户端调通——最小系统跑起来，验证全家桶生效。"
abbrlink: 2478845449
---

理论讲完，动手。这一篇的目标非常具体：**装上 vLLM，用一条命令把模型变成 OpenAI 兼容服务，再用客户端调通**。跑通这个最小系统，后面所有参数、原理、调优才有地方验证。

## 安装：环境要求先看

vLLM 面向 NVIDIA GPU（CUDA）优化，装之前确认：

```bash
python --version        # 3.9+
nvidia-smi             # 有 NVIDIA 卡；驱动较新
pip install vllm       # 会连带安装 torch 等（体积大，耐心等）
```

没有 GPU 也能起服务跑通流程（走 CPU，极慢），但性能数据没有参考意义。**生产至少需要一张 16GB+ 的卡**（7B 模型 FP16）。

## 起第一个服务

```bash
# 从 HuggingFace 拉模型并起 OpenAI 兼容服务
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --port 8000 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192
```

启动日志会显示模型加载、显存分配（含 KV Cache 预留），最后出现服务地址。两个最常用的参数先理解：

- `--gpu-memory-utilization`：允许 vLLM 用多少比例的显存（0.90 = 90%），其余留给别的进程；
- `--max-model-len`：支持的最大上下文长度（prompt + 输出），它直接决定 KV Cache 预留量。

## 验证服务：三种方式

**方式一：curl**

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen2.5-7B-Instruct",
       "messages":[{"role":"user","content":"你好，介绍一下你自己"}],
       "max_tokens":128}'
```

**方式二：OpenAI Python 客户端（最常用）**

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "用三句话解释什么是 RAG"}],
    max_tokens=200,
)
print(resp.choices[0].message.content)
```

**方式三：流式（验证 SSE 透传）**

```python
stream = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "从 1 数到 5"}],
    stream=True,
)
for chunk in stream:
    piece = chunk.choices[0].delta.content
    if piece:
        print(piece, end="", flush=True)
```

流式是 RAG 问答"打字机效果"的底座——vLLM 原生支持，前端接 `fetch` 流即可。

## 服务端点一览

启动后 vLLM 暴露这几个端点：

| 端点 | 用途 |
| --- | --- |
| `/v1/models` | 查看已加载模型（多模型部署时有用） |
| `/v1/chat/completions` | 对话补全（最常用） |
| `/v1/completions` | 纯文本补全 |
| `/health` | 健康检查（部署探活用） |

```bash
curl http://localhost:8000/v1/models    # 看服务里有哪些模型
curl http://localhost:8000/health       # OK
```

## 跑一个简单压测，感受引擎能力

验证吞吐提升（前面推理篇强调过：**要并发测**）：

```python
import asyncio, time, statistics
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

async def one(i):
    t0 = time.perf_counter()
    await client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct",
        messages=[{"role": "user", "content": f"问题 {i}：1+1=?"}],
        max_tokens=64)
    return time.perf_counter() - t0

async def bench(n=40):
    lat = await asyncio.gather(*[one(i) for i in range(n)])
    print(f"{n} 个并发请求 p50={statistics.median(lat):.2f}s")

asyncio.run(bench())
```

**现象预期**：40 个并发请求的总耗时 ≈ 单个请求的 2~4 倍（而不是 40 倍）——连续批处理把请求拼批并行了。看到这个，你就直观理解了 vLLM 吞吐优势的来源。

## 常见坑

| 症状 | 原因与解法 |
| --- | --- |
| 显存 OOM | 降 `--gpu-memory-utilization` 或 `--max-model-len` |
| 模型名带远程仓库拉不动 | 先 `huggingface-cli download` 或换国内镜像/本地路径 |
| 无 GPU 环境很慢 | 正常，CPU 跑只是验证流程 |
| 客户端报连接拒绝 | 服务没起成功（看日志）或端口不对 |

## 小结

vLLM 的最小系统 = **`pip install vllm` + `vllm serve <model>` + OpenAI 客户端调通**。一条命令拿到 OpenAI 兼容服务、curl/客户端/流式三路验证、并发压测感受引擎价值。骨架跑通了，下一篇深入参数：上下文、并发与显存这三个最影响容量和性能的旋钮。
