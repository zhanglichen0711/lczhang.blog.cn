---
title: "Agent 的思考模式：从 Tool use 到 ReAct"
date: 2025-07-14
categories:
  - [大模型应用, Agent]
tags: [Agent, ReAct]
description: "五种思考模式能力递进：Tool use、ReAct、Reflection、Planning、Multi-agent。从简单的开始，按需加码。"
abbrlink: 2769725658
---

Agent 有了工具（Function Calling + MCP），下一步是决定"怎么用工具"——这就是 Agent 的思考模式。业内总结出五种常见模式，能力逐渐加码：**Tool use → ReAct → Reflection → Planning → Multi-agent**。理解这条光谱很重要，因为大部分团队的错误是**一上来就用最复杂的模式**，而实际上简单的模式往往更稳、更便宜、更容易测。这篇讲透五种模式，以及怎么选。

## 模式一：Tool use——按需调一次工具

最简单的模式：模型判断"这个问题需不需要工具"，需要就调一次，拿到结果直接回答。

```text
用户：上海天气如何？
模型判断：需要天气 → 调 get_weather("上海") → 拿到结果 → 直接回答
```

**特点**：单轮、无循环、决策简单。适合"一次工具调用就能解决"的任务——查个天气、查个订单状态、做个翻译。它其实是"带工具的 RAG 问答"，Agentic 程度最低。

**为什么它是地基**：很多任务根本不需要多轮循环，Tool use 就够了。把它做好（工具设计 + Function Calling 可靠），比盲目上复杂模式更有价值。

## 模式二：ReAct——边想边做，观察后决定下一步

ReAct（Reasoning + Acting）是 Agent 的核心模式：**思考 → 行动 → 观察 → 再思考**，形成一个循环。模型每一步都"说出自己的想法，决定调什么工具，观察结果，再决定下一步"。

```text
用户：上海明天下雨吗？下雨的话要不要带伞？
模型（思考）：需要先查天气，再根据天气给建议
行动：get_weather("上海", "明天")
观察：{"condition": "雨", "temperature": 22}
模型（思考）：明天下雨，温度 22 度，建议带伞
回答：明天下雨，建议带伞。
```

ReAct 的关键机制：**模型通过"推理文本"来组织行动**——它先想"我需要什么信息"，再决定调什么工具，而不是盲目乱调。在提示/实现层面，ReAct 可以这样表达：

```python
REACT_PROMPT = """你是任务助手。请按以下循环工作：
思考：分析当前情况，决定下一步需要什么信息
行动：调用工具获取信息（格式：Action: 工具名(参数)）
观察：工具返回的结果
……重复，直到可以给出最终答案
最终：Answer: 最终答案

可用工具：
{工具列表}
"""

def react_loop(task: str, max_steps: int = 6):
    messages = [{"role": "user", "content": task}]
    for _ in range(max_steps):
        resp = llm(messages)
        if resp.contains("Answer:"):
            return extract_answer(resp)
        action = parse_action(resp)          # 解析 Action: get_weather(上海)
        result = execute_tool(action)         # 执行工具
        messages.append({"role": "tool", "content": str(result)})
    return "任务超步数未完成"
```

**特点**：多轮循环、带推理、能根据中间结果调整。这是"真正 Agent"的起点，也是后续所有模式的基础。**工程关键：步数上限、工具失败恢复（工具设计篇的错误契约在这里发挥作用）。**

## 模式三：Reflection——对已有结果检查修正

ReAct 是"边做边想"，Reflection 是"做完再检查"：让模型先产出结果，再换个视角审视自己的结果，发现错误就修正。

```text
第一遍：模型生成了一段 SQL
反思：模型检查"这段 SQL 有没有语法错误、有没有漏条件？"
修正：发现问题 → 重写 SQL
```

实现上通常是"两次调用"：一次生成，一次用"审视者"提示检查：

