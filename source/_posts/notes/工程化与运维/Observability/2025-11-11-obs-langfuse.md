---
title: "LLM 调用追踪：接入 Langfuse"
date: 2025-11-11
categories:
  - [工程化与运维, Observability]
tags: [可观测性, Langfuse, LLMOps]
description: "每次 LLM 调用的 prompt、输出、token、成本、延迟，全记录可复盘。"
abbrlink: 1581580108
---

可观测性系列前面两篇讲的日志和指标，对 LLM 应用有个共同盲区：**它们只看到"请求"这一层，看不到"智能层"**——模型收到了什么 prompt、输出了什么、花了多少 token、为什么这次回答质量差。传统监控根本感知不到这些，因为它们不是"错误"，而是"过程"。Langfuse 这类 LLMOps 工具补的正是这一层：**把每次 LLM 调用（连同检索、工具调用等周边环节）完整记录下来，形成可回放、可评估、可统计的 trace。** 这篇讲 Langfuse 的接入——从部署到三种接入方式，重点是让一次 RAG 回答变成一棵能逐层检查的"调用树"。

## 自托管：一条命令起服务

Langfuse 是开源项目，提供云服务（cloud.langfuse.com）和自托管两种方式。**数据敏感（prompt 里可能带业务内容）的团队建议自托管**。官方仓库自带 docker compose 编排，包含 Web 界面 + worker + PostgreSQL + ClickHouse + Redis：

```bash
git clone https://github.com/langfuse/langfuse.git
cd langfuse
cp .env.example .env      # 生成并填好密钥（NEXTAUTH_SECRET、SALT 等）
docker compose up -d
```

启动后打开 `http://localhost:3000`，注册管理员账号、创建项目，拿到一对钥匙：

- **公钥（Public Key）**：标识项目，可以出现在前端；
- **私钥（Secret Key）**：服务端调用 SDK 时用，别泄露。

接入代码只需要配置三个环境变量，SDK 会自动读取：

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-xxx"
export LANGFUSE_SECRET_KEY="sk-lf-xxx"
export LANGFUSE_HOST="http://localhost:3000"
```

## 方式一：零侵入的 OpenAI 兼容封装

如果你的代码直接用 OpenAI SDK（或任何 OpenAI 兼容的 API），Langfuse 提供 drop-in 替代——**只改 import 一行，所有调用自动被记录**：

```python
from langfuse.openai import openai   # 原来是 from openai import OpenAI

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",   # 哪怕是 vLLM 这类兼容端点也行
    api_key="sk-xxx",
)
resp = client.chat.completions.create(
    model="qwen-plus",
    messages=[{"role": "user", "content": "什么是 RAG？"}],
)
```

每次调用自动记录：模型、prompt、输出、token 数、延迟、估算成本。**这是接入成本最低的方式**，适合"先把追踪跑起来"的阶段。

## 方式二：@observe 装饰器——让业务逻辑进 trace

只追踪模型调用还不够——RAG 的价值在于能看到**整个链路的每一环**。Langfuse 的 `@observe()` 装饰器可以给任意函数加追踪，嵌套的被装饰函数自动成为父子 span：

```python
from langfuse.decorators import observe, langfuse_context

@observe()
def retrieve(query: str):
    docs = vector_store.search(query, top_k=5)
    # 给这一步挂上自定义信息
    langfuse_context.update_current_observation(
        input={"query": query},
        output={"n": len(docs), "ids": [d.id for d in docs]},
        metadata={"index": "knowledge_v2"},
    )
    return docs

@observe()
def generate(query: str, docs: list):
    context = "\n\n".join(d.page_content for d in docs)
    resp = openai.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": f"仅依据以下资料回答：\n{context}"},
            {"role": "user", "content": query},
        ],
    )
    return resp.choices[0].message.content

@observe()
def rag_answer(query: str):
    docs = retrieve(query)
    answer = generate(query, docs)
    langfuse_context.update_current_trace(
        name="rag_qa",
        session_id=session_id,       # 把多次提问归到同一会话
        user_id=user_id,             # 按用户维度分析
        metadata={"source": "web"},
    )
    return answer
```

调一次 `rag_answer`，Langfuse 里就生成一棵树：`rag_qa`（trace）下挂着 `retrieve` 和 `generate` 两个 span，`generate` 内部还有一次模型调用（自动成为子节点）。**排查"回答为什么差"时，点开 trace 就能看到：检索返回了什么、prompt 拼成什么样、模型输出是什么**——哪一环出了问题一目了然。

## 方式三：框架回调（LangChain / LangGraph）

用 LangChain/LangGraph 构建时，注册一个 CallbackHandler 就能捕获整条链：

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
result = chain.invoke(
    {"question": "什么是 RAG？"},
    config={"callbacks": [handler]},
)
```

## 在 Langfuse 界面里能做什么

数据进去之后，界面提供的核心能力：

**Trace 详情回放**。点开任意一次请求，看完整的输入输出树，逐层检查每一环节的耗时、token、结果——**定位质量问题的第一现场**。

**成本与用量统计**。按模型、按功能、按用户聚合 token 消耗和成本曲线——回答"上个月模型调用花了多少钱、花在哪个功能上"。

**评分与评估**。对 trace 打分数（人工标注或 LLM-as-judge），把"回答质量"变成可跟踪的指标。把一个失败案例存成 dataset，回归测试时反复用——这是把"质量事故"沉淀成"测试用例"的路径。

**Prompt 管理**。把 prompt 存进 Langfuse 做版本管理，A/B 对比不同 prompt 的效果，不用改代码就能切换版本。

## 接入时注意三个点

**采样**：生产环境流量大时全量记录成本高，SDK 支持采样率配置——对线上流量按比例抽样记录，测试/预发环境全量。质量类复盘可以靠"用户反馈触发全量记录"（反馈差评的请求必须完整留痕）。

**脱敏**：prompt 和输出可能含用户隐私，Langfuse 支持在 SDK 层做字段处理（截断、替换），按合规要求在接入前就设计好什么数据进 trace。

**错误也要 trace**：模型调用失败、超时、重试的路径同样要记录，否则线上错误无法在追踪里复盘——用 try/except 把异常路径也做成 span（带 error 标记），界面里能按错误筛选。

## 小结

Langfuse 把可观测性延伸到智能层：自托管一条 compose 起服务，三种接入方式（drop-in 封装、@observe 装饰器、框架回调）从"零成本起步"到"业务逻辑全链路入 trace"。一次 RAG 回答从此是一棵可回放、可评分、可统计的调用树。Agent 场景比 RAG 更复杂——多轮、多工具、多分支，追踪怎么做？下一篇讲 Agent 的可观测。
