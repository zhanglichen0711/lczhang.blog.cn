---
title: "Redis 实战：AI 问答的会话与 FAQ 缓存"
date: 2024-06-19
categories:
  - [数据与存储, Redis]
tags: [Redis, AI, 缓存, 实战]
description: "把会话存储、FAQ 缓存、热度榜、限流放进同一个 AI 问答服务，看 Redis 全角色协同。"
abbrlink: 13795501
---

前九篇把 Redis 的单点能力都过了一遍。这一篇收口：把它们组装进一个真实的 AI 问答服务，看 Redis 同时扮演**会话库、缓存、热榜、限流计数器**四个角色时怎么协同。你会发现前面每个知识点在这里都有落点。

## 架构里 Redis 的位置

```text
用户 → Node/FastAPI 网关
            │
            ▼
        Redis（四顶帽子）
        ├─ ① 会话存储  session:*
        ├─ ② FAQ 缓存  cache:faq:*
        ├─ ③ 热榜计数  hot:faq
        └─ ④ 限流计数  ratelimit:*
            │
            ▼
        检索(Milvus) + LLM
            │
            ▼
        MySQL（会话与问答的最终落库）
```

- **Redis**：扛住高频读与状态（每次请求都要碰）；
- **MySQL**：存需要长期留存的数据（完整对话记录、文档）；
- Redis 丢了能重建（从 MySQL/LLM 再攒），MySQL 才是数据归宿。

## ① 会话：用 Hash + TTL 管上下文

多轮对话要记住"最近几轮聊了什么、当前任务到哪一步"。Hash 存会话字段、TTL 控制闲置回收（复用第 5 篇的会话设计）：

```python
def save_history(session_id: str, history: list[dict]):
    key = f"session:{session_id}"
    r.hset(key, "history", json.dumps(history, ensure_ascii=False))
    r.hset(key, "updated_at", int(time.time()))
    r.expire(key, 1800)            # 30 分钟无活跃自动清


def load_history(session_id: str) -> list[dict]:
    key = f"session:{session_id}"
    raw = r.hget(key, "history")
    if not raw:
        return []
    r.expire(key, 1800)            # 活跃即续期（滑动过期）
    return json.loads(raw)
```

多轮上限控制（别让上下文无限膨胀）：

```python
MAX_ROUNDS = 8
def append_history(session_id: str, role: str, content: str):
    history = load_history(session_id)
    history.append({"role": role, "content": content})
    history = history[-MAX_ROUNDS * 2:]     # 只留最近 8 轮（user+assistant）
    save_history(session_id, history)
```

## ② FAQ 缓存：热问题直答，省一次 LLM

FAQ 命中率高的问答（"系统怎么登录""报销流程是什么"）根本不用走检索 + 生成，直接查 FAQ 库。为了快，把高频 FAQ 的答案缓存进 Redis，秒回：

```python
def answer_question(question: str) -> dict | None:
    key = f"cache:faq:{hash_question(question)}"

    # 1. 先查缓存
    cached = r.get(key)
    if cached:
        r.expire(key, 3600)          # 命中即顺带续期
        return json.loads(cached)

    # 2. miss → 查 FAQ 精确库
    faq = faq_db.lookup(question)
    if faq:
        result = {"answer": faq["answer"], "source": "faq", "kb": "faq"}
        r.set(key, json.dumps(result, ensure_ascii=False), ex=3600)
        return result
    # 3. 连 FAQ 都没有 → 走 RAG 检索 + LLM（略）
    return run_rag(question)
```

FAQ 缓存的价值：**热问题命中时零 LLM 调用、零向量检索，毫秒级返回**——用户日常最高频的问题全部被这一层接住。

## ③ 热榜：动态决定"谁值得缓存"

问题不是每个都该缓存 1 小时——冷门问题缓存占内存还不命中。用 ZSet 记录每个问题的热度，**热度高的才长缓存，热度低的短缓存或不缓存**：

```python
def after_answered(question: str):
    h = hash_question(question)
    r.zincrby("hot:faq", 1, h)           # 热度 +1
    # 动态调整：热度 ≥ 5 的问题缓存 1 小时，否则 5 分钟
    score = r.zscore("hot:faq", h) or 0
    ttl = 3600 if score >= 5 else 300
    r.expire(f"cache:faq:{h}", ttl)

# 排行榜：展示最热问题（运营能看到用户在问什么）
top = r.zrevrange("hot:faq", 0, 9, withscores=True)
```

这体现了前面 ZSet 的价值：**热度数据既服务缓存策略，又服务运营分析**，一份数据两个用途。

## ④ 限流：网关多实例也有效

每个用户每分钟最多问 30 次，用 Redis 的原子自增做滑动窗口计数（多实例共享同一份计数，第 9 篇的 Redis 存储版限流在这里落地）：

```python
def check_rate_limit(user_id: str, limit: int = 30, window: int = 60) -> bool:
    key = f"ratelimit:{user_id}:{int(time.time()) // window}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, window + 1)        # 首次创建才设过期，避免每次重置
    return count <= limit
```

```python
# 网关每个问答请求前校验
if not check_rate_limit(user_id):
    return JSONResponse({"error": "请求过于频繁，请稍后再试"}, status_code=429)
```

## 全链路一次问答，Redis 做了哪些事

一次完整问答的时间线，Redis 的参与一目了然：

```text
请求进来
 → 限流计数 +1（④）
 → 读会话历史（①）
 → 查 FAQ 缓存，命中？→ 直接返回 + 热度 +1（③）
 → miss：走检索 + LLM → 答案写 FAQ 缓存（动态 TTL ③）
 → 追加会话历史（①）
```

四个角色全程无数据库参与——**MySQL 只负责异步落盘完整记录**。这就是 Redis 在 AI 服务里的典型存在方式：把高频、短暂、可重建的状态全部顶在内存层，让慢的那一层（检索、LLM、MySQL）只处理真正必要的工作。

## 上线检查清单

- [ ] 会话/FAQ 的 key 全部带过期，避免"只写不删"的内存泄漏
- [ ] 会话只留最近 N 轮，防止上下文无限膨胀烧 token
- [ ] Redis 开 AOF（会话丢失可接受 1 秒窗口）
- [ ] 限流窗口值、FAQ TTL 做成配置而非硬编码
- [ ] 监控：内存占用、命中率、慢命令（`SLOWLOG`）

## 小结

一个 AI 问答服务的 Redis 侧，本质是**四套键的协同**：`session:*`（会话，Hash+TTL）、`cache:faq:*`（缓存，动态 TTL）、`hot:faq`（热度，ZSet）、`ratelimit:*`（限流，原子计数）。每一套都只用最基础的类型与命令，组合起来就把"高频访问"这件事从数据库和 LLM 身上整个卸了下来。

Redis 十一篇到此收官。回看系列：定位 → 类型 → 键 → 队列 → 对象 → 集合 → 缓存失效 → 一致性 → 锁 → 持久化 → 实战，是一条"从认识 Redis 到用它扛住 AI 服务"的完整路径。愿你设计的每一个缓存，都经得起高并发和重启。
