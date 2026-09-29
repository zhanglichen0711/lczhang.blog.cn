---
title: "Redis Set 与 ZSet：去重、标签与排行榜"
date: 2024-05-17
categories:
  - [数据与存储, Redis]
tags: [Redis, Set, ZSet]
description: "Set 管去重与关系，ZSet 管排序与 TopN——两类集合型数据的正确容器。"
abbrlink: 683557822
---

应用里有两类"集合型"需求特别常见：**判断在不在、算共同点**（用户有哪些标签、哪些文档有权看）和**按分数排序取 TopN**（热门问题、任务优先级）。对应 Redis 的两个类型：Set（无序去重）和 ZSet（有序带分）。这一篇把它们的经典用法过一遍。

## Set：三个天然能力

### 1. 去重

同一事件可能重复上报（埋点、回调重试），用 Set 天然只保留一份：

```bash
SADD seen:event:42 "retry-1"     # 1（新增）
SADD seen:event:42 "retry-1"     # 0（已存在，未新增）
SCARD seen:event:42              # 1 —— 集合大小，即"不重复的事件数"
```

判断"处理过没"是分布式系统的家常便饭，Set 的 `SADD` 返回值（1 新 0 重复）就是天然的去重闸。

### 2. 成员判断

`SISMEMBER` 是 O(1) 的判断，适合"有没有权限/是不是成员"这类热查询：

```bash
SADD group:manager "u1" "u2"
SISMEMBER group:manager "u3"     # 0 —— 不是管理员
```

比把权限存成字符串再正则匹配快得多，语义也清晰。

### 3. 集合运算：共同与差异

Set 最有价值的是交并差运算——算"共同点"一条命令：

```bash
SADD kb:user:1 "doc_a" "doc_b" "doc_c"     # 用户 1 可见文档
SADD kb:user:2 "doc_b" "doc_c" "doc_d"     # 用户 2 可见文档

SINTER kb:user:1 kb:user:2                 # 共同可见 → doc_b, doc_c
SDIFF kb:user:1 kb:user:2                  # 1 有 2 没有 → doc_a
SUNION kb:user:1 kb:user:2                 # 并集
```

知识库场景里"这个部门能看哪些文档、两个部门重叠哪些"——用 Set 存可见文档集合，交集差集都是现成的。

## ZSet：有序集合

ZSet 给每个成员配一个分数（score），按分数排序存储。两个最经典的应用：

### 应用一：排行榜 / 热门榜

```bash
# 记录每个问题被问的次数
ZINCRBY hot:questions 1 "如何拆模"
ZINCRBY hot:questions 1 "如何拆模"
ZINCRBY hot:questions 1 "什么是质量门禁"

ZREVRANGE hot:questions 0 4 WITHSCORES   # 降序取 Top5
# 1) "如何拆模"  2
# 2) "什么是质量门禁"  1
```

`ZINCRBY` 原子加分、`ZREVRANGE` 取前 N——排行榜的实现就是这两条命令，自己写排序逻辑纯属重复造轮子。

### 应用二：按优先级取任务

ZSet 的分数可以当"优先级/时间戳"，消费时取分数最小的：

```bash
# 任务入队，分数 = 执行时间戳（紧急任务分数更小）
ZADD task:delay 1710000000 "job-a"
ZADD task:delay 1700000000 "job-b"       # job-b 更早该执行

ZRANGE task:delay 0 0                    # 取最早该执行的任务
```

配合"分数 = 到期时间"，还能实现**简单的延迟队列**：定时任务每 5 秒取一次分数 ≤ 当前时间的任务执行。专业延迟队列（RabbitMQ 延迟插件、Redis Stream）更完备，但轻量场景 ZSet 够用。

## 两个类型的选型对照

| 需求 | 用谁 | 命令 |
| --- | --- | --- |
| 去重、判断成员、算共同点 | Set | `SADD` `SISMEMBER` `SINTER` |
| 按分数排序、TopN、加权 | ZSet | `ZADD` `ZINCRBY` `ZREVRANGE` |
| 成员多、要范围查询/分页 | ZSet（按分数范围） | `ZRANGEBYSCORE` |

记住一句话：**需要"自动排序"就选 ZSet**——Set 是无序的，想排序就得自己取出来排，那不如直接用 ZSet 让 Redis 排好。

## 实战组合：热问题榜单 + 文档标签

把两个类型放进一个真实场景（知识库问答的热门分析与召回优化）：

```python
# 用户问完一个问题后：
# 1. ZSet：热度 +1（用于热门问题缓存策略）
r.zincrby("hot:faq", 1, question_hash)

# 2. Set：给文档打标签（用于检索时按标签过滤）
r.sadd(f"doc:{doc_id}:tags", "规范", "质量", "2026")
```

后续两个用途都自然浮现：**热度 TopN 决定哪些 FAQ 答案常驻缓存**（命中率最高的问题缓存最久），**标签集合用于检索召回后的过滤**（只保留带"规范"标签的块）。两类数据，各归其位。

## 小结

Set 与 ZSet 是 Redis 处理"关系"和"排序"的两把刀：Set 解决**去重、成员判断、集合运算**，ZSet 解决**按分排序、TopN、加权队列**。遇到"要不要去重""要不要自动排序"的问题，答案几乎都是"用对的集合类型，让 Redis 替我算"。

集合类型讲完，五种经典类型全部到位。下一篇进入 Redis 最核心的应用面——缓存：穿透、击穿、雪崩三个经典问题。
