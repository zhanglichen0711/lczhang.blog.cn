---
title: "Node.js 调用 LLM 与流式转发"
date: 2024-06-14
categories:
  - [后端服务, Node.js]
tags: [Node.js, LLM, 流式]
description: "用 fetch 调大模型接口，把流式回答逐块转发给前端，超时与中断都要兜住。"
abbrlink: 2670699669
---

Node 在 AI 架构里最常用的一个角色：**网关层帮浏览器去调大模型**。浏览器不直连大模型 API（密钥不能暴露给前端），而是请求 Node 网关，由网关带着密钥去调 LLM，再把流式回答逐块转发回来。这一篇把这条链路完整实现。

## 为什么不能让浏览器直连大模型

如果前端直接调 LLM API：

1. **API Key 会暴露**——密钥写在浏览器代码里等于公开，别人扒走就能刷你的额度；
2. **没法加限制**——没有网关层，谁都能调、调多少次都管不住；
3. **业务逻辑没地方放**——要在回答前拼上下文、查权限、记日志，总得有服务端那一环。

所以标准做法是：**前端 → Node 网关 → LLM API**，密钥和业务逻辑都藏在网关层。

## 非流式调用：fetch 一行

Node 18+ 内置了 `fetch`（对标浏览器的 fetch），不用装 axios：

```js
// services/llm.js
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY;

async function askLLM(messages, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const resp = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`LLM 接口返回 ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timer);
  }
}
```

几个工程细节：

- **密钥来自环境变量**，绝不写死在代码里；
- `AbortController` 实现超时——30 秒没返回就主动中断，避免请求悬挂；
- 检查 `resp.ok`，上游出错时抛明确错误而不是默默吞掉。

## 流式调用：读一段、转一段

大模型回答是流式的，网关要做的是**收到一块就立刻转发一块**，而不是攒完整段再发。流式接口返回的 body 是一个 `ReadableStream`：

```js
// Express 路由：/api/chat
app.post('/api/chat', async (req, res) => {
  const { question } = req.body;

  // 告诉浏览器：下面是流式响应
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',     // 关掉中间层缓冲，否则流式会"攒批"
  });

  const controller = new AbortController();

  try {
    const upstream = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: question }],
        stream: true,
      }),
      signal: controller.signal,
    });

    // 读上游的流，逐块转发
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      // 原样转发给浏览器，浏览器能直接解析 SSE 格式
      res.write(text);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      res.write('data: [超时中断]\n\n');
    } else {
      res.write(`data: [错误] ${err.message}\n\n`);
    }
  } finally {
    res.end();
  }
});
```

转发的核心就是 `upstream.body.getReader()` + 循环 `read()` + `res.write()`：**上游吐一块，网关转一块**。网关不缓存、不加工（或只做轻量过滤），延迟只增加一跳网络的量级——用户看到的打字机效果几乎无感。

`TextDecoder` 的 `stream: true` 参数是中文不乱码的关键：上游的字节流可能把一个中文字符拆到两个 chunk，这个模式会缓存半个字符的尾巴，等下一块补齐再解码。

## 浏览器端长什么样

```js
const resp = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: '什么是知识蒸馏' }),
});

const reader = resp.body.getReader();
const decoder = new TextDecoder();
const box = document.getElementById('answer');

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  box.textContent += decoder.decode(value, { stream: true });
}
```

对浏览器来说，它只跟 Node 网关通信——网关在内部去调谁、带什么密钥，浏览器完全无感。这就是"接入层封装"的价值。

## 中断处理：谁断谁负责

流式链路有三处可能中断，要分别兜住：

1. **LLM 上游超时/报错** → 用 `AbortController` 超时，catch 里给客户端写一条明确的 `data: [错误信息]`；
2. **浏览器中途关页面** → 客户端的连接断了，`res.write` 会失败或 `res` 触发 `close` 事件，此时要 `controller.abort()` 去中断对上游的调用，别让网关还在傻等一个没人接收的响应；
3. **网关进程重启** → 上游连接会被 `server.close()` 断开，交由进程管理（pm2）恢复。

其中第 2 点最容易漏：**客户端断开 ≠ 上游停止**。加一句监听：

```js
req.on('close', () => {
  if (!res.writableEnded) {
    controller.abort();   // 客户端走了，别再等上游了
  }
});
```

## 小结

Node 调 LLM 并转发流式回答，本质是一条**管道**：fetch 读上游流 → `res.write` 写下游流，中间只做轻量透传。工程上要兜三件事：密钥藏环境变量、上游调用设超时、客户端断开时主动中止上游。做到这三点，网关转发链路就稳了。

单接口转发会了，下一篇升一个维度：把网关做成"统一入口"——多个上游服务、多种路径，一个 Node 进程统一收口。
