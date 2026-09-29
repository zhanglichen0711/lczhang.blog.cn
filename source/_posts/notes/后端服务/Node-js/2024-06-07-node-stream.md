---
title: "Node.js Stream 流式处理"
date: 2024-06-07
categories:
  - [后端服务, Node.js]
tags: [Node.js, Stream]
description: "处理大文件与流式数据不爆内存的看家本领：pipe、背压、Transform。"
abbrlink: 2079071499
---

把整个文件读进内存再处理，小文件无所谓，文件一大（几百 MB 的日志、视频）内存就撑不住了。Node 的 Stream（流）就是为这类场景设计的：**数据是一块一块流过去的，处理完一块丢一块，内存占用始终很小**。它也是后面做"大模型流式转发"的地基。

## 不用 Stream 的代价

```js
// 一次性读入内存：100MB 文件 → 进程内存涨 ~100MB+
fs.readFile('big.log', (err, data) => {
  console.log('文件大小:', data.length);
});
```

一个请求这样干没问题，十个并发大文件请求同时进来，进程内存直接爆掉。

## 用 Stream：边读边处理

```js
const fs = require('fs');

// createReadStream 返回一个 Readable 流，数据分块(chunk)到达
const stream = fs.createReadStream('big.log', { encoding: 'utf8' });

let lines = 0;
stream.on('data', (chunk) => {
  lines += chunk.split('\n').length - 1;   // 每来一块处理一块
});
stream.on('end', () => {
  console.log('总行数:', lines);
});
```

数据不是一次全到，而是**一小块一小块（chunk）地触发 `data` 事件**。每次只处理当前这块，处理完这块的引用就被释放——内存占用和文件大小无关，只和 chunk 大小有关。

## pipe：流的"管道符"

读和写经常连着做（读文件 → 发给客户端）。Node 提供了 `pipe`，像 Unix 管道一样把两个流接起来：

```js
// 把大文件"流"给 HTTP 响应——内存安全地下载大文件
app.get('/download', (req, res) => {
  const readStream = fs.createReadStream('big.zip');
  readStream.pipe(res);          // 读一点、发一点，全程不整载入内存
});
```

这段代码的意义：浏览器下载 1GB 文件，Node 进程内存纹丝不动。

## 背压：流的自我保护

流式传输有个隐患：**读得快、写得慢**怎么办？比如磁盘读文件的速度远快于网络发给浏览器的速度。如果不管不顾地读，数据会在内存里堆积。

Node 的解决方案叫"背压"（backpressure）：`pipe` 内部会自动处理——**当消费者（写端）处理不过来时，会暂停生产端（读端），等消费跟上了再继续**。就像水龙头和水池：水池快满了就拧小龙头。

手写流时这个机制要自己尊重：`write()` 返回 `false` 表示"写不动了，先暂停读"：

```js
const { Readable } = require('stream');

function sendToClient(res, source) {
  source.on('data', (chunk) => {
    const ok = res.write(chunk);       // false 说明网络缓冲已满
    if (!ok) {
      source.pause();                  // 暂停读
      res.once('drain', () => source.resume());  // 缓冲空了再继续
    }
  });
}
```

不过 99% 的场景你不需要手写背压——**`pipe` 已经处理好了**。只有自定义转发逻辑时才需要关心。

## Transform：边读边改

流的三种角色：Readable（读）、Writable（写）、Transform（读→改→写）。Transform 流是"转换器"，适合逐块处理数据。比如给流式输出做"按行统计并加前缀"：

```js
const { Transform } = require('stream');

const prefixer = new Transform({
  transform(chunk, enc, callback) {
    // 把每块内容加个前缀再交给下游
    callback(null, `[LOG] ${chunk.toString()}`);
  },
});

fs.createReadStream('app.log')
  .pipe(prefixer)              // 先转换
  .pipe(process.stdout);       // 再输出
```

管道链可以无限接：`读流.pipe(转换).pipe(转换).pipe(写流)`。

## 实战：逐块统计 + 转发

综合起来看一个"边读日志边统计关键词、不占内存"的写法：

```js
const { Transform } = require('stream');

const keyword = process.argv[2] || 'ERROR';
let count = 0;

const counter = new Transform({
  transform(chunk, enc, cb) {
    const text = chunk.toString();
    count += text.split(keyword).length - 1;
    cb();                                  // 不往下传也行，这里只统计
  },
});

fs.createReadStream('service.log')
  .pipe(counter)
  .on('finish', () => console.log(`"${keyword}" 出现 ${count} 次`));
```

注意一个真实工程坑：**按 chunk 统计关键词会数错**——一个词可能被切成两半分到两个 chunk。严谨做法是保留"半个词的尾巴"拼到下一块再数。做流式处理时这类"边界问题"要专门处理。

## 小结

Stream 让 Node 能优雅地处理"大"：大文件不整载内存、下载能边读边发、数据能边到边转换。核心就三个词：**chunk（分块到达）、pipe（管道连接）、背压（慢则暂停）**。理解这三点，大文件处理和流式传输都顺了。

流式的能力铺垫好了，下一篇进入 AI 实战——用 Node 调用大模型接口，并把它返回的流式回答转发给浏览器。
