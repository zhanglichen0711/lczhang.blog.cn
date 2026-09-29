---
title: "Agent 评测：任务成功率与回归"
date: 2025-08-18
categories:
  - [大模型应用, Agent]
tags: [Agent, 评测]
description: "RAG 评回答质量，Agent 还要评任务完成度与过程合理性：步骤数、工具错误、死循环、恢复能力。"
abbrlink: 786405299
---

RAG 的评测评"回答好不好"，Agent 的评测要复杂得多——它不只输出一段话，而是**执行了一串行动**。判断 Agent 好不好，要看三个层次：**任务完成没有（结果）、怎么完成的（过程）、换一种情况还会不会（鲁棒性）。** 这一篇讲 Agent 评测的完整框架——它和 RAG 评测的差异、测哪些维度、怎么组织回归。

## Agent 评测和 RAG 评测的根本差异

RAG 评测是"单轮打分"：一个问题，一个回答，评质量。Agent 不行，因为：

**1. 结果不是唯一评判。** Agent 任务"查天气并建议带伞"，如果它绕了 20 步、调错 5 次工具才完成，算好吗？结果对了，但过程很烂——成本高、易出错、不可靠。

**2. 没有唯一正确答案。** RAG 有标准答案可比（golden set），Agent 任务"帮用户调研云厂商"，完成的方式有无数种——没有"标准答案"，只能评"任务目标是否达成 + 过程是否合理"。

**3. 错误是累积的。** 单步小错可能滚成任务失败，评测必须看整条链而不是单步。

所以 Agent 评测要回答三个问题，缺一不可：

```text
① 任务完成了吗？    （结果维度）
② 过程健康吗？      （过程维度）
③ 换场景还稳吗？    （鲁棒性维度）
```

## 结果维度：任务完成度怎么判

"任务完成度"没有标准答案，工程上用分级判定 + 多信号交叉：

**信号一：Agent 自报完成 + 用户确认。** 最朴素的信号，但 Agent 会"自信地错"——它以为做完了，实际没做对。不能只信它。

**信号二：结果可验证的用规则校验。** 如果任务产出有明确可验证点，用规则判（比模型判断可靠）：

```python
def verify_result(task: dict, agent_output: dict) -> dict:
    """按任务类型校验结果（规则优先）"""
    checks = {}
    if task["type"] == "report":
        # 报告类：检查是否包含所有必需章节
        checks["sections_complete"] = all(
            s in agent_output["report"] for s in task["required_sections"]
        )
        checks["has_sources"] = bool(agent_output.get("sources"))
    if task["type"] == "data_query":
        # 数据类：检查返回结构是否合法
        checks["schema_valid"] = validate_schema(agent_output["data"], task["schema"])
    return checks
```

**信号三：LLM-as-Judge 判定完成度。** 无法规则化的任务（开放式调研），用 Judge 按标准判"任务目标是否达成"：

```python
AGENT_DONE_JUDGE = """判断 Agent 是否完成了用户的任务。
任务：{task}
Agent 的最终输出：{output}
判断标准：目标是否达成？关键要求是否满足？有无遗漏？
只输出：完成 / 部分完成（说明缺什么）/ 未完成（说明原因）"""
```

**实践结论：完成度判断是"多信号投票"**——规则校验（能规则的）+ Judge（不能规则的）+ 人工抽检（争议的）。别只信 Agent 自报。

## 过程维度：从轨迹里挖的指标

过程质量看 Agent 的轨迹（上一篇可观测打的基础在这里用上）：

```python
def eval_process(agent_trace: dict) -> dict:
    """过程质量：从轨迹算过程指标"""
    steps = agent_trace["steps"]
    return {
        "steps_used": len(steps),                 # 用了几步（与基准比）
        "tool_errors": sum(1 for s in steps if s["action_result"].get("error")),
        "tool_error_rate": round(tool_errors / len(steps), 3),
        "repeated_calls": detect_repeated(steps),  # 重复调用数
        "looped": detect_loop(steps),              # 是否死循环
        "cost": agent_trace["outcome"]["total_cost"],
        "completed": agent_trace["outcome"]["success"],
    }
```

**过程指标的用法是对比，不是孤立的绝对值**：同一个任务，跑 10 次，平均 5 步完成——某次改动后平均变 8 步，就是过程退化了。**"换模型让 Agent 平均步数从 5 涨到 8"这类退化，只有过程评测能发现，结果评测（完成率没变）看不出来。**

过程健康的黄金标准：**用最少的步数、最少的工具错误完成任务**。步数和错误率是和完成率并列的 Agent 核心指标。

## 鲁棒性维度：边界与恢复

Agent 评测还要覆盖"不顺利的情况"——真实任务总会遇到意外：

**边界测试：**
- 任务信息不全（"帮我订机票"——没给日期地点，Agent 应该追问还是瞎订？）
- 工具不可用（故意让工具失败，看 Agent 能否正确恢复/告知）
- 任务不可能完成（Agent 应该承认做不到，而不是硬编结果）

**恢复测试：**
- 工具失败后，Agent 是正确重试、换方案，还是死循环？
- 中途被打断（模拟超时），恢复后能否从中断处继续（工作记忆）？

```python
EDGE_TASKS = [
    {"task": "帮我订机票", "expect": "追问必要信息或说明缺少什么", "note": "信息不全"},
    {"task": "查一个不存在的订单号", "expect": "告知查无此订单，不编造", "note": "工具空结果"},
    {"task": "调一个会超时的工具", "expect": "重试或告知超时，不死循环", "note": "工具故障"},
]
```

**鲁棒性是被最多 Agent 项目忽略的评测维度**——大家都在测"顺利的任务"，但生产环境里 Agent 真正的价值，恰恰体现在"不顺利时能不能体面地处理"。

## 评测集怎么组织：按"任务路径"

Agent 评测集不是"一组问题"，是"一组完整任务路径"。每个评测项是一个从开始到结束的整任务：

```python
AGENT_EVAL_SUITE = {
    "task_paths": [
        {
            "id": "tp_query_weather",
            "goal": "查上海明日天气并给出带伞建议",
            "setup": {"tools": ["get_weather"]},   # 任务环境
            "expect": {
                "complete": True,                    # 结果
                "max_steps": 4,                      # 过程约束
                "tool_used": "get_weather",          # 应调用正确工具
            },
        },
        # ... 覆盖各任务类型 + 边界 + 失败恢复
    ]
}
```

Agent 评测回归的组织原则（呼应评测系列）：**每次改动（模型/提示/工具/编排）跑全套任务路径，对比完成率、平均步数、工具错误率——任何一项退化都阻止上线。** 线上差评任务 → 提取轨迹 → 补成新的任务路径评测项。

## 小结

Agent 评测三维度：结果（任务完成度，规则 + Judge + 人工多信号判定，别只信自报）、过程（步数、工具错误、死循环，用对比发现退化）、鲁棒性（边界与失败恢复，最常被忽略却最关键）。评测集按"任务路径"组织（整任务而非单题），改动前后跑全套对比。**Agent 评测比 RAG 难，是因为它评的不只是"说得对不对"，还有"做得稳不稳、遇到意外会不会崩"——这三个维度缺一个，Agent 上线就是盲飞。**

下一篇讲 Agent 工程化的收口：可靠性、成本与安全——把散落的护栏（步数、熔断、权限、人工介入）组装成一套生产级保障。
