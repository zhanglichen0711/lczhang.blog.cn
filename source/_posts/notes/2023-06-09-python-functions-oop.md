---
title: "Functions, Generators and a Small Class Boundary"
date: 2023-06-09
categories:
  - Python
tags: [Python]
description: "Generators batch work. Classes hold connections, not prompts."
---

函数课里真正能带到工程里的是三件：短函数、生成器、以及「有状态的对象不要和纯逻辑混在一起」。

## 生成器

embedding 和入库都按 batch 走，不要一次把全部文本装进内存。

```python
def chunks(items, n):
    batch = []
    for x in items:
        batch.append(x)
        if len(batch) == n:
            yield batch
            batch = []
    if batch:
        yield batch
```

## 类只保留连接

`RAGClient` / `Store` 用实例保存连接和超时。Prompt 拼装更适合当纯函数。`super()` 用来扩展，不是复制父类。
