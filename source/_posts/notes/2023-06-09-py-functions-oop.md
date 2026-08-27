---
title: "函数、生成器与类的边界"
date: 2023-06-09
categories:
  - Python
tags: [Python]
description: "生成器负责分批。类负责连接。Prompt 不要塞进构造函数。"
---

匿名函数适合短排序键。递归适合浅树，知识库目录更深时用显式队列更稳。

## 生成器

```python
def batched(items, n):
    batch = []
    for x in items:
        batch.append(x)
        if len(batch) == n:
            yield batch
            batch = []
    if batch:
        yield batch
```

embedding、Milvus upsert、评测集打分都按批走，避免一次装入全部文本。

## 类只保存状态

`self` 里放连接、超时、重试次数。`super()` 用来扩展而不是复制。和状态无关的纯函数放模块级。垃圾回收记住「没引用才会收」；真正要关的是 HTTP client 和数据库连接。
