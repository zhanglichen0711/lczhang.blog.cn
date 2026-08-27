---
title: "Redis Structures That Actually Show Up in LLM Apps"
date: 2024-04-18
categories:
  - Redis
tags: [Redis]
description: "String, hash, list and TTL cover most session and cache needs."
---

Redis 课会铺很多结构。接到大模型应用，高频只用几种。

| 结构 | 用途 |
| --- | --- |
| string + TTL | query embedding 缓存 |
| hash | session / 短时记忆字段 |
| list | 最近几轮对话 |
| incr + TTL | 限流 |

不要把长期知识库正文放进 Redis。重启和淘汰策略会让系统「忘事」，而且难以做权限版本。
