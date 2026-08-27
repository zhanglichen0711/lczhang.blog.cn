---
title: "网络编程、线程和 GIL"
date: 2023-09-02
categories:
  - Python
tags: [Python]
description: "模型调用是 I/O。本地 embedding 才碰到 GIL。"
---

IP、端口、协议解释的是服务从哪进来。socket 课帮你理解 FastAPI 并不是魔法，只是把字节流包成了 HTTP。

## 多线程适用场景

等模型、等 Milvus、等 Redis，用线程或异步都能提高吞吐。本地 tokenizer / embedding 偏 CPU，GIL 会让多线程几乎单核跑，应换成多进程或独立推理服务。

## 锁

同一 `doc_id` 不要被两个入库任务同时切分。这就是示例里「抢票」要锁的原因，只是对象从座位号换成了文档主键。
