---
title: "单表查询负责精确过滤"
date: 2024-02-08
categories:
  - MySQL
tags: [MySQL]
description: "模糊搜索不是 MySQL 的主业。"
---

`WHERE`、`IN`、`BETWEEN`、去重和别名，足够支撑后台按专业、章节、时效筛文档。

```sql
SELECT chunk_id, doc_id, section
FROM kb_chunk
WHERE doc_id = 'gb-50300' AND deleted = 0
ORDER BY chunk_index;
```

全站语义搜索交给向量库。MySQL 把「有权看、仍生效、属于这一章」卡住。两者分工清楚，hybrid search 才有意义。
