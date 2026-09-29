---
title: "条件分支与循环：把 ReAct 画成图"
date: 2025-09-29
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, ReAct]
description: "图的力量在条件边：模型决策决定走向。把工具路由、意图分流、失败重试都变成图上的条件分支。"
abbrlink: 3224751976
---

状态篇的 ReAct 图里已经出现了一个条件边（`should_continue`），这一篇专门讲**条件分支**——它是图相对"链"最核心的增量能力。真实 Agent 的流程从来不是直线：问题不同走不同工具、结果不同走不同分支、失败要重试、完成要退出。**条件边让这些"看情况"的流转显式化**，Agent 的决策逻辑从"藏在代码 if 里"变成"画在图上"。

## 条件边的本质：状态 → 路由决策

回顾一下条件边的写法。一个节点执行完后，调一个"路由函数"，它读状态、返回"下一步走哪条路"：

```python
def route_by_intent(state: AgentState) -> str:
    """意图路由：根据分类决定走哪条处理路径"""
    intent = state["intent"]
    if intent == "rag":
        return "rag_chain"        # 知识问答 → RAG 流程
    elif intent == "tool":
        return "tool_agent"       # 要调工具 → Agent 流程
    else:
        return "chat"             # 闲聊 → 直接对话

# 建图：节点 → 条件路由 → 各分支
workflow.add_conditional_edges(
    "intent_classifier",          # 前一个节点
    route_by_intent,              # 路由函数（读状态，返回分支名）
    {
        "rag_chain": "rag_node",
        "tool_agent": "agent_node",
        "chat": "chat_node",
    },
)
```

**路由函数是纯逻辑**（读状态、返回分支名），不调模型、没有副作用——所以它便宜、快、可单测。复杂的业务分流（意图、场景、用户类型）都应该用这种显式路由，而不是让模型在节点内部"自由决定"。

## 三个最常用的条件分支模式

**模式一：工具路由（该调哪个工具）。** 模型决定调用工具后，不同工具可以走不同的处理节点（有的工具要确认、有的要记录、有的直接执行）：

```python
def route_tool(state: AgentState) -> str:
    last_call = state["messages"][-1].tool_calls[0]
    tool_name = last_call["name"]
    # 敏感工具走"确认节点"，普通工具直接执行
    if tool_name in CONFIRM_TOOLS:
        return "confirm"          # 先人工/规则确认
    if tool_name in AUDIT_TOOLS:
        return "audit_execute"    # 执行 + 强审计
    return "execute"              # 普通执行
```

**模式二：结果分叉（成功/失败/重试）。** 工具执行的结果决定下一步——失败要重试还是换方案：

```python
def route_on_result(state: AgentState) -> str:
    last_result = state["tool_results"][-1]
    if last_result.get("success"):
        return "continue"         # 成功 → 继续 Agent 决策
    if state["retries"] < 2:
        return "retry"            # 可重试错误 → 回重试节点
    return "recover"              # 重试耗尽 → 降级/告知用户
```

**模式三：流程结束判断（什么时候停）。** Agent 最常见的分支是"继续还是结束"：

```python
def should_stop(state: AgentState) -> str:
    if state["steps"] >= MAX_STEPS:      # 步数上限
        return "timeout_exit"            # 走"超时收场"分支（不崩溃）
    if state.get("answer"):
        return "end"                     # 有答案 → 正常结束
    return "continue"                    # 否则继续循环
```

## 完整示例：带重试和超时收场的 ReAct 图

把上面的模式拼成一个更完整的图：

```python
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    steps: int
    retries: int
    answer: str

MAX_STEPS = 8
MAX_RETRIES = 2

def agent_node(state): ...            # 决策（同状态篇）
def execute_tool_node(state): ...     # 执行工具，更新 tool_results
def retry_node(state):
    """重试节点：把失败信息反馈给模型，让它换参数/换工具再试"""
    return {"retries": state["retries"] + 1,
            "messages": [SystemMessage(content="上一个工具调用失败了，请检查参数或换一种方式重试")]}
def timeout_exit_node(state):
    """超时收场：不崩溃，优雅告知用户"""
    return {"answer": "任务步骤过多未能完成，建议拆分为更小的任务或联系人工"}
def answer_node(state): ...           # 生成最终回答

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", execute_tool_node)
workflow.add_node("retry", retry_node)
workflow.add_node("timeout_exit", timeout_exit_node)

workflow.set_entry_point("agent")

# agent 之后：看是否结束（条件边）
workflow.add_conditional_edges("agent",
    lambda s: "end" if s["answer"] or not has_tool_call(s)
               else ("timeout" if s["steps"] >= MAX_STEPS else "tools"),
    {"tools": "tools", "timeout": "timeout_exit", "end": END})

# tools 之后：看成功还是重试（条件边）
workflow.add_conditional_edges("tools",
    lambda s: "retry" if tool_failed(s) and s["retries"] < MAX_RETRIES
               else ("agent" if tool_failed(s) else "agent"),
    {"retry": "retry", "agent": "agent"})

# retry 回到 agent 再决策
workflow.add_edge("retry", "agent")

app = workflow.compile(checkpointer=checkpointer)
```

这个图把 Agent 工程化的护栏（步数上限、重试上限、优雅收场）都画成了图的节点和边——**每一道护栏都是图上可见的一步**，而不是藏在循环代码里的 if。这让 Agent 的行为结构一目了然，也更容易测试每条路径。

## 图的边界：别把图画成意大利面

条件分支是强大的，但有个反面：**图会越来越复杂**。画图的纪律：

1. **节点别太碎**：能把"检索 + 过滤"合成一个节点，就别拆成三个——图的可读性优先于"每个函数一个节点"；
2. **分支别太多**：一个节点后接七八个分支，图就难懂了。能用状态（如统一走一个节点，内部按状态处理）解决的，少用分支；
3. **命名即文档**：节点名、分支名要能看出业务含义（`rag_node`、`confirm`、`timeout_exit`），别用 `node1`、`node2`。

**图的复杂度应该匹配流程的真实复杂度**——流程简单就画简单图，流程复杂就用分支表达清楚，而不是用一大坨 if 把复杂度藏起来。

## 小结

条件分支是图相对链的核心增量：路由函数读状态、返回走向，把"看情况"的流转显式画在图上。三种高频模式：工具路由（该调哪个工具/要不要确认）、结果分叉（成功/重试/降级）、结束判断（继续/正常结束/超时收场）。把护栏（步数上限、重试上限、优雅降级）画成图的节点和边，Agent 行为结构清晰、可测。**画图的纪律：节点别太碎、分支别太多、命名即文档——图的复杂度匹配流程的真实复杂度。** 条件分支让 Agent 图"能转向了"，下一篇给它加"能停下来等人工"的能力——human-in-the-loop。
