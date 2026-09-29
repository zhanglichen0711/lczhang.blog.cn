---
title: "插入、删除与重建"
date: 2026-02-16
categories:
  - [数据与存储, Milvus]
tags: [Milvus]
description: "删向量不同步，引用就会指向幽灵切片。"
abbrlink: 2572481623
---

文档更新应是：MySQL 写新版本 → upsert 新向量 → 切换当前版本 → 删旧点。顺序反了会出现短暂的双重命中或全空。

批量导入时按 batch 走，失败要可重放。只看「插入成功条数」不够，还要用抽检 query 看能否找回刚入库的条文。
