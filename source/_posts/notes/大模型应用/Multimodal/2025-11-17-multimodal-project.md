---
title: "实战：图文知识库与智能质检"
date: 2025-11-17
categories:
  - [大模型应用, Multimodal]
tags: [Multimodal, 实战]
description: "VLM 前置解析把图变成可检索的知识，CV+VLM+LLM 组合完成质检闭环——多模态的落地是把它缝进已有架构。"
abbrlink: 1997093708
---

Multimodal 系列最后一篇，也是整个大模型应用版块的收官。把前四篇的能力和一个贯穿始终的思想串成一个完整方案：**图文知识库与智能质检**——它把多模态（看图）+ RAG（检索依据）+ 传统 CV（检测锚点）+ LLM（报告生成）组合成一条真实可交付的应用链。做这个实战的意义在于：它是整个版块所有能力的汇合点，也是"多模态怎么在业务里真正落地"的完整答案。

## 方案全景：一条图文混合的质检知识闭环

```text
┌────────────────── 入库侧（图文知识库） ──────────────────┐
│ 历史质检报告（图文混合）                                    │
│   → VLM 解析：文字转文本流，图片转"结构化图描述"             │
│   → 切分入库（带图描述 chunk + 图片缩略图引用）              │
│   → 质量门禁 → 向量化入库                                   │
└──────────────────────────────────────────────────────┘
                    ↓（知识库：规范 + 历史案例 + 图描述）
┌────────────────── 查询侧（智能质检助手） ─────────────────┐
│ 现场照片 / 用户问题                                        │
│   → CV 检测：框缺陷 + 置信度（客观锚点）                    │
│   → 低置信样本升级 VLM：类型/成因/严重度判断                │
│   → RAG 检索：命中规范条款 + 相似历史案例（含图）            │
│   → LLM 生成：质检结论 + 规范依据 + 处理建议的报告           │
└──────────────────────────────────────────────────────┘
                    ↓
      评测闭环：缺陷判断与 CV 交叉验证 + 人工抽检争议 + 差评回流
```

## 模块一：图文知识库（VLM 前置解析入库）

把历史图文质检报告变成可检索的知识，关键是把"图"也变成可检索的文本：

```python
class ImageTextKB:
    """图文知识库：VLM 把图片转成可检索的描述后走 RAG 入库"""

    def parse_report_page(self, page_image: str) -> list[dict]:
        """解析一页图文报告：文字成文本、图片成结构化描述"""
        parsed = vlm_page_to_markdown(page_image)   # 文字 + 版式
        chunks = chunk_by_structure(parsed)          # 结构切分

        # 图里的信息：对报告中的缺陷照片/示意图单独生成"检索描述"
        for image_region in extract_images(page_image):
            img_desc = describe_image_for_index(image_region)
            # 图片描述作为该区域的 chunk，与所在章节元数据绑定
            chunks.append({
                "content": f"[图] {img_desc}",
                "doc_id": ..., "section": image_region["section"],
                "image_ref": image_region["path"],   # 回答时可展示原图
            })
        return chunks
```

**设计要点：图片描述和文字一起进 RAG**——用户问"有没有屋面裂缝的案例"，既可能命中文字（"屋面裂缝"）也可能命中图片描述（"[图] 屋面防水层裂缝，西南角……"）。**图文知识库让"看图才有的信息"也能被检索问答触达。**

## 模块二：智能质检（CV + VLM + RAG 组合）

查询侧是"检测 + 理解 + 依据"的组合（图文协同篇的流水线，这里给出完整实现骨架）：

```python
def inspect_and_report(photo: str) -> dict:
    """单张现场照片的质检：CV 初检 + VLM 精判 + RAG 依据"""
    # ① CV 检测（客观锚点，快而确定）
    cv_hits = cv_detect(photo)                     # [{box,type,conf}]
    if not cv_hits:
        return {"finding": None, "note": "未检测到明显缺陷"}

    findings = []
    for hit in cv_hits:
        finding = {
            "box": hit["box"], "cv_type": hit["type"], "cv_conf": hit["conf"],
        }
        # ② 低置信/复杂样本升级 VLM（裁剪局部图）
        if hit["conf"] < 0.8 or hit["type"] in AMBIGUOUS_TYPES:
            vlm = vlm_judge(crop(photo, hit["box"]), hit["type"])
            finding.update({
                "type": vlm.get("type", hit["type"]),
                "severity": vlm.get("severity", "待确认"),
                "confidence": vlm.get("confidence", hit["conf"]),
                "vlm_reviewed": True,
            })
        else:
            finding.update({"type": hit["type"], "confidence": hit["conf"]})

        # ③ 高置信缺陷 → RAG 查规范 + 历史案例
        if finding["confidence"] >= 0.6:
            finding["spec"] = rag_search(
                f"{finding['type']} 缺陷 处理要求 规范")
            finding["cases"] = rag_search(
                f"{finding['type']} 缺陷 整改案例")
        findings.append(finding)

    # ④ LLM 汇总报告（带出处的质检结论）
    return llm_generate_report(findings)
```

