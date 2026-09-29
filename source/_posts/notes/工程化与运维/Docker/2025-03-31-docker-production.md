---
title: "Docker 生产实践：镜像瘦身与健康检查"
date: 2025-03-31
categories:
  - [工程化与运维, Docker]
tags: [Docker, 生产环境]
description: "从能跑到能上线：瘦身、健康检查、日志、优雅退出全套标准。"
abbrlink: 1911118507
---

到这一篇，Docker 系列要回答的问题从"怎么跑起来"变成"怎么跑得稳、能上线"。本地 `docker run` 能跑和在生产环境能扛住是两回事——生产要的是：镜像小到秒级拉取、进程挂了能自愈、流量来了健康检查说真话、下线时优雅收尾。这篇把生产化的几个关键动作一次讲清。

## 镜像瘦身：能省则省

镜像体积直接决定拉取时间和磁盘占用。回顾前面学的，瘦身三板斧：

**1. 用 slim / alpine 基础镜像。** `python:3.11-slim` 比 `python:3.11` 小一半以上。alpine 更小但用的是 musl libc，**部分 Python 包没有 musl 的预编译轮子，要现场编译，容易踩坑**——权衡之下 slim（Debian 系）是 Python 项目更稳的选择。

**2. 多阶段构建。** 编译工具链只留在构建阶段，产物拷进精简运行镜像（前面已详述）。

**3. 清理安装缓存。** 装完依赖立刻清掉包管理器的缓存，别让它留在镜像层里：

```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
```

`.dockerignore` 别忘了——它挡掉的是构建上下文，直接影响 build 时往 Docker daemon 传多少数据，代码仓库大时能省大量传输时间。

## 健康检查：让编排系统知道服务是死是活

容器"在跑"不等于"服务可用"——进程活着但端口没监听、数据库连不上、依赖的外部服务超时，都是"假活"。健康检查就是给编排系统一个**可信的存活信号**。

在 Dockerfile 里声明（`docker run` 会自动生效）：

```dockerfile
FROM python:3.11-slim
# ... 构建过程 ...
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
```

参数含义：每 30 秒查一次，单次 5 秒超时，容器启动后等 40 秒才开始查（**给服务留启动时间，否则一启动就被判死**），连续 3 次失败判定不健康。

或者运行时临时指定：

```bash
docker run -d --name api \
  --health-cmd="curl -f http://localhost:8000/health || exit 1" \
  --health-interval=30s \
  --health-start-period=40s \
  api:1.0
```

**健康检查接口本身要设计对**：只返回 200 不代表健康。生产里 `/health` 至少应该检查关键下游（数据库连接、缓存可用），下游挂了返回 503，编排系统才会帮你重启或切流量。前面 Compose 篇里 `condition: service_healthy` 就是吃这个信号来决定依赖方何时启动的。

## 日志：统一走 stdout，别落盘

容器日志的正确姿势前面提过两次，这里给个完整理由和标准做法：

- **标准做法**：应用把所有日志打到 stdout/stderr。`docker logs`、`docker compose logs` 直接能看。
- **为什么**：容器随时会删，日志写进容器内文件等于丢弃；而且生产里日志要被采集（filebeat、fluentd、云厂商日志服务），它们统一的采集入口就是容器的 stdout——**日志流一旦走文件，采集器就得猜文件路径、处理轮转，平白多一堆麻烦**。

对 Python 服务，确保日志不进黑洞的一个细节：**别让 Gunicorn/Uvicorn 的日志被吞**，并在应用里配置好输出格式（后面可观测性篇展开结构化日志）。

## 优雅退出：下线也要体面

`docker stop` 默认发 SIGTERM 给容器主进程，等 10 秒（可配）后强制 SIGKILL。如果应用不处理 SIGTERM，正在处理的请求会被直接掐断——用户可能看到半个回答。

应用侧要做的：**捕获 SIGTERM，停止接收新请求，把手头请求处理完再退出。** FastAPI/uvicorn 的部署形态（gunicorn + uvicorn worker）已经内置了这个能力，关键是别让进程管理器把它挡掉。镜像侧可配的：

```bash
# Dockerfile 里给容器一点处理时间（默认 10s 可能不够等长请求收尾）
STOPSIGNAL SIGTERM
```

## 把标准串进 Dockerfile：一个生产级示例

```dockerfile
FROM python:3.11-slim AS runtime

RUN useradd -m appuser

WORKDIR /app
COPY --chown=appuser:appuser requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=appuser:appuser . .

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["gunicorn", "main:app", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--workers", "4"]
```

对照本篇要点逐条核：slim 基础镜像 ✓、普通用户运行 ✓、缓存清理 ✓、健康检查 ✓、`0.0.0.0` 监听 ✓、代码所有权给 appuser ✓。这个镜像已经具备上生产的基本素质。

## 小结

生产化是几件小事的叠加：多阶段构建 + 精简镜像让拉取变快，健康检查给编排系统可信信号，日志统一走 stdout 保证可采集，SIGTERM 优雅退出不让请求被掐断。**单机 Docker 这条路走到这里就到头了**——健康检查、优雅退出这些机制，到了 Kubernetes 里会以更完整的形态出现：探针、滚动更新、自动重启。这也是这个系列后半程要进入的领域。
