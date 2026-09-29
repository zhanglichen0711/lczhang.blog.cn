---
title: "实战：把一组工具封装成 Agent 服务"
date: 2025-09-01
categories:
  - [大模型应用, Agent]
tags: [Agent, 实战]
description: "工具设计 → MCP 封装 → ReAct 编排 → 权限与护栏 → 评测回归，一条线把 Agent 送上生产。"
abbrlink: 232737413
---

Agent 系列最后一篇，把前面十一篇的能力串成一个真实可交付的 Agent 服务。场景设定很贴近实际工作：**把一组企业工具（查规范、查历史方案、查供应商信息）封装成一个能自主完成任务的 Agent 服务**——这类"内部知识 + 工具 + 自主执行"的 Agent，正是当前最有落地价值的形态。这篇给出一条完整的搭建路径，每一步都对应前面某篇的核心。

## 目标与整体架构

```text
用户任务："帮我查一下屋面防水的规范要求，并找找有没有类似的整改案例"
   ↓
FastAPI 入口（鉴权/限流/request_id）
   ↓
QAAgent（编排核心）
 ├─ 意图/任务理解：拆任务（查规范 + 查案例）
 ├─ ReAct 循环：决策 → 调工具 → 观察 → 再决策
 ├─ 工具层：通过 MCP 接入（规范检索 / 案例库 / 供应商查询）
 ├─ 护栏：步数上限、成本预算、循环检测、写操作确认
 └─ 记忆：任务状态持久化（可恢复）、用户上下文
   ↓
输出：任务结果 + 全程轨迹（可观测/审计）
```

## 第一步：工具设计（复用工具设计篇）

先明确这个 Agent 需要哪些工具，每个按"名称-参数-错误契约"设计：

```python
TOOLS = {
    "search_specs": {
        "description": "检索企业内部技术规范。keyword 填 2-5 字核心术语，可指定专业分类。",
        "parameters": {"keyword": "str", "category": "enum(防水/结构/消防...)", "top_k": "int"},
        "permission": "all",          # 全员可见
    },
    "search_cases": {
        "description": "检索历史整改/缺陷案例库。",
        "parameters": {"keyword": "str", "project_type": "str"},
        "permission": "all",
    },
    "query_supplier": {
        "description": "查询供应商资质与历史合作记录。",
        "parameters": {"supplier_name": "str"},
        "permission": "admin",        # 敏感工具：仅管理员
        "confirm": True,              # 副作用/敏感：需确认
    },
}
```

关键：敏感工具（`query_supplier`）标了 `confirm: True`——模型提议调用后，要经过确认才能执行（安全护栏）。

## 第二步：MCP 封装（复用 MCP 篇）

把工具封装成 MCP Server，让 Agent 侧通过标准协议发现和调用：

```python
# tool_server.py —— MCP Server 承载企业工具
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("enterprise-tools")

@mcp.tool()
def search_specs(keyword: str, category: str = "", top_k: int = 5) -> dict:
    """检索企业技术规范库。返回 [{title, section, content, doc_id}]"""
    # 内部实现：走 RAG 检索（权限过滤在检索层，参考 RAG 过滤篇）
    return spec_retriever.search(keyword, category, top_k)

@mcp.tool()
def search_cases(keyword: str, project_type: str = "") -> dict:
    """检索历史整改案例库。"""
    return case_retriever.search(keyword, project_type)

if __name__ == "__main__":
    mcp.run()
```

封装收益：工具说明跟着实现走（MCP Server 内部维护），Agent 侧只连协议，不重复维护工具文档。

## 第三步：ReAct 编排 + 护栏（复用模式篇 + 工程化篇）

Agent 核心是一个带护栏的 ReAct 循环。把前面散落的护栏组装进来：

