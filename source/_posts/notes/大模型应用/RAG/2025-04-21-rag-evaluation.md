---
title: "RAG 评测：命中率、引用与拒答"
date: 2025-04-21
categories:
  - [大模型应用, RAG]
tags: [RAG, 评测]
description: "RAG 不能只靠感觉调。三层测试：单测、评测集、线上 trace，把'坏了'变成可定位的指标。"
abbrlink: 2684484614
---

做 RAG 最怕听到的话是"最近回答好像变差了"——"好像"意味着无法定位、无法验证、无法回归。RAG 是个多环节系统（切分→检索→组装→生成），任何一环悄悄变差，都会表现为"回答变差"，但**不评测就永远不知道是哪一环**。这篇讲 RAG 评测的落地：三层测试结构，把"感觉能用"变成"数据证明能用"。

## RAG 评测为什么不能只靠"人眼看"

直觉上，评测就是"拿问题问系统，人看答得好不好"。这在早期可行，但一旦开始迭代（换 embedding、改切分、调提示），问题就来了：

- **人看的主观性**：同一个回答，两个人评分可能差很多；
- **无法回归**：上周改了个参数，这周怎么知道整体是变好还是变坏？
- **无法定位**：回答变差，是检索漏了？还是模型没用好上下文？人眼看不出是哪一环。

RAG 评测的目标不是"打分"，而是**把系统的每个环节变成可量化、可回归、可定位的指标**。标准做法是三层测试。

## 第一层：纯逻辑单测——测"确定性的环节"

RAG 里有几个环节是确定性的，可以直接写单测：

- **意图分类**：给定问题，应该路由到哪条路径；
- **过滤逻辑**：给定用户权限，检索表达式是否正确排除无权文档；
- **上下文组装**：给定召回结果，拼接是否带来源、是否超预算。

这些环节没有"模型发挥"的成分，可以用传统单测覆盖：

```python
def test_acl_filter_excludes_private_docs():
    user = User(id="u1", org="org_a")
    expr = build_filter(user)
    # 应只包含 public + 本 org + 本人 private 文档
    assert 'visibility == "public"' in expr
    assert 'owner == "u1"' in expr
    assert 'org_a' in expr
```

第一层测试的价值：**把确定性的部分锁死**，让 RAG 的工程地基（路由、过滤、组装）不会悄悄被改坏。

## 第二层：评测集——测"模型环节的质量"

模型环节（检索命中率、回答质量）不能用单测，要用**评测集**：一组固定的"问题→期望结果"，每次改动后跑一遍，看指标变化。

RAG 评测集的核心指标分两块：

**检索质量指标（只看检索，不看生成）：**

```python
def eval_retrieval(test_cases, retriever):
    """召回评测：命中的正确 chunk 是否在召回结果里"""
    results = []
    for case in test_cases:
        hits = retriever(case["question"])
        hit_doc_ids = {h["doc_id"] for h in hits}
        expected = set(case["expected_doc_ids"])
        # 命中率：期望文档有多少被召回了
        recall = len(expected & hit_doc_ids) / len(expected) if expected else 1.0
        results.append({"question": case["question"], "recall": recall})
    return {"avg_recall": mean(r["recall"] for r in results)}
```

**生成质量指标（结合生成看答案）：**

```python
def eval_generation(test_cases, rag_answer):
    """生成评测：答案对错 + 引用 + 拒答"""
    metrics = {"correct": 0, "cited": 0, "rejected_ok": 0, "total": len(test_cases)}
    for case in test_cases:
        answer = rag_answer(case["question"])
        # 1. 答案正确性（有标准答案时比对）
        if case.get("expected_answer"):
            metrics["correct"] += judge_match(answer, case["expected_answer"])
        # 2. 引用是否有效（关键结论应指向期望文档）
        if case.get("requires_citation"):
            metrics["cited"] += citation_valid(answer, case["expected_doc_ids"])
    return metrics
```

