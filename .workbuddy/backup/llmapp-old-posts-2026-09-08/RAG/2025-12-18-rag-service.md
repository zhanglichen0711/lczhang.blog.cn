---
title: "QAService 与 FastAPI 入口"
date: 2025-12-18
categories:
  - [大模型应用, RAG]
tags: [RAG, FastAPI]
description: "鉴权、限流和编排不要写进同一个函数。"
abbrlink: 4128612605
---

入口层做参数校验、鉴权、限流。QAService 选择场景和知识库版本。Pipeline 负责改写、检索、组上下文、调模型。Prompt profile 按场景切换。

异步能提高等待中的吞吐，但必须给模型调用设超时和并发上限。把所有逻辑塞进一个 handler，评测和隔离都会返工。
