---
title: LangGraph：把 Agent 画成状态机
date: 2025-09-03
categories:
  - [大模型应用, LangGraph]
tags: [LangGraph, Agent, LLM]
description: LangGraph：把 Agent 画成状态机
abbrlink: 3872161621
---

用图描述 Agent 流程，节点是步骤，边是流转。

1. 状态在节点间显式传递，可检查、可恢复。
2. 支持循环、分支、人工审批，比线性 chain 更灵活。
3. 适合多步、可回退的复杂任务编排。
4. 图结构把"模型该做什么"变成"流程该怎么走"。
