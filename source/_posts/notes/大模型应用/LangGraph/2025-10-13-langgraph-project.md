---
title: "实战：用 LangGraph 重写 Agent 服务"
date: 2025-10-13
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, 实战]
description: "把 Agent 实战篇的手写循环重构成 LangGraph 图：状态显式、审批中断、持久恢复、每步可观测，一条线跑通。"
abbrlink: 4201415299
---

LangGraph 系列最后一篇。在 Agent 实战篇里，我们手写了一个带护栏的 ReAct 循环（QAAgent）；这一篇把它**用 LangGraph 完整重写**——同样的业务（企业知识 Agent：查规范 + 查案例 + 敏感操作审批），但架构升级成图：状态显式、循环画成边、审批用中断、崩溃能恢复。对比两种写法，你能直观感受到"手写循环"和"图编排"的差别。

## 目标流程（画成图）

```text
               ┌────────────────────────────────────────┐
               ▼                                        │
 用户任务 ──► ① agent 决策 ──(要调工具)──► ② 工具路由     │
               │                           │            │
               │(完成)              普通工具│  │敏感工具   │
               ▼                         ▼    ▼        │
              END                 ③ 执行   ④ 审批(中断)   │
               ▲                          │    │(批准)   │
               │                          ▼    ▼        │
               └────────────────── ⑤ 回到 agent ◄───────┘
                      (工具结果回填，继续决策)
```

## 完整代码

```python
# agent_graph.py —— 用 LangGraph 重写企业知识 Agent
import operator
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver   # 生产换 PostgresSaver
from langgraph.types import interrupt, Command

# ---------- 1. 状态 ----------
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]    # 对话/工具消息（追加）
    steps: int                                  # 已走步数
    retries: int
    answer: str
    approved: bool

MAX_STEPS = 8

# ---------- 2. 节点 ----------
def agent_node(state: AgentState) -> dict:
    """决策节点：模型决定下一步（可挂可观测记录）"""
    resp = llm.invoke(state["messages"])
    return {"messages": [resp], "steps": state["steps"] + 1}

def execute_node(state: AgentState) -> dict:
    """普通工具执行"""
    call = state["messages"][-1].tool_calls[0]
    tool = TOOL_REGISTRY[call["name"]]
    result = tool.invoke(call["args"])
    return {"messages": [ToolMessage(content=str(result), tool_call_id=call["id"])]}

def approve_node(state: AgentState) -> dict:
    """敏感工具：中断等待人工审批（human-in-the-loop）"""
    call = state["messages"][-1].tool_calls[0]
    decision = interrupt({
        "tool": call["name"],
        "arguments": call["args"],
        "ask": f"Agent 请求调用敏感工具 {call['name']}，请审批",
    })
    if decision.get("approved") is True:
        return execute_node(state)     # 批准 → 执行
    # 拒绝 → 把原因反馈给模型，让它换方案
    return {"messages": [ToolMessage(
        content=f"审批被拒绝：{decision.get('reason','未说明')}",
        tool_call_id=call["id"])]}

def finalize_node(state: AgentState) -> dict:
    """生成最终回答"""
    return {"answer": state["messages"][-1].content}

# ---------- 3. 路由 ----------
def route_after_agent(state: AgentState) -> str:
    """agent 决策后：有工具调用 → 判断敏感与否；无 → 结束"""
    last = state["messages"][-1]
    if not getattr(last, "tool_calls", None):
        return "final"
    tool_name = last.tool_calls[0]["name"]
    return "approve" if tool_name in CONFIRM_TOOLS else "execute"

# ---------- 4. 建图 ----------
workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("execute", execute_node)
workflow.add_node("approve", approve_node)
workflow.add_node("finalize", finalize_node)
workflow.set_entry_point("agent")

workflow.add_conditional_edges("agent", route_after_agent,
    {"execute": "execute", "approve": "approve", "final": "finalize"})
workflow.add_edge("execute", "agent")      # 工具执行完回 agent（循环）
workflow.add_edge("approve", "agent")      # 审批完回 agent（继续决策）
workflow.add_edge("finalize", END)

app = workflow.compile(checkpointer=MemorySaver())
```

