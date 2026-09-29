---
title: "RAG 服务化：分层架构与工程落地"
date: 2025-04-28
categories:
  - [大模型应用, RAG]
tags: [RAG, FastAPI]
description: "把 RAG 包成可上线的服务：入口、业务、编排、提示分层，缓存与超时设对，别把一切塞进一个函数。"
abbrlink: 3285694108
---

前面几篇把 RAG 的组件讲完了（切分、检索、组装、评测）。这一篇讲怎么把它们**包成一个能上线的服务**——这是"demo 能跑"和"生产能用"的分水岭。RAG 服务化最常见的错误，是把所有逻辑塞进一个 handler 函数：入口校验、检索、组装、调模型全揉在一起。这样做的后果是：评测难做、隔离难做、出问题无法定位。**正确的做法是分层——每一层只干一件事，层与层之间用清晰的数据结构传递。**

## 分层架构：四层各司其职

一个生产级 RAG 服务，标准的分层是：

```text
① 入口层（API / 网关）
   鉴权、限流、参数校验、request_id

② 业务层（QAService）
   意图路由、知识库版本选择、评测与日志入口

③ 编排层（Pipeline）
   改写 → 检索 → 组装 → 调模型 → 解析

④ 提示层（Prompt profile）
   按场景管理提示模板，不写死在代码里
```

用 FastAPI 落地这套分层：

```python
# ① 入口层：只做 API 职责
@app.post("/qa")
async def qa_endpoint(
    request: QuestionRequest,
    auth: User = Depends(get_current_user),
):
    # 鉴权（Depends）、参数校验（Pydantic）已由 FastAPI 处理
    service = QAService()
    result = await service.answer(
        question=request.question,
        user=auth,
        kb_version=request.kb_version,   # 可选：指定知识库版本
    )
    return result


# ② 业务层：编排的"大脑"，但不管检索细节
class QAService:
    def __init__(self):
        self.pipeline = RagPipeline()
        self.evaluator = TraceRecorder()

    async def answer(self, question: str, user: User, kb_version: str | None):
        # 意图路由：闲聊不走 RAG
        intent = self.classify_intent(question)
        if intent != "rag":
            return {"answer": handle_chat(question), "intent": intent}

        # 走 RAG 编排，传入用户（权限过滤需要）和版本
        result = await self.pipeline.run(
            question=question, user=user, kb_version=kb_version
        )

        # 记录 trace 供评测与观测
        self.evaluator.record(user, question, result)
        return result
```

为什么业务层和编排层要分开？因为业务层的职责是**决策**（走不走 RAG、用哪个版本），编排层的职责是**执行**（一步步把检索生成跑完）。混在一起时，改一个检索策略会牵扯到鉴权逻辑，改一个路由会碰到检索代码——**分层是为了让每一层可以独立修改和测试。**

## 编排层：Pipeline 的落地形态

编排层把 RAG 的步骤串起来，用清晰的数据结构在步骤间传递：

```python
class RagPipeline:
    """编排层：只负责把各组件按顺序串起来"""

    async def run(self, question: str, user: User, kb_version=None):
        # 1. 改写（查询理解）
        rewritten = await self.rewriter.rewrite(question)

        # 2. 检索（多路召回 + 过滤，检索模块内部处理）
        hits = self.retriever.retrieve(
            query=rewritten or question,
            user=user,             # 权限过滤在检索层完成
            kb_version=kb_version,
            top_k=20,
        )

        # 3. 组装上下文（精选 + 带来源）
        context = self.assembler.assemble(hits)

        # 4. 生成（按场景提示模板）
        answer = await self.generator.generate(
            question=question,
            context=context,
            profile="qa_standard",
        )
        return {"answer": answer, "sources": context.sources}
```

Pipeline 的价值：**它让"改一个环节"变成"换一个组件"**。想从单路检索换混合检索？改 `self.retriever` 的实现，Pipeline 不用动。想加 rerank？在 retriever 内部加，或给 Pipeline 加一步。**面向组件的编排，让 RAG 可以持续演进而不推倒重来。**

## 提示层：Prompt profile，别写死

生产 RAG 服务的提示不能散落在代码字符串里，要用 **Prompt profile** 管理——按场景定义提示模板：

```python
# prompts/profile.py
PROFILES = {
    "qa_standard": {
        "system": "你是一个知识库问答助手……",
        "template": "【资料】\n{context}\n\n【用户问题】\n{question}",
        "requirements": "1. 只依据资料……2. 标注出处……",
        "model": "qwen-plus",
        "temperature": 0.3,      # 知识问答要低温度，减少自由发挥
    },
    "qa_compare": {
        "system": "你是一个条款对比助手……",
        "template": "……",
        "model": "qwen-plus",
        "temperature": 0.2,
    },
}

def get_profile(name: str) -> dict:
    return PROFILES.get(name, PROFILES["qa_standard"])
```

提示层独立出来的意义：**调提示 = 改配置，不用动代码、不用重新部署整个服务**（配合提示版本管理那篇的做法）。不同场景（标准问答 vs 条款对比 vs 摘要）用不同 profile，而不是一个万能提示走天下。

## 并发、超时与缓存

服务化绕不开的三个工程问题：

**并发与超时。** RAG 里有多次外部调用（检索、模型），必须设超时防止单次慢调用拖垮整个请求：

```python
async def generate_with_timeout(self, ...):
    try:
        return await asyncio.wait_for(
            self.llm_client.chat(...),
            timeout=15.0,          # 模型调用超时，防止无限等
        )
    except asyncio.TimeoutError:
        log.warning("llm.timeout")
        return {"answer": "服务暂时繁忙，请稍后再试", "sources": []}
```

异步并发能提高吞吐，但**并发上限要设**——无限并发会把模型服务和下游打爆。用信号量控制：

```python
SEMAPHORE = asyncio.Semaphore(20)  # 最多 20 个并发模型调用

async def limited_llm_call(...):
    async with SEMAPHORE:
        return await llm_client.chat(...)
```

**缓存。** RAG 里值得缓存的只有两类：**embedding 结果**（相同文本不重复向量化）和**带版本边界的检索结果**（相同问题 + 相同版本，检索结果可缓存）。**不要把"自由生成的答案"当永久真理缓存**——答案是生成式的，缓存它会放大模型的错误和漂移（语义缓存的取舍在 Redis 系列讲过，这里只强调边界）。

## 可观测：服务化的最后一环

分层的服务如果不可观测，出了问题还是抓瞎。每层的关键动作打日志（结构化 + request_id，见可观测系列）：

- 入口：谁在什么时间问了什么；
- 业务：意图路由结果、选的知识库版本；
- 编排：改写后的 query、召回的 doc_id 列表、耗时；
- 生成：模型、token 数、延迟。

**有了逐层日志，用户说"答错了"，你能回答"错在检索还是生成"**——这是 RAG 服务化之后迭代的基础（评测篇的第三层 trace 就是它）。

## 小结

RAG 服务化的核心是分层：入口层管 API 职责（鉴权/限流/校验）、业务层管决策（路由/版本）、编排层管执行（检索→生成）、提示层管模板（场景化配置）。工程要点：模型调用设超时和并发上限，缓存只缓存 embedding 和带版本边界的检索结果，每层打可观测日志。**分层让 RAG 可演进、可评测、可定位——这是它从 demo 走向生产的架构保障。**

下一篇是这个系列的收尾：RAG 工程闭环实战。把前面所有环节（切分、检索、权限、评测、服务化）串成一个完整的工程体系，看它们如何协同。
