---
title: "QAService, Pipeline and Prompt Profiles"
date: 2025-12-18
categories:
  - RAG
tags: [RAG, FastAPI]
description: "Do not put routing, retrieval and generation in one handler."
---

常见分层：FastAPI 入口做鉴权限流；QAService 选场景和知识库版本；Pipeline 负责改写、检索、组上下文；Prompt profile 按场景切换。

异步有用，但要给模型调用设超时和并发上限。编排写进一个函数，后面加评测和隔离会返工。