```python
class QAAgent:
    """生产级 Agent：ReAct 循环 + 全套护栏"""

    def __init__(self, mcp_client, budget: Budget, observer: Observer):
        self.tools = mcp_client          # MCP 客户端
        self.budget = budget             # 成本/步数预算
        self.observer = observer         # 可观测记录

    async def run(self, task: str, user: User):
        messages = [{"role": "user", "content": task}]
        # 按用户角色过滤可见工具（安全）
        visible = await self.tools.list_tools(user=user)

        for step in range(self.budget.max_steps):        # 护栏：步数上限
            # 决策：模型选择工具或结束
            resp = await llm.decide(messages, tools=visible)

            if resp.is_final:
                return await self._finalize(task, messages, resp)

            # 护栏：敏感工具确认（工具设计/工程化篇）
            if resp.tool.requires_confirm and not await self._confirm(user, resp):
                messages.append(confirm_rejected(resp))   # 告知模型被拒绝
                continue

            # 执行工具（超时 + 结果记录）
            result = await self._safe_call(resp.tool, resp.args)   # 单步超时护栏
            self.observer.record_step(step, resp, result)          # 可观测
            messages.append(tool_result(result))

            # 护栏：循环检测（可观测篇）
            if detect_loop(self.observer.steps):
                return {"status": "stopped_loop", "message": "检测到循环，已停止"}

            # 护栏：成本预算（工程化篇）
            if self.budget.exceeded():
                return {"status": "budget_exceeded", "message": "超出预算，已停止"}

        return {"status": "step_limit", "partial": ...}
```

**注意护栏不是"可选装饰"，是这个 Agent 的核心骨架的一部分**——每条护栏都有对应的降级返回（而不是崩溃）。

## 第四步：评测与回归（复用 Agent 评测篇）

Agent 上线前，按"任务路径"建评测集，覆盖三块：

```python
EVAL_PATHS = [
    # 典型任务：查规范 + 找案例的组合任务
    {"goal": "查屋面防水规范要求并找类似整改案例",
     "expect": {"complete": True, "max_steps": 6,
                "tools_used": ["search_specs", "search_cases"]}},
    # 边界任务：信息不全要追问
    {"goal": "帮我查一下供应商", "expect": {"ask_clarify": True}},
    # 失败恢复：规范库临时不可用
    {"goal": "查幕墙密封要求", "setup": {"fail_tool": "search_specs"},
     "expect": {"graceful": True, "no_hallucination": True}},
]
```

评测跑通后，每次改动（换模型/改工具描述/调提示）都跑这套路径，对比完成率、平均步数、工具错误率（评测篇）。**没有这套评测，Agent 的每次改动都是一次赌博。**

## 第五步：上线形态（复用服务化 + 观测）

Agent 服务化落地注意三点：

1. **异步任务化**：Agent 任务可能跑几十秒，不适合同步请求等——用任务队列（提交任务 → 返回 task_id → 轮询/回调结果），配合工作记忆支持恢复；
2. **观测接入**：每个任务一个 trace（步骤轨迹 + 成本 + 结果），用户投诉能按 task_id 回放全程（可观测篇）；
3. **人工兜底**：复杂任务保留"转人工"出口——Agent 处理不了或用户要求时，把任务连同轨迹交接给人。

## 从这套实战得到的三个认知

**认知一：Agent 工程的 80% 不是模型，是系统。** 数一数这个实战里用到的能力：工具设计、MCP、权限过滤、护栏、观测、评测——没有一个依赖"更聪明的模型"。**把系统做扎实，现有模型已经能交付不错的 Agent。**

**认知二：Agent 的价值在"组合拳"。** 查规范 + 找案例 + 汇总，每个单步 RAG 都能做，但**组合成一个多步任务自动完成，才是 Agent 的增量价值**——它把用户从"自己一步步查"里解放出来。

**认知三：先跑通最小可用，再谈智能。** 这个 Agent 的第一版甚至不需要 MCP（直接函数调用）、不需要多 Agent（单 Agent 够）、不需要复杂记忆（任务级状态即可）——**从最小可用跑起，用评测驱动加复杂度**，而不是第一天就上全家桶。

## 小结

把一个 Agent 从工具封装到生产交付，路径是：工具设计（名称/参数/错误契约）→ MCP 封装（标准协议）→ ReAct 编排 + 全套护栏（步数/预算/循环/确认）→ 任务路径评测（完成率/过程/鲁棒）→ 异步服务化 + 观测 + 人工兜底。**Agent 系列到此完结——核心认知是：模型负责聪明，系统负责可靠，工程负责把两者缝成能交付的产品。** 从"能回答"到"能完成任务的自主执行"，这条路上没有魔法，只有一道道工程细节。

Agent 系列十二篇完结。下一篇进入 Agent 落地的工程框架——LangGraph，把 ReAct、状态、人工介入这些概念变成真正可维护的代码。
