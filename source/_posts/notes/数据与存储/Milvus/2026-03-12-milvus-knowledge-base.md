---
title: "Milvus 实战：搭建企业知识库检索服务"
date: 2026-03-12
categories:
  - [数据与存储, Milvus]
tags: [Milvus, 知识库, 实战]
description: "把系列知识组装成完整的企业知识库：入库管线、混合检索、权限过滤、精排，一条链路交付。"
abbrlink: 4198743953
---

前 10 篇把 Milvus 的单点能力都过完了。这一篇做收口：把它们组装成一个**能上线的企业知识库检索服务**。从"文档进来"到"用户拿到带出处的回答"，把入库管线、混合检索、权限过滤、精排串成完整链路——你会发现每一篇在这里都有位置，拼起来才是知识库的完整形态。

## 整体架构

```text
入库管线（离线）                        在线检索
原始文档 → 解析 → 切片 → 元数据 →       用户提问
   embedding + BM25（Milvus 内置）         ↓
              ↓                      混合检索（稠密 + BM25）
        质量门禁（空块/过短/        + expr 权限过滤
         缺元数据/重复块）               ↓
              ↓                      Rerank 精排取 TopK
        写入 Milvus                 ↓
                                  LLM 生成（带出处引用）
```

两条链路独立跑：**入库管线把文档变成可检索的向量块；在线检索把问题变成带出处的答案**。

## 工程目录

```text
kb_retrieval/
├── ingest/
│   ├── parser.py         # 文档解析（PDF/Word → 文本）
│   ├── chunker.py        # 切片策略（条款级/父子块）
│   ├── embedder.py       # embedding 封装（BGE-M3）
│   ├── quality_gate.py   # 质量门禁四道检查
│   └── writer.py         # 写入 Milvus
├── api/
│   ├── main.py           # FastAPI：检索接口
│   ├── auth.py           # 用户身份 → 权限过滤条件
│   ├── retriever.py      # 混合检索
│   └── reranker.py       # 精排
└── config.py
```

## 入库管线：文档 → 向量块

**切片 + 元数据**（对应 schema 设计篇的字段）：

```python
# ingest/chunker.py —— 按条款级切块，保留出处
def chunk_document(doc) -> list[dict]:
    chunks = []
    for clause in split_by_clause(doc.text):      # 按条号切
        chunks.append({
            "doc_id": doc.doc_id,
            "title": doc.title,
            "clause": clause.no,                   # 条号，回答要引用
            "version": doc.version,
            "seq": len(chunks),
            "text": clause.text,
            "dept": doc.dept,                      # 权限过滤用
        })
    return chunks
```

**质量门禁**（呼应 RAG 章节的"四类拦截"——不过关的块不进库）：

```python
# ingest/quality_gate.py
def validate(chunk: dict) -> tuple[bool, str]:
    if not chunk["text"].strip():
        return False, "空块"
    if len(chunk["text"]) < 20:
        return False, "过短块"
    if not chunk.get("clause") or not chunk.get("dept"):
        return False, "缺元数据"
    if is_duplicate(chunk):
        return False, "重复块"
    return True, "ok"
```

**embedding + 写入**：

```python
# ingest/embedder.py
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3")        # 1024 维，多语言


def embed_batch(texts: list[str]) -> list[list[float]]:
    return model.encode(texts, normalize_embeddings=True).tolist()
```

```python
# ingest/writer.py —— 入库：过门禁 → 向量化 → 写入
from pymilvus import MilvusClient

client = MilvusClient(uri="http://localhost:19530")
EMBEDDING_DIM = 1024

def ingest_document(doc):
    chunks = chunk_document(doc)
    valid = []
    for c in chunks:
        ok, reason = validate(c)
        if not ok:
            log_warning(f"质量门禁拦截 {doc.doc_id} {c.get('clause')}: {reason}")
            continue
        valid.append(c)

    rows = []
    for c in valid:
        c["embedding"] = embed_batch([c["text"]])[0]   # 稠密向量
        rows.append(c)                                  # BM25 稀疏由 Function 自动算
    client.insert(collection_name="kb_specs", data=rows)
    client.flush(collection_name="kb_specs")            # 写入后立即可搜
```

入库侧全自动，schema（含 BM25 Function 与索引）按前篇方案在初始化时建好一次。

