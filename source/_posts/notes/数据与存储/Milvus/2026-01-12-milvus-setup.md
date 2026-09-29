---
title: "Milvus 安装与第一个集合"
date: 2026-01-12
categories:
  - [数据与存储, Milvus]
tags: [Milvus, 安装]
description: "用 Docker 起一个 Milvus Standalone，装好 pymilvus，建第一个集合并完成一次搜索。"
abbrlink: 3582464072
---

上一篇讲了向量数据库在 RAG 里的位置。这一篇动手：把 Milvus 跑起来、装上 Python SDK，然后完成"建集合 → 插入数据 → 搜索"的完整循环。目标只有一个——**让最小系统转起来**，后面的概念都建立在能跑的基础上。

## 用 Docker 起 Milvus Standalone

本地开发最省事的方式是 Docker Compose 起单机版。Milvus 依赖 etcd（元数据）和 MinIO（存储），官方编排文件一次全带：

```bash
# 下载官方编排文件并启动（standalone 单机版）
wget https://github.com/milvus-io/milvus/releases/download/v2.5.x/milvus-standalone-docker-compose.yml -O docker-compose.yml
docker compose up -d
```

启动后会看到三个容器：`milvus`、`etcd`、`minio`。验证服务健康：

```bash
docker compose ps          # milvus 状态为 healthy
curl http://localhost:9091/healthz
# OK
```

Milvus 默认监听 `19530` 端口（gRPC）。生产环境用分布式集群（K8s 部署），本地学习 Standalone 完全够。

## 装 Python SDK：pymilvus

Milvus 的官方 Python 客户端是 `pymilvus`（2.5+ 版本才支持内置 BM25 等新特性，安装时注意版本）：

```bash
pip install pymilvus
```

## 连接与第一个集合

现代 pymilvus 推荐用 `MilvusClient`（比旧版 `connections.connect` + `Collection` 的写法简单直观）：

```python
from pymilvus import MilvusClient

# 连接（本地 Standalone）
client = MilvusClient(uri="http://localhost:19530")

# 检查是否存在并删除旧集合（演示幂等）
client.drop_collection("demo_docs")
```

创建集合需要先定义 schema——**字段是集合的骨架**：

```python
from pymilvus import DataType

schema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)

schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
schema.add_field(field_name="title", datatype=DataType.VARCHAR, max_length=200)
schema.add_field(field_name="dept", datatype=DataType.VARCHAR, max_length=50)
schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=8)
```

这里声明了四个字段：主键 `id`、标量字段 `title`/`dept`（元数据，将来能过滤）、向量字段 `embedding`（8 维，仅演示用——真实场景用 BGE-M3 之类 embedding 模型输出 1024 维）。

**向量字段必须建索引才能高效搜索**（否则全量暴力扫），索引在创建集合时一起配置：

```python
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="embedding",
    index_type="HNSW",          # 图索引，召回率高（下一篇细讲）
    metric_type="IP",           # 度量：内积
    params={"M": 16, "efConstruction": 200},
)

client.create_collection(
    collection_name="demo_docs",
    schema=schema,
    index_params=index_params,
)
print("集合创建成功")
```

## 插入数据

向量数据库插入的数据 = **一行行的 dict**，每个 dict 包含主键、标量字段和向量：

```python
import numpy as np

def fake_embed(text: str) -> list[float]:
    """演示用伪向量；真实项目换成 embedding 模型"""
    seed = sum(ord(c) for c in text)
    rng = np.random.default_rng(seed)
    return rng.normal(size=8).tolist()

docs = [
    {"id": 1, "title": "GB50204 混凝土结构验收", "dept": "质量部",
     "embedding": fake_embed("混凝土结构验收规范")},
    {"id": 2, "title": "施工方案与交底管理办法", "dept": "技术部",
     "embedding": fake_embed("施工方案技术交底")},
    {"id": 3, "title": "扣件式脚手架安全技术规范", "dept": "安全部",
     "embedding": fake_embed("脚手架安全")},
]
client.insert(collection_name="demo_docs", data=docs)
print("已插入", len(docs), "条")
```

## 第一次搜索

搜索的输入也是一个向量（问题的 embedding），Milvus 返回距离最近的 TopK 条：

```python
results = client.search(
    collection_name="demo_docs",
    data=[fake_embed("混凝土强度验收要求")],   # 问题向量
    limit=3,                                   # 返回 Top3
    output_fields=["title", "dept"],           # 把标量字段也带回来
)

for hit in results[0]:
    print(f"id={hit['id']} 得分={hit['distance']:.4f}  "
          f"title={hit['entity']['title']}  dept={hit['entity']['dept']}")
```

预期输出里，"混凝土强度验收"那条（id=1）应该排在最前——因为它的伪向量与问题向量最接近。真实场景中把 `fake_embed` 换成 BGE-M3 之类的真实 embedding 模型，语义相近的文本就会聚在一起被召回到。

## 三个容易懵的点

1. **dim 必须与 embedding 模型输出一致**——用 BGE-M3（1024 维）就声明 `dim=1024`，声明错了插数据直接报错；
2. **索引要在建集合时配好**——忘配索引，小数据能搜但数据一多就退化成全量扫描，慢到不可用；
3. **`limit` 是召回数不是最终答案数**——召回 TopK 之后通常还有 rerank 精排（后面专门一篇），先召回多些，别让向量库替你决定答案。

## 小结

Milvus 的最小系统 = **Docker 起服务 → 定义 schema（主键 + 标量 + 向量）→ 建索引建集合 → insert → search**。这套循环是后面所有篇章的骨架：加字段、做过滤、混合检索、调索引，都是在"建集合与搜索"这两步上做文章。

最小系统转起来了，下一篇深入索引：向量间的距离怎么算、HNSW 和 IVF 各是什么——理解索引才能调好召回。
