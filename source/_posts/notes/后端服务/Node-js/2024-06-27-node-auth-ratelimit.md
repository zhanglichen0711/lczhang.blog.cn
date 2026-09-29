---
title: "Node.js 鉴权与限流"
date: 2024-06-27
categories:
  - [后端服务, Node.js]
tags: [Node.js, JWT, 限流]
description: "网关的两道闸：jsonwebtoken 校验身份，express-rate-limit 拦高频，防越权防刷爆。"
abbrlink: 3664311749
---

网关暴露在公网，会面对两类攻击：**越权**（拿别人的身份访问）和**刷爆**（脚本高频请求把上游打挂）。对应两道闸：鉴权中间件确认"你是谁"，限流中间件约束"你多快"。这一篇把这两道闸写扎实，全部以 Express 中间件形式落地。

## 第一道闸：JWT 鉴权

Web 服务最主流的无状态认证是 JWT（JSON Web Token）：登录成功后服务端签发一个**签名 token** 给客户端，里面编码用户 ID、角色等信息；后续请求带上它，服务端验签通过即信任内容，**不需要在服务端存会话**。

```bash
npm install jsonwebtoken
```

```js
// auth.js —— 签发与校验
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;      // 密钥必须走环境变量

function signToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);          // 验签 + 检查过期，非法直接抛错
}
```

签发端（登录接口）：

```js
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = authenticate(username, password);   // 查库验证密码
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  // 载荷只放身份信息，不放敏感数据
  const token = signToken({ uid: user.id, role: user.role, dept: user.dept });
  res.json({ token });
});
```

三个要点：

1. **载荷里放角色和部门**——后面做数据级权限、给上游透传身份时直接从 token 解，不用再查库；
2. **`expiresIn` 必须设**——永不过期的 token 等于永久通行证；
3. **密钥绝不放代码里**——`process.env.JWT_SECRET` 注入，git 里永远找不到。

## 鉴权中间件：网关统一校验

网关层的鉴权中间件，把"验签 → 挂用户信息 → 放行"做成一步：

```js
// middleware/auth.js
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '缺少登录凭证' });
  }
  try {
    req.user = verifyToken(token);       // 挂到 req 上，下游中间件/路由可读
    next();
  } catch {
    return res.status(401).json({ error: '凭证无效或已过期' });
  }
}
```

```js
// 网关：除了登录，全部接口先过鉴权
app.post('/auth/login', loginHandler);           // 白名单：登录本身免鉴权
app.use('/api', requireAuth);                    // 其余全拦
app.use('/api', proxyRouter);
```

带角色/部门的权限卡点（比如只有 admin 能访问管理接口）：

```js
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

app.get('/api/admin/stats', requireAuth, requireRole('admin'), handler);
```

401（没登录）和 403（登录了但没权限）的区别就在这里：前者没通过鉴权，后者过了鉴权但角色不够。

## 上游怎么拿到身份：透传

网关校验通过后，上游服务也需要知道"当前是谁"才能做数据级过滤（比如 RAG 只搜本部门文档）。网关把身份**透传**给上游：

```js
// 网关把 req.user 作为请求头传给上游
function attachUser(req, res, next) {
  if (req.user) {
    req.headers['x-user-id'] = req.user.uid;
    req.headers['x-user-role'] = req.user.role;
    req.headers['x-user-dept'] = req.user.dept;
  }
  next();
}

app.use('/api', requireAuth, attachUser, proxyRouter);
```

上游 FastAPI 服务读这几个自定义头拿身份，做权限过滤下推。**注意**：内网之间传身份用自定义头没问题，但网关必须保证这些头是"自己填的"而不是客户端伪造的——所以要让 `attachUser` **覆盖**掉客户端传的同名头，而不是信任原值。

## 第二道闸：限流

限流防两类问题：恶意脚本刷接口、某个用户异常高频调用拖垮上游。Express 生态用 `express-rate-limit`：

```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');

// 全局限流：每个 IP 每分钟最多 120 次
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,          // 窗口：1 分钟
  limit: 120,                   // 窗口内最多 120 次
  standardHeaders: true,
  legacyHeaders: false,
});

// 敏感接口更严：登录接口防爆破，每 IP 每分钟 10 次
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { error: '尝试过于频繁，请稍后再试' },
});

app.use('/api', globalLimiter);
app.post('/auth/login', loginLimiter, loginHandler);
```

超限时 `express-rate-limit` 默认返回 429（Too Many Requests），客户端会收到明确信号。登录接口单独加严是标配——防暴力破解密码。

## 分布式的限流：多实例要共享计数

`express-rate-limit` 默认把计数存在**当前进程内存**里。网关如果部署了多个实例（负载均衡），每个实例各记各的——实际限流上限会被放大 N 倍。多实例必须用**共享存储**（Redis）来计数：

```bash
npm install express-rate-limit ioredis
```

```js
const RedisStore = require('rate-limit-redis').default;
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
});
```

计数落在 Redis 后，无论多少个网关实例，都共享同一套计数——限流才真正有效。这也是网关架构里 Redis 最常见的一个用途。

## 限流策略怎么定

限流不是拍脑袋，先想清楚被保护对象能扛多少：

- **登录**：每 IP 每分钟 5~10 次（防爆破）；
- **普通查询**：每用户每分钟 60~120 次（人肉操作到不了这个量级）；
- **LLM 类接口**：最贵，按 token 消耗或按次严格限，超了返回 429 引导降级；
- **静态资源**：一般不限流。

被限流后给用户合理反馈（429 + 重试时间），而不是直接掐断，体验会好很多。

## 小结

鉴权与限流是网关防线上最常驻的两道闸：**JWT 中间件验明身份并把角色挂到请求上（必要时透传给上游做数据过滤），限流中间件按窗口挡住高频请求（多实例要落 Redis 共享计数）**。两道闸都用"挂中间件"的方式接入，路由代码零侵入。

单点能力都齐了——最后一篇把它们组装起来：一个真实的 Node 网关，把 RAG 问答服务包在身后完整跑通。
