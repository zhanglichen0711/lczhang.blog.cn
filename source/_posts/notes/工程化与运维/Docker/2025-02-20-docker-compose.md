---
title: "Docker Compose 编排多服务"
date: 2025-02-20
categories:
  - [工程化与运维, Docker]
tags: [Docker, Compose]
description: "一份 YAML 描述整个应用，docker compose up 一键拉起所有服务。"
abbrlink: 2638849701
---

上一篇结尾用命令手动部署了 redis + api 两个容器，命令已经长得没法看。真实项目更夸张：一个 RAG 服务可能要同时拉起 API、向量库、Redis、模型服务、可选的管理后台——五六个容器，每个都带一堆参数。手动敲命令既不现实也容易出错。**Docker Compose 把"整套服务怎么部署"写进一个 YAML 文件，版本化管理，一条命令全部拉起。**

## 一份 Compose 文件长什么样

```yaml
services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}   # 从宿主机环境变量注入
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis-data:
```

对照上一篇手敲的命令逐项看，几乎一一对应：`image` 对应镜像，`ports` 对应 `-p`，`environment` 对应 `-e`，`volumes` 对应 `-v`。几个 Compose 特有的东西：

- **服务名就是网络域名。** 同一个 Compose 文件里的服务自动加入同一个网络，`redis` 服务在 `api` 里直接用 `redis://redis:6379` 访问，不用手动建网络。
- **`build: .` 表示这个服务要从当前目录的 Dockerfile 现场构建**，而不只是拉现成镜像。
- **`${OPENAI_API_KEY}`** 引用宿主机环境变量，密钥不写死在文件里。
- **`restart: unless-stopped`** 容器崩溃后自动重启，服务挂了能自愈。

启动与日常操作：

```bash
docker compose up -d          # 后台启动全部服务
docker compose ps             # 查看状态
docker compose logs -f api    # 跟日志
docker compose down           # 停止并删除容器（数据卷保留）
docker compose down -v        # 连数据卷一起删（慎用，数据会没）
```

## 依赖顺序与健康检查

`depends_on: - redis` 只保证 redis **先启动**，不保证 redis **已经就绪**——Redis 可能要一两秒才完成初始化。简单场景问题不大，但像"API 启动时要连数据库建表"这种，就可能遇到 API 起来了数据库还没准备好，连接报错。

解法是加健康检查，让 Compose 等服务真正"健康"后再启动依赖方：

```yaml
services:
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build: .
    depends_on:
      redis:
        condition: service_healthy
```

## 一个 AI 应用的真实 Compose

把前面 Docker 系列学的东西组合起来，一个本地 RAG 服务的 Compose 大致长这样：

```yaml
services:
  milvus-etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
    volumes:
      - etcd-data:/etcd

  milvus:
    image: milvusdb/milvus:v2.4.0
    command: ["milvus", "run", "standalone"]
    ports:
      - "19530:19530"
    depends_on:
      - milvus-etcd
    volumes:
      - milvus-data:/var/lib/milvus

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - MILVUS_HOST=milvus
      - REDIS_URL=redis://redis:6379
    depends_on:
      milvus:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  etcd-data:
  milvus-data:
```

这套配置的价值在于：**新同事加入，clone 仓库，一条 `docker compose up -d`，整个依赖环境就在本地跑起来了。** 之前要写一页文档描述"先装 Milvus 再配 Redis 再装依赖"的流程，现在全被这个文件替代。开发环境和生产环境跑同一份编排，环境漂移问题又少一类。

## 常见坑

**坑一：改了代码不生效。** 代码改动要重新构建镜像，`docker compose up -d` 不会自动重新 build。改完代码记得 `docker compose up -d --build`，或者干脆 `docker compose build && docker compose up -d`。

**坑二：`down -v` 误删数据。** 前面提醒过，`-v` 会把 volumes 段里声明的数据卷一起删掉。养成习惯：`down` 就好，不带 `-v`，除非真想清空数据。

**坑三：端口冲突。** 本地同时跑着别的服务占了 8000，Compose 启动会报端口占用。要么停掉占用的进程，要么改 ports 里的宿主机侧端口。

## 小结

Compose 把"多个容器 + 网络 + 数据卷 + 环境变量"的部署描述收进一个版本化文件，`up -d` 一键拉起、`down` 一键清理，配合健康检查能处理服务依赖的就绪问题。它是单机部署的终点——当一台机器放不下、需要多机集群和自动扩缩容时，就轮到 Kubernetes 出场了。
