---
title: "结构化日志与请求追踪"
date: 2025-10-18
categories:
  - [工程化与运维, Observability]
tags: [可观测性, 日志]
description: "文本日志不可查，JSON 结构化 + request_id 才能串起一次请求。"
abbrlink: 63399947
---

可观测性三件套里，日志是唯一"每次请求都会产生、出了问题第一个翻"的东西。但很多服务的日志停留在"能看"的水平——一堆 `print` 拼出来的文本，时间戳格式随意，字段靠肉眼认。**等真要排查问题时，这种日志基本帮不上忙**：你想查"某个用户某次提问为什么超时"，日志里根本串不起这个请求的完整轨迹。这篇讲清楚：什么样的日志才配叫"可排查的日志"。

## 为什么文本日志不可查

先看一段典型的"反面日志"：

```text
2025-10-01 10:23:45 收到提问: 什么是RAG?
2025-10-01 10:23:46 检索耗时 0.31s
2025-10-01 10:24:01 生成耗时 15.2s 失败
```

这段日志有三个致命问题：

1. **字段靠人眼认**：时间、事件、数值挤在一行里，脚本没法按字段筛选——想统计"平均检索耗时"得写正则硬抠。
2. **没有 request_id**：日志里有三个事件，但没法证明它们是同一次请求产生的。线上同时几十个请求在跑，事件互相穿插，根本分不清哪条属于谁。
3. **关键信息缺失**：超时了，但没记录是哪个模型、输入多少 token、重试了几次——查问题要的信息全没有。

## 结构化日志：一条 JSON 说清楚一件事

正确做法是**每条日志输出成结构化格式（JSON）**，字段名规范化，机器能直接解析：

```json
{
  "ts": "2025-10-01T10:24:01.123Z",
  "level": "error",
  "logger": "rag.retrieve",
  "request_id": "9f2c8a1e",
  "user_id": "u_1024",
  "event": "retrieve_timeout",
  "query": "什么是RAG?",
  "duration_ms": 312,
  "top_k": 5,
  "error": "milvus connection timeout"
}
```

每条日志都是一个自包含的事件对象：什么时间、什么级别、谁触发的、哪个环节、发生了什么、耗时多少、附带的上下文是什么。这样的日志：

- **能筛选**：`jq 'select(.level=="error")'` 或日志平台里按字段过滤；
- **能聚合**：统计 duration_ms 的分布、错误率；
- **能串链**：按 request_id 一查，一次请求的所有日志按时间排开。

Python 里的标准姿势是用 `logging` + JSON formatter，或者直接上 structlog：

```python
import structlog

log = structlog.get_logger()

@app.post("/qa")
async def qa(request: Request):
    request_id = request.headers.get("x-request-id", uuid4().hex)
    log.info("qa.request", request_id=request_id, question=request.question)
    try:
        docs = retrieve(request.question)
        log.info("qa.retrieved", request_id=request_id, n=len(docs), ms=retrieve_ms)
        answer = generate(request.question, docs)
        log.info("qa.answered", request_id=request_id, tokens=answer.usage.total)
    except Exception as e:
        log.error("qa.failed", request_id=request_id, error=str(e), exc_info=True)
```

关键字段命名约定几个词就够：`event`（事件名，便于过滤）、`request_id`（串链）、`duration_ms`（统一单位）、`error`（错误信息）。**同一字段名全项目保持一致**，否则筛选时字段对不上。

## request_id：把一次请求的所有日志串起来

现代 Web 服务都是高并发的，日志流里事件互相穿插。要还原"某一次请求"的完整过程，靠时间猜不靠谱——需要给每次请求一个唯一标识，贯穿整个调用链：**request_id（也叫 trace_id、correlation_id）**。

它的生命周期是：

1. **入口生成/透传**：网关或 API 入口为每个请求生成 `request_id`（或从客户端 header 读），放进请求上下文；
2. **贯穿传递**：服务内部所有日志都带上它，调用下游时通过 header（如 `x-request-id`）传给下游，下游继续带——这样**跨服务也能串起来**；
3. **返回给客户端**：响应头带 `x-request-id`，用户报障时只要报这个号，后端一查全链路日志都在。

```python
# 中间件：为每个请求生成 request_id 并注入日志上下文
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid4().hex
    with structlog.contextvars.bind_contextvars(request_id=request_id):
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
```

排查流程因此变成：用户报障 → 拿到 request_id → 日志平台一搜 → 该请求从入口到出口的每条日志按时间排好——**哪个环节慢、哪里报错，一目了然**。

## 日志该记什么、不该记什么

日志记录有一条黄金法则：**记下"事后排查需要的全部上下文"，但别记敏感信息。**

必须记的：

- 请求的**关键参数**（问题内容、检索条件）——不然复盘时不知道当时发生了什么；
- **每一步的耗时**——定位慢在哪；
- **错误详情**（异常类型、堆栈）——`exc_info=True` 或等价物，别只记一句 "failed"；
- **资源用量**（token 数、检索条数）——成本和质量复盘都要用。

绝不能记的：

- **密钥**：API Key、密码、token 一律不进日志。一个 `log.info("llm_call", api_key=...)` 就能把密钥打满整个日志系统；
- **个人敏感信息**：身份证、手机号、完整对话里可能含的隐私内容——要么脱敏（截断/替换）要么不入日志；
- **冗余大对象**：完整的 prompt 和响应可以进追踪系统（后面 Langfuse 篇讲），但别每行日志都打全量文本，日志会爆炸。

## 日志的四层级别怎么用

很多团队的日志级别形同虚设——全打成 info，出问题翻日志翻到怀疑人生。规范用法：

- **DEBUG**：开发调试细节，生产默认不开；
- **INFO**：正常业务流程的关键节点（请求进来、检索完成、回答返回）；
- **WARNING**：异常但可恢复（重试了一次、下游变慢）——**这类最容易被忽略，但它们往往是事故的前兆**；
- **ERROR**：出错且影响功能（请求失败、下游挂了）。

一个实用的心法：**生产环境的 WARNING 和 ERROR 应该少到能人工盯**。如果 ERROR 每分钟几十条却没人处理，那 ERROR 就失去了信号意义——大家会对报警麻木。

## 小结

可排查的日志三要素：结构化（JSON + 统一字段）、带 request_id（贯穿全链路）、内容对（记上下文不记密钥）。日志是排查问题时的第一手材料，也是后面接日志平台、做告警的基础。下一篇从日志的"点"上升到指标的"面"——用 Prometheus 采集、Grafana 展示，让服务健康度一眼可见。
