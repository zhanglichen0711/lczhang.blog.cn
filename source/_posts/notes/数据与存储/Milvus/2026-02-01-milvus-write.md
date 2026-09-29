---
title: "Milvus 数据写入：insert、upsert 与分段管理"
date: 2026-02-01
categories:
  - [数据与存储, Milvus]
tags: [Milvus, 写入, upsert]
description: "批量写入、增量更新、删除与分段（Segment）机制——理解数据的底层流转。"
abbrlink: 1388163432
---

RAG 知识库要不停地"灌数据"：新文档进来要切块入库，旧标准更新要替换旧块，失效文档要能撤下。这一篇讲清 Milvus 的写入三件套（insert / upsert / delete）以及背后的**分段（Segment）机制**——理解了 Segment，就理解了为什么"刚插入的数据有时搜不到""删除后空间没立刻释放"。

## insert：批量写入

单个插入和批量插入的 API 一样，区别只在 data 列表长度——**永远用批量**，单条一次往返太浪费：

```python
rows = []
for chunk in chunks:
    rows.append({
        "chunk_id": chunk.chunk_id,
        "doc_id": chunk.doc_id,
        "title": chunk.title,
        "text": chunk.text,
        "embedding": chunk.embedding,   # 由 embedding 模型提前算好
        "dept": "质量部",
        "is_active": True,
    })

res = client.insert(collection_name="kb_specs", data=rows)
print("插入条数:", res["insert_count"])
```

两个要点：

1. **向量要自己提前算好**（embedding 模型输出的 float 列表），Milvus 只存不负责"文本转向量"（BM25 稀疏字段除外，那是内置 Function 自动算）；
2. 一次插 1000 条和插 1 条的开销差不了太多，**按千条一批**是常见实践，别一条一条 insert。

## upsert：有则更新，无则插入

文档重新解析后要"整体替换旧块"，用 upsert——主键相同则覆盖：

```python
client.upsert(collection_name="kb_specs", data=new_rows)
```

注意两点：

1. **upsert 按主键判重**——前提是主键设计稳定（上一篇说的业务可复现 ID 在这里派上用场）；
2. upsert 实际上是"先删后插"，主键相同但向量也变了时，旧向量会留下孤儿数据直到 compaction（下面讲）。**重度重灌场景，推荐"按 doc_id 精确删除 + insert"**，语义更干净。

## delete：按表达式删

删除最常见的是"撤下一整篇文档"（标准更新、违规文档下架），按 doc_id 表达式删：

```python
client.delete(
    collection_name="kb_specs",
    filter="doc_id in ['GB50204-2015', 'GB50300-2013']",
)
```

Milvus 的 delete 和 MySQL 不同：**删除是"软删除"**——数据不会立即从磁盘消失，而是被打上删除标记，真正物理清理要等 compaction 合并分段时执行。所以删完立刻看磁盘占用没变化是正常的。

## 分段（Segment）：数据在底层的"小包"

理解 Milvus 的写入模型，关键在于 Segment（数据段）。它的行为很像 LSM-Tree：

- 新数据不断追加成一个个小的 Segment（增量段）；
- 后台会把小 Segment **合并（compaction）**成大 Segment，同时物理清理被删除/被覆盖的数据；
- 删除标记、upsert 的旧向量，都在 compaction 时被真正清除。

这就是两个常见现象的解释：

```python
# 现象一：刚插入的数据有时搜不到
# 原因：查询只搜"已 flush 的段"，小段数据达到阈值前可能不可见
# 处理：写入后显式 flush，保证后续查询能搜到
client.flush(collection_name="kb_specs")

# 现象二：delete/upsert 后磁盘没变小
# 原因：软删除，等 compaction
# 处理：不需要手动干预；若删量巨大，可对集合做 compact 再等它跑完
client.compact(collection_name="kb_specs")
```

工程上把握两个动作：**写完关键批数据后 `flush` 一下保证立即可搜**；**大批量删除/重灌后手动 `compact` 让空间真正回收**。日常小量增删不用管，Milvus 会自动 compaction。

## 写入吞吐的注意点

灌大文档集（几万块）时，写入速度受几个因素影响：

1. **分批别太大**——单批几万条会让服务端压力集中，几千条一批节奏更稳；
2. **写入与索引**——建了索引后每次写入增量段也要更新索引结构，海量初灌时可以先建集合不建索引，灌完再一次性建索引，速度快很多；
3. **embedding 生成是瓶颈**——通常瓶颈在模型侧不在 Milvus 侧，用批量 embedding + 并发控制（前面 FastAPI/异步那篇的 Semaphore）拉满吞吐。

## 小结

写入的心智模型：**insert 批量灌、upsert 按主键替换、delete 按表达式撤文档、Segment 决定可见性与空间回收时机**。配合"写入后 flush、大批量后 compact"两个动作，知识库的增量更新就稳了。

数据能进能出了，下一篇做查询的进阶：search 时的过滤表达式 expr——权限下推的核心武器。
