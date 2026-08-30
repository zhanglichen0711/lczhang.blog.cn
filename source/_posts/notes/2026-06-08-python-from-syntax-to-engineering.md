---
title: Python 学习笔记：从容器语法到能写 LLM 服务
date: 2026-06-08
categories:
  - Python
tags: [Python, Pandas]
description: 把基础语法课里真正会反复用到的部分抽出来：容器、函数、面向对象、并发和数据分析三件套。
abbrlink: 3833552795
---

Python 课通常按「字面量 → 分支循环 → 容器 → 函数 → 面向对象 → 网络/多任务 → Pandas」推进。做大模型应用时，不是每一页语法都同等重要。下面只留后面会反复碰到的部分。

## 先把数据形状想清楚

`list` / `tuple` / `set` / `dict` 不是背 API，是在选「这份中间结果该不该改、该不该去重、该不该按键取」。

- 模型返回的 tool arguments，用 `dict` 接，再用 schema 校验。
- 检索命中的 chunk 列表用 `list`，因为要保序。
- 标签、权限码用 `set`，避免同一文档被加两次。
- `tuple` 适合当不可变配置，比如 `(host, port)`。

分支和循环本身很简单。真正容易写乱的是：在 `for` 里又改正在遍历的列表，以及把业务判断写成层层 `if` 而没有提前 `return`。

## 函数：匿名、递归、生成器

匿名函数适合短排序键，不适合塞进半页 prompt 拼装。递归适合树状文档目录，但知识库切分更常见的是显式栈或队列，避免深度把进程打爆。

生成器更值得留下：

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

embedding 和入库都按 batch 走，不要一次性把全部文本装进内存。

## 面向对象只保留三件事

1. `self` 是实例自己，服务里的 `RAGClient`、`MilvusStore` 用它保存连接。
2. `super()` 用来扩展而不是复制父类逻辑。
3. 类方法/静态方法不要滥用；和状态无关的纯函数放模块级更清晰。

垃圾回收知道「引用没了才会收」即可。LLM 应用里更常见的泄漏是：全局缓存、未关闭的 HTTP client、未断开的 Milvus 连接。

## 网络和多任务

TCP / socket 课帮你理解「服务是端口上的字节流」。后面 FastAPI 只是把这层藏起来。多线程能提高 I/O 并发，但别忘了 GIL：embedding 这种偏 CPU 的工作，进程或专门推理服务比纯线程更合适。抢票示例说明的是锁，对应到业务就是「同一文档不要被两个入库任务同时切两遍」。

## Pandas 放在数据入口

`NumPy` / `Pandas` / `Matplotlib` 不是模型课的附属品。文本分类、缺陷数据、评测集，先在表里看分布，再决定要不要上 BERT。

最小习惯：

- 读入后先 `info()` / `value_counts()`，别直接 `fit`
- 缺失值和标签体系分开处理
- 图只为了回答一个问题：类别是否失衡、长度是否极端、准确率是否被少数类拖垮

## 接到大模型应用时的对照

| 基础课里的概念 | 后面实际落在哪 |
| --- | --- |
| dict / json | Function Call 参数、配置、trace |
| 生成器 / 批处理 | embedding、Milvus upsert |
| 类与组合 | Client / Retriever / Pipeline 分层 |
| 多线程与锁 | 入库任务、限流、缓存 |
| Pandas | 评测集、分层分类样本、坏案例表 |

语法课可以停在「能独立写脚本」。之后的时间应该花在：配置与日志、超时重试、以及把模型当成不稳定 I/O 来封装。
