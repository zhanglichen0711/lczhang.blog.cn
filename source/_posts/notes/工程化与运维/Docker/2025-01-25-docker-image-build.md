---
title: "Dockerfile 与镜像构建"
date: 2025-01-25
categories:
  - [工程化与运维, Docker]
tags: [Docker, Dockerfile]
description: "分层缓存、多阶段构建、.dockerignore，把镜像从几百 MB 压到几十 MB。"
abbrlink: 348910091
---

前面两篇用的一直是现成镜像（`python:3.11-slim`）。但真实项目里总要把**自己的代码**做成镜像——这时就得写 Dockerfile：一份描述"这个镜像该怎么一步步构建"的配方文件。这篇讲透 Dockerfile 的写法，重点是两个决定镜像质量和构建速度的关键机制：**分层缓存**和**多阶段构建**。

## 一份最小 Dockerfile

以 FastAPI 服务为例，一个能跑的 Dockerfile 长这样：

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

逐行看每条指令做了什么：

- `FROM`：指定基础镜像。一切构建都从某个现成镜像开始，选 slim 变体（去掉编译器和文档）能让体积小很多。
- `WORKDIR`：设定容器内的工作目录，后续指令都在这个目录下执行，等价于 `cd`。
- `COPY requirements.txt .`：把依赖清单复制进镜像。
- `RUN`：构建时执行的命令——这里装依赖。**RUN 里的命令会真实跑一次，结果作为新的一层固化进镜像。**
- `COPY . .`：把项目代码复制进去。
- `CMD`：容器启动时执行的命令。注意它和 `RUN` 的区别——`RUN` 在构建时执行一次，`CMD` 在每次启动容器时执行。

构建并运行：

```bash
docker build -t my-api:1.0 .
docker run -d -p 8000:8000 my-api:1.0
```

## 分层与缓存：COPY 的顺序是门学问

镜像由一层层文件系统叠加而成，**每一行指令生成一层**。这个设计带来了缓存机制：构建时如果某一层没有变化，Docker 会直接复用上次构建的缓存，跳过执行。

关键在于：**只要某一层变了，它后面的所有层都会失效重建**。所以要把"不常变的放前面，常变的放后面"：

```dockerfile
COPY requirements.txt .      # 依赖清单不常变
RUN pip install -r requirements.txt   # 这层很耗时，放前面
COPY . .                     # 代码天天变，放最后
```

如果反过来把 `COPY . .` 放在 `RUN pip install` 前面，那每次改一行代码，整个依赖安装都要重跑一遍——本地开发时一次 build 可能要等几分钟，全部浪费在装依赖上。

一个小细节：`COPY . .` 会把构建上下文（默认是 Dockerfile 所在目录）整个拷进去，包括 `node_modules`、`__pycache__`、`.git` 这些垃圾。用 `.dockerignore` 文件排除，作用和 `.gitignore` 一样：

```dockerignore
__pycache__/
*.pyc
.git/
.venv/
node_modules/
```

## 多阶段构建：镜像瘦身的核心手段

编译型项目（Go、Java、前端打包）有一个痛点：构建时需要完整的编译工具链，但运行根本用不上。多阶段构建解决它——**用第一个阶段做"重活"，只把产物拷进第二个精简阶段**：

```dockerfile
# 阶段一：构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build        # 产出 dist/

# 阶段二：运行
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

最终镜像只包含 nginx 和静态文件，node 工具链一点没带进来。Python 项目同样适用：

```dockerfile
FROM python:3.11-slim AS builder
RUN pip install --prefix=/install -r requirements.txt

FROM python:3.11-slim
COPY --from=builder /install /usr/local
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

多阶段构建的意义不只是体积——**镜像越小，拉取越快、攻击面越小、启动越快**。一个常见的反例是图省事直接 `FROM python:3.11`（不带 slim），镜像凭空多出几百 MB 的编译器和文档，里面还有一堆用不到的库，既不省事也不安全。

## 构建时最常见的三个坑

**坑一：进程监听的地址。** 服务在容器里监听 `127.0.0.1`，端口映射出去了宿主机也访问不到——容器内要监听 `0.0.0.0`。上面的 `CMD` 里 `--host 0.0.0.0` 就是这个原因。

**坑二：时区。** 官方镜像默认 UTC 时间，国内服务打印的日志比北京时间慢 8 小时。在 Dockerfile 里加：

```dockerfile
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
```

**坑三：用 root 跑应用。** 镜像默认以 root 运行，一旦容器被攻破，攻击者就是宿主机 root。生产环境要建普通用户再切换：

```dockerfile
RUN useradd -m appuser
USER appuser
```

## 小结

Dockerfile 的核心是把"环境构建过程"变成可复现的代码：依赖清单先拷、代码后拷以吃满分层缓存；多阶段构建把编译工具链挡在最终镜像之外；`.dockerignore` 控制构建上下文大小。下一篇讲数据卷与网络——容器怎么持久化数据、容器之间怎么通信，这是从"单容器能跑"走向"多服务协作"的关键。
