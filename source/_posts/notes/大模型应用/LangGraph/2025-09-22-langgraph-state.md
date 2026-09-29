---
title: "状态管理与持久化：让 Agent 可恢复"
date: 2025-09-22
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, 状态管理]
description: "Agent 跑一半断了是常态。checkpoint 把每一步状态存下来，崩溃后从断点继续，而不是从头再来。"
abbrlink: 1028338986
---

Agent 跑长任务，最怕的是"跑一半断了"——进程重启、网络抖动、用户关掉页面，任务状态全丢，只能从头再来。对短任务这还能忍，对"调研十家厂商并出报告"这种要跑几分钟的任务，一次崩溃就是一次完全浪费。**LangGraph 用 checkpoint（检查点）解决这个问题：把每一步执行后的状态持久化，Agent 可以随时暂停、恢复、甚至回退。** 这一篇讲透状态持久化——它是长任务 Agent 能上生产的基石。

## 为什么状态持久化是刚需

回顾状态篇的图：Agent 跑一个任务，要经过"决策→工具→决策→工具→……→结束"很多步。每一步之间，状态（messages、step、中间结果）都存在内存里。问题就在这——**内存里的状态是易失的**：

- 进程崩了 → 状态没了；
- 任务跑太久 → 连接断了 → 状态没了；
- 用户想"明天继续这个任务" → 内存早已清空。

没有持久化的 Agent 有个隐含假设：**任务必须一口气跑完**。而真实世界的任务常常需要中断——要么是系统故障，要么是流程需要等人工（下一篇的 human-in-the-loop 也依赖持久化：停下来等人确认，人确认完再继续）。

## LangGraph 的 checkpoint：自动保存状态

LangGraph 内置了 checkpoint 机制：**图每执行完一个节点，就自动把状态存到持久化存储里。** 用起来很简单，编译时传入一个 checkpointer：

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver  # 生产用 PostgreSQL

# 开发：内存 checkpointer（进程内）
checkpointer = MemorySaver()

# 生产：PostgreSQL checkpointer（跨进程持久化）
# checkpointer = PostgresSaver.from_conn_string("postgresql://...")

# 编译时传入 checkpointer → 图自动支持持久化
app = workflow.compile(checkpointer=checkpointer)
```

之后每次执行都要带一个 `thread_id`（标识"哪条任务线"），LangGraph 用它在存储里定位状态：

```python
config = {"configurable": {"thread_id": "task_8821"}}

# 第一次执行：Agent 开始跑任务
result1 = app.invoke(
    {"messages": [HumanMessage(content="调研三家云厂商 GPU 价格")]},
    config=config,
)
# → 跑到某一步（比如查完厂商 A），状态已自动保存

# 进程崩溃/中断后…… 用同一个 thread_id 继续：
result2 = app.invoke(
    {"messages": [HumanMessage(content="继续")]},   # 或直接不传新消息
    config=config,
)
# → 从上次停下的位置继续，而不是从头跑
```

**关键点：只要用同一个 thread_id，LangGraph 就能从上次的 checkpoint 继续执行**——中间跑了几步、工具返回了什么，全在持久化状态里，不用重新执行。

## 状态里存了什么、能干什么

checkpoint 持久化的是图的完整状态（State + 执行位置）。这意味着你获得了三个能力：

**能力一：断点续跑。** 崩溃/中断后，同 thread_id 继续，从中断处接着跑（工作记忆篇的需求，框架原生支持）。

**能力二：历史回放。** 每个 checkpoint 都记录了"执行到某步时的状态"。可以回看任务每一步的状态快照——调试 Agent 时，能精确看到"第 3 步之后状态变成了什么"。

**能力三：分支探索。** 基于某个历史 checkpoint 分叉出新的执行线（thread_id 加后缀），做"如果这里换个方案会怎样"的实验——A/B 测试 Agent 策略很方便。

## 工程落地：状态存哪、存多久

选 checkpointer 存储的经验：

| 存储 | 适用 | 说明 |
|---|---|---|
| MemorySaver | 开发调试 | 进程内，重启即失，只用来本地跑通 |
| SqliteSaver | 单机小规模 | 文件持久化，适合原型 |
| PostgresSaver | 生产 | 跨进程、可扩展，生产推荐 |

生产环境的配套设计：

```python
# 1. 状态生命周期：任务状态的保留策略
def task_ttl(task_type: str) -> int:
    """短任务状态留 1 天，长任务状态留 7 天（超时自动清理）"""
    return 86400 if task_type == "short" else 7 * 86400

# 2. 恢复入口：用户回来时，根据 thread_id 找到未完成任务
def resume_or_start(task_id: str, user_message: str):
    thread = get_thread(task_id)           # 查这个任务有没有历史状态
    if thread and thread["status"] == "paused":
        return app.invoke({"messages": [HumanMessage(content=user_message)]},
                          config={"configurable": {"thread_id": task_id}})
    return start_new_task(task_id, user_message)
```

**状态数据的安全**：checkpoint 里存了对话、工具结果，可能含敏感信息——存储要加密、访问要鉴权、按用户隔离（thread_id 不能全局可查）。状态即数据，数据就有合规义务。

## 状态持久化 + 工作记忆的关系

在 Agent 记忆篇，我们用手动方式实现了"工作记忆"（把任务状态存 Redis）。LangGraph 的 checkpoint 把这件事做成了框架内建能力——**不用自己设计任务状态的序列化、存储、恢复，框架全包了**。这也是用框架的价值：那些"每个 Agent 项目都要重写一遍"的通用能力（状态、持久化、中断恢复），框架帮你做好了，你专注业务节点。

## 小结

状态持久化是长任务 Agent 的基石：LangGraph 的 checkpoint 机制让图每执行完一个节点就自动保存状态，用 thread_id 标识任务线，崩溃后同 thread_id 继续即可。能力：断点续跑、历史回放、分支探索。工程要点：生产用 PostgresSaver，状态设保留期（TTL），状态数据要加密鉴权隔离。**有了持久化，Agent 的任务才从"一口气跑完的短流程"变成"可以中断、可以续跑、可以回放的长流程"**——这是它从 demo 走向生产的分水岭之一。

下一篇用状态管理的能力实现 Agent 的关键特性——条件分支与循环，把 ReAct 和各种复杂流程真正画成图。
