---
title: "Node.js 项目实战：网关与 RAG 服务"
date: 2024-07-03
categories:
  - [后端服务, Node.js]
tags: [Node.js, 网关, 实战]
description: "把前十篇串成完整工程：Node 网关 + FastAPI 问答服务，登录、限流、转发、流式全链路。"
abbrlink: 1632239257
---

Node 系列前九篇把单点能力都过完了。这一篇做收口：把「登录 → 鉴权 → 限流 → 转发 RAG → 流式返回」串成一个**能跑的完整网关工程**，对接 FastAPI 写的问答服务。你会发现每篇的知识在这里都有位置，而把它们拼起来才是真正的工程。

## 架构总览

```text
浏览器 / 小程序
    │  HTTPS + Bearer Token
    ▼
Node 网关 :3000
    ├─ POST /api/auth/login      → 签发 JWT（自己处理）
    ├─ POST /api/rag/ask         → 转发 FastAPI :8001/ask（整段返回）
    └─ POST /api/rag/ask/stream  → 转发 FastAPI :8001/ask/stream（流式透传）
                │  内网，带上 x-user-* 身份头
                ▼
FastAPI RAG 服务 :8001
    └─ 检索(Milvus) → LLM 生成 → 返回/流式回答
```

网关管"入口三件事"：登录发证、鉴权放行、限流转发。业务全在上游 FastAPI。

## 工程结构

```text
gateway/
├── package.json
├── server.js            # 入口：组装中间件与路由，启动
├── config.js            # 环境变量集中读取
├── middleware/
│   ├── auth.js          # JWT 校验（requireAuth、requireRole）
│   └── ratelimit.js     # 全局限流 + 登录限流
├── routes/
│   ├── auth.js          # /auth/login 签发 token
│   └── rag.js           # /rag/* 转发到 FastAPI
└── services/
    └── proxy.js         # 转发逻辑（普通 + 流式）
```

## config.js：配置集中管理

```js
module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET,
  ragBaseUrl: process.env.RAG_BASE_URL || 'http://localhost:8001',
};
```

## middleware/auth.js 与 ratelimit.js

复用前一篇的成果，注意 `requireAuth` 之后**必须**有一个把身份挂到转发请求头的环节：

```js
// middleware/auth.js —— 校验 + 身份透传头
const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    // 覆盖式写入透传头：客户端伪造的同名头一律无效
    req.headers['x-user-id'] = req.user.uid;
    req.headers['x-user-role'] = req.user.role;
    req.headers['x-user-dept'] = req.user.dept;
    next();
  } catch {
    return res.status(401).json({ error: '凭证无效或已过期' });
  }
}
```

## routes/rag.js：转发逻辑

普通问答直接转发 JSON；流式问答必须**逐块透传**：

```js
const express = require('express');
const config = require('../config');
const router = express.Router();

// 整段返回型问答
router.post('/ask', async (req, res) => {
  const upstream = await fetch(`${config.ragBaseUrl}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 身份头已由 requireAuth 注入 req.headers，原样转发
      'x-user-id': req.headers['x-user-id'],
      'x-user-role': req.headers['x-user-role'],
      'x-user-dept': req.headers['x-user-dept'],
    },
    body: JSON.stringify(req.body),
  });

  const data = await upstream.json();        // 非流式：等完整 JSON
  res.status(upstream.status).json(data);
});

// 流式问答：边收边转
router.post('/ask/stream', async (req, res) => {
  const controller = new AbortController();

  // 客户端断开时，中止对上游的调用
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const upstream = await fetch(`${config.ragBaseUrl}/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      res.write(`data: [网关错误] ${err.message}\n\n`);
    }
  } finally {
    res.end();
  }
});

module.exports = router;
```

## server.js：把一切组装起来

```js
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(express.json());

// 限流：全局 + 登录单独加严
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, limit: 10 }));

// 登录路由（免鉴权），其余全走鉴权
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rag', requireAuth, require('./routes/rag'));

// 兜底：404 与统一错误
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '网关内部错误' });
});

app.listen(config.port, () =>
  console.log(`gateway listening on :${config.port}`));
```

顺序是关键：**JSON 解析 → 限流 → 路由**，登录路由在鉴权之前，业务路由在鉴权之后。挂中间件的顺序就是请求被处理的顺序。

## 端到端验证

```bash
# 1. 登录拿 token
curl -s -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhang","password":"***"}' | jq -r .token
# eyJhbGciOiJIUzI1NiIs...

# 2. 带 token 走网关问 RAG（整段）
curl -s -X POST localhost:3000/api/rag/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"模板拆除的强度要求？"}' | jq

# 3. 流式问答
curl -N -X POST localhost:3000/api/rag/ask/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是质量门禁？"}'

# 4. 不带 token 应 401；1 分钟内狂刷应 429
curl -s localhost:3000/api/rag/ask        # → 401
```

验证点全覆盖：**有证放行、无证 401、超频 429、流式逐块返回**——网关的完整职责一次闭环。

## 工程化收尾清单

- [ ] JWT_SECRET、LLM Key 等全走环境变量，`.env` 进 gitignore
- [ ] `pm2` 或容器编排多实例部署，限流切 Redis 共享计数
- [ ] 网关日志结构化（访问日志 + 错误日志分开）
- [ ] 上游 FastAPI 增加健康检查 `/health`，网关转发前可探活
- [ ] 给关键路径写集成测试：登录、鉴权 401、转发 200

## 小结

一个网关工程到这里就是完整闭环：**登录发证 → 全局限流 → JWT 鉴权 → 身份透传 → 普通/流式转发 → 错误兜底**，全部以中间件和独立路由组织，代码薄而清晰。这个骨架加一个上游、减一个上游，只是改路由表的事——网关层的可扩展性就在这里体现。

Node.js 十篇到此收官。回看整个系列：定位（介绍）→ 起步 → 模块 → 框架 → 原理 → 流 → AI 应用 → 网关 → 安全 → 实战，是一条从"认识 Node"到"用 Node 搭起 AI 接入层"的完整路径。愿你写出的每一个接口，都经得起流量和审查。
