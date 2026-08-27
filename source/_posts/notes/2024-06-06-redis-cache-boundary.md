---
title: "What Redis Should Cache in a RAG Path"
date: 2024-06-06
categories:
  - Redis
tags: [Redis, RAG]
description: "Cache embeddings and bounded retrieval candidates, not free-form answers."
---

缓存自由生成的答案看起来能省钱，错一次会被记住很久。更稳的是缓存：

1. query embedding
2. 带版本和权限边界的检索候选
3. 高频且答案稳定的条目（过期要短）

键里必须带 `kb_version` 和权限范围，否则换版本后会命中旧结果。
