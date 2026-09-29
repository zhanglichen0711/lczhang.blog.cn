---
title: "vLLM 实战：RAG 问答服务的推理底座"
date: 2025-03-19
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, RAG, 实战]
description: "把 vLLM 接进 RAG 服务：推理服务化、流式对接、并发验证——整套架构落地。"
abbrlink: 2478589256
---

「模型部署与推理」整个版块的收口：把 vLLM 作为推理底座，完整接进一个 RAG 问答服务。你会看到前面所有知识（推理优化、量化、参数、生产化）在这里如何各就各位，最终形成一套"检索 + 生成"的生产架构。

## 整体架构

```text
用户
 → 应用服务（FastAPI，RAG 编排：检索 + 组装 prompt + 调模型）
     → Milvus（检索增强：召回相关片段）     ← RAG 章节的地盘
     → vLLM（生成底座：OpenAI 兼容 API）    ← 本章的地盘
         └ Qwen 7B（AWQ INT4 + 长上下文配置）
```

**分工**：应用服务管 RAG 编排（检索、拼 prompt、流式转发），vLLM 只做一件事——把模型高效地跑成服务。清晰的分工让两侧可以独立扩展（检索加容量、模型加吞吐互不干扰）。

## 第一步：起 vLLM 底座

按业务需求定参数：RAG 请求要塞检索上下文，prompt 偏长；对延迟敏感，单实例压测过容量：

```bash
# RAG 底座：长上下文 + 前缀缓存（system/规则前缀被大量复用）
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --quantization awq \
  --gpu-memory-utilization 0.90 \
  --max-model-len 16384 \
  --enable-prefix-caching \
  --served-model-name rag-llm
```

两个选择呼应前文：**AWQ 4bit**（单卡能跑 7B 且留 KV 空间）、**prefix-caching**（RAG 请求共享的 system 前缀省预填充）。显存不够就用 INT4 权重 + FP8 KV 组合。

## 第二步：应用服务里接 vLLM

用 OpenAI 客户端指向 vLLM（drop-in 替换的关键价值）：

```python
from openai import AsyncOpenAI

llm = AsyncOpenAI(base_url="http://vllm:8000/v1", api_key="EMPTY")

SYSTEM_PROMPT = (
    "你是建筑工程规范问答助手。只依据给定资料回答，"
    "必须标注引用（文件名/条号/版本）；资料中没有就说不知道。"
)

async def rag_answer(question: str, context: list[dict]) -> str:
    # 把检索结果拼成带编号的上下文
    materials = "\n".join(
        f"[{i}]（{c['title']} {c.get('clause','')} v{c.get('version','')}）"
        f"{c['text']}" for i, c in enumerate(context)
    )
    resp = await llm.chat.completions.create(
        model="rag-llm",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",
             "content": f"资料：\n{materials}\n\n问题：{question}"},
        ],
        temperature=0.2,          # RAG 事实性回答，低温求稳
        max_tokens=1024,
    )
    return resp.choices[0].message.content
```

**温度设置呼应生成质量**：RAG 回答要准（低温度 0.1~0.3），不是要创意。

## 第三步：流式对接（打字机效果）

完整问答体验需要流式。vLLM 天然支持，应用层透传：

```python
from fastapi.responses import StreamingResponse

async def rag_stream(question: str, context: list[dict]):
    materials = build_materials(context)
    stream = await llm.chat.completions.create(
        model="rag-llm",
        messages=[{"role": "system", "content": SYSTEM_PROMPT},
                  {"role": "user",
                   "content": f"资料：\n{materials}\n\n问题：{question}"}],
        temperature=0.2,
        max_tokens=1024,
        stream=True,             # 流式：vLLM 逐 token 推
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield f"data: {delta}\n\n"

@app.post("/api/rag/ask/stream")
async def ask_stream(req: AskRequest):
    context = await retriever.search(req.question, user=req.user)
    return StreamingResponse(
        rag_stream(req.question, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

链路：**vLLM 逐 token → OpenAI 流 → FastAPI 逐块转发 → 前端打字机**。vLLM 侧几乎零配置，流式开箱即用。

## 第四步：并发与容量验证

上线前用推理度量篇的方法压测整条链路：

```python
# 压测目标：确认并发下 p95 延迟满足 SLA、GPU 显存不爆
# 关注两个数字：
#   1. 并发 RAG 请求（含检索）下 p95 总延迟
#   2. vLLM 侧 GPU 利用率与显存（是否接近上限）
# 若显存吃紧：缩 max-model-len 或降并发（max-num-seqs）
# 若延迟超标：开投机解码，或 vLLM 加副本
```

**别忘了前缀缓存验证**：RAG 请求共享 SYSTEM_PROMPT，压测时看启动日志里 prefix cache hit 率——命中高说明缓存生效，吞吐会明显优于"每次全量预填充"。

## 架构复盘：每个决策对应哪个知识点

| 决策 | 依据的知识点 |
| --- | --- |
| 用 vLLM 而非裸模型 | 连续批处理 + PagedAttention（吞吐） |
| AWQ 4bit | 量化（显存放得下 7B + KV 空间） |
| enable-prefix-caching | 前缀缓存（RAG 共享 system 前缀） |
| 长上下文 16K | 核心参数（RAG prompt 长） |
| 低温度 + 流式 | 生成质量 + OpenAI 兼容 API |
| 压测验证 | 推理性能度量方法论 |

**这套架构的扩展性**：检索换库、模型换更大、推理加副本——都是"换局部"，架构骨架稳定。这正是把 vLLM 当作"底座"而非"一段代码"的意义。

## 上线检查清单

- [ ] vLLM 参数按业务（上下文/并发/量化）配好并压测
- [ ] 前缀缓存开启且命中率验证
- [ ] 应用服务接 vLLM（OpenAI 客户端 + 流式透传）
- [ ] GPU/显存/延迟监控与告警
- [ ] 多副本与网关路由（如需要）
- [ ] 评测：检索 + 生成全链路在领域评测集上的表现

## 小结

RAG 问答服务的推理底座 = **vLLM 服务化（量化 + 前缀缓存 + 长上下文）+ OpenAI 兼容接入（低温 + 流式）+ 压测与监控兜底**。到这一步，检索（Milvus）、编排（FastAPI）、生成（vLLM）三层各就各位——你拥有了一套从知识库到流式回答的完整生产架构。这也正是整个「模型部署与推理」版块（推理优化 → 量化 → vLLM）在真实业务里的最终形态。
