---
title: "Docker 数据卷与网络"
date: 2025-02-08
categories:
  - [工程化与运维, Docker]
tags: [Docker, Volume, Network]
description: "数据不写容器层、服务靠名字互访，多容器协作的基础。"
abbrlink: 2731963888
---

前面强调过容器是"一次性"的——删了再起一个。但真实服务有两样东西不能跟着容器一起消失：**数据**（数据库文件、上传的附件、模型缓存）和**服务之间的连接关系**（API 要调向量库，网关要转发到后端）。这篇就讲 Docker 怎么处理这两件事：数据卷负责持久化，网络负责让容器用名字互访。

## 为什么数据必须用卷

先看一个反面案例。有人把 MySQL 跑在容器里，用着用着发现一 `docker rm` 再重新 `run`，**数据全没了**。原因很简单：容器自己那层"可写文件系统"是临时的，容器一删就跟着销毁。

数据的正确归宿是**卷（Volume）**——由 Docker 管理、独立于容器生命周期的存储区域：

```bash
docker volume create mysql-data        # 创建数据卷
docker run -d --name mysql \
  -v mysql-data:/var/lib/mysql \      # 把卷挂到容器内的数据目录
  -e MYSQL_ROOT_PASSWORD=secret \
  mysql:8.0
```

`-v mysql-data:/var/lib/mysql` 的意思是"把名为 mysql-data 的卷，挂载到容器里的 /var/lib/mysql 路径"。**容器删除、重建，卷还在**，新容器挂上同一个卷，数据就回来了。

除了命名卷，还有两种挂载方式：

- **匿名卷**：`-v /var/lib/mysql`，Docker 随机起名，适合临时容器，不适合需要复用的数据。
- **绑定挂载（bind mount）**：`-v /宿主机路径:/容器路径`，直接把宿主机目录映射进去。开发场景常用——代码在宿主机改，容器里立即生效，不用反复重新构建镜像：

```bash
docker run -d -p 8000:8000 -v $(pwd):/app my-api:1.0
```

绑定挂载适合开发调试，生产环境应该用命名卷。一个常见误区是把数据库的数据目录用绑定挂载指到宿主机某个普通文件夹——可以工作，但权限、备份、迁移都不如命名卷省心。

## 为什么容器之间不能靠 IP

容器有自己的网络命名空间，每次启动分配的 IP 都可能变。如果 A 服务在代码里写死了 B 容器的 IP，B 一重启 A 就调不通了。正确做法是让容器加入**同一个自定义网络**，用**容器名**当域名互相访问：

```bash
docker network create app-net                 # 创建自定义网络
docker run -d --name mysql --network app-net mysql:8.0
docker run -d --name api --network app-net -p 8000:8000 my-api:1.0
```

现在 api 容器里可以直接 `ping mysql`、连接 `mysql:3306`——Docker 内置 DNS 会把容器名解析成对应 IP，IP 怎么变都不用管。

```python
# 应用代码里连数据库，写容器名而不是 IP
DATABASE_URL = "mysql://user:pass@mysql:3306/mydb"
```

默认的 `bridge` 网络也能跑容器，但容器之间只能用 IP 互访，不推荐。**凡是需要互相通信的容器，就建一个自定义网络把它们放进去。**

## 端口映射：把服务暴露给外部

自定义网络解决的是"容器 ↔ 容器"，而"外部世界 → 容器"靠端口映射：

```bash
docker run -d --name api --network app-net -p 8000:8000 my-api:1.0
```

`-p 8000:8000` 把宿主机 8000 端口收到的流量转发进容器的 8000 端口。只有被映射的端口对外可见，**没映射的端口外部一律访问不到**——这本身就是一层天然防火墙。

几个注意点：

- 前面说过容器内要监听 `0.0.0.0`，否则流量进来了容器里的服务没接住。
- 两个容器别映射同一个宿主机端口，会冲突。可以 `-p 8000:8000` 和 `-p 8001:8000`，把同一个容器端口映射到不同宿主机端口。
- 只允许本机访问的调试服务，可以绑 `127.0.0.1`：`-p 127.0.0.1:8000:8000`，外部网络完全不可达。

## 把几件事串起来：一个能用的部署

```bash
# 1. 网络
docker network create app-net
# 2. 数据卷
docker volume create redis-data
# 3. 数据库/缓存容器（不暴露端口给外部，只有内部用）
docker run -d --name redis --network app-net -v redis-data:/data redis:7-alpine
# 4. 业务容器（只暴露业务端口）
docker run -d --name api --network app-net -p 8000:8000 \
  -e REDIS_URL=redis://redis:6379 my-api:1.0
```

到这里，命令已经变得很长——建网络、建卷、跑三个容器、传一堆参数，每次部署都要敲一遍，而且敲错一个字母就部署出问题。下一篇的 Docker Compose 就是来解决这个问题的：把整个部署描述写成一个文件，一条命令拉起全部服务。

## 小结

数据卷把数据从容器的临时生命周期里解放出来，网络让容器之间用名字稳定互访，端口映射是容器对外的唯一出口。容器"一次性"不可怕，只要数据在卷里、连接在网络里，容器本身可以随时推倒重来——这正是容器化部署该有的姿态。
