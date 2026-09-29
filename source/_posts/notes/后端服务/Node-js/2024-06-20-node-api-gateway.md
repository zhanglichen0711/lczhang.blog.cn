---
title: "Node.js API 网关"
date: 2024-06-20
categories:
  - [后端服务, Node.js]
tags: [Node.js, 网关]
description: "统一入口：网关为什么存在、职责边界，以及用 Node 做反向代理转发到多个服务。"
abbrlink: 2903805563
---

当服务从一个变成多个——一个 RAG 问答服务、一个 Agent 服务、一个文件服务——问题就来了：前端该请求哪个地址？密钥和鉴权在每处重复实现？想加个全局限流在哪加？这时候需要一个**统一入口**：API 网关。这一篇讲清网关的职责边界，并实现一个基于 Node 的转发网关。

## 网关解决什么问题

没有网关时，前端要直连多个服务：

```text
前端 ──→ RAG 服务 :8001
  ├──→ Agent 服务 :8002
  └──→ 文件服务  :8003
```

问题随之而来：

1. **端口和地址暴露**：每个服务都要公网可访问，攻击面变大；
2. **鉴权各做各的**：三个服务三套 token 校验；
3. **跨域、限流、日志**：每个服务都要配一遍；
4. **上游想换个地址**：前端代码得跟着改。

加一层网关后：

```text
前端 ──→ Node 网关 :3000  ──→ RAG 服务   :8001
                │          ├─→ Agent 服务 :8002
                │          └─→ 文件服务   :8003
```

前端只知道网关一个地址，网关按路径把请求**转发**给正确的上游服务。公网只暴露网关，内部服务互不可达。

## 网关的职责边界

一个成熟的网关通常负责这些事（按重要性排序）：

| 职责 | 说明 | 在哪做 |
| --- | --- | --- |
| 统一入口 | 前端只认一个地址，内部拓扑对前端透明 | 路由转发 |
| 鉴权 | 在入口统一校验 token，通过才放行 | 中间件 |
| 限流 | 全局/按用户限流，防刷防爆 | 中间件 |
| 路由聚合 | 一次前端请求，网关并调多个上游再合并 | 路由逻辑 |
| 日志/监控 | 所有流量必经，天然的统一观测点 | 中间件 |
| 灰度/熔断 | 新版本只放一部分流量；上游故障时快速失败 | 高级进阶 |

**关键原则：网关不做业务**。它只做"转发、拦截、记录"，业务逻辑（检索、生成）都在上游服务里。网关一旦塞进业务代码，就退化成"上帝服务"，改一次要动全局。

## 用 Node 实现转发网关

Node 没有内置的"反向代理"指令，但用 `http-proxy` 库或直接 fetch 转发都能做。先看用 `http-proxy` 的最简实现：

```bash
npm install http-proxy
```

```js
// gateway.js
const httpProxy = require('http-proxy');
const express = require('express');

const app = express();
const proxy = httpProxy.createProxyServer();

// 路由表：路径前缀 → 上游服务地址
const routes = {
  '/rag':    'http://localhost:8001',
  '/agent':  'http://localhost:8002',
  '/files':  'http://localhost:8003',
};

// 按路径前缀转发
app.use((req, res) => {
  const hit = Object.keys(routes).find(p => req.path.startsWith(p));
  if (!hit) {
    res.status(404).json({ error: '没有匹配的上游服务' });
    return;
  }
  proxy.web(req, res, { target: routes[hit] });
});

app.listen(3000, () => console.log('gateway on :3000'));
```

```text
GET /rag/search?...  → 转发到 :8001/search?...
GET /agent/run       → 转发到 :8002/run
GET /files/x.pdf     → 转发到 :8003/x.pdf
```

`proxy.web(req, res, { target })` 把请求原样转给目标服务，上游的响应再原样转回来——对前端来说，一切像在直接请求网关。

## 流式转发不丢

转发网关最大的坑是**流式响应**：RAG 服务的 SSE 是持续推送的，网关必须逐块透传，不能等上游结束再回。`http-proxy` 天然支持流式透传（它就是管道转发），但如果自己用 fetch 实现转发，要注意逐块写：

```js
// 如果不用 http-proxy、用 fetch 手写转发（要支持流式）
app.post('/rag/ask', async (req, res) => {
  const upstream = await fetch('http://localhost:8001/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });

  res.status(upstream.status);
  // 逐块透传上游流，而不是 await upstream.text()（那会等全部完）
  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
});
```

**绝不 `await resp.text()` 再转发**——那等于把流式退化成一坨等到齐再发。

## 网关层的鉴权怎么加

网关是加鉴权的最佳位置——**只在这里校验一次，上游服务默认信任内网流量**：

```js
// 中间件：网关统一鉴权
app.use((req, res, next) => {
  // 放行登录接口本身
  if (req.path === '/auth/login') return next();

  const token = req.headers['authorization'];
  if (!verifyToken(token)) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  next();
});
```

这样的好处：上游的 RAG 服务、Agent 服务不需要各自实现鉴权，它们只在内网被网关调用，天然安全。鉴权逻辑改一处（网关），全线生效。

## 用 Express Router 做更清晰的聚合

不想把全部逻辑堆在 `app.use` 里，用 Router 组织：

```js
const express = require('express');
const router = express.Router();

// 每个上游一个模块，内部自己管转发规则
router.use('/rag', require('./routes/rag').router);
router.use('/agent', require('./routes/agent').router);

// 统一鉴权挂在业务路由之前
app.use('/api', requireAuth, router);
```

## 小结

网关是 AI 服务架构的"门卫 + 接线员"：统一入口、集中鉴权、全局限流、透明转发。Node 做网关的天然优势是**事件模型扛得住大量长连接转发**——这正是流式场景需要的。记住职责边界：**网关管转发与拦截，不写业务**。

网关骨架搭好，下一篇把"鉴权和限流"这两块最常驻网关的中间件写扎实——这是网关防刷防越权的关键两道闸。
