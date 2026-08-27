---
title: "Redis 常用结构对照 LLM 应用"
date: 2024-04-18
categories:
  - Redis
tags: [Redis]
description: "String、Hash、List 加 TTL 就覆盖大部分场景。"
---

结构课会介绍很多类型。接到大模型应用，高频只用几种：

| 结构 | 用途 |
| --- | --- |
| string + TTL | query embedding 缓存 |
| hash | session 短时记忆 |
| list | 最近几轮对话 |
| incr + TTL | 限流 |

长期知识库正文不要放 Redis。淘汰策略和重启都会让系统「忘事」，也难做版本和权限。
