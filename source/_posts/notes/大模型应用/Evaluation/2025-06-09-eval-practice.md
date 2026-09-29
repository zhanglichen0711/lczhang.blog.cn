---
title: "评测实战：给 RAG 与 Agent 建评测体系"
date: 2025-06-09
categories:
  - [大模型应用, Evaluation]
tags: [评测, 实战]
description: "把评测集、Judge、线上 trace 组装成一套体系：离线保回归、线上抓真实、差评回流驱动迭代。"
abbrlink: 3835041851
---

评测系列四篇讲完了方法论，这一篇实战收口：**给一个真实的 RAG + Agent 应用搭一套完整的评测体系。** 目标不是"装一堆评测工具"，而是建立一条能持续回答"系统有没有变好"的流水线。这套体系跑起来之后，任何改动（换模型、改提示、调检索）都有了判断依据——这正是 AI 应用工程化最缺的那块拼图。

## 评测体系全景

```text
┌──────────── 离线评测（改动前跑） ────────────┐
│ 评测集（典型题+边界题+坏案例+golden set）      │
│   → 规则判分（客观部分）+ Judge 判分（主观部分）│
│   → 输出通过率 / 分维度报告                   │
└──────────────────────────────────────────┘
              ↑ 差评回流（补评测集）
┌──────────── 线上评测（持续跑） ──────────────┐
│ 全量 trace → 规则门禁（实时异常）              │
│ 抽样 Judge（定时批量评分）                    │
│ 人工复核（差评/争议）→ 归因 → 修复/补评测集     │
└──────────────────────────────────────────┘
```

## 第一步：评测集落地

针对 RAG + Agent 混合应用，评测集按"任务类型"组织（不同任务不同评测标准）：

```python
# eval_suite.py —— 评测集结构与加载
TASKS = {
    "rag_qa": {
        "description": "知识库问答",
        "cases": [...],   # 典型题 + 边界题 + 坏案例
        "judge_prompt": "rag_answer_quality",   # 用哪个评分标准
        "rules": ["has_source", "reject_when_no_doc"],  # 哪些规则门禁
    },
    "agent_task": {
        "description": "Agent 完成任务",
        "cases": [...],
        "judge_prompt": "agent_task_success",
        "rules": ["tool_call_valid", "no_loop"],
    },
}
```

注意 Agent 任务的评测和 RAG 不同——RAG 评"回答质量"，Agent 还要评"任务是否完成 + 过程是否合理"（工具调用对不对、有没有死循环、耗了多少步）。**每种任务类型一套评测标准，混在一起评会让分数失去意义。**

## 第二步：评测执行器

写一个统一的评测执行器，把"跑用例 + 判分 + 汇总"串起来：

```python
class EvalRunner:
    """评测执行器：跑评测集，输出可比较的报告"""

    def __init__(self, system, suite: dict, judge_model="gpt-4o-mini"):
        self.system = system
        self.suite = suite

    def run(self, tag: str) -> dict:
        report = {"tag": tag, "tasks": {}, "overall": {}}
        all_passes = []

        for task_name, task in self.suite["tasks"].items():
            results = []
            for case in task["cases"]:
                # 1. 系统作答
                answer = self.system.run(case["input"])

                # 2. 规则判分（客观部分）
                rule_pass = all(
                    rule_check[rule](answer, case) for rule in task["rules"]
                )
                # 3. Judge 判分（主观部分）
                judge_score = judge_answer(
                    case["input"], answer,
                    prompt=task["judge_prompt"],
                )

                results.append({
                    "case_id": case["id"],
                    "rule_pass": rule_pass,
                    "judge_score": judge_score,
                    "pass": rule_pass and judge_score >= THRESHOLD,
                })
                all_passes.append(results[-1]["pass"])

            report["tasks"][task_name] = summarize(results)
        report["overall"]["pass_rate"] = sum(all_passes) / len(all_passes)
        return report
```

核心要求：**评测结果必须带版本标记（tag）**——跑一次记一次 tag（如 `20250602_switch_embedding`），历史报告留档，才能回答"这次改动相比上次是涨是跌"。