**三条主线的配合**：CV 提供"确定性的检测锚点"（不怕它错，怕它不确定时就升级）、VLM 处理"CV 拿不准的疑难"（成本花在刀刃上）、RAG 提供"处理依据"（让结论可溯源）。这是图文协同篇四原则的完整落地。

## 模块三：评测闭环（多模态评测篇落地）

质检助手上线必须有评测（没有评测的多模态就是赌）:

```python
def eval_inspector(test_photos: list[dict]) -> dict:
    """质检评测：缺陷判断与 CV 锚点交叉 + 人工抽检"""
    metrics = {"total": len(test_photos), "agreed": 0, "flagged": []}
    for case in test_photos:               # case: {photo, cv_label}
        result = inspect_and_report(case["photo"])

        # 感知正确性：VLM/LLM 结论 vs CV 客观锚点
        if result["finding"] is None and case["cv_label"] is None:
            metrics["agreed"] += 1                     # 都认为无缺陷 ✓
        elif result["finding"] and result["finding"]["type"] == case["cv_label"]:
            metrics["agreed"] += 1                     # 缺陷类型一致 ✓
        else:
            metrics["flagged"].append(case)            # 争议 → 人工复核

    metrics["pass_rate"] = metrics["agreed"] / metrics["total"]
    return metrics
```

配合：争议样本（flagged）走人工复核、人工结论回流成标准答案、差评（用户质疑质检结果）提取后补进评测集——**多模态评测篇的"多信号交叉 + 差评回流"完整落地**。

## 上线要做的工程事（回顾全版块）

把这条链路送上生产，前面所有系列的工程积累全部用上：

- **服务化**：RAG 服务篇的分层架构（入口/业务/编排/提示）——质检助手同样分层；
- **权限**：检索过滤篇的权限下推——质检报告按项目/租户隔离；
- **可观测**：Agent 可观测篇的 trace——每张图的处理链路（CV/VLM/RAG 各段耗时成本）全程留痕；
- **护栏**：Agent 工程化篇的预算与降级——VLM 调用要预算，CV 挂了降级提示而非崩溃；
- **提示管理**：Prompt 篇的版本化——VLM 的描述提示、报告生成提示都按版本管理。

## 三个认知：这个版块的收官之悟

**认知一：大模型应用的价值 = 组合，不是单模型。** 回看整个版块：RAG（知识）+ Agent（行动）+ 多模态（感知）+ 评测（证明），每一个都是架构里的一段。**真正值钱的方案，是把这些能力按业务缝成闭环的系统**——就像这个图文质检，没有哪个模型单独能做完整，但组合起来就是可交付的产品。

**认知二：从最小闭环开始，用评测驱动加复杂度。** 这个质检助手的第一版甚至可以是"CV + 一个规则报告"，跑通后加 VLM 处理疑难、加 RAG 补依据、加评测闭环。**大模型应用版块 46 篇讲的所有方法，最终都指向同一个工程观：先让链路跑通，再让链路变好，每次变好都有评测数据支撑。**

**认知三：模型的聪明是标配，工程才是护城河。** 模型的代际差距在快速缩小，但"把模型缝进有权限、有评测、可观测、能回滚的业务系统"的能力不会贬值——这正是这个博客从后端到存储、从训练到部署、从应用到工程，一路写下来始终在强调的东西。

## 小结

图文知识库 + 智能质检，把多模态的能力真正落成了业务方案：VLM 前置解析让"图里的知识"可检索（入库侧），CV 检测 + VLM 精判 + RAG 依据组合完成质检闭环（查询侧），多信号交叉 + 差评回流保证可评测（评测侧）。**整个大模型应用版块在此收官——46 篇从提示工程出发，走过 RAG、评测、Agent、LangGraph、多模态，最后汇成一句话：大模型应用的工程，是把模型的聪明，缝进系统的可靠里。**
