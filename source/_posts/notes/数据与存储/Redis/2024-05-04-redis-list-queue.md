---
title: "Redis List 与消息队列"
date: 2024-05-04
categories:
  - [数据与存储, Redis]
tags: [Redis, List, 队列]
description: "用 List 的 LPUSH + BRPOP 搭一个能扛真实流量的任务队列，可靠消费怎么落地。"
abbrlink: 3684813523
---

AI 应用里有一类活特别适合"排队干"：文档解析、文本切片、向量化入库——耗时长、需要重试、不能阻塞在线请求。最常见的做法是用消息队列把这些任务异步化。消息队列的轮子很多（RabbitMQ、Kafka），但如果场景是"中等流量、想少维护一套系统"，Redis 的 List 就能胜任。这一篇把它讲透。

## List 为什么能当队列

List 是双向链表：一头进、另一头出，天然 FIFO（先进先出）。用两个命令就组成队列：

- `LPUSH`（生产者）：从左边塞入任务；
- `BRPOP`（消费者）：从右边取出任务，**队列空时阻塞等待**，有新任务立刻返回。

```bash
# 生产者：来一个任务塞一个
LPUSH task:doc-parse "{doc_id: 42, source: 'upload.pdf'}"

# 消费者：取任务，没任务就等（0 = 永远等，也可设秒数超时）
BRPOP task:doc-parse 0
```

`BRPOP` 的"阻塞等待"是关键：消费者不用轮询空转浪费 CPU，任务一到立即唤醒。多个消费者并发 `BRPOP` 时，Redis 保证**每条任务只被一个人取走**——天然实现多消费者负载分担。

## 一个完整的任务队列

生产者侧（FastAPI 收到文档上传后，不阻塞，直接入队）：

```python
import json
import redis

r = redis.Redis(host="localhost", port=6379)


def enqueue_parse(doc_id: str, source: str):
    task = json.dumps({"doc_id": doc_id, "source": source})
    r.lpush("task:doc-parse", task)     # 立即返回，耗时活交给消费者
```

消费者侧（独立进程，循环取任务执行）：

```python
def worker():
    r = redis.Redis(host="localhost", port=6379)
    while True:
        # 阻塞取任务；queue, data 结构；空则一直等
        _, data = r.brpop("task:doc-parse", timeout=0)
        task = json.loads(data)
        try:
            parse_and_embed(task["doc_id"], task["source"])
            print(f"完成 {task['doc_id']}")
        except Exception as e:
            print(f"失败 {task['doc_id']}: {e}")
```

这套结构的收益：**上传接口只做 LPUSH，立即返回 202；真正耗时的解析在后台慢慢做**。前端轮询任务状态，做完了展示结果。

## 可靠消费：任务丢了怎么办

上面是最简版，生产环境有一个致命问题：**消费者取走任务后、还没处理完就崩了，任务就丢了**（BRPOP 是"取出即删除"）。

经典补救叫"备份队列"（类似 Kafka 的 offset / RabbitMQ 的 ack）：

```python
def safe_worker():
    while True:
        _, data = r.brpop("task:doc-parse", timeout=0)
        # 1. 取出后先放进"处理中"队列，带过期时间兜底
        r.rpush("task:doc-parse:processing", data)
        r.expire("task:doc-parse:processing", 300)

        try:
            task = json.loads(data)
            parse_and_embed(task["doc_id"], task["source"])
            # 2. 成功：从 processing 里删掉（用 LREM 按值移除）
            r.lrem("task:doc-parse:processing", 1, data)
        except Exception as e:
            # 3. 失败：放回主队列重试（带重试计数）
            r.lpush("task:doc-parse", data)
```

思路一句话：**先"确认收到"再干活，干完才"确认完成"**。中间任何一步崩了，任务要么在 processing 里（有 TTL 兜底重新入队），要么在重试队列，不会凭空消失。

## List 队列的边界：什么时候该换更强的

List 队列简单可靠，但要知道它的边界：

| 能力 | Redis List | 专业 MQ（RabbitMQ/Kafka） |
| --- | --- | --- |
| 流量规模 | 万级/秒够用 | 百万级/秒 |
| 消息不丢保证 | 需自己写备份逻辑 | 内置 ACK、持久化策略 |
| 消息回溯/重放 | 弱 | Kafka 天然支持 |
| 延迟队列/定时消息 | 需自己实现 | 内置或插件 |
| 运维成本 | 几乎为零（复用 Redis） | 单独一套系统 |

**选型判断：团队已有 Redis、任务量中等、能接受自己写几十行兜底逻辑 → 用 Redis List 起步；一旦需要严格的消息语义（不丢、可回溯、精确一次）、或流量大到 Redis 单点扛不住 → 换专业 MQ。**

## 更现代的选项：Stream

Redis 5.0 之后有专门的消息流类型 **Stream**，相比 List 提供了：消费者组（类似 Kafka 的 group）、消息 ID、ack 确认、pending 列表。如果项目 Redis 版本 ≥5.0 且要更可靠的消息语义，优先 Stream：

```bash
XADD task:doc-parse "*" doc_id 42 source upload.pdf
XREADGROUP GROUP workers w1 COUNT 1 BLOCK 0 STREAMS task:doc-parse ">"
```

Stream 是 List 队列的"亲儿子升级版"，重活该用它。List 方案胜在简单，Stream 胜在完备——二选一即可，不必两者都维护。

## 小结

用 Redis List 搭任务队列 = **LPUSH 入队 + BRPOP 阻塞消费 + 备份队列兜底**三件套。它把耗时任务从在线请求里剥出来异步执行，成本低到几乎为零。当任务语义要求严格（不丢、可分组、可回溯）时，升级到 Stream 或专业 MQ。

队列把任务流转起来了，下一篇回到存储本身：Hash 怎么存"对象"，为什么它比 JSON 字符串更聪明。
