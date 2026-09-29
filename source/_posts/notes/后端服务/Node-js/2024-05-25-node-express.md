---
title: "Express 框架入门"
date: 2024-05-25
categories:
  - [后端服务, Node.js]
tags: [Node.js, Express]
description: "从原生 http 到 Express：路由、中间件、参数解析一次到位，看懂洋葱模型。"
abbrlink: 564575958
---

第二篇用原生 `http` 模块写服务时你会发现：解析 URL、判断路径、写响应头……每个接口都在重复这些样板代码。Express 是 Node 生态最主流的 Web 框架，把这些重复劳动收敛成"定义路由 + 挂中间件"两个动作。这一篇以 Express 4 为例（撰写时的主流版本），把框架的核心心智讲透。

## 安装与最小应用

```bash
npm install express
```

```js
// app.js
const express = require('express');

const app = express();          // 创建应用

app.get('/', (req, res) => {
  res.json({ message: 'Hello Express' });
});

app.listen(3000, () => {
  console.log('listening on 3000');
});
```

```bash
node app.js
curl http://localhost:3000/
# {"message":"Hello Express"}
```

对比原生版本，三个变化立刻能感受到：

1. **不用自己判断 URL 了**——`app.get('/', 回调)` 声明"访问 `/` 且是 GET 时执行这个回调"；
2. **`res.json()` 直接发 JSON**——不用手动 `JSON.stringify` 再设 `Content-Type`；
3. **代码结构清晰**——一个路由一段代码，而不是在回调里堆 if-else。

## 路由参数与请求数据

Express 用 `:param` 声明路径参数，自动放进 `req.params`：

```js
app.get('/doc/:docId', (req, res) => {
  const { docId } = req.params;      // 路径参数
  res.json({ docId });
});

app.get('/search', (req, res) => {
  const { q, page = 1 } = req.query; // 查询参数
  res.json({ q, page });
});
```

POST 带 JSON 请求体时，需要先挂一个内置中间件 `express.json()`，把 body 解析进 `req.body`：

```js
app.use(express.json());    // 解析 application/json 请求体

app.post('/ask', (req, res) => {
  const { question } = req.body;     // 请求体，已经是被解析好的对象
  res.json({ answer: `你问的是：${question}` });
});
```

注意顺序：**`app.use(express.json())` 必须写在处理 POST 的路由之前**——中间件按注册顺序执行，先解析 body，后面的路由才能用 `req.body`。

## 中间件：Express 的灵魂

中间件是 Express 一切能力的载体。一个中间件就是一个函数，签名固定 `(req, res, next)`：

```js
// 日志中间件：每个请求先经过它
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();   // 放行：把请求交给下一个中间件/路由
});
```

执行顺序用"洋葱"理解最贴切：请求从最外层中间件进入，一层层往里走，到路由处理完，**响应再一层层往外返回**：

```js
app.use((req, res, next) => {
  console.log('1. 请求进入');
  const start = Date.now();
  res.on('finish', () => {           // 响应结束时触发
    console.log(`4. 响应返回，耗时 ${Date.now() - start}ms`);
  });
  next();
});

app.get('/', (req, res) => {
  console.log('2. 路由处理中');
  res.json({ ok: true });            // 3. 响应开始返回
});
```

```text
请求 → [日志中间件] → [路由] → 响应（原路返回）
```

这套模型带来的能力是"**给所有请求统一做某件事**"：打日志、做鉴权、限流，全部写成中间件挂上去即可，路由代码保持干净。

## 鉴权中间件：动手写一个

把第二篇的 token 校验改造成中间件，任何路由想"必须登录才能访问"，挂上它就行：

```js
// middleware/auth.js
function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;                       // 注意：这里不调 next()，请求到此为止
  }
  req.user = getUserByToken(token);  // 把用户信息挂在 req 上，后续可读
  next();
}
```

```js
// app.js
app.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });   // 能到这里，一定已通过鉴权
});
```

中间件鉴权的精髓：**拒绝时直接终结请求（不调 next），通过时把用户信息挂到 `req` 上交给后面**。从此每个"需要登录"的路由只多一个参数，逻辑零重复。

## 错误处理中间件

Express 的错误处理中间件是**四参数**签名（`err` 必须在第一位），框架一旦遇到 `next(err)` 就会跳过普通中间件直达这里：

```js
// 放最后：兜住所有没被处理的路由和错误
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.use((err, req, res, next) => {    // 注意四个参数，err 在前
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
  });
});
```

同步代码里抛异常，Express 会捕获并送到错误中间件；**异步代码（尤其 async 函数）在 Express 4 里要自己兜**——这是 v4 最经典的坑：

```js
// Express 4：async 路由抛错不会自动进错误中间件，要手动 next(err)
app.get('/chat', async (req, res, next) => {
  try {
    const answer = await callLLM(req.query.q);
    res.json({ answer });
  } catch (err) {
    next(err);     // 手动交给错误中间件
  }
});
```

（顺带说明：后来的 Express 5 把这个坑填了——async 函数里抛错会自动转发给错误中间件，无需手动 `next(err)`。你读到这段时若已用上 v5，这一层 try/catch 可以省掉。）

## 小结

Express 的心智模型三句话：**路由声明接口、中间件处理横切逻辑、洋葱模型管执行顺序**。从原生 http 到 Express，省掉的是样板，不变的是"收请求、做处理、回响应"的骨架。

路由和中间件铺好，下一篇回到 Node 的地基——事件循环：为什么 Express 能扛住海量并发，异步代码背后到底在发生什么。
