---
title: Node.js：事件循环与异步 I/O
date: 2023-07-20
categories:
  - [后端服务, Node.js]
tags: [Node.js, 后端]
description: Node.js：事件循环与异步 I/O
abbrlink: 2026230380
---

单线程 + 事件循环，靠非阻塞 I/O 撑起高并发。

1. 回调、Promise、`async/await` 是异步的三种写法，后者最易读。
2. 事件循环分阶段执行，`setTimeout` 不保证准时，只是最早触发时间。
3. 适合 I/O 密集；CPU 密集任务交给 worker 线程或子进程。
4. 别在循环里无脑 `await`，会让并发退化成串行。
