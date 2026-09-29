---
title: FastAPI：用类型注解写 Python 接口
date: 2023-09-08
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, 后端]
description: FastAPI：用类型注解写 Python 接口
abbrlink: 1471223794
---

基于 Pydantic，用 Python 类型注解自动生成校验和文档。

1. 请求/响应模型定义好，参数校验和序列化都交给框架。
2. 自动产出 OpenAPI，`/docs` 直接可交互调试。
3. `async def` 支持异步，适合等待 I/O 的场景。
4. 依赖注入让鉴权、数据库会话等横切逻辑复用。
