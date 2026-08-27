---
title: "Pandas as the Front Door of Every Dataset"
date: 2023-11-21
categories:
  - Python
tags: [Python, Pandas]
description: "Look at distribution before fitting anything."
---

`NumPy` / `Pandas` 不是模型课的附件。分类样本、评测集、缺陷表，都先在表里看分布。

- 读入后先 `info()` / `value_counts()`
- 缺失值和标签体系分开处理
- 图只回答一个问题：是不是失衡、长度是不是极端

没有这层，后面的准确率数字没有对照。