## 第三步：跑分报告与基线对比

评测跑完，输出一份"可对比"的报告，而不是一坨数字：

```text
评测 tag: 20250602_embedding_v2
对比基线: 20250601_embedding_v1（上次线上版本）

RAG 问答   : 通过率 92% (基线 90%) ↑  忠实性 4.6 (基线 4.5) ↑
Agent 任务 : 通过率 78% (基线 81%) ↓   ← 注意：回退了！
  - 失败集中在"多步检索任务"：工具调用在第三步开始出错

工程指标  : 延迟 P95 1.2s (基线 1.1s) ≈ 成本 +3%
结论      : Agent 任务回退，需要定位；RAG 有提升，可单独上线
```

报告的核心是**对比**：每次改动必须和上次基线比，涨了才能上线，跌了要定位。上面例子里的"Agent 回退"如果没跑评测根本发现不了——而发现后，评测还给出了定位线索（失败集中在多步检索任务）。

## 第四步：Agent 评测的特殊点

给 Agent 做评测，比 RAG 多了两个维度（Agent 系列会展开，这里先给评测视角）：

**维度一：过程质量，不只是结果。** Agent 跑完任务，结果对，但过程可能很烂——调了 20 次工具、在同一个错误上打转、访问了不该访问的工具。评测要记过程指标：

```python
def agent_process_metrics(trace) -> dict:
    return {
        "steps": len(trace["tool_calls"]),       # 步数（越少越好）
        "tool_errors": trace["tool_error_count"], # 工具调用失败次数
        "loops": detect_loops(trace),            # 是否在同一工具上打转
        "cost": trace["cost"],
        "completed": trace["task_done"],
    }
```

**维度二：回归要按"任务路径"组织。** Agent 是长流程，改一个环节可能让整条任务链在某一步悄悄坏掉。评测集按**典型任务路径**组织（每个任务一整条从开始到结束的完整流程），而不是只测单步输出——RAG 评"单次问答"，Agent 必须评"整条任务"。

## 第五步：差评回流，形成闭环

评测体系的发动机是回流机制（上篇详述）。落地时把它做成自动化程度递增的三段：

```text
V1（人肉版）：线上差评 → 手动记录到坏案例表 → 手动加进评测集
V2（半自动）：trace 平台标记差评 → 一键"加入评测集"（预填问题/输出）
V3（自动）：差评根因可自动归类（规则/分类器）→ 自动入对应的评测任务
```

即使是 V1 人肉版，也远胜于没有——**回流机制的关键是"每次都回流"，而不是"回流得多优雅"。**

## 一套最小可用评测体系的自检清单

从零搭评测体系，按这个清单逐项落地：

```text
□ 评测集：RAG 与 Agent 分任务建，含典型/边界/坏案例，golden set 占 30%+
□ 判分：规则判客观（出处/拒答/工具合法），Judge 判主观（质量/完成度）
□ 回归：任何改动上线前跑评测，结果带 tag 与基线对比
□ 线上：全量 trace + 规则门禁 + 抽样 Judge + 差评人工复核
□ 回流：差评 → 补评测集 → 防复发
□ 看板：质量分 / 差评率 / 根因分布，看趋势不看单点
```

## 小结

给 RAG 和 Agent 建评测体系，本质是把评测方法论组装成一条流水线：评测集按任务组织（RAG 评回答、Agent 还要评过程和任务完成）、执行器统一跑分且结果带版本、报告与基线对比决定"能不能上线"、线上差评回流补评测集形成闭环。**评测体系的成熟标志不是"工具有多全"，而是三个问题的回答变得容易：这次改动是涨是跌？差评出在哪个环节？坏案例有没有防住复发？** 能回答这三个问题，评测就从"成本"变成了"加速器"。

评测系列五篇完结。从"为什么评测是地基"到评测集设计、LLM-as-Judge、线上评测，再到这套实战体系——你已经有了让 AI 应用"可证明地变好"的完整方法论。下一篇进入这个版块的重头戏 Agent：让模型从"回答问题"到"完成任务"。
