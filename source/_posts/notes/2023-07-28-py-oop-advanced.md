---
title: "继承、类方法与对象生命周期"
date: 2023-07-28
categories:
  - Python
tags: [Python]
description: "继承解决复用。生命周期解决连接泄漏。"
---

面向对象第二节通常讲 `super`、类方法、静态方法和对象销毁。

对 LLM 服务的含义很具体：`OpenAIClient` 和 `LocalClient` 可以共享重试逻辑，差异只在 `base_url` 和鉴权。类方法适合备选构造，例如 `from_env()`。静态方法能写成模块函数就不必硬放进类里。

进程退出前未关闭的连接，比「垃圾回收原理」更容易在生产上出事。把 client 放进上下文管理器，或在 FastAPI 的 lifespan 里打开和关闭。
