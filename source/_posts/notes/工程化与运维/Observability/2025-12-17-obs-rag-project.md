---
title: "实战：给 RAG 服务搭建观测体系"
date: 2025-12-17
categories:
  - [工程化与运维, Observability]
tags: [可观测性, RAG, 实战]
description: "日志、指标、追踪三件套 + LLM 调用追踪，一次搭完整个体系。"
abbrlink: 228283361
---

可观测性系列前面六篇把每块拼图都讲过了：结构化日志、Prometheus 指标、Langfuse 追踪、Agent 过程记录、成本治理。这一篇把它们拼成一个整体——**给一个真实形态的 RAG 服务搭一套完整的观测体系**。目标不是"装一堆工具"，而是回答三个问题：服务挂了怎么快速定位（日志+指标）、回答变差了怎么复盘（追踪）、钱花哪了怎么查（成本）。整套体系用 docker compose 一条命令就能起，适合直接照抄落地。

## 整体架构

```
                      ┌─────────────────────────────┐
  用户请求 → rag-api  │  日志 → stdout（结构化 JSON） │
                      │  指标 → /metrics（Prometheus）│
                      │  追踪 → Langfuse SDK（异步）  │
                      └─────────────────────────────┘
                           │            │          │
                     Loki/日志平台   Prometheus    Langfuse
                           │            │          │
                        (可选)       Grafana      (Postgres+ClickHouse)
                         告警通知 ←─────┘
```

简化版的落地组合（本地/单机）:

- **日志**：应用输出结构化 JSON 到 stdout，先由 docker 收集，量大了接 Loki/ELK；
- **指标**：Prometheus 拉取 `/metrics`，Grafana 画板 + 告警；
- **LLM 追踪 + 成本**：Langfuse（compose 起，自带库）。

## 第一步：日志——结构化 + request_id

前面日志篇的中间件直接用上：

```python
# middleware.py
import structlog, uuid
from fastapi import Request

log = structlog.get_logger()

@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    with structlog.contextvars.bind_contextvars(
        request_id=request_id, path=request.url.path
    ):
        start = time.perf_counter()
        response = await call_next(request)
        log.info(
            "http.request",
            status=response.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000, 1),
        )
        response.headers["x-request-id"] = request_id
        return response
```

RAG 关键环节各打一条（检索、生成、整体），每一条都带 request_id——出问题按 id 一查到底。

## 第二步：指标——RED + LLM 专属

```python
# metrics.py
from prometheus_client import Counter, Histogram

HTTP_REQUESTS = Counter("http_requests_total", "请求总数", ["path", "status"])
HTTP_LATENCY = Histogram("http_request_duration_seconds", "请求延迟", ["path"])
LLM_CALLS = Counter("llm_calls_total", "模型调用次数", ["model", "feature"])
LLM_LATENCY = Histogram("llm_duration_seconds", "模型调用延迟", ["model"])
LLM_TOKENS = Counter("llm_tokens_total", "token 消耗", ["model", "type"])  # type=input/output
RETRIEVAL_EMPTY = Counter("retrieval_empty_total", "空召回次数", ["index"])
```

Prometheus 采集目标 + 告警规则（前面指标篇的配置直接复用）：错误率超 5% 告警、P95 延迟超阈值告警、检索空召回率突增告警。

## 第三步：Langfuse——RAG 全链路 trace

把 RAG 的每一步都用 `@observe` 包起来，形成一棵完整调用树：

```python
from langfuse.decorators import observe, langfuse_context
from langfuse.openai import openai

@observe()
def rewrite_query(question: str) -> str:
    """查询改写：把口语问题转成适合检索的形式"""
    resp = openai.chat.completions.create(
        model="qwen-plus",
        messages=[{"role": "system", "content": REWRITE_PROMPT},
                  {"role": "user", "content": question}],
    )
    return resp.choices[0].message.content

@observe()
def retrieve(query: str, top_k: int = 5):
    docs = milvus.search(query, top_k=top_k)
    langfuse_context.update_current_observation(
        metadata={"n": len(docs), "index": "knowledge_v2", "top_k": top_k}
    )
    return docs

@observe()
def generate(question: str, docs: list) -> str:
    context = format_context(docs)
    resp = openai.chat.completions.create(
        model="qwen-plus",
        messages=[SYSTEM_PROMPT_WITH_CONTEXT(question, context)],
    )
    return resp.choices[0].message.content

@observe(name="rag_answer")
async def rag_answer(question: str, user_id: str, session_id: str):
    langfuse_context.update_current_trace(
        user_id=user_id, session_id=session_id,
        metadata={"feature": "web_qa"},
    )
    q = rewrite_query(question)
    docs = retrieve(q)
    if not docs:
        RETRIEVAL_EMPTY.inc()
    answer = generate(question, docs)
    return {"answer": answer, "sources": [d.id for d in docs]}
```

跑起来之后，Langfuse 里每一次提问都是一棵 `rag_answer → rewrite_query / retrieve / generate` 的树，带 token、延迟、成本。**回答变差时点开看：改写后的 query 对不对？检索召回了几条、相关不相关？prompt 上下文有没有拼错？**

## 第四步：把三者的数据串起来

日志、指标、追踪各管一段，但排查时要在三者间跳转。用 request_id 作为桥梁：

- Grafana 指标面板报警（错误率上升）→ 看是哪个 path → 到日志平台按 `request_id` 搜对应请求的日志 → 再到 Langfuse 按同样的 id（或 session_id）打开该请求的 trace 看智能层。

Langfuse 的 trace 也可以带业务 id：把 HTTP 的 request_id 存进 trace 的 metadata，两边就能对上号。

## 一套 docker compose 全部拉起

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.53.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana:11.1.0
    ports: ["3000:3000"]

  langfuse:
    image: langfuse/langfuse:latest
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/langfuse
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      SALT: ${SALT}
    ports: ["3001:3000"]
    depends_on: [db, clickhouse]

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
    volumes: [pgdata:/var/lib/postgresql/data]

  clickhouse:
    image: clickhouse/clickhouse-server:24.8

volumes:
  pgdata:
```

（Langfuse 官方 docker compose 更完整，含 Redis 和 MinIO，生产直接 clone 官方仓库用它的编排。）

## 落地后的使用节奏

体系搭完，日常是这样运转的：

**被动排查**（用户报障）：拿到 request_id → 日志看服务层发生了什么 → Langfuse 看智能层哪里不对 → 定位到环节 → 修复。

**主动发现**（监控报警）：Grafana 告警（错误率、延迟）→ 看趋势确认影响面 → 深入日志和 trace 找根因。

**定期复盘**（周会看板）：成本趋势（这个月模型花了多少、哪功能最贵）、质量评分趋势（LLM-as-judge 对回答打分）、Top 问题 session——**把"感觉服务还行"变成"数据说话"**。

## 小结

给 RAG 服务搭观测体系，本质是把前面六篇按职责拼好：结构化日志 + request_id 兜底"发生了什么"，Prometheus/Grafana 的 RED + LLM 指标兜底"整体健康吗"，Langfuse 的 trace 兜底"智能层每一环怎么样"，成本记录兜底"钱花哪了"。三者用 request_id 串成一条排查链路。可观测性的终极目标不是工具齐全，而是**任何一次"服务异常"或"回答变差"，都能在几分钟内定位到具体环节**——这套体系给的就是这个能力。下一篇进入另一个与上线同等重要的主题：安全。
