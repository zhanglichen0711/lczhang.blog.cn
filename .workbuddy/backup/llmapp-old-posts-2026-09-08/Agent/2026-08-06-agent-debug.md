---
title: "先看调用轨迹，再调 Prompt"
date: 2026-08-06
categories:
  - [大模型应用, Agent]
tags: [Agent]
description: "落盘 thought、tool、observation，问题会从「模型不行」变成可修的步骤。"
abbrlink: 4201707697
---

每一轮留下：选了哪个工具、参数过没过 schema、返回是否被截断、是否在同一工具上打转。

大多数故障不是「智能不足」，而是工具边界不清或失败没有恢复路径。把这些变成单测，比反复改一句系统提示更接近工程。
