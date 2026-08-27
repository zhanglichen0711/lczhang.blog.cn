---
title: "Python Containers and Why Shape Matters"
date: 2023-03-18
categories:
  - Python
tags: [Python]
description: "list / tuple / set / dict are layout choices, not trivia."
---

Python 入门最先要稳住的不是语法全集，而是数据形状。后面写 RAG 和 Agent，中间结果几乎都落在这四种容器上。

## 四种形状

- `list`：检索命中要保序
- `tuple`：配置和不可变坐标
- `set`：权限码、标签去重
- `dict`：模型返回的 JSON、配置、trace

## 后面会踩的坑

在 `for` 里修改正在遍历的 list，以及把业务判断写成多层 `if`。能提前 `return` 就提前结束。

容器课可以停在「能独立写脚本」。下一站是把脚本变成可配置的小工具。
