---
title: "Eval Sets, Tests and Traces for RAG"
date: 2026-04-27
categories:
  - RAG
tags: [RAG, 评测]
description: "RAG cannot live on assertEqual. Keep 30 domain questions as a gate."
---

三层最低配置：

- 纯逻辑单测：意图、过滤、上下文拼接
- 评测集：业务题，看引用是否命中、是否拒答
- 线上 Trace：模型名、耗时、命中的 `doc_id`、改写前后 query

本地先有评测报告，再谈把 Trace 送到观测平台。
