---
title: "FastAPI WebSocket 实时对话"
date: 2023-07-20
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, WebSocket]
description: "SSE 只管服务端单向推，WebSocket 双向全双工，做真正一问一答的实时对话。"
abbrlink: 1110290078
---

上一篇的 SSE 只能服务端往客户端单向推。做聊天室、语音助手、多人协同这类**两边都要说话**的场景就不够用了——你需要一条双向的通道：客户端随时发消息，服务端也能随时主动推。这就是 WebSocket。

## 先理解 WebSocket 和 HTTP/SSE 的区别

- **HTTP**：一问一答，请求-响应，服务端不能主动说话；
- **SSE**：还是 HTTP，但连接不关，服务端单向持续推；
- **WebSocket**：先通过 HTTP 握手升级，之后**变成一条全双工的 TCP 长连接**，两端随时互发，没有请求-响应的一一对应。

选型一句话：**推送用 SSE 更省事，对话用 WebSocket 更自然**。FastAPI 对两者都是一等公民支持。

## 最小 WebSocket 路由

WebSocket 的代码结构和普通路由很不一样，流程是固定的三步：接受连接 → 循环收发 → 处理断开：

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()                      # 1. 同意握手，建立连接
    try:
        while True:                        # 2. 循环：等消息、回消息
            msg = await ws.receive_text()
            await ws.send_text(f"echo: {msg}")
    except WebSocketDisconnect:            # 3. 客户端断开
        print("客户端已断开")
```

三个动作拆开看：

- `await ws.accept()`：**必须显式接受**，否则客户端一直处于"连接中"；
- `await ws.receive_text()`：阻塞等待客户端发来一条文本消息——有人发消息才返回，没人发就一直挂在这里让出事件循环；
- 客户端断开时 `receive_text` 会抛 `WebSocketDisconnect`，**必须捕获**，否则异常会冒泡污染整个应用。

## 真实场景：接入 LLM 做对话

把上一节的 echo 换成"收到问题 → 调大模型 → 边生成边推回"。注意服务端可以**边收边推**，这正是对话场景需要的：

```python
@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            question = await ws.receive_text()          # 收到用户问题
            # 调 LLM，流式地一条条推回，用户实时看到生成过程
            async for token in llm_stream(question):
                await ws.send_text(token)
            await ws.send_text("[DONE]")                # 自定义结束标记
    except WebSocketDisconnect:
        print("对话连接断开")
```

这里能看到 WebSocket 相对 SSE 在对话场景的优势：**收和发在同一条连接上交替进行**。SSE 想做到"用户再发一个问题"就得重新开一条连接，WebSocket 不需要。

## 管理多个连接：在线用户表

真实系统不可能只有一个连接。要"给指定用户推送""给所有人广播"，需要一个连接管理器：

```python
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}    # user_id -> 连接

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)

    async def send_to(self, user_id: str, message: str):
        ws = self.active.get(user_id)
        if ws:
            await ws.send_text(message)

    async def broadcast(self, message: str):
        # 遍历副本，避免发送时集合被修改
        for ws in list(self.active.values()):
            await ws.send_text(message)


manager = ConnectionManager()


@app.websocket("/ws/{user_id}")
async def ws_user(ws: WebSocket, user_id: str):
    await manager.connect(user_id, ws)
    try:
        while True:
            msg = await ws.receive_text()
            # 业务分发：私聊、群发、转发给 Agent……
            await manager.broadcast(f"{user_id}: {msg}")
    except WebSocketDisconnect:
        manager.disconnect(user_id)
```

两个细节值得注意：

1. **断开时必须从表里移除**，否则"幽灵连接"越积越多，广播时对已断开的连接 `send_text` 会抛异常；
2. **广播时遍历的是 `list(...)` 副本**——发送过程中可能正好有连接断开被移除，直接遍历 dict 会报"字典在迭代时被修改"。

## 带状态的房间：给每个会话挂上下文

对话服务往往需要会话上下文（多轮记忆）。把状态挂在连接上，一个连接一套上下文：

```python
@app.websocket("/ws/agent/{session_id}")
async def agent_ws(ws: WebSocket, session_id: str):
    await ws.accept()
    history: list[dict] = []                    # 该会话专属，互不干扰
    try:
        while True:
            question = await ws.receive_text()
            history.append({"role": "user", "content": question})
            async for token in llm_stream(history):   # 带历史去问模型
                await ws.send_text(token)
            history.append({"role": "assistant", "content": full_answer})
    except WebSocketDisconnect:
        print(f"会话 {session_id} 断开，历史已保留 {len(history)} 轮")
```

每个连接进来都新建一个 `history`，天然实现了"连接隔离"。配合 session_id 落库，就能做到"任务中断后凭 task_id 恢复"——简历里那种多轮对话保留最近 N 轮、断线可恢复的能力，底座就是这样搭的。

## 心跳与保活

WebSocket 连接可能被中间的网络设备悄悄掐断，而两端都不知道。常规做法是**定期发心跳帧**：客户端每隔一段时间发个 ping，服务端收到回 pong（或用 `asyncio.wait_for` 包住接收，超时视为失联）：

```python
import asyncio

from fastapi import WebSocket

@app.websocket("/ws")
async def ws_ping(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            # 30 秒没收到任何消息就判定失联
            msg = await asyncio.wait_for(ws.receive_text(), timeout=30)
            if msg == "ping":
                await ws.send_text("pong")
            else:
                await ws.send_text(f"echo: {msg}")
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await ws.close()
```

用 `wait_for` 给"等消息"加个期限，超时就走清理逻辑关连接——比被动等断开通知可靠得多。

## 小结

WebSocket 的三板斧：**accept 后循环收发、捕获 WebSocketDisconnect 做清理、用连接表管理多个在线连接**。对话型 AI 应用（Chat 助手、Agent 会话、多人协同）的实时通道，都是在这三个动作上长出来的。

FastAPI 系列到这儿，接口的传输层（REST / SSE / WebSocket）都齐了。下一篇回到业务侧的关键一环——认证与权限控制，让接口知道"你是谁、你能干什么"。