## 对比手写循环：框架带来的四个升级

**升级一：循环从"while"变成"边"。** 手写版的循环靠 `for step in range(max_steps)`，逻辑藏在代码里；图版本里"工具执行完回 agent"是图上的一条边——循环结构一目了然，加了新分支就是在图上加节点和边。

**升级二：审批从"自己写状态机"变成"interrupt"。** 手写版做人工审批，要自己管理"任务挂起状态、等待输入、恢复执行"一整套逻辑；图版本 `interrupt()` 一行，配合 checkpoint 自动完成暂停-持久化-恢复。**框架把"中断恢复"这种高难度通用能力做成了内建。**

**升级三：步数上限变成路由条件。** 手写版在循环头检查 `step >= max`；图版本在路由函数里判（示例为了简洁没展开，条件分支篇讲过 `should_stop`）——**护栏是图的一部分，可以可视化、可单独测。**

**升级四：状态天然可观测、可恢复。** 手写版要自己打日志记录每一步；图版本的每步执行都经过 checkpoint，配合 `app.stream()` 天然产出每一步的过程（可观测篇的轨迹数据直接有）。任务中断后同一个 `thread_id` 恢复——手写版要自己实现整套工作记忆。

## 调用侧：任务 + 审批 + 恢复

```python
config = {"configurable": {"thread_id": "task_1001"}}

# 1. 发起任务（可能在中途 interrupt 等待审批）
result = app.invoke(
    {"messages": [HumanMessage(content="查屋面防水规范，找整改案例，并给供应商 A 发合作邮件")],
     "steps": 0, "retries": 0, "answer": "", "approved": False},
    config=config,
)

# 2. 若任务在等待审批（app 返回了 interrupt 信号）：
pending = get_pending_approval("task_1001")   # 拿到待审批的工具调用
# 前端展示：Agent 想调 query_supplier 并发邮件，请批准

# 3. 用户批准 → 恢复执行
result = app.invoke(
    Command(resume={"approved": True, "reason": "供应商 A 是合作方，可以联系"}),
    config=config,
)
print(result["answer"])   # Agent 完成任务，输出带出处的汇总
```

## 工程化的配套（回顾 Agent 工程化篇）

LangGraph 管住了"图怎么跑"，工程护栏仍然是你的事：

- **成本预算**：在 agent 节点外包一层预算检查（累计成本超限 → 路由到"预算超限"节点优雅收场）；
- **工具白名单与权限**：`TOOL_REGISTRY` 按用户角色过滤（执行节点内部校验用户权限）；
- **可观测**：`app.stream()` 的每步输出 + 结构化日志，接进 trace 平台（Agent 可观测篇）；
- **评测**：图跑完的任务路径评测（完成率 + 平均步数），接评测体系。

## 什么时候用这套、什么时候别用

这套图编排适合：**多步、要循环、要审批中断、要持久恢复的正式 Agent 服务**。但如果你只是做一个"一次工具调用就完事"的助手，或者还在验证想法的原型阶段——直接函数调用更轻，别上框架。**用 LangGraph 的判据：你的 Agent 复杂到"手写循环已经很难维护"了吗？是，才值得画成图。**

## 小结

用 LangGraph 重写 Agent，本质是把"手写循环 + 手写状态管理"升级成"图编排 + 内建 checkpoint"。四个升级：循环成边（结构可见）、审批用 interrupt（暂停恢复交给框架）、护栏成路由条件（可测可看）、状态天然持久可恢复。工程护栏（预算、权限、观测、评测）仍需自己配。**LangGraph 不是让 Agent 变聪明，是让聪明的 Agent 变得可维护、可恢复、可信赖**——这六篇从框架演进讲到核心、状态、分支、人工介入再到这个实战，一条"用图把 Agent 工程化"的完整路径就走通了。

LangGraph 系列完结。下一篇进入这个版块最后一个分类 Multimodal——把能力从文本扩展到图文，看看多模态应用怎么做。
