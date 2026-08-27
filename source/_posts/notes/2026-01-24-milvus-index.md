---
title: "Milvus 索引是延迟旋钮"
date: 2026-01-24
categories:
  - Milvus
tags: [Milvus, RAG]
description: "先对齐主键，再争论 HNSW 还是 IVF。"
---

维度、度量方式、过滤字段必须和 MySQL 主键对齐。HNSW / IVF 影响召回和延迟，不决定业务正确性。

运维上更关键：upsert 是否幂等、删除是否同步、重建索引会不会打断线上读。这些比选一个「更新的」索引名更影响事故率。
