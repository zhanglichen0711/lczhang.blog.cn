---
title: "Agent 可观测：工具调用与中间过程"
date: 2025-11-21
categories:
  - [工程化与运维, Observability]
tags: [可观测性, Agent, LangGraph]
description: "Agent 是黑盒里的黑盒，可观测的关键是记录每一次思考和工具调用。"
abbrlink: 2438049996
---

上一篇的 RAG trace 还算好追踪——链路是固定的（检索 → 生成），一两次模型调用，树是直的。**Agent 完全不同：它自己决定下一步干什么**——可能调工具、可能再想一轮、可能中途改主意。同样的用户问题，两次运行的工具调用序列可能完全不一样。这意味着什么？意味着**出问题时你根本不知道它当时经历了什么**——除非把每一次"思考 → 工具调用 → 观察结果"都记录下来。Agent 是 LLM 应用里最黑的黑盒，可观测性不是可选项，是它能上线的前提。

## Agent 出问题的方式：传统手段全部失效

Agent 的故障模式和传统服务有本质区别：

**报错不一定有异常。** Agent 最常见的失败不是抛异常，而是"绕了远路"：本该一个工具搞定，它来回调了七八次；或者掉进了循环——反复调用同一个工具拿同样的结果，转不出去。这些在服务层看完全是 200 OK、延迟正常，传统监控一声不吭。

**过程不可复现。** 一个 Agent 任务失败了。你想复盘，但只存了最终结果——中间它想了什么、调了哪个工具、工具返回了什么，全没了。**没有过程记录，Agent 的问题就永远说不清。**

**状态是分布式的。** 多 Agent 协作（编排 Agent 分派任务给专业 Agent）时，问题可能出在任何一个成员身上——某个子 Agent 误解了任务、工具权限不够、返回格式不对。没有跨 Agent 的追踪，排查就像在黑屋子里找一只黑猫。

## Agent 可观测要记录什么

给 Agent 加可观测，核心是记录每次"Agent 循环"里的关键事件。一个典型的 ReAct 循环长这样：模型思考 → 决定调某工具 → 拿到工具结果 → 再思考……直到给出最终答案。每一轮循环都值得记录：

```python
from langfuse.decorators import observe, langfuse_context

@observe()
def agent_run(user_query: str) -> str:
    # 记录任务的输入和最终目标
    langfuse_context.update_current_trace(
        name="support_agent",
        session_id=session_id,
        user_id=user_id,
        metadata={"task": user_query, "agent_version": "v1.4"},
    )

    messages = [{"role": "user", "content": user_query}]

    for step in range(MAX_STEPS):
        # 1) 模型决定下一步动作
        decision = llm(messages)
        messages.append(decision)

        # 2) 有工具调用 → 执行并记录
        if tool_calls := decision.tool_calls:
            for call in tool_calls:
                with observe(name=f"tool:{call.function.name}") as span:
                    result = execute_tool(call)      # 真正的工具执行
                    span.set_output({
                        "args": call.function.arguments,
                        "result": truncate(result, 2000),  # 结果别记太满
                    })
                    messages.append(tool_message(call.id, result))
            continue

        # 3) 没有工具调用了 → 这是最终回答
        return decision.content
    raise TimeoutError("agent 超过最大步数")
```

关键记录点：

- **每次模型决策**（thought + 选的工具 + 参数）——复盘时能看出它为什么走这条路；
- **每次工具调用的入参和返回**——工具返回什么决定了 Agent 下一步怎么走；
- **循环轮次**——几轮解决的？超过预期轮数就该告警（可能陷入循环）；
- **token 消耗**——Agent 是 token 消耗大户，多轮下来一次任务可能顶普通请求几十倍。

## 循环与"转圈"的检测

Agent 最隐蔽的故障是**循环**：反复调用同一工具、拿到相同结果、又决定再调一次——每次都很"正常"，但整体在空转。可观测体系里要能看见它：

**指标层**：记录每次 Agent 任务的**步数分布**。正常任务 2-5 步，如果出现一批 15+ 步的任务，大概率有 Agent 在转圈：

```promql
histogram_quantile(0.95, sum(rate(agent_steps_bucket[5m])) by (le))
```

**追踪层**：在 trace 界面里，一眼能看出工具调用序列是否重复——`tool:search` 连续出现三次且参数相同，基本就是循环。也可以在代码里加**去重检测**：连续 N 次工具调用参数完全相同，主动打断并提示模型换策略。

```python
if last_call and call.arguments == last_call.arguments:
    repeat_count += 1
    if repeat_count >= 3:
        messages.append({
            "role": "system",
            "content": "你连续多次调用了相同工具和参数，请换一种方式或直接回答。",
        })
        repeat_count = 0
```

**成本侧**：循环任务会烧掉大量 token。成本监控里"单任务 token 异常高"是循环的另一个信号——指标和追踪互相印证。

## 多 Agent 协作的追踪设计

多 Agent 场景（编排者 + 多个专业 Agent），trace 的设计要点：

- **一个用户任务 = 一个 trace**，顶层 span 是编排者，子 span 是每个子 Agent 的完整运行；
- 每个子 Agent 的 span 里带上**它的任务描述**（子 Agent 收到的指令），否则没法判断是"指令理解错"还是"执行错"；
- 子 Agent 之间的**消息传递**要留痕——A 传给 B 了什么，B 返回给 A 了什么。

```python
@observe(name="orchestrator")
async def orchestrator(task):
    for subtask in plan(task):
        with observe(name=f"agent:{subtask.agent}") as span:
            result = await run_agent(subtask.agent, subtask.prompt)
            span.set_output({"subtask": subtask.prompt, "result": result})
    return compose(plan, results)
```

LangGraph 构建的 Agent 可以直接接 Langfuse 的 CallbackHandler（上一篇讲过），整个图的状态流转自动入 trace——**图里的每个节点、每条边、每次状态更新都能回放**，这对调试 LangGraph 应用几乎是刚需。

## Agent 可观测的落地顺序

给 Agent 加可观测，按这个顺序推进收益最大：

1. **先记录，再分析**：第一时间把每次运行的完整过程（思考/工具/结果/步数）落 trace——没有数据，后面一切都是空谈；
2. **再做指标**：步数分布、工具失败率、token 消耗、任务成功率（用 LLM-as-judge 或规则打分），建立健康基线；
3. **再上告警**：步数异常、同一工具连续失败、token 突增——这些是"Agent 要出事了"的早期信号；
4. **最后做评估闭环**：把失败案例沉淀成测试集，每次改 prompt 或换模型都回归跑一遍，防止"修好一个坏一片"。

## 小结

Agent 的可观测难点在于过程不可预知：要记录每一次思考决策、工具调用的入参返回、循环轮次和 token 消耗，用指标捕捉步数异常和循环信号，多 Agent 场景用 trace 树还原协作过程。没有这些，Agent 上线后的问题将永远停留在"复现不了、说不清楚"。记录解决"发生了什么"，成本解决"花了多少钱"——下一篇专门讲 token 成本：大模型应用的钱是怎么悄悄花掉的，怎么监控和治理。
