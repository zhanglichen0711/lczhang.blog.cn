---
title: "Milvus 检索与过滤：search 与 expr 权限下推"
date: 2026-02-07
categories:
  - [数据与存储, Milvus]
tags: [Milvus, 检索, 过滤]
description: "search 的完整参数、expr 表达式过滤与权限下推——把部门角色过滤做进数据库层。"
abbrlink: 2328648847
---

企业知识库最敏感的一点：**不同角色搜到的东西必须不同**——质量部的规范问答不能让员工搜到越权文档，下架的标准绝不能出现在结果里。如果过滤逻辑写在应用层（先把全量搜出来再内存里滤），既慢又危险（漏滤一条就泄密）。正确做法是**把过滤条件下推进数据库**：搜索时就按标量字段限定范围。这一篇把 search 的完整用法和 expr 过滤讲透。

## search 的完整参数

上一篇的搜索只用了最简形式，完整形态长这样：

```python
results = client.search(
    collection_name="kb_specs",
    data=[query_vector],                    # 问题向量（一个或多个）
    anns_field="embedding",                 # 在哪个向量字段上搜
    limit=20,                               # 召回数
    expr='dept == "质量部"',                # 标量过滤：先滤再搜
    search_params={"metric_type": "IP", "params": {"ef": 128}},
    output_fields=["doc_id", "title", "clause", "version", "text"],
)
```

关键参数逐个看：

- `data`：可以传多个查询向量（一次搜多问，比如批量评测）；
- `anns_field`：多向量集合里要指明搜哪个向量字段；
- `expr`：**过滤表达式**，本片主角；
- `output_fields`：召回后把哪些标量字段带回来——检索块出处（doc_id/title/条号）靠它返回。

## expr 过滤：先缩小范围再搜索

`expr` 写在搜索请求里，Milvus 会**先按标量字段筛出候选集合，再在候选里做向量搜索**——不是全量搜完再滤。常用运算符：

```python
# 等值
expr='dept == "质量部"'
expr='doc_id == "GB50204-2015"'

# 范围 / 比较
expr='level <= 2 and updated_at > 1700000000'
expr='seq >= 10 and seq <= 100'

# 集合成员
expr='dept in ["质量部", "技术部"]'

# 布尔
expr='is_active == true'

# 组合
expr='dept == "质量部" and is_active == true and level <= 2'
```

组合过滤对企业知识库是刚需：**部门 + 激活态 + 密级**三个条件叠起来，搜索自然收敛到"该用户该看的那批文档"。

## 权限下推：服务端拼 expr，用户改不了

前面 FastAPI 权限篇讲过：权限过滤条件必须在**服务端根据 token 里的身份强制拼接**，绝不信任客户端传参。落到 Milvus 检索就是：

```python
def build_filter(user) -> str:
    """根据用户身份拼出检索过滤表达式——由服务端决定，调用方无法覆盖"""
    parts = ['is_active == true']
    parts.append(f'dept == "{user["dept"]}"')       # 只搜本部门
    if user["role"] in ("manager", "admin"):
        parts.append('level <= 3')                   # 管理层可见密级更高
    else:
        parts.append('level <= 1')                   # 普通员工低密级
    return " and ".join(parts)


def search_visible(question: str, user: dict, top_k: int = 10):
    qv = embed(question)
    expr = build_filter(user)                         # ← 权限在此固化
    hits = client.search(
        collection_name="kb_specs",
        data=[qv],
        limit=top_k,
        expr=expr,
        search_params={"metric_type": "IP", "params": {"ef": 128}},
        output_fields=["doc_id", "title", "clause", "version"],
    )
    return hits[0]
```

这套设计的核心价值：**权限过滤发生在数据库层、由服务端身份决定**——应用层拿不到"不带过滤的检索结果"，天然没有越权出口。即便某个下游接口忘了传权限，搜索本身也会因缺 expr 而只返回可见范围之外的空结果。

## 过滤字段要有索引

`expr` 过滤的性能依赖标量字段上的**倒排索引**。字段多、过滤频繁时给它们建索引，否则每条过滤都是全段扫描：

```python
index_params = client.prepare_index_params()
# 给常被过滤的标量字段建倒排索引
index_params.add_index(field_name="dept", index_type="INVERTED")
index_params.add_index(field_name="is_active", index_type="INVERTED")
index_params.add_index(field_name="level", index_type="INVERTED")
client.create_index(collection_name="kb_specs", index_params=index_params)
```

**取舍心法**：只为"真正常用的过滤字段"建索引——字段值区分度越高（dept 比 is_active 更值得建）收益越大，别给所有字段都建，白白吃内存。

## 查询（query）：不带向量的过滤查询

除了向量搜索，Milvus 还支持纯标量查询（不需要向量），按过滤条件取数据——管理后台查数据、按 doc_id 检查某篇文档的切片数，用它：

```python
rows = client.query(
    collection_name="kb_specs",
    filter='doc_id == "GB50204-2015"',
    output_fields=["chunk_id", "seq", "text"],
    limit=100,
)
print("该文档切片数:", len(rows))
```

`query` 与 `search` 的分工：**query 是"按条件取数据"（无向量），search 是"按相似度找"（有向量 + 可选过滤）**。排查数据时用 query，别拿 search 硬搜。

## 小结

过滤是向量检索里最容易忽略却最要命的一环：**expr 让"先滤后搜"发生在数据库层，权限下推让越权没有出口**。要点三句话：过滤表达式用服务端拼的用户身份、常用过滤字段建倒排索引、溯源字段记得放 output_fields。

单路稠密搜索与过滤就位了，下一篇做混合检索：稠密向量 + BM25 稀疏，语义和精确词两条路一起走。
