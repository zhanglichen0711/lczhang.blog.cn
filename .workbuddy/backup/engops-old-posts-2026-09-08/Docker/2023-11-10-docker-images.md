---
title: Docker：把环境打包成镜像
date: 2023-11-10
categories:
  - [工程化与运维, Docker]
tags: [Docker, 部署]
description: Docker：把环境打包成镜像
abbrlink: 2097094430
---

镜像是只读模板，容器是它的运行实例。

1. Dockerfile 描述构建步骤，分层缓存能显著加速重复构建。
2. 数据要挂 volume，不要写进容器层，否则一删就丢。
3. 端口映射和自定义网络，让容器之间可控通信。
4. 用 .dockerignore 减小上下文，镜像越小越稳。
