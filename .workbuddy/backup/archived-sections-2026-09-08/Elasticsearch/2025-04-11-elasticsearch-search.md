---
title: Elasticsearch：全文检索与倒排索引
date: 2025-04-11
categories:
  - [数据与存储, Elasticsearch]
tags: [Elasticsearch, 搜索]
description: Elasticsearch：全文检索与倒排索引
abbrlink: 1772088906
---

倒排索引把词映射到文档，全文搜索毫秒级。

1. 分片横向扩展，副本保证高可用。
2. 相关性打分决定排序，可调字段权重和匹配方式。
3. 常与向量检索配合，做关键词 + 语义的混合搜索。
4. 数据建模和分词器，往往比调参更重要。
