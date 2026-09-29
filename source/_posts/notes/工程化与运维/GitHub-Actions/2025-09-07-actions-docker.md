---
title: "GitHub Actions 构建并推送 Docker 镜像"
date: 2025-09-07
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, Docker]
description: "代码一合并就出镜像：buildx 多架构、缓存复用、密钥不落层。"
abbrlink: 2998301478
---

把 Docker 和 GitHub Actions 接起来，是个人项目走向"自动化发布"的关键一步：代码推上 main，流水线自动构建镜像、推送到镜像仓库，服务器（或 K8s）拉新镜像部署。整条链路里人只做一件事——**提交代码**。这篇讲透镜像流水线的标准写法，重点在三个生产级细节：多架构构建、构建缓存、构建密钥安全。

## 最小可用的镜像流水线

```yaml
name: Build and Push Image

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write          # 推送 GHCR 需要
    steps:
      - uses: actions/checkout@v4

      - name: 登录 GitHub 容器仓库
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 构建并推送
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

几个值得说明的点：

- **`ghcr.io`** 是 GitHub 自家的容器仓库（GitHub Container Registry），和代码仓库天然集成，个人项目不需要额外注册 Docker Hub 账号。
- **`${{ secrets.GITHUB_TOKEN }}`** 是 GitHub 自动注入的临时令牌，workflow 每次运行都有，权限由 `permissions` 控制，不用自己配——**别把它当普通 secret 对待，它是给 Actions 用的专用令牌**。
- **打两个 tag**：`latest` 方便拉取，`${{ github.sha }}`（提交号）保证每个版本可追溯——线上跑的是哪个提交构建的镜像，看 tag 就知道。生产部署应该拉 sha 版本而不是 latest，这是前面 Docker 篇反复强调过的。

## 用 buildx 构建多架构镜像

默认构建只出当前 runner 的架构（amd64）。想一个镜像同时支持 amd64 和 arm64（Apple Silicon 机器、ARM 服务器越来越多），用 Docker Buildx 的 QEMU 模拟：

```yaml
      - name: 设置 QEMU（多架构模拟）
        uses: docker/setup-qemu-action@v3

      - name: 设置 buildx
        uses: docker/setup-buildx-action@v3

      - name: 构建并推送（多架构）
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

发布一次，两个架构的镜像一起产出，用户按自己的平台拉取，**manifest 自动选择对应架构**。注意多架构构建比较慢（每个架构完整 build 一遍），加缓存能显著缓解。

## 构建缓存：别每次从头 build

前面缓存篇讲的是依赖缓存，这里还有一层：**Docker 构建本身的分层缓存**。不配置的话每次 push 都从零构建，几分钟就没了。用 buildx 的内置缓存推送到仓库：

```yaml
      - name: 构建并推送
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha      # 从 GitHub Actions 缓存读
          cache-to: type=gha,mode=max   # 写回缓存
```

`type=gha` 把构建缓存存在 GitHub 的缓存服务里，下一次构建直接复用 Dockerfile 里没变的分层——**配合前面讲的"COPY 顺序"技巧，依赖层基本每次都能命中，构建时间大幅缩短**。

## 构建密钥：别把密钥烧进镜像层

这是镜像流水线里最隐蔽的安全坑。有人为了在构建时用密钥（比如拉私有模型、访问私有源），把它作为 `--build-arg` 传进去——**结果密钥被写进镜像的某层，谁拉镜像谁拿到**。正确做法是用 BuildKit 的 secret 挂载：

```dockerfile
# Dockerfile 里这样声明：构建时挂载密钥，用完即弃，不进层
RUN --mount=type=secret,id=gh_token \
    git clone https://github.com/private/repo.git \
    --config http.extraheader="AUTHORIZATION: Bearer $(cat /run/secrets/gh_token)"
```

workflow 侧通过 build-push-action 传入：

```yaml
      - name: 构建并推送
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          secrets: |
            gh_token=${{ secrets.SOME_TOKEN }}
```

挂载的 secret 只在 `RUN` 执行期间存在，**不落进任何镜像层**——构建完想提取都提取不到。

## 触发策略小结

镜像流水线的触发通常配合发布节奏设计：

- **push 到 main** → 构建 `sha` 版本 + `latest`（持续集成，随时有可部署的最新镜像）；
- **打 tag（`v1.2.0`）** → 额外构建带版本号的镜像（正式发布，版本可追溯）；
- **PR** → 只构建不推送（验证 Dockerfile 没问题），避免垃圾镜像堆积。

```yaml
on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    paths: ["Dockerfile", "docker/**"]
```

## 小结

镜像流水线的标准形态：代码提交 → buildx 多架构构建 → 推送到 GHCR（带 sha 和版本两个 tag）→ 服务器/集群拉取部署。生产级细节三个：多架构覆盖 amd64/arm64、`type=gha` 复用构建缓存、构建密钥走 secret 挂载不进镜像层。流水线产出的是"可部署的镜像"，那部署动作本身怎么自动化？下一篇用最贴近个人项目的场景收尾——Hexo 博客的自动发布流水线。
