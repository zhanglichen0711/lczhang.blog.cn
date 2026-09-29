---
title: "Milvus 集合与字段设计：主键、向量与标量"
date: 2026-01-25
categories:
  - [数据与存储, Milvus]
tags: [Milvus, schema, 字段设计]
description: "集合的 schema 怎么设计：主键策略、向量维度、标量元数据字段，设计决定检索质量上限。"
abbrlink: 3382324434
---

Collection 相当于表，schema（字段定义）决定这张表长什么样。RAG 场景里 schema 设计得差，后面做权限过滤、版本控制、时效管理都会寸步难行；设计得好，很多需求只是"加一个过滤条件"的事。这一篇把知识库场景的 schema 设计讲透。

## 字段的三种角色

一个知识库集合的字段通常分三类，各司其职：

| 角色 | 字段示例 | 用途 |
| --- | --- | --- |
| 主键 | `id` | 唯一标识一条切片，写入/删除按它定位 |
| 向量字段 | `embedding`（dense）、`sparse` | 语义搜索的依据 |
| 标量字段 | `doc_id`、`title`、`dept`、`version`、`seq` | 元数据：过滤、返回展示、权限控制 |

设计原则一句话：**"将来要按它过滤的，都做成标量字段；将来要原样返回展示的，也做成标量字段"**——不要在搜索完之后才后悔没存元数据。

## 一个真实的知识库 schema

以企业规范知识库为例（呼应 RAG 章节的切分与元数据模型），每个"检索块"应自带完整出处：

```python
from pymilvus import MilvusClient, DataType

schema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)

# —— 主键：业务自增 / 雪花 ID，不用 auto_id（块删除/更新靠它定位）
schema.add_field(field_name="chunk_id", datatype=DataType.INT64, is_primary=True)

# —— 溯源字段：召回后要拼进 prompt、要展示出处
schema.add_field(field_name="doc_id", datatype=DataType.VARCHAR, max_length=64)
schema.add_field(field_name="title", datatype=DataType.VARCHAR, max_length=256)
schema.add_field(field_name="clause", datatype=DataType.VARCHAR, max_length=64)   # 条号
schema.add_field(field_name="version", datatype=DataType.VARCHAR, max_length=32)
schema.add_field(field_name="seq", datatype=DataType.INT64)                        # 块内序号

# —— 过滤字段：权限、时效
schema.add_field(field_name="dept", datatype=DataType.VARCHAR, max_length=64)
schema.add_field(field_name="level", datatype=DataType.INT8)       # 密级/角色门槛
schema.add_field(field_name="is_active", datatype=DataType.BOOL)   # 质量门禁后置为 true
schema.add_field(field_name="updated_at", datatype=DataType.INT64) # 版本时间戳

# —— 文本 + 稠密向量（真实用 BGE-M3：dim=1024）
schema.add_field(field_name="text", datatype=DataType.VARCHAR, max_length=1024)
schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=1024)

client.create_collection(collection_name="kb_specs", schema=schema)
```

这套设计直接支撑几个硬需求：

1. **回答强制带出处**——`doc_id`/`title`/`clause`/`version` 都在切片上，拼 prompt 或返回引用时直接读字段，不用反查文档表；
2. **权限过滤**——搜索时 `expr='dept == "质量部" and is_active == true'`，把"只看本部门、只搜已激活"下推进数据库；
3. **旧版治理**——`version` + `updated_at` 组合，搜索时可加 `version == 最新版` 条件，避免新旧标准混用。

## 主键策略：用业务 ID，别用 auto_id

两种主键方案对比：

```python
# 方案 A：auto_id=True，Milvus 自动生成
# 缺点：你 insert 后拿不到 chunk_id，删除/更新要靠查询定位，还可能与业务 ID 对不上

# 方案 B：业务侧生成（推荐）
chunk_id = int(hashlib.md5(f"{doc_id}:{seq}".encode()).hexdigest()[:15], 16)
row = {"chunk_id": chunk_id, "doc_id": doc_id, "seq": seq, ...}
```

推荐业务侧生成稳定主键：**切片与文档的对应关系在代码里可复现**，重灌某篇文档时能精确删除旧块（按 doc_id 删即可），而不是全集合清了重建。

## enable_dynamic_field：临时字段的开关

创建 schema 时的 `enable_dynamic_field` 决定：**insert 时带了 schema 里没有的字段，会不会被拒绝**。

- `False`（默认）：严格模式，多带字段直接报错——**生产推荐**，避免脏字段混入；
- `True`：宽容模式，多余字段自动存进动态字段——适合快速验证、schema 频繁演进时。

RAG 生产环境建议 `False`：字段边界清晰，索引和过滤都可预期。开发阶段图省事可以开 True，但上线前收敛。

## 一个文本字段，为 BM25 预留

Milvus 2.5+ 支持内置 BM25 全文检索，做法是给文本字段开 `enable_analyzer`，再用一个 Function 把它转成稀疏向量（稀疏字段由系统生成，不用自己算）：

```python
schema.add_field(field_name="text", datatype=DataType.VARCHAR,
                 max_length=1024, enable_analyzer=True)
schema.add_field(field_name="sparse", datatype=DataType.SPARSE_FLOAT_VECTOR)

from pymilvus import Function, FunctionType
bm25 = Function(name="bm25", function_type=FunctionType.BM25,
                input_field_names=["text"], output_field_names="sparse")
schema.add_function(bm25)
```

这样建好后：插入时**只传文本**，Milvus 自动分词生成 BM25 稀疏向量；搜索时**直接传原始文本**，自动算稀疏查询向量。语义召回（稠密）和关键词召回（稀疏）可以在一个集合里共存——混合检索留到专门一篇展开。

## schema 设计的自查清单

- [ ] 主键是否稳定、可由业务复现（便于删改定位）？
- [ ] 溯源字段（doc_id/title/版本/条号）是否齐全？——RAG 回答要带出处
- [ ] 权限/时效字段（部门/密级/激活态/时间戳）是否在 schema 里？——过滤靠它
- [ ] 文本字段开 analyzer 了吗？——为 BM25/全文检索预留
- [ ] `enable_dynamic_field=False`，字段边界收敛了吗？
- [ ] 向量 dim 与 embedding 模型输出一致吗？

## 小结

schema 是知识库检索的"地基"：**主键决定可维护性，向量字段决定召回能力，标量字段决定过滤与溯源能力**。设计时多想一步"将来我要按什么过滤、返回什么字段"，就能避免"检索到了却不知道是哪个文档的哪一条"的尴尬。

地基打好，下一篇写数据：insert、upsert、delete 与背后的分段管理——数据的增删改都讲清楚。
