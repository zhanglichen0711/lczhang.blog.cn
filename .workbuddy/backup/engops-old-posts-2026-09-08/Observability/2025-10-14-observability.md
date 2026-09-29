---
title: 可观测性：给 LLM 应用装上仪表盘
date: 2025-10-14
categories:
  - [工程化与运维, Observability]
tags: [可观测, LLMOps]
description: 可观测性：给 LLM 应用装上仪表盘
abbrlink: 2925068990
---

LLM 应用是黑盒，可观测性让你知道每次调用发生了什么。

1. 记录 prompt、输出、token 数、延迟、成本，出问题才查得到。
2. LangSmith、Langfuse 这类工具能追踪整条调用链。
3. 对 Agent 要看到每一步工具调用和中间结果。
4. 成本监控和效果监控一起做，别只看延迟。
