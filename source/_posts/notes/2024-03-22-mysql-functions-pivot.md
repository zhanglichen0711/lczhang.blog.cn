---
title: "MySQL Functions Stay in Reporting"
date: 2024-03-22
categories:
  - MySQL
tags: [MySQL]
description: "String functions are for display. Chunking stays in Python."
---

数值、字符串、日期、`CASE WHEN` 适合报表和清洗。行转列是面试常客，在业务里更常见于把多标签展平。

不要用一长串 SQL 字符串函数代替切分器。切分是 Python 的工作，MySQL 保存切分结果。
