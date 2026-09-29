---
title: "Agent 的五种模式，以及何时不要用"
date: 2026-07-16
categories:
  - [大模型应用, Agent]
tags: [Agent]
description: "自主程度不是职称。能写死的顺序就不要自由规划。"
abbrlink: 263983963
---

五种常见模式：Tool use、ReAct、Reflection、Planning、Multi-agent。Agent 是实体，Agentic 描述自主程度。

能用 workflow 写死的步骤，做成自由规划只会增加费用和失败面。工具有副作用时，步数上限、重复调用熔断，比再加一个子 Agent 更重要。

A2A 管 Agent 与 Agent，MCP 管 Agent 与工具。旅行助手这类项目适合当协议练习；接到业务还要补权限、费用和「查不到就停」。
