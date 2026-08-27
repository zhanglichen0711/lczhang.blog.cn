---
title: "Threads, GIL and Why LLM Calls Are I/O"
date: 2023-09-02
categories:
  - Python
tags: [Python]
description: "Threads help waiting on APIs. CPU work wants processes or a separate inference service."
---

网络和多任务课解释的是：服务是端口上的字节流，锁是为了不让两个任务同时改同一份状态。

## 对 LLM 应用的含义

调模型、调向量库，本质是 I/O。多线程能提高等待中的并发。本地 embedding 这种偏 CPU 的活，GIL 会挡住线程，进程或独立推理服务更合适。

同一文档不要被两个入库任务切两遍——这就是抢票示例里那把锁，换了一种业务说法。
