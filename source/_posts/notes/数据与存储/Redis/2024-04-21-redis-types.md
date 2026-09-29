---
title: "Redis 安装与五大数据类型入门"
date: 2024-04-21
categories:
  - [数据与存储, Redis]
tags: [Redis, 数据类型]
description: "装好 Redis，用 redis-cli 把 string、list、hash、set、zset 五类基础类型一次认全。"
abbrlink: 3017590659
---

上一篇讲了 Redis 的定位。这一篇动手装环境，然后通过 redis-cli 把**五大数据类型**挨个过一遍——理解"一种类型对应一类场景"，是设计 Redis 数据结构的第一步。

## 安装与启动

最省事的方式是 Docker 起一个（生产也大多这么部署）：

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

macOS 可用 Homebrew，Linux 用包管理器，Windows 建议直接用 Docker 或 WSL。装完验证：

```bash
redis-cli ping
# PONG
```

`PONG` 说明服务活了。用 `redis-cli` 可以直接在命令行操作——后面所有示例都能照敲。

## 类型总览

Redis 有五种经典类型，外加近几年的新类型（Stream、JSON 等）。先认准老五样：

| 类型 | 底层结构 | 一句话场景 | 典型命令 |
| --- | --- | --- | --- |
| String | 字节串 | 计数、缓存值、简单 KV | `SET` / `GET` / `INCR` |
| List | 双向链表 | 消息队列、时间线 | `LPUSH` / `RPOP` / `LRANGE` |
| Hash | 字段-值映射 | 存对象（用户、文档元数据） | `HSET` / `HGET` / `HGETALL` |
| Set | 无序去重集合 | 去重、标签、共同好友 | `SADD` / `SISMEMBER` / `SINTER` |
| ZSet | 有序集合（带分值） | 排行榜、按权重排队 | `ZADD` / `ZRANGE` / `ZREVRANGE` |

### String：最常用的"一根弦"

```bash
SET doc:count 0        # OK
INCR doc:count         # 1   —— 原子自增，天然防并发加错
INCRBY doc:count 5     # 6
GET doc:count          # "6"
```

String 不只是存文本，`INCR` 这类**原子操作**让"计数"成为它的高频用途——点赞数、限流计数、并发锁的版本号。

### List：消息的"队列"

```bash
LPUSH task:queue "parse-doc-42"     # 从左边塞
RPUSH task:queue "parse-doc-43"     # 从右边塞
LPOP task:queue                     # 从左边取（先进先出 = 队列）
LRANGE task:queue 0 -1              # 看全部
```

`LPUSH` + `RPOP` 就是经典队列；加 `BRPOP`（阻塞版）能让消费者"没任务就睡着，来了立刻醒"——下一篇细讲。

### Hash：对象的"字段表"

```bash
HSET doc:42 title "GB50204-2015" version "2.0" dept "质量部"
HGET doc:42 title          # "GB50204-2015"
HGETALL doc:42             # 全部字段
HINCRBY doc:42 hits 1      # 对象里某字段自增
```

Hash 适合存"一个对象的若干属性"——用户、文档元数据。相比把整个对象序列化成字符串，Hash 可以**只读写需要的字段**，更新一个字段不用整体覆盖。

### Set：去重与关系的"集合"

```bash
SADD user:1:tags "规范" "质量" "安全"      # 加标签
SADD user:2:tags "规范" "进度"
SISMEMBER user:1:tags "安全"               # 1（属于）
SINTER user:1:tags user:2:tags             # 交集 → "规范"
```

Set 的三个天然能力：**去重**（同一元素只存一份）、**成员判断**（O(1) 查在不在）、**集合运算**（交集/并集算共同点）。

### ZSet：带分值的"排行榜"

```bash
ZADD hot:questions 100 "如何拆模"   # 分数 100
ZADD hot:questions 30 "什么是质检"
ZINCRBY hot:questions 70 "如何拆模" # 分数 +70 → 170
ZREVRANGE hot:questions 0 2 WITHSCORES   # 取前三名
```

ZSet 的每个成员带一个分数，按分数排序——**排行榜、热门榜、按优先级取任务**都是它的地盘，且插入删除自动保持有序。

## 类型选择的判断框架

拿到一个需求，先问三个问题，答案基本就锁定了类型：

1. **只是一个值，还是要维护它的计数/原子变化？** → String
2. **是"一个对象的一堆属性"？** → Hash
3. **是有顺序的消息流 / 任务流？** → List
4. **要保证不重复、要做集合运算？** → Set
5. **要排序取 TopN（按分数/时间）？** → ZSet

## 小结

五大数据类型就是五个"预置好的数据结构工具箱"：String 管简单值与计数，List 管队列，Hash 管对象，Set 管去重与关系，ZSet 管排序。**先选对类型，再谈命令**——用对类型，很多业务逻辑一条命令就表达完了。

类型认全了，下一篇讲键的学问：过期时间、键命名、TTL——为什么 Redis 的键设计比想象中讲究。
