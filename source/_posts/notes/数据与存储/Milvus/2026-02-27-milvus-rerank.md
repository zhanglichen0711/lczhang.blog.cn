---
title: "Milvus Rerank：用精排把召回变成相关"
date: 2026-02-27
categories:
  - [数据与存储, Milvus]
tags: [Milvus, Rerank, 精排]
description: "召回要宽、进 LLM 的要精：交叉编码器如何把 TopK 候选精排成真正可用的上下文。"
abbrlink: 2998041761
---

向量搜索（召回）解决"别漏掉"——一次取回 20~50 条候选；但真正塞进 prompt 给 LLM 的只有 3~5 条。如果直接把召回的 20 条都塞进去，既烧 token 又稀释注意力（无关内容混进上下文会让模型答错）。中间需要一道**精排（Rerank）**：把候选按"与问题的真实相关性"重新排序，只留最相关的少数几条。这一篇讲 Rerank 的原理和落地。

## 召回和精排的分工

| 阶段 | 用什么 | 目标 | 数量 |
| --- | --- | --- | --- |
| 召回（Retrieve） | 向量相似度（Milvus） | 宽：别漏掉相关的 | Top 20~50 |
| 精排（Rerank） | 交叉编码器 / LLM | 准：把最相关的挑出来 | 留 3~8 条进 prompt |

**为什么召回阶段不能直接"更准"**：双塔式向量模型（embedding）是"问题和文档各自编码、算个相似度"，速度快但粒度粗，区分不了"强相关"和"擦边相关"。精排用的是**交叉编码器（Cross-Encoder）**：把"问题 + 文档"拼成一句话一起过模型，能精细建模两者的交互——更准，但**每对都要单独算一次，贵得多**。所以策略是"宽召回、窄精排"：让便宜的召回多捞，让贵的精排精选。

## 用 bge-reranker 做精排

Sentence-Transformers 生态里有专门做精排的模型（bge-reranker-base 等），输入一对文本输出相关分：

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-base")


def rerank(query: str, hits: list[dict], keep: int = 5, threshold: float = 0.5) -> list[dict]:
    """hits: Milvus 召回结果（含 text 等字段），按精排分取前 keep"""
    pairs = [(query, h["entity"]["text"]) for h in hits]
    scores = reranker.predict(pairs)               # 每个候选一个相关分

    scored = sorted(zip(hits, scores), key=lambda x: x[1], reverse=True)
    results = []
    for hit, score in scored:
        if score < threshold:
            break                                    # 低于阈值的不够格进上下文
        results.append({**hit, "rerank_score": float(score)})
    return results[:keep]
```

三个工程要点：

1. **先召回 20~50，精排只留 3~8**——召回数别设太小（会漏），也别把精排候选设太大（rerank 每对要过一遍模型，候选多延迟高）；
2. **阈值过滤**——低于阈值的候选说明"模型认为不相关"，宁可让 LLM 说"不知道"也别硬塞。这是控制幻觉的前置防线；
3. **精排分数可以记录**——`rerank_score` 能用来做评测和效果分析。

## 和 Milvus 搜索怎么衔接

混合检索召回 → 应用层精排 → 拼上下文：

```python
def retrieve_and_rerank(query: str, user: dict, top_k: int = 6) -> list[dict]:
    # 1. 召回：混合检索 + 权限过滤，多召回一些（比如 3 倍）
    hits = milvus_hybrid_search(query, user, limit=top_k * 3)

    # 2. 精排：交叉编码器打分重排
    ranked = rerank(query, hits, keep=top_k, threshold=0.5)

    # 3. 溯源：把出处字段拼好返回
    return [{
        "text": h["entity"]["text"],
        "doc_id": h["entity"]["doc_id"],
        "title": h["entity"]["title"],
        "clause": h["entity"].get("clause"),
        "version": h["entity"].get("version"),
        "score": h["rerank_score"],
    } for h in ranked]
```

最终进 prompt 的上下文结构清晰、出处齐全——LLM 依据它回答时能精确标注来源，这就是"回答强制携带文件名、条号、版本号"的数据底座。

## 精排的三个方案对比

| 方案 | 原理 | 质量 | 成本/延迟 | 适用 |
| --- | --- | --- | --- | --- |
| 双塔向量分（召回分） | embedding 相似度 | 一般 | 低 | 起步兜底 |
| 交叉编码器（bge-reranker） | 拼接建模交互 | 高 | 中（每对过模型） | 通用首选 |
| LLM Rerank（让模型打分） | 用 LLM 判断 | 最高 | 高 | 候选极少、质量要求极高 |

**默认路线：召回用混合检索，精排用 bge-reranker**。候选多、预算足、要极致精度时再考虑 LLM rerank。

## 精排放在哪一层

工程上注意一点：**精排是计算密集操作，建议独立成服务或至少独立于高频查询路径**。RAG 服务架构里它通常是独立的 rerank 服务（FastAPI 包一层），由检索主流程调用：

```text
Milvus 召回（20条，快）
   → rerank 服务（交叉编码器，重排取 5 条）
   → 拼 context → LLM
```

多路召回的候选合流后统一精排（稠密、BM25、甚至知识图谱各自的结果都送进 rerank），效果优于"每路各自取 Top 再拼接"——让最强的裁判来挑，而不是按来源轮流坐庄。

## 小结

Rerank 是"从相关到可用"的一步：**召回放宽、精排收窄、阈值兜底**。交叉编码器逐对打分，把 20 条候选里真正值得进上下文的 3~5 条挑出来，顺便用阈值挡住不相关内容——幻觉控制的前置就做在这一步。它是 RAG 效果里投入产出比极高的一环：模型不变、向量库不变，光加一层精排，回答质量就能上一个台阶。

检索链路（召回 → 过滤 → 混合 → 精排）全部打通，下一篇讲运维：备份、监控、横向扩展——让 Milvus 在线上稳得住。
