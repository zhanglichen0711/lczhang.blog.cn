---
title: "人工介入与中断恢复：human-in-the-loop"
date: 2025-10-06
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, 人工介入]
description: "关键动作不能全自动：Agent 跑到一半停下来等人确认，确认完再继续。checkpoint 让中断恢复成为可能。"
abbrlink: 3701507656
---

Agent 全自动是理想，但生产环境里有些动作**必须有人把关**——给客户发正式邮件、执行财务操作、删除数据、做高风险决策。如果这些也让 Agent 自动执行，一旦判断错误，后果由谁承担？这就是 human-in-the-loop（人工介入）：**Agent 跑到关键节点停下来，等人工确认或输入，确认完再从断点继续。** 它结合了 Agent 的效率和人的判断力，也是生产级 Agent 的必备能力。LangGraph 的 checkpoint（状态篇）让"停下来再继续"成为可能——这一篇讲怎么实现。

## 人工介入的三种典型场景

**场景一：执行前审批（Approval）。** Agent 准备执行有副作用的动作（发邮件、转账、删数据），先停下来给人工看"它打算做什么"，批准才执行：

```text
Agent：准备给客户 A 发送邮件，内容如下……
       —— 等待人工批准 ——
人工：批准 / 修改后发送 / 拒绝
Agent（批准后）：继续执行
```

**场景二：索取缺失信息（Input）。** Agent 做任务发现缺关键信息（订票不知道日期），不能瞎猜，要停下来问用户：

```text
Agent：需要确认机票的出发地和日期，请提供
用户：北京到上海，明天
Agent：继续订票流程
```

**场景三：复杂决策上报（Escalation）。** Agent 遇到自己处理不了的情况（规则冲突、高风险判断），转给人工决策，而不是硬着头皮继续。

## LangGraph 实现审批中断

LangGraph 有两种实现人工介入的方式，最常用的是 **interrupt**（中断）：在节点里调用 `interrupt()`，图会暂停执行、把控制权交回外部（应用层），等人给了输入再继续。

```python
from langgraph.types import interrupt, Command

def execute_with_approval(state: AgentState):
    """工具执行节点：敏感动作执行前先中断等人工批准"""
    tool_call = state["messages"][-1].tool_calls[0]

    # 敏感工具才需要审批
    if tool_call["name"] not in CONFIRM_TOOLS:
        return execute_tool(state)     # 普通工具直接执行

    # 中断：把"待审批的动作"抛给外部，暂停图执行
    decision = interrupt({
        "type": "approval_request",
        "tool": tool_call["name"],
        "arguments": tool_call["args"],
        "message": f"Agent 请求执行 {tool_call['name']}，参数：{tool_call['args']}，是否批准？",
    })

    # interrupt 返回后从这里继续（外部给了 decision）
    if decision.get("approved") is True:
        return execute_tool(state)
    if decision.get("approved") is False:
        # 拒绝：把拒绝原因反馈给模型，让它换方案
        return {"messages": [ToolMessage(
            content=f"用户拒绝了该操作：{decision.get('reason', '未说明')}",
            tool_call_id=tool_call["id"],
        )]}
    # 修改后执行
    return execute_tool({**state, "tool_call": decision["modified"]})
```

**关键理解：`interrupt()` 不是"抛异常"，而是"暂停图、保存状态、等待外部输入"**——配合 checkpoint，图停在这一点，状态已持久化，人什么时候批都行，批完从这一点继续。这背后就是状态篇讲的 checkpoint 能力：**中断恢复不是魔法，是"状态被保存了，可以从任何一步恢复"。**

应用层处理中断（用户的审批界面/接口）：

```python
# 图执行到 interrupt 时，会抛出需要人工输入的信号
def handle_task(task_id: str, user_input: str | None = None):
    config = {"configurable": {"thread_id": task_id}}

    # 场景 A：任务第一次跑，可能在中途 interrupt 等待
    result = app.invoke(initial_input, config=config)

    # 若任务已中断等待输入（比如等待审批）：
    # 用户确认后，用 Command(resume=...) 恢复执行
    if task_is_waiting(task_id):
        decision = {"approved": True, "reason": user_input}
        result = app.invoke(
            Command(resume=decision),     # 把人工决定喂回中断点
            config=config,
        )
    return result
```

## 人工介入的工程形态

**形态一：同步界面（Web 审批）。** 最常见——Agent 跑到审批点，前端弹出"待审批"卡片（显示 Agent 要做什么），用户点批准/拒绝/修改。适用：低频、需要人看上下文的操作。

**形态二：异步通知（消息审批）。** Agent 中断后通过企业微信/邮件通知审批人，审批人在消息里回复决定，系统 `Command(resume=...)` 恢复。适用：Agent 在后台跑、人不盯着的场景。

**形态三：规则化审批（兜底）。** 不是所有审批都要人看——能用规则自动批的（金额 < 阈值、收件人在白名单），先自动过；规则的边界之外才转人工。**把人工介入留给"规则处理不了"的决策**，别让人天天给 Agent 当按钮。

```python
def approval_policy(tool_call: dict, user: User) -> str:
    """审批策略：auto（自动过）/ confirm（人工确认）/ deny（直接拒绝）"""
    if tool_call["name"] == "send_email":
        if tool_call["args"].get("amount", 0) < 1000 and user.role == "admin":
            return "auto"           # 小额 + 管理员 → 自动
        return "confirm"            # 否则人工确认
    if tool_call["name"] == "delete_record":
        return "deny"               # 删除操作 Agent 一律不许执行
    return "auto"
```

## 超时与滞留：人工不回复怎么办

人工介入最实际的坑：**人迟迟不回复，Agent 卡在中断点**。要设计超时和滞留处理：

```text
审批请求发出 → 进入等待
  ├─ 审批人批准/拒绝 → 恢复执行
  ├─ 超时（如 24 小时未处理）→ 按策略处理：
  │     · 高危操作：默认拒绝（安全优先），并通知用户"审批超时已取消"
  │     · 低危操作：可配置"超时自动继续"或转第二审批人
  └─ 任务过期（超过保留期）→ 清理状态，告知用户重新发起
```

**安全默认值是"超时拒绝"**——尤其是高风险的写操作，宁可任务失败，不能在没有审批的情况下自动执行。

## 小结

human-in-the-loop 让 Agent 在关键节点停下来等人工：三类场景（执行前审批、索取缺失信息、复杂决策上报）。LangGraph 用 `interrupt()` + checkpoint 实现——图暂停、状态持久化、`Command(resume=...)` 恢复。工程形态分同步界面、异步通知、规则化审批（能用规则自动批的先自动，人工留给规则处理不了的）。别忘了超时设计：高危操作默认"超时拒绝"。**Agent 的价值是效率，人的价值是判断——human-in-the-loop 是把两者正确分工的机制，也是生产级 Agent 信任度的来源。**

下一篇是 LangGraph 系列的实战收尾：把状态、分支、中断全部串起来，用 LangGraph 完整重写一个带人工审批的生产级 Agent 服务。
