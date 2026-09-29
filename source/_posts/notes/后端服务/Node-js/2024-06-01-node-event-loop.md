---
title: "Node.js 事件循环与异步 I/O"
date: 2024-06-01
categories:
  - [后端服务, Node.js]
tags: [Node.js, 异步, 事件循环]
description: "回调、Promise、async/await 三种写法的演进，事件循环阶段划分，别把并发写成串行。"
abbrlink: 1056393815
---

Node 的"单线程扛高并发"靠的是事件循环（Event Loop）。这一篇不背原理图，而是从**写代码会遇到的真实现象**出发，把事件循环讲明白——包括为什么有的代码顺序诡异、为什么回调会嵌套成地狱、为什么 `await` 用错会把并发写成串行。

## 一个让新手懵掉的现象

先看这段代码，猜猜输出顺序：

```js
console.log('1 开始');

setTimeout(() => console.log('2 定时器'), 0);

Promise.resolve().then(() => console.log('3 Promise'));

console.log('4 结束');
```

实际输出是：`1 开始 → 4 结束 → 3 Promise → 2 定时器`。为什么？因为 JS 是**单线程**的，但浏览器/Node 给它配了一个"调度器"（事件循环）：

1. 同步代码（`console.log`）立即执行；
2. `setTimeout` 的回调和 Promise 的 `then` 都被放进了**待办队列**，等同步代码跑完才轮到；
3. 队列内部还有优先级：微任务（Promise.then）先于宏任务（setTimeout）。

理解这个调度模型，就理解了 Node 一切异步的基础：**代码不是按书写顺序执行，而是按"谁准备好了谁先跑"执行**。

## 异步代码的三种写法

Node 的异步 API 从一开始就是回调风格，后来演进出 Promise 和 async/await。三种写法看同一个"读文件"：

```js
// 1. 回调地狱：嵌套越来越深，错误处理四处散落
fs.readFile('a.txt', (err, dataA) => {
  fs.readFile('b.txt', (err, dataB) => {
    fs.readFile('c.txt', (err, dataC) => {
      // 三层还勉强，十层直接崩溃
    });
  });
});

// 2. Promise：链式，但仍要 .then/.catch 满天飞
fs.promises.readFile('a.txt')
  .then(() => fs.promises.readFile('b.txt'))
  .then(() => fs.promises.readFile('c.txt'));

// 3. async/await：像同步代码一样顺序读，异常用 try/catch
async function readAll() {
  const a = await fs.promises.readFile('a.txt', 'utf8');
  const b = await fs.promises.readFile('b.txt', 'utf8');
  const c = await fs.promises.readFile('c.txt', 'utf8');
  return [a, b, c];
}
```

**`async` 函数永远是 Promise**（`async` 函数调用返回 Promise），`await` 只是"等它完成"的语法糖。新代码一律用 async/await——它把异步代码的可读性拉到和同步代码同一水平，`try/catch` 就能兜住异常。

## 事件循环阶段：一句话版本

完整的事件循环分好几个阶段（timers → pending → poll → check …），日常写代码不需要背全。记住这三个就够：

- **Timers 阶段**：执行 `setTimeout` / `setInterval` 到期的回调（"2 定时器"在这里跑）；
- **Poll 阶段**：处理 I/O 回调（文件读写、网络请求完成后的回调在这里）；
- **微任务**：Promise 回调，在**每个阶段之间**优先插队执行（所以"3 Promise"总比"2 定时器"先跑）。

设计启示：**Node 把 I/O 等待交给操作系统，JS 线程只在"结果已就绪"时才被叫醒去执行回调**——这就是"非阻塞"的含义：等待期间线程不闲着，去处理别的请求。

## I/O 密集 vs CPU 密集

事件循环再强，它只有**一个线程**跑 JS。分两类活看：

**I/O 密集（Node 的主场）**——同时来 1000 个请求，每个都要查一次 Redis（毫秒级等待）。事件循环发起查询后立刻去服务下一个请求，等 Redis 结果回来再逐个处理。1000 个连接毫无压力。

**CPU 密集（Node 的短板）**——一个请求要做 10 秒的本地重计算（比如把大数组排序、跑本地模型）。这一算，整个事件循环被占住 10 秒，**期间所有请求都卡住**。解决办法是把重活交给 `worker_threads` 或子进程：

```js
const { Worker } = require('worker_threads');

function runHeavy(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./heavy.js', { workerData: data });
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

app.get('/heavy', async (req, res) => {
  const result = await runHeavy(req.query.data);
  res.json({ result });          // 主线程没被卡住，其他请求照常服务
});
```

判断口诀再强调一遍：**I/O 多靠事件循环，CPU 重用 worker 线程**。

## 最常见的坑：把并发写成串行

事件循环最大的价值是并发处理 I/O。但 `await` 用错地方，会亲手把并发掐死：

```js
// 反模式：串行——第二个请求要等第一个返回才开始
async function askSequential(questions) {
  const answers = [];
  for (const q of questions) {
    answers.push(await callLLM(q));    // 一次只发一个，其余干等
  }
  return answers;
}

// 正确：先全部发起，再一次收齐——总耗时 ≈ 最慢的一个
async function askParallel(questions) {
  return Promise.all(questions.map(q => callLLM(q)));
}
```

区别在 `await` 出现的位置：**循环体里 `await` = 一个个等；先收集 Promise 再 `Promise.all` = 并发**。LLM 调用、HTTP 转发这类外部请求，几乎都应该走并发路线。

`Promise.all` 的注意点：只要有一个失败，整体就 reject。想要"各自成败互不影响"，用 `Promise.allSettled`：

```js
const results = await Promise.allSettled(
  questions.map(q => callLLM(q))
);
// 每个结果都有 status: 'fulfilled' 或 'rejected'
```

## 小结

事件循环让 Node 用单线程扛住海量 I/O：同步代码先跑，异步回调按"谁准备好谁先"调度；`async/await` 是写异步的正确姿势；I/O 密集放心交给事件循环，CPU 重活挪给 worker；**并发要主动发起**——把 `await` 移出循环体，用 `Promise.all` 一次收齐。

异步地基打牢了，下一篇讲 Stream——Node 处理大数据和流式传输的另一个看家本领。