## 在线检索：问题 → 带出处的答案

**身份 → 权限过滤**（对应权限下推篇）：

```python
# api/auth.py
def build_expr(user: dict) -> str:
    parts = ['is_active == true']
    parts.append(f'dept == "{user["dept"]}"')
    if user["role"] not in ("manager", "admin"):
        parts.append("level <= 1")
    return " and ".join(parts)
```

**混合检索 + 精排**（对应混合检索篇与精排篇）：

```python
# api/retriever.py
from pymilvus import AnnSearchRequest, RRFRanker


def hybrid_retrieve(question: str, user: dict, top_k: int = 6):
    expr = build_expr(user)
    qv = embed_batch([question])[0]

    dense_req = AnnSearchRequest(data=[qv], anns_field="embedding",
                                 param={"metric_type": "IP",
                                        "params": {"ef": 128}}, limit=20)
    sparse_req = AnnSearchRequest(data=[question], anns_field="sparse",
                                  param={"metric_type": "BM25"}, limit=20)
    hits = client.hybrid_search(
        collection_name="kb_specs",
        reqs=[dense_req, sparse_req],
        ranker=RRFRanker(),
        limit=20,
        expr=expr,                                    # 权限过滤下推
        output_fields=["doc_id", "title", "clause", "version", "text"],
    )
    return rerank(question, hits[0], keep=top_k)      # 精排收窄
```

**FastAPI 接口**（对应 FastAPI 系列的结构，服务薄、逻辑在层里）：

```python
# api/main.py
from fastapi import FastAPI, Depends

app = FastAPI(title="kb-retrieval")

@app.post("/retrieve")
async def retrieve(req: AskRequest, user: dict = Depends(get_current_user)):
    top = hybrid_retrieve(req.question, user, top_k=req.top_k or 6)
    return {"hits": top}                              # 各条带 doc_id/title/clause/version

@app.post("/ask", response_model=Answer)
async def ask(req: AskRequest, user: dict = Depends(get_current_user)):
    top = hybrid_retrieve(req.question, user)
    context = format_context(top)                     # 拼编号资料
    answer = await llm_answer(context, req.question)  # 强制带出处回答
    return Answer(answer=answer, sources=[{k: h[k] for k in
                   ("doc_id", "title", "clause", "version")} for h in top])
```

## 全链路验证

```bash
# 1. 入库一篇文档
python -m ingest.run --doc GB50204_2015.pdf

# 2. 检索：语义问法
curl -X POST localhost:8000/retrieve -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"梁板跨度 2-8m 什么时候可以拆模"}'
# → 命中"拆模强度"相关条款，带 clause 条号

# 3. 检索：精确问法（验证 BM25 兜底）
curl -X POST localhost:8000/retrieve -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"GB50204 7.1.4"}'
# → 精确命中该条，即便表述与文档不完全一致

# 4. 权限验证：普通员工搜质量部文档 → 空结果
```

四个验证点全过：语义能召回、精确词能命中、权限有隔离、答案带出处——知识库检索服务闭环。

## 上线清单

- [ ] 初始化脚本建 schema + 索引（dense HNSW + sparse SPARSE_WAND）
- [ ] 入库管线带质量门禁 + 幂等（重复 doc_id 先删后插）
- [ ] 权限过滤由服务端身份拼 expr，客户端不可改
- [ ] rerank 独立服务部署，控制精排延迟
- [ ] Milvus 备份策略（milvus-backup）+ 监控告警（内存/延迟）
- [ ] 检索评估集跑 Recall@K，量化上线前后效果

## 小结

一个企业知识库检索服务到这里是完整闭环：**入库管线用质量门禁保证数据干净，schema 让权限与出处成为一等公民，混合检索兼顾语义与精确词，expr 把权限下推进数据库，rerank 把最相关的内容送进 LLM，回答强制带出处**——每一层各司其职，从"文档"到"可信答案"全程可控。

Milvus 十一篇到此收官。回看整个系列：定位 → 上手 → 索引 → schema → 写入 → 过滤 → 混合 → 调优 → 精排 → 运维 → 实战，是一条从"认识向量数据库"到"交付企业知识库"的完整路径。愿你搭的每一个检索系统，都又快、又准、又守得住边界。
