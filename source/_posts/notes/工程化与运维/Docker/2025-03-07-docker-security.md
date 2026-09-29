---
title: "Docker 资源限制与安全加固"
date: 2025-03-07
categories:
  - [工程化与运维, Docker]
tags: [Docker, 安全]
description: "限额防雪崩、非 root 运行、镜像可信，三层防线缺一不可。"
abbrlink: 3654364910
---

容器用起来方便，但"方便"背后有代价：如果放任不管，一个失控的容器可能**吃光宿主机全部内存把机器拖死**，或者因为镜像来自不可信来源、进程以 root 运行，把安全边界撕开一个口子。这篇把资源限制和安全加固放在一起讲，因为它们本质是同一件事——**别让容器成为宿主机上的隐患**。

## 资源限制：给每个容器套上笼头

默认情况下容器可以无限制使用宿主机资源。一个内存泄漏的容器能把整台机器拖垮，其他正常服务全部陪葬。用 `--memory` 和 `--cpus` 给每个容器设上限：

```bash
docker run -d --name api \
  --memory 1g --memory-swap 1g \
  --cpus 1.0 \
  my-api:1.0
```

参数含义：

- `--memory 1g`：容器最多用 1 GB 内存。超过会被 OOM 杀掉（进程退出，容器重启策略生效）。
- `--memory-swap 1g`：内存+swap 总和上限。**设为和 memory 相同，等于禁掉 swap**，防止容器把内存压力传导到磁盘导致整机变慢。
- `--cpus 1.0`：最多用 1 个 CPU 核（可以是小数，如 `0.5`）。

对 LLM 服务来说内存限额尤其重要——推理时显存不足会退到内存，内存不足会 OOM，提前设好上限并配合监控，才能在被拖垮前发现问题。用 `docker stats` 可以实时观察每个容器的实际占用，判断限额设置是否合理。

Compose 里对应写法：

```yaml
services:
  api:
    image: my-api:1.0
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: "1.0"
```

## 不以 root 运行：最容易忽略的一条

前面 Dockerfile 那篇提过：官方镜像默认以 root 身份运行容器内进程。这意味着如果应用有漏洞被利用，攻击者在容器里拿到的就是 root——虽然还有容器隔离挡着，但一旦配合内核漏洞或错误配置，等于直接拿到宿主机控制权。

正确姿势是在 Dockerfile 里建普通用户并切换：

```dockerfile
FROM python:3.11-slim
RUN useradd -m appuser
WORKDIR /app
COPY --chown=appuser:appuser . .
USER appuser
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

运行时还可以再加一道保险，用只读根文件系统 + 去掉多余内核能力：

```bash
docker run -d --name api \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  my-api:1.0
```

`--read-only` 让容器内文件系统只读，应用想写文件会失败（需要写临时文件的目录要单独挂 tmpfs 或卷）；`--cap-drop ALL` 丢弃所有 Linux 内核能力，容器内的 root 也干不了多少坏事。这两条对无状态 API 服务几乎零成本，安全收益却很大。

## 镜像来源可信：供应链安全

`docker pull` 一条命令拉下来的镜像，背后可能是任何人构建的。**不要在生产环境用来历不明的镜像**——恶意镜像可以在你毫不知情的情况下植入后门、挖矿程序。

几个可执行的检查习惯：

- 优先用**官方镜像**（`python`、`redis`、`nginx` 等带 Official 标识的）和可信组织发布的镜像。
- 版本写死（`python:3.11-slim` 而不是 `python:latest`），latest 的内容会漂移，你无法确定线上跑的是什么。
- 定期 `docker scan` 或接入 Trivy 等镜像扫描工具，检查已知漏洞（CVE）。
- 私有代码构建的镜像推到私有仓库（如 Harbor、GHCR），加访问控制，别公开在 Docker Hub。

## 其他几个值得养成习惯的点

**日志别落盘。** 应用把日志写进容器内的文件，容器一删日志就没了，排查问题无从下手。让应用把日志打到 stdout，用 `docker logs` 统一收集——后面讲可观测性时这也是标准姿势。

**控制暴露面。** 只映射必须的端口。数据库、Redis 这些内部服务**不要**用 `-p` 暴露到宿主机，业务容器走自定义网络访问它们就够了。

**及时更新。** 基础镜像里的系统库会有新披露的漏洞，定期重建镜像（重新 pull 基础镜像再 build）比一直用几个月前的旧镜像安全。

## 小结

安全是层层设防而不是指望一道墙：资源限额防失控拖垮宿主机，非 root + 只读文件系统 + 丢弃内核能力缩小被攻破后的破坏半径，可信镜像从源头减少恶意代码进入的概率。单机 Docker 做好这些，已经能应付绝大多数场景。下一篇进入 AI 特有的环节——把带 GPU 的 LLM 推理服务容器化，那里面有显存、驱动、CUDA 版本这些全新的坑。
