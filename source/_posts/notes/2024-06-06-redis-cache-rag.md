---
title: "RAG 路径里 Redis 该缓存什么"
date: 2024-06-06
categories:
  - Redis
tags: [Redis, RAG]
description: "缓存 embedding 和带边界的候选，不要缓存自由生成答案。"
---

缓存一次错误的生成，会让错误被记住。更稳的三层是：query embedding、带版本和权限的检索候选、极少数稳定 FAQ。

缓存键必须包含 `kb_version` 和权限范围。换版本后旧键应失效，否则用户会看到作废条文。
