---
title: "Milvus 混合检索：稠密向量 + BM25 稀疏"
date: 2026-02-14
categories:
  - [数据与存储, Milvus]
tags: [Milvus, 混合检索, BM25]
description: "语义检索漏精确词、关键词检索漏语义，Milvus 内置 Sparse-BM25 把两条路合进一个集合。"
abbrlink: 3827348459
---

纯向量检索有个经典盲区：问"GB50204 第 7.1.4 条怎么规定的"，语义检索可能把"GB50204""7.1.4"这种**精确编号**当噪声忽略，召回一堆"看似相关其实不对"的块。反过来，纯关键词（BM25）检索对"混凝土强度达到多少可以拆模"这种**换着说法问**的问题又无能为力。真实知识库必须两条腿走路：**语义召回 + 精确词召回**，再融合排序。这一篇讲 Milvus 里的混合检索怎么落地。

## 为什么需要两条路

| 检索方式 | 擅长 | 盲区 |
| --- | --- | --- |
| 稠密向量（语义） | 同义改写、概念相近 | 精确编号/专有名词可能被"向量化"冲淡 |
| 稀疏 BM25（关键词） | 精确词、条款号、错误码 | 语义相关但用词不同的问题召回不到 |

企业规范问答里两种问题都存在：一半问题用语义（"梁板拆模强度"），一半问题必须精确（"GB50204 第 7.1.4 条"）。**混合检索 = 两条路都跑，把结果融合排序**，召回率显著高于任何单路。

## Milvus 2.5+ 的内置方案：Sparse-BM25

在 2.5 之前，做混合检索要自己维护两套系统（向量库 + Elasticsearch/BM25），文档一更新要同步改两处。Milvus 2.5 起把 BM25 **内置进向量库**：文本经内置分词器自动转成 BM25 稀疏向量，与稠密向量存在同一个集合、走同一套检索链路。

落地分三步（schema 已在前篇铺垫过）：

**第一步：schema 里加文本字段 + 稀疏向量 + BM25 Function**

```python
from pymilvus import MilvusClient, DataType, Function, FunctionType

schema = MilvusClient.create_schema(auto_id=False)

schema.add_field(field_name="chunk_id", datatype=DataType.INT64, is_primary=True)
schema.add_field(field_name="text", datatype=DataType.VARCHAR,
                 max_length=1024, enable_analyzer=True)   # 开分词
schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=1024)
schema.add_field(field_name="sparse", datatype=DataType.SPARSE_FLOAT_VECTOR)

# BM25 Function：读 text，自动产出稀疏向量到 sparse 字段
bm25_func = Function(name="bm25", function_type=FunctionType.BM25,
                     input_field_names=["text"],
                     output_field_names="sparse")
schema.add_function(bm25_func)
```

**第二步：给两个向量字段分别建索引**（稠密用 HNSW，稀疏用 SPARSE_WAND，度量都是 BM25/IP 对应好）：

```python
index_params = client.prepare_index_params()
index_params.add_index(field_name="embedding", index_type="HNSW",
                       metric_type="IP", params={"M": 16, "efConstruction": 200})
index_params.add_index(field_name="sparse", index_type="SPARSE_WAND",
                       metric_type="BM25")
client.create_collection(collection_name="kb_specs", schema=schema,
                         index_params=index_params)
```

**第三步：插入数据时只传文本**——BM25 稀疏向量由系统自动算，不用自己动手：

```python
rows = [{"chunk_id": c.chunk_id, "doc_id": c.doc_id,
         "text": c.text, "embedding": c.embedding} for c in chunks]
client.insert(collection_name="kb_specs", data=rows)
```

## 混合检索：一路稠密一路稀疏，RRF 融合

查询时用 `hybrid_search`：分别构造稠密请求（向量）和稀疏请求（**原始文本**，系统自动转 BM25），再交给融合排序器：

```python
from pymilvus import AnnSearchRequest, RRFRanker

query_text = "GB50204 第 7.1.4 条 梁板拆模强度"

# 路 1：稠密语义检索
dense_req = AnnSearchRequest(
    data=[embed(query_text)],              # 向量
    anns_field="embedding",
    param={"metric_type": "IP", "params": {"ef": 128}},
    limit=20,
)

# 路 2：稀疏关键词检索（直接传原文）
sparse_req = AnnSearchRequest(
    data=[query_text],                     # 原始文本！系统自动做 BM25
    anns_field="sparse",
    param={"metric_type": "BM25"},
    limit=20,
)

# RRF（Reciprocal Rank Fusion）：按排名融合，兼顾两路
results = client.hybrid_search(
    collection_name="kb_specs",
    reqs=[dense_req, sparse_req],
    ranker=RRFRanker(),
    limit=10,
    output_fields=["doc_id", "title", "clause", "text"],
)
```

`RRFRanker` 的原理一句话：**不看分数看名次**——两条路的 TopN 各自计分（排名越靠前分越高），加总后重新排序。它的好处是不用调权重，天然抗"两路分数尺度不一致"的问题（向量距离和 BM25 分数根本没有可比性，直接加权是错的）。

## 想要可控的权重？

RRF 是零配置的稳妥选择。如果你希望"语义为主、关键词兜底"的明确配比（比如语义 0.55 / 关键词 0.45），用 `WeightedRanker`（Milvus 2.4+ 提供，适合两路分数已做过归一化的场景）：

```python
from pymilvus import WeightedRanker

ranker = WeightedRanker(0.55, 0.45)     # 稠密 0.55，稀疏 0.45
```

实践提醒：**先跑 RRF，再用线上数据评估，确有需要再上权重**。权重调不好反而引入新的偏差，RRF 的鲁棒性在日常场景通常够用。

## 过滤器照样能加

混合检索同样支持 expr 过滤——权限下推和混合检索不冲突：

```python
results = client.hybrid_search(
    collection_name="kb_specs",
    reqs=[dense_req, sparse_req],
    ranker=RRFRanker(),
    limit=10,
    expr='dept == "质量部" and is_active == true',   # 权限过滤照常下推
    output_fields=["doc_id", "title", "clause", "text"],
)
```

## 什么时候该用混合检索

不是所有场景都要上。判断标准看你的 query 形态：

- 知识库/规范问答、包含大量专有名词与编号（标准号、条款号、错误码）→ **强烈建议混合**；
- 开放域闲聊、语义相似度高的问题（没有"必须精确命中"的内容）→ 单路稠密即可；
- 数据源更新频繁 → 混合检索的优势更明显（Milvus 的 IDF 自动随数据更新，不用像双系统那样手动重建）。

## 小结

混合检索解决"语义与精确词不可兼得"：**稠密路管语义、BM25 路管精确词、RRF 融合排序、expr 照常过滤权限**——一套 API、一个集合、一次运维，替代了以前"向量库 + ES"两套系统的复杂度。对企业规范知识库这类"编号密集"的检索，它是召回率的关键一步。

召回的路铺好了，下一篇调优：索引参数、召回率与延迟怎么权衡，用什么方法量化。
