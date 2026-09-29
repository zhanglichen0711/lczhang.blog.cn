---
title: "FastAPI 项目实战：RAG 问答 API"
date: 2023-08-02
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, RAG, 实战]
description: "把前九篇串成完整工程：分层目录、检索接口、流式问答、权限、限流与可观测。"
abbrlink: 4033840284
---

前九篇把 FastAPI 的单点能力都过了一遍。这一篇做收口：把它们组装成一个**能上线的 RAG 问答服务**——真实的检索 + 流式回答 + 权限 + 限流 + 日志，一整套骨架。你会发现前九篇的每个概念在这里都有一席之地，而拼起来才是工程。

## 工程目录

严格按第一篇定的分层骨架来：

```text
rag_api/
├── main.py              # 组装 app：挂路由、注册中间件
├── config.py            # 环境变量读取
├── schemas.py           # Pydantic 请求/响应模型
├── deps.py              # 公共依赖：鉴权、限流、检索客户端
├── routers/
│   ├── auth.py          # 登录、token
│   └── chat.py          # 问答接口
├── services/
│   ├── retriever.py     # 向量检索：embedding + Milvus + rerank
│   └── llm.py           # 大模型调用（普通 + 流式）
└── core/
    └── db.py            # MySQL 会话（会话历史）
```

原则回顾：**路由薄、业务在 services**。接口只负责"收参数、调 service、回响应"，脏活都在 services 里，这样每个文件职责单一、好测试。

## schemas.py：模型先行

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=8, ge=1, le=20)
    stream: bool = True


class Source(BaseModel):
    doc_id: str
    title: str
    clause: str | None = None
    version: str | None = None


class Answer(BaseModel):
    answer: str
    sources: list[Source] = []
```

`Answer` 作为响应模型锁住出口：只吐回答和带出处引用列表，内部对象的杂七杂八字段不会漏出去。

## deps.py：鉴权 + 检索客户端

把前几篇的依赖沉淀成公共模块：

```python
from fastapi import Depends, HTTPException

from config import settings
from deps import get_current_user
import jwt


def get_retriever(user=Depends(get_current_user)):
    """每个请求按用户身份构建检索客户端，权限过滤内置其中"""
    from services.retriever import build_retriever
    # 把用户部门/角色作为固定过滤条件注入，检索层只认这个客户端
    return build_retriever(dept=user["dept"], role=user["role"])
```

## services/retriever.py：检索核心

```python
class Retriever:
    def __init__(self, dept: str, role: str):
        self.filters = {"dept": dept}
        if role not in ("manager", "admin"):
            self.filters["visible"] = "self"      # 非管理层只见本部门

    async def retrieve(self, question: str, top_k: int) -> list[dict]:
        # 1. embedding 化问题
        emb = await embed(question)
        # 2. Milvus 稠密 + 稀疏混合检索，expr 带上权限过滤
        hits = await milvus_hybrid_search(
            emb, top_k=top_k * 3, expr=self.filters
        )
        # 3. reranker 精排，取最终 top_k
        return await rerank(question, hits, top_k=top_k)
```

权限不放在路由层 while 过滤，而是**构建时就绑进检索客户端**——调用方想传个"看全库"的过滤器都没有入口。

## services/llm.py：普通 + 流式

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY)


async def complete_with_sources(question: str, top_k: int, retriever) -> dict:
    chunks = await retriever.retrieve(question, top_k)
    context = format_context(chunks)          # 拼成带编号的上下文
    system = "只依据给定资料回答，注明引用条号；资料中没有就说不知道。"
    resp = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"资料：\n{context}\n\n问题：{question}"},
        ],
    )
    return {"answer": resp.choices[0].message.content,
            "sources": [{"doc_id": c["doc_id"], "title": c["title"],
                          "clause": c.get("clause"), "version": c.get("version")}
                         for c in chunks]}


async def stream_with_sources(question: str, top_k: int, retriever):
    chunks = await retriever.retrieve(question, top_k)
    context = format_context(chunks)
    stream = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[...],                       # 同上
        stream=True,
    )
    async for part in stream:
        delta = part.choices[0].delta.content
        if delta:
            yield f"data: {delta}\n\n"
    # 流结束后补一段引用
    yield f"data: {json.dumps({'sources': sources}, ensure_ascii=False)}\n\n"
```

普通接口拿整段回答，流式接口逐 token 推——同一个 service 的两个出口，路由层各取所需。

## routers/chat.py：路由层保持薄

```python
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from schemas import AskRequest, Answer
from deps import get_current_user, get_retriever
from services import llm

router = APIRouter(prefix="/api")


@router.post("/ask", response_model=Answer)
async def ask(req: AskRequest, retriever=Depends(get_retriever)):
    result = await llm.complete_with_sources(req.question, req.top_k, retriever)
    return Answer(**result)


@router.post("/ask/stream")
async def ask_stream(req: AskRequest, retriever=Depends(get_retriever)):
    return StreamingResponse(
        llm.stream_with_sources(req.question, req.top_k, retriever),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

路由函数加起来不到二十行——参数接收、鉴权、流式包装都在声明和依赖里完成了，这正是前面每一篇铺垫的最终效果。

## main.py：限流与可观测兜底

```python
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, chat

app = FastAPI(title="rag-api")
app.include_router(auth.router)
app.include_router(chat.router)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    # 生产接结构化日志：method path status elapsed_ms user_id
    print(f"{request.method} {request.url.path} "
          f"{response.status_code} {elapsed:.0f}ms")
    return response
```

## 验证整条链路

```bash
# 1. 登录拿 token
TOKEN=$(curl -s -X POST localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhang","password":"***"}' | jq -r .access_token)

# 2. 普通问答（带出处）
curl -s localhost:8000/api/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"梁板跨度 2-8m 拆模强度要求？"}' | jq

# 3. 流式问答（打字机效果）
curl -N localhost:8000/api/ask/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是质量门禁？"}'
```

没带 token 调 `/api/ask` 应该返回 401——权限体系生效了。

## 上线检查清单

- [ ] 密钥、API Key 全部走环境变量，不进 git
- [ ] 检索、LLM 调用都设了超时
- [ ] 慢接口（>1s）打了日志，方便追踪
- [ ] Dockerfile + docker-compose 编排服务与 MySQL/Milvus
- [ ] 压测过并发：开多少个 worker、数据库连接池多大

## 小结

一个 RAG 问答 API 到这里就是完整闭环：**类型模型守边界、依赖注入管鉴权与检索客户端、异步扛并发、SSE 做流式、权限下推进检索**——每一层各司其职，路由薄、服务纯、可观测。这个骨架换业务领域（招投标、规范问答、设备资料）只改 services，外层不用动。

FastAPI 十篇到这里收官。代码里的每个概念都能在真实项目里找到对应物——这也是写这个系列的意义：不是学框架语法，而是理解一个服务层怎么长出来。
