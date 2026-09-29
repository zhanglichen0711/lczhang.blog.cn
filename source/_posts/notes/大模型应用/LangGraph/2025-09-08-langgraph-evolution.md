---
title: "从 LangChain 到 LangGraph：框架的演进"
date: 2025-09-08
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, LangChain]
description: "Chain 只能线性串联，Agent 需要循环与分支。LangGraph 把 Agent 流程画成图，状态显式、可恢复。"
abbrlink: 2267293682
---

Agent 的概念讲完了，这一篇开始讲落地框架。在 LangChain 时代，编排 AI 流程靠"链"（Chain）——把 Prompt、模型、检索串成一条线。但 Agent 的出现暴露了 Chain 的根本局限：**Chain 是线性的，而 Agent 是循环的**——它要根据工具结果决定下一步，可能要回退、要分支、要循环。LangGraph 就是为这个而生的：**把 Agent 的流程从"链"升级成"图"（Graph），节点是步骤，边是流转，状态显式地在节点间传递。**

## LangChain 解决了什么、卡在哪

LangChain 的价值（2023-2024 的主流）：把调用 LLM 的常见模式抽象成可组装组件——Prompt 模板、模型封装、输出解析、检索器、记忆，用 Chain 串起来。它解决的是"**固定流程的编排**"：

```python
# LangChain 时代的典型 Chain：固定线性流程
chain = (
    {"question": RunnablePassthrough()}
    | prompt_template      # 1. 拼提示
    | llm                 # 2. 调模型
    | output_parser       # 3. 解析输出
)
```

Chain 的局限在写出来那一刻就注定了：**它是单向的直线。** 而真实 Agent 需要的是：

- **循环**：做完一步，根据结果决定要不要再来一步；
- **分支**：这个条件走 A，那个条件走 B；
- **状态**：多步之间共享和更新信息（而不是每步只靠上一步的输出）；
- **中断与恢复**：跑到一半停下来等人确认，然后再继续。

用 Chain 硬写这些需求，代码会扭曲成"用 if/while 模拟图"——状态藏在哪里都不对。**问题不是 Chain 不够好，是它被用在了自己不适合的场景（Agent 需要图，不是线）。**

## LangGraph 的核心转变：从"链"到"图"

LangGraph 把编排模型从"线性链"改成"有向图"：

```text
Chain 视角：            LangGraph 视角：
A → B → C              A ──► B ──► C
                        │         ▲
                        └──► D ───┘（分支/汇合）
                             循环：B → D → B（根据条件）
```

LangGraph 的几个核心概念：

- **State（状态）**：整个流程共享的数据结构，所有节点读写它——这是和 Chain 最大的区别，**每一步都能看到和修改全局状态**；
- **Node（节点）**：一个处理步骤（调模型、调工具、做判断）；
- **Edge（边）**：节点间的流转关系，可以是固定流转，也可以是**条件流转**（根据状态决定走哪条边）；
- **Graph（图）**：节点 + 边的组合，编译后可以执行。

一个直观的对应：**LangGraph 之于 Agent，就像状态机之于复杂业务流程**——它把"Agent 的自由循环"装进了"有结构的状态图"里，让循环可控、可检查、可恢复。

## 最小示例：用图表达一个两步流程

先感受一下 Graph 的写法（两步流程：先改写查询、再检索回答）：

```python
from typing import TypedDict
from langgraph.graph import StateGraph, END

# 1. 定义共享状态（所有节点读写这个结构）
class QAState(TypedDict):
    question: str
    rewritten: str
    answer: str

# 2. 定义节点（每个节点是处理 state 的函数）
def rewrite_node(state: QAState) -> dict:
    # 改写查询（调用 LLM）
    rewritten = llm_rewrite(state["question"])
    return {"rewritten": rewritten}      # 返回要更新的字段

def answer_node(state: QAState) -> dict:
    answer = llm_answer(state["rewritten"])
    return {"answer": answer}

# 3. 建图、加节点、连边
graph = StateGraph(QAState)
graph.add_node("rewrite", rewrite_node)
graph.add_node("answer", answer_node)
graph.add_edge("rewrite", "answer")      # 固定流转
graph.add_edge("answer", END)            # 结束
graph.set_entry_point("rewrite")

# 4. 编译并执行
app = graph.compile()
result = app.invoke({"question": "屋面漏水怎么办", "rewritten": "", "answer": ""})
print(result["answer"])
```

对比 Chain，注意两个区别：**状态是显式的**（一个贯穿全程的 QAState），**流转是图结构**（即便这里还是线性，但你已经能看到"加循环/加分支"的空间）。

## 为什么"状态显式"对 Agent 是质变

Chain 里每步只有"上一步的输出"，Agent 需要的是"整个任务的上下文"。LangGraph 的 State 解决了这个问题：**所有节点共享一个状态对象，任何一步都能读全局信息、更新局部结果。**

这对 Agent 的意义是决定性的：

1. **可检查**：任何时刻，任务的完整状态（做了什么、做到哪了）都在 State 里，能打印、能持久化；
2. **可恢复**：State 可以保存（checkpoint），中断后从保存的状态继续（工作记忆篇的需求，框架直接支持）；
3. **可测试**：给定一个 State，节点是纯函数（输入 state 输出更新），可以单独单测。

**把 Agent 从"隐式的消息列表魔法"变成"显式的状态流转"，是 LangGraph 让 Agent 工程化的核心贡献。** 后续几篇会在状态管理、分支循环、人工介入上深入。

## 什么时候用 LangGraph，什么时候不用

LangGraph 不是银弹，选型看场景：

```text
用 LangGraph：
  · 多步、需要循环/分支的 Agent（ReAct、Plan-and-Execute）
  · 需要中断/恢复/人工介入的流程
  · 需要状态可检查、可持久化的长任务

不用 LangGraph：
  · 单次调用或固定线性流程 → 直接写代码或 Chain 更轻
  · 简单 RAG（检索→生成）→ 不需要图，直接函数调用
  · 团队规模小、流程固定 → 引入框架前先确认复杂度真的需要
```

**判断心法：你的流程是"线"还是"图"？** 是线，用最简单的方式；是图（有循环/分支/状态），LangGraph 的价值才兑现。别为了用框架而把简单流程硬画成图。

## 小结

LangChain 解决固定线性流程的编排，Agent 需要循环/分支/状态，于是有了 LangGraph——把编排从"链"升级为"图"。核心转变是状态显式化：所有节点共享 State，流程可控、可检查、可恢复。选型心法：流程是线用 Chain/直写，是图才用 LangGraph。**下一篇深入 LangGraph 的核心概念——节点、边与状态，把 Agent 的骨架真正搭起来。**

接下来几篇会用 LangGraph 逐步实现一个真实 Agent（从 ReAct 到带人工介入的完整流程），建议边看边敲。
