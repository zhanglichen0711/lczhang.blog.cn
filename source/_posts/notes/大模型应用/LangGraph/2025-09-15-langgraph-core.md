---
title: "LangGraph 核心：节点、边与状态"
date: 2025-09-15
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph]
description: "用图描述 Agent：节点做一步、边决定流向、状态贯穿全程。把 ReAct 的循环画成一张能编译执行的图。"
abbrlink: 3069872840
---

上一篇讲了 LangGraph 为什么出现（Chain 装不下 Agent 的循环），这一篇把它的三个核心概念——**节点、边、状态**——讲透，然后用它们实现一个真正的 ReAct Agent。理解这三样，LangGraph 的图就长在你脑子里了。

## 三个核心概念

**State（状态）：流程的"共享黑板"。** 整个图的所有节点，读写同一个状态对象。它定义了流程里"有什么信息在流动"：

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
import operator

# Agent 的全局状态：所有节点共享
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]   # 对话历史（自动追加）
    task: str                                  # 目标任务
    tool_results: dict                         # 工具结果缓存
    steps: int                                 # 已走步数
    done: bool                                 # 是否完成
```

`Annotated[list, operator.add]` 是 LangGraph 的 reducer 语法——告诉框架"这个字段更新时是追加而不是覆盖"。状态更新默认是"覆盖"，想累加/追加要用 reducer。

**Node（节点）：图里的"一步"。** 节点是一个函数：读 State、干活、返回要更新的字段：

```python
def agent_node(state: AgentState) -> dict:
    """Agent 决策节点：模型决定下一步做什么"""
    resp = llm.decide(state["messages"])
    return {"messages": [resp], "steps": state["steps"] + 1}
```

节点的黄金法则：**节点是"状态的纯函数"**——输入 state，返回更新，不偷偷改外部变量。这保证了图可测试、可重放（给定相同状态，节点行为可复现）。

**Edge（边）：图的"流向"。** 边连接节点。两种边：

- **固定边**：无条件 A→B；
- **条件边**：根据状态决定走哪条路。

## 用 LangGraph 实现 ReAct

把 ReAct 循环（思考→行动→观察→再思考）画成图，它长这样：

```text
                 ┌──────────────┐
                 ▼              │（循环回来）
           ┌──────────┐    ┌──────────┐
开始 ──►  │  决策节点   │──► │ 工具执行  │
           │ (model)   │    │ (tools)  │
           └──────────┘    └──────────┘
                │
                │（模型决定结束）
                ▼
              END
```

用代码实现这个图：

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

llm = ChatOpenAI(model="qwen-plus", temperature=0)

# ---------- 1. 状态 ----------
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    steps: int

# ---------- 2. 节点 ----------
def call_model(state: AgentState) -> dict:
    """决策节点：模型决定下一步（调工具 or 给最终答案）"""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def call_tool(state: AgentState) -> dict:
    """工具执行节点：执行模型请求的工具调用"""
    last_message = state["messages"][-1]
    results = []
    for tool_call in last_message.tool_calls:
        tool = TOOL_REGISTRY[tool_call["name"]]
        result = tool.invoke(tool_call["args"])
        results.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))
    return {"messages": results}

# ---------- 3. 路由：模型决定走哪条边 ----------
def should_continue(state: AgentState) -> str:
    """条件边：有工具调用 → 走工具；没有 → 结束"""
    last = state["messages"][-1]
    return "tools" if last.tool_calls else "end"

# ---------- 4. 建图 ----------
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("tools", call_tool)
workflow.set_entry_point("agent")

# 条件边：agent 节点之后，根据 should_continue 决定走向
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {"tools": "tools", "end": END},
)
# 固定边：工具执行完，回到 agent 再决策（循环）
workflow.add_edge("tools", "agent")

app = workflow.compile()
```

这个图就是**一个完整的 ReAct Agent**：`agent` 决策 →（要调工具）→ `tools` 执行 → 回到 `agent` 再决策 →（完成）→ END。**循环通过"tools 回到 agent"这条边表达，分支通过"条件边"表达**——Agent 的自由循环，被装进了有结构的图里。

## 执行与流式

编译后的图可以同步执行，也支持流式（适合逐 token 输出给用户）：

```python
# 同步执行
result = app.invoke({
    "messages": [HumanMessage(content="查一下上海明天天气，建议是否带伞")],
    "steps": 0,
})

# 流式执行（逐步产出，适合给用户看过程/前端流式）
for chunk in app.stream({
    "messages": [HumanMessage(content="查一下上海明天天气")],
    "steps": 0,
}):
    for node_name, node_output in chunk.items():
        print(f"[{node_name}] {node_output}")
        # [agent] 模型决策……  [tools] 工具返回……
```

`app.stream()` 会按节点逐步产出——**这是 Agent 可观测的基础**：每一步经过哪个节点、产出了什么，都能被捕获记录（呼应 Agent 可观测篇）。

## 为什么"图"让 Agent 更好用

把 Agent 从"手写 while 循环"升级成"图"，三个实际收益：

**1. 结构可见。** 图编译后可以可视化（`app.get_graph().draw_mermaid()`），Agent 的流程长什么样一目了然——哪几步、怎么循环、哪里能退出。代码 review 和讲解都更容易。

**2. 每步可测。** 节点是"状态的纯函数"，可以单独测试：构造一个 state，测某个节点输出对不对，不用跑完整 Agent。**这让 Agent 的单测成为可能**（评测篇的"确定性环节单测"落到框架里）。

**3. 复用与扩展。** 加一个节点（比如加"反思"步骤）、改一条边（加人工确认），是在图上做局部修改，不动其他部分——Agent 演进成本大幅降低。

## 小结

LangGraph 三核心：State（共享黑板，全局状态显式化）、Node（一步处理，状态纯函数）、Edge（流向，固定或条件）。用它们把 ReAct 画成图：agent 决策节点 + tools 执行节点 + 条件边（有工具调用就循环、没有就结束）。**图的价值是让 Agent 的循环结构可见、可测、可扩展。** 下一篇讲状态管理的高级用法——checkpoint 持久化，让 Agent 可中断、可恢复。
