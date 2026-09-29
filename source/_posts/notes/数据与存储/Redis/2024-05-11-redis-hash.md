---
title: "Redis Hash 存储对象与轻量会话"
date: 2024-05-11
categories:
  - [数据与存储, Redis]
tags: [Redis, Hash, 会话]
description: "把对象存成 Hash 而不是 JSON 字符串：字段级读写、局部更新、天然的结构化。"
abbrlink: 1655438216
---

存"一个对象"时，新手最容易的做法是把整个对象序列化成 JSON 塞进 String。这在对象只会整体读写的场景没问题，但只要涉及**局部更新**（改一个字段）或**只读部分字段**，String 方案就笨重了。Hash 类型就是为"存对象"设计的——这一篇对比讲透，并落到 AI 应用最典型的对象：会话。

## 两种存法对比

假设要存用户信息（id、姓名、部门、角色）：

```python
# 方案 A：String + JSON（整体存取）
r.set("user:42", json.dumps({"name": "张三", "dept": "质量部", "role": "quality"}))

# 方案 B：Hash（字段表）
r.hset("user:42", mapping={"name": "张三", "dept": "质量部", "role": "quality"})
```

看着差不多，差异在读写粒度：

| 操作 | String + JSON | Hash |
| --- | --- | --- |
| 读整个对象 | GET 后反序列化 | HGETALL |
| 读一个字段 | 得取整个 JSON 再解析 | `HGET user:42 name` 直接拿 |
| 改一个字段 | 取→改→整体写回（有覆盖风险） | `HSET user:42 role admin` 只动它 |
| 并发改不同字段 | 互相覆盖 | 各改各的字段，互不干扰 |

关键是"**改一个字段**"这行：String 方案要先把整个对象取出来反序列化、改完再整体写回——两个进程同时这么干，后写的会把先写的改动覆盖掉。Hash 方案改 `role` 只影响 `role`，天然规避。

## 对象到底什么时候该用 Hash

并不是所有对象都该用 Hash。判断标准是**读写模式**：

- 对象**整体读写**（拿到就用、用完整个换掉）→ String + JSON 更省事；
- 对象**按字段读写**（缓存文档元数据、会话信息、配置项，经常只改其中一两个字段）→ Hash。

AI 服务里典型的 Hash 对象：文档元数据（title/version/dept/status，入库时状态要流转：`pending → parsing → active`）、检索块的计数统计、用户画像字段。

## 实战：会话状态用 Hash 存

问答服务要给每个会话维护"历史上下文、当前任务、来源过滤条件"。用 Hash 组织得清清楚楚：

```python
import time
import uuid

SESSION_TTL = 1800  # 30 分钟


def create_session(user_id: str) -> str:
    session_id = uuid.uuid4().hex
    key = f"session:{session_id}"
    r.hset(key, mapping={
        "user_id": user_id,
        "created_at": int(time.time()),
        "last_active": int(time.time()),
        "history": "",        # 序列化的最近 N 轮
        "task_id": "",        # 任务中断后恢复用
        "filters": "",        # 会话专属的检索过滤条件（部门/角色）
    })
    r.expire(key, SESSION_TTL)     # 会话带过期：30 分钟没活跃自动清
    return session_id


def touch_session(session_id: str):
    """每次请求刷新活跃时间，顺带续期"""
    key = f"session:{session_id}"
    r.hset(key, "last_active", int(time.time()))
    r.expire(key, SESSION_TTL)     # 续期：滑动过期
```

这个会话设计里 Hash + 过期配合得刚好：

- **字段级更新**：`touch_session` 只改 `last_active`，不用把整个会话取出来改；
- **滑动过期**：每次活跃都续期，用户一直用就一直有效，闲置 30 分钟自动清——会话临时性由 TTL 托管，不用写定时清理任务；
- **多实例共享**：会话在 Redis 里，网关多少个实例都能读到同一份，不会"登录了换个实例就掉线"。

## 小技巧：HSET 的多字段与原子性

一次设多个字段用 `mapping`，避免多次往返：

```python
r.hset("session:abc", mapping={"step": "retrieval", "round": "3"})
```

同一条命令内的多个字段更新是原子的——要么全成功要么全不生效。需要"读-改-写"整块原子操作（比如会话历史追加）时用 Lua 脚本或 WATCH，简单场景先记着有这个坑即可。

## 小结

Hash 是"对象"的正确容器：**按字段读写、局部更新不互相覆盖、字段即文档**。和 String + JSON 的取舍看读写粒度——整体读写用 String，字段级读写用 Hash。会话、文档元数据这类"经常只动一两个字段还带过期"的对象，Hash + TTL 是黄金组合。

对象有地方安放了，下一篇讲 Set 与 ZSet：去重、标签关系和排行榜——Redis 处理"关系"与"排序"的两把刀。