```python
def generate_with_reflection(task: str):
    # 第一遍：生成
    draft = llm(f"完成任务：{task}")

    # 第二遍：反思（换个提示，扮演审视者）
    review = llm(f"""检查下面的回答是否准确、完整，列出问题：
任务：{task}
回答：{draft}
问题列表：""")

    if "没问题" in review or not review.strip():
        return draft
    # 第三遍：根据反思修正
    revised = llm(f"根据以下问题修正回答。\n任务：{task}\n原回答：{draft}\n问题：{review}\n修正后：")
    return revised
```

**特点**：质量更高但成本翻倍（多次调用）。适合"生成结果容易被自己发现错误"的任务——代码生成、SQL、结构化输出。**反思的质量取决于模型"能不能看出自己的错"——模型能力不足时，反思只是多花一次钱。**

## 模式四：Planning——先拆任务再执行

ReAct 是"走一步看一步"，Planning 是"先规划再行动"：模型先分析任务、拆成子任务清单，再逐个执行。

```text
用户：帮我调研三家云厂商的 GPU 价格，并出一份对比报告
规划：
  1. 列出三家厂商（A/B/C）
  2. 逐个查询 GPU 实例价格
  3. 汇总成对比表
  4. 写报告
执行：按清单逐项做……
```

```python
def plan_and_execute(task: str):
    # 第一步：生成计划
    plan = llm(f"""把任务拆成可执行的步骤清单（每步尽量独立）：
任务：{task}
步骤：""")

    results = []
    for step in parse_steps(plan):
        # 第二步：逐步执行（每步可以是一个子 Agent 或一次工具调用）
        result = execute_step(step)
        results.append(result)

    # 第三步：汇总结果，生成最终输出
    return llm(f"基于以下步骤结果，完成最终输出。\n任务：{task}\n步骤结果：{results}")
```

**特点**：长任务更可控（计划先行，不易跑偏）、可中断可恢复（每步独立）。适合多步骤、目标明确的任务。**代价**：规划本身可能错（拆错步骤），需要结合执行反馈调整。

## 模式五：Multi-agent——分工协作

多个 Agent 各司其职、协作完成任务。常见形态：一个"编排者"拆任务、多个"专家 Agent"各干一段、再汇总。

```text
编排 Agent：把"调研+报告"任务拆成：
  → 搜索 Agent：查资料
  → 分析师 Agent：分析对比
  → 写作 Agent：写报告
各 Agent 结果汇集给编排者，整合输出
```

**特点**：能并行、能复用专家能力，但复杂度最高——Agent 之间的通信、上下文传递、结果合并都是新问题。**Multi-agent 是最容易被滥用的模式**：很多任务一个 Agent 干完就行，拆成多个反而引入协作开销。它适合任务本身可以清晰拆分成不同领域、且各领域需要不同"专家设定"的场景。

## 怎么选：从简单的开始，按需加码

五种模式不是"越高级越好"，是**越复杂越贵、越难控、越难测**。选择的原则：

```text
Tool use（单次调用）     够用就别加循环
  ↓ 任务需要多步/中间决策？
ReAct（循环决策）       最常用的"标准 Agent"
  ↓ 结果容易自检错误、质量要求高？
Reflection（生成后检查）  多花一次调用换质量
  ↓ 任务长、目标明确、怕跑偏？
Planning（先拆后做）      让长任务可控
  ↓ 任务天然分领域、需并行？
Multi-agent（协作）      最后才考虑
```

**工程心法：用最低的复杂度完成任务，每次加码都要有评测数据支撑**——加了 Reflection，评测分数涨了才留下；拆了 Multi-agent，任务完成率提升了才值得。Agent 模式不是炫技清单，是问题驱动的工具集。

## 小结

五种思考模式能力递进：Tool use（单次调用）、ReAct（循环决策，标准 Agent 的核心）、Reflection（结果自查修正）、Planning（先拆任务再执行）、Multi-agent（多角色协作）。复杂度、成本、失控风险逐级上升。选择原则是从简单开始、按需加码、用评测验证每次加码的价值。**Agent 工程的核心不是"用多复杂的模式"，而是"用刚好够用的复杂度把任务做稳"。**

下一篇讲 Planning 与 Reflection 的进阶形态——规划与反思怎么落地成可靠机制，以及它们各自的边界。
