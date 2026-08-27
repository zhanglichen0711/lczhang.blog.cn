---
title: "MySQL DDL and Constraints for a Knowledge Base"
date: 2023-12-16
categories:
  - MySQL
tags: [MySQL]
description: "Primary keys and uniqueness decide whether citations can be traced back."
---

DDL / DML 看起来像建库练习。知识库里它们对应的是：文档、切片、权限各放哪一张表。

## 约束对应的线上问题

- 主键：回答里的引用能不能回表
- 唯一：同一文件不要被导入两次
- 非空：`source` / `version` / `permission` 不允许空
- 删除：切片级联删还是先标记 `deleted`

字符集一开始用 `utf8mb4`。向量不放 MySQL，事实和权限放 MySQL。
