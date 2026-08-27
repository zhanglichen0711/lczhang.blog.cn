---
title: "Joins and Subqueries as the Citation Chain"
date: 2024-02-08
categories:
  - MySQL
tags: [MySQL]
description: "Citations are joins. Fuzzy search is not MySQL work."
---

单表 `WHERE` / `IN` / `BETWEEN` 够做后台筛选。真正形成引用链的是联表。

- chunk join 文档元数据，才能写出标准号和生效日期
- 自连接适合章节树
- 子查询适合「先找最新版本，再取该版本切片」

`LIKE '%规范%'` 不能当全站搜索。精确过滤和回表留给 MySQL，语义召回留给向量库。