三层评测题的构成（对应最小闭环的三条底线）：

| 题型 | 测什么 | 例子 |
|---|---|---|
| 命中题 | 找得回来 | "屋面防水等级怎么定？" → 期望命中规范文档 |
| 拒答题 | 知道边界 | "文档里没有的问题" → 期望答"未找到"而非编造 |
| 溯源题 | 引用正确 | "4.2 条要求什么" → 期望引用指向 4.2 所在文档 |

**评测集不是一次建完的**：每次线上发现一个答错的 case，就把它加进评测集（连同正确答案）——这是 RAG 的"回归测试"生长机制，和"修 bug 先加测试"是同一个工程习惯。

## 第三层：线上 trace——测"真实流量下的表现"

评测集是"人工构造的题"，线上流量是"真实的用户问题"——两者都要看。第三层是**线上观测**：给每次线上请求打 trace，记录关键信息，供事后分析：

```python
# 每次 RAG 请求记录（结构化日志 / trace 平台）
trace = {
    "request_id": "9f2c8a1e",
    "question": "屋面漏了怎么处理",        # 原问题
    "rewritten_query": "屋面防水层渗漏 维修",  # 改写后（若有）
    "retrieved": [                          # 召回了什么
        {"doc_id": "doc_2025_003", "section": "4.2", "score": 0.82},
    ],
    "model": "qwen-plus",
    "answer": "...",                        # 生成结果
    "latency_ms": 812,
    "tokens": {"input": 1520, "output": 380},
}
```

线上 trace 解决评测集解决不了的两件事：

1. **发现"没想到的坏案例"**：评测集的题是你想到的，线上问题是用户想到的——定期从 trace 里挖"低分回答"补充评测集；
2. **定位环节**：用户说某次回答不对，翻 trace 能看出是"检索没召到"还是"召到了但模型没用对"——**trace 是 RAG 归因的第一现场**。

（这套 trace 体系的完整实现在工程化版块的可观测系列讲过——Langfuse 就是干这个的，这里不重复。）

## 三层测试怎么配合

三层不是互相替代，是各管一段：

```text
单测（确定性环节）  → 每次代码改动跑，秒级，锁死工程地基
评测集（模型环节）  → 每次检索/切分/提示改动跑，分钟级，防回归
线上 trace（真实流量）→ 持续采集，定期分析，喂给评测集
```

**工作流的节奏：** 任何改动（换 embedding、改切分参数、调提示）上线前，先跑评测集，指标不降才允许上线；上线后靠 trace 观察真实表现，发现新坏案例就补进评测集。这样形成一个闭环：**改动 → 评测集验证 → 上线 → trace 发现问题 → 补评测集 → 下次改动有据可依。**

## 评测里要小心的坑

**坑一：评测题和线上分布脱节。** 评测集全是"规范文档里能找到答案"的题，那命中率自然高——但线上大量是模糊问题、闲聊。**评测集要覆盖真实分布**，包括该拒答的、该路由的边界题。

**坑二：只测答案对错，不测引用。** RAG 和普通问答最大的区别是"可溯源"——不测引用，就可能在"答对了但出处是编的"上翻车，这恰恰是最危险的情况。

**坑三：评测集被"背下来"。** 如果评测集长期不变，系统的改动可能只是在"拟合评测题"而非提升真实能力。定期混入新题、保留一部分"未见过的 holdout 题"，防止过拟合评测集。

## 小结

RAG 评测三层结构：纯逻辑单测锁死确定性环节（路由/过滤/组装）、评测集量化模型环节（召回命中率/答案正确/引用/拒答）、线上 trace 覆盖真实流量并持续喂给评测集。**RAG 从"感觉能用"到"数据证明能用"，靠的就是这套三层体系**——每次改动前跑评测集防回归，线上靠 trace 发现新问题补进评测集。

下一篇进入 RAG 的工程化收尾：怎么把 RAG 包成一个稳定可维护的服务——分层架构、并发控制、缓存与超时。
