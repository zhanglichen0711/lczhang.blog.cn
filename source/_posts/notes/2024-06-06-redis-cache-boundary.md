---
title: "What Redis Should Cache in a RAG Path"
date: 2024-06-06
categories:
  - Redis
tags: [Redis, RAG]
description: "Cache embeddings and bounded retrieval candidates, not free-form answers."
abbrlink: 71712335
---

缓存自由生成的答案看起来能省钱，但一次错误会被记住很久——用户会反复看到那条已经作废的回答。更稳的是缓存：

1. query embedding
2. 带版本和权限边界的检索候选
3. 极少数高频且答案稳定的 FAQ（过期时间要短）

键里必须带 `kb_version` 和权限范围。换版本后旧键应失效，否则用户会看到作废条文。
