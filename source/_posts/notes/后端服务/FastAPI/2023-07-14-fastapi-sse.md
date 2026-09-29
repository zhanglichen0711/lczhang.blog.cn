---
title: "FastAPI SSE 流式输出"
date: 2023-07-14
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, SSE, 流式]
description: "用 SSE 把大模型的回答逐 token 推给前端：先看到字，再等它说完。"
abbrlink: 782249815
---

大模型回答要好几秒甚至几十秒。如果等服务端把整段回答生成完再一次性返回，用户盯着转圈会以为服务挂了。所有 Chat 类产品的体验标配是"打字机效果"——**边生成边推**。实现它的核心技术叫 SSE（Server-Sent Events），这一篇讲透它的原理、FastAPI 实现和前端消费方式。

## SSE 是什么，为什么用它

SSE 是建立在普通 HTTP 之上的**服务端单向推送**协议：

- 服务端保持连接不断开，持续往同一个响应里追加内容；
- 消息格式极简：每行 `data: 内容`，空行分隔一条消息；
- 浏览器原生支持 `EventSource`，**不需要额外协议握手**（对比 WebSocket 要升级连接）。

和 WebSocket 的分工一句话说清：**SSE 适合"我推给你看"（模型输出、进度、通知），WebSocket 适合"你一句我一句"（聊天、协同）**。LLM 流式输出是 SSE 的典型主场。

## 服务端最小实现

FastAPI 里流式响应的核心是 `StreamingResponse` + 一个异步生成器——生成器每 `yield` 一次，内容就被推出去一次：

```python
import asyncio

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()


class ChatRequest(BaseModel):
    prompt: str


async def fake_stream(prompt: str):
    """模拟逐 token 输出；真实场景换成对 LLM 的流式调用"""
    for word in f"你好，你说的是：{prompt}".split():
        yield f"data: {word}\n\n"
        await asyncio.sleep(0.1)   # 模拟生成耗时


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(
        fake_stream(req.prompt),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # 关掉 Nginx 缓冲，否则流式失效
        },
    )
```

两个关键点：

1. `fake_stream` 是**异步生成器**：每次 `yield` 框架就把内容推给客户端。`data: xxx\n\n` 是 SSE 的消息格式——`data:` 前缀 + 内容 + 空行。
2. `X-Accel-Buffering: no` 这行头很重要：如果前面挂了 Nginx 等反向代理，默认会攒满缓冲区才转发，流式就退化成"等全部完了一次性到"。显式关掉缓冲才能让中间层即时透传。

## 真实场景：把 LLM 流接进来

主流大模型（DeepSeek、Qwen、OpenAI）都提供兼容 OpenAI 协议的流式接口，开启 `stream=True` 后逐块返回增量。把生成器接到 FastAPI：

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="https://api.deepseek.com", api_key=API_KEY)


async def llm_stream(prompt: str):
    stream = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        stream=True,                     # 关键：开启流式
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:                        # 过滤掉空增量
            yield f"data: {delta}\n\n"
```

于是整条链路变成：**LLM 吐一个 token → FastAPI yield 一次 → 用户屏幕多一个字**，间隔只有网络延迟，没有"等整段生成完"的空窗。

## 前端怎么接

EventSource 只支持 GET，流式对话通常要 POST 带 prompt，所以用 `fetch` + `ReadableStream` 更通用：

```js
const resp = await fetch('/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: '讲一个关于工程师的笑话' }),
});

const reader = resp.body.getReader();
const decoder = new TextDecoder();
const out = document.getElementById('answer');

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  // 去掉 data: 前缀和空行，直接追加文本
  const text = decoder.decode(value, { stream: true });
  out.textContent += text.replace(/^data:\s*/gm, '').replace(/\n\n/g, '\n');
}
```

一次 `read()` 可能拿到多个 chunk 或半个 chunk（字节流不按消息切分），所以用 `TextDecoder` 的 `stream: true` 模式处理跨 chunk 的中文边界，避免乱码。

## 断开连接怎么办

用户中途关页面、刷新、切走，服务端的生成器会在下一次 `yield` 时收到取消（异步场景抛 `CancelledError`）。流式接口必须兜住这个，否则会留下半截资源：

```python
async def event_stream(prompt: str):
    try:
        async for token in llm_stream(prompt):
            yield f"data: {token}\n\n"
    finally:
        # 客户端断开也一定会走到这里：关连接、记日志、释放引用
        await cleanup()
```

`finally` 是保险丝：正常结束走它，异常走它，**客户端中途断开也走它**。凡是"发起就停不下来"的资源（数据库会话、HTTP 客户端、锁），都应该在这里收尾。

## 小结

SSE 让"长耗时生成"变成"持续可见的流动"。实现要点一句话：异步生成器 + `StreamingResponse` + `text/event-stream` + 关中间层缓冲 + `finally` 兜底断开。LLM 服务的最外层接口用它，用户体感从"等待"变成"观看"。

SSE 是单向推送；当需要用户说话、服务端回话的双向交互时，下一篇的 WebSocket 才是合适的工具。
