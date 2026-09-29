---
title: "Docker 核心概念与常用命令"
date: 2025-01-15
categories:
  - [工程化与运维, Docker]
tags: [Docker, 命令]
description: "镜像、容器、数据卷、网络四件事，对应日常 90% 的命令操作。"
abbrlink: 3046212988
---

上一篇讲了 Docker 解决什么问题，这一篇全部落到命令上。Docker 的命令看起来多，其实只围绕四件事转：**镜像（Image）、容器（Container）、数据卷（Volume）、网络（Network）**。把每一类里最高频的几条命令练熟，日常 90% 的操作就覆盖了。

## 镜像管理：拉取、查看、删除

```bash
docker pull python:3.11-slim        # 从仓库拉镜像
docker images                       # 列出本地所有镜像
docker rmi python:3.11-slim         # 删除镜像（先删依赖它的容器）
docker tag myapp:1.0 myapp:latest   # 给镜像打标签
```

几个值得记住的点：

- `docker images` 输出的 `REPOSITORY:TAG` 里，`TAG` 默认是 `latest`。**生产环境不要依赖 latest**——它指向的镜像会变，今天部署的和三个月后部署的可能不是同一个东西。版本要写死，如 `myapp:2025-01-02-abc123`。
- `rmi` 删镜像前，如果有容器还引用它，会报冲突。要么先删容器，要么加 `-f` 强删（慎用）。

## 容器生命周期：run、ps、start、stop、rm

```bash
docker run -d --name api -p 8000:8000 myapp:1.0   # 后台启动
docker ps                                          # 查看运行中的容器
docker ps -a                                       # 查看所有容器（含已停止）
docker logs -f api                                 # 跟踪容器日志
docker exec -it api bash                           # 进入容器内部调试
docker stop api && docker start api                # 停止 / 再次启动
docker rm api                                      # 删除容器
```

`run` 是命令中的核心，几个常用参数拆开讲：

- `-d`：后台运行，不占用终端。
- `--name`：给容器起名字，后面所有操作都拿名字指代，比记一长串容器 ID 方便。
- `-p 8000:8000`：端口映射，宿主机 8000 端口转发到容器内 8000 端口。**容器有自己的网络命名空间**，不映射的话宿主机访问不到容器里的服务。这是新手最容易忘的一步——容器起来了，但 curl localhost 不通。
- `-e KEY=VALUE`：传入环境变量，比如 `-e OPENAI_API_KEY=sk-xxx`。
- `-v`：挂载数据卷或宿主机目录，下一篇详讲。
- `--rm`：容器退出时自动删除自己，适合跑一次性任务的临时容器。

`exec -it ... bash` 是排查问题的入口：容器里报错了，进去看进程、看文件、手跑命令。注意容器里往往没有 vi、curl 这些工具——**镜像越精简越安全，排查靠日志而不是进容器改东西**，改完重启就丢了。

## 关键认知：容器是"一次性"的

理解 Docker 最重要的一句话：**容器随时可以删，删了用镜像再起一个一模一样的。**

所以容器里的一切临时状态都不该依赖——日志要输出到 stdout（用 `docker logs` 看），配置走环境变量，数据落数据卷。如果发现自己"舍不得删容器"，说明有些状态放错了地方，应该把它挪到镜像、环境变量或数据卷里去。

```bash
# 同一镜像起两个互不干扰的容器
docker run -d --name api-a -p 8000:8000 myapp:1.0
docker run -d --name api-b -p 8001:8000 myapp:1.0
```

## 资源查看与清理

```bash
docker stats            # 实时查看每个容器的 CPU / 内存占用
docker system df        # 看镜像、容器、数据卷、构建缓存占了多大空间
docker system prune     # 清理悬空镜像、停止的容器等垃圾
```

`docker system prune` 是磁盘救星——频繁 build 之后构建缓存可能吃掉几十 GB。它默认不删数据卷，真要连数据卷一起清要加 `-a --volumes`，**这条命令会删掉所有没被容器引用的数据卷，执行前务必确认**。

## 小结

镜像管拉取与删除，容器管生命周期，日志用 `logs` 查、进容器用 `exec`，状态不落容器、配置走环境变量。下一篇讲 Dockerfile——怎么把一个应用"做"成镜像，这是从"会用 Docker 跑现成镜像"到"能把自己的服务容器化"的分水岭。
