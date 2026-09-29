---
title: "容器化 LLM 服务：GPU 与推理镜像"
date: 2025-03-18
categories:
  - [工程化与运维, Docker]
tags: [Docker, GPU, vLLM]
description: "GPU 进容器要过驱动、运行时、镜像三层关，模型服务容器化全流程。"
abbrlink: 3169119536
---

普通服务容器化到上一篇就够用了，但 LLM 推理服务有个特殊之处：**它要吃 GPU**。而 GPU 默认是进不了容器的——容器共享宿主机内核，但显卡驱动、CUDA 运行时这些并不天然跟随容器走。把 `nvidia-smi` 在容器里跑起来，往往是第一次做模型部署的人卡得最久的一关。这篇讲透 GPU 容器化的完整链路。

## 三层依赖，缺一不可

要让容器里的 PyTorch/vLLM 用上 GPU，需要三层东西逐层就位：

**第一层：宿主机显卡驱动。** 这是操作系统层面的，NVIDIA 驱动必须装在宿主机上，容器无法自带（驱动要匹配内核版本）。先确认宿主机能跑通 `nvidia-smi`，再谈容器。

**第二层：容器运行时。** 默认的 runc 不会把 GPU 设备映射进容器。需要安装 NVIDIA Container Toolkit，它让 Docker 知道怎么把 GPU 设备、驱动库注入容器：

```bash
# Ubuntu 上安装 nvidia-container-toolkit（以官方文档为准）
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

**第三层：镜像里的 CUDA 运行时。** 容器里的应用需要 CUDA 库。自己从零装容易踩坑，正确做法是**基于官方 CUDA 镜像构建**，或直接用专门为推理引擎做好的镜像。

## 三层都就位后：--gpus 一条命令

```bash
docker run --rm --gpus all \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct
```

`--gpus all` 把所有 GPU 给容器用；也可以指定某一块 `--gpus '"device=0,1"'`。

验证 GPU 是否真的进了容器：

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

能正常打印显卡信息，说明驱动 + 运行时 + 镜像三层全部打通。这应该是你调 GPU 容器时的**第一个验证动作**——先用官方 CUDA 镜像跑 nvidia-smi，通了再往上叠应用，别直接拿 vLLM 镜像排错。

## 为什么选现成的推理镜像，而不是自己装

自己写 Dockerfile 装 vLLM 不是不行，但要处理一堆琐碎且易错的事：CUDA 版本和 PyTorch 的匹配、vLLM 的编译依赖（它部分算子需要编译）、共享库路径。而 vLLM 官方发布的镜像已经把这些全部调好，而且**针对推理做了优化**。

```bash
# 拉取并跑起来，OpenAI 兼容接口立刻可用
docker run -d --gpus all --name qwen \
  -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct --max-model-len 8192
```

挂载 `~/.cache/huggingface` 到容器里很关键——模型权重下载一次后缓存在宿主机，**容器重建不用重新下载几十 GB 的模型**。这也是前面讲的"数据要放卷里"的又一次体现：模型权重属于要持久化的数据。

## 显存相关：容器里的容量规划

容器化之后显存管理多了几个要注意的点：

**显存是共享的。** 多个容器 `--gpus all` 同时跑，会互相抢显存。规划时要么一个容器独占一张卡（`--gpus '"device=0"'`），要么靠推理引擎自己管理。

**vLLM 默认吃满显存。** `--gpu-memory-utilization` 控制 vLLM 使用显存的比例，默认 0.9。多个模型服务共享一张卡时，要显式调低并预留 KV cache 余量：

```bash
docker run -d --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct \
  --gpu-memory-utilization 0.7 \
  --max-num-seqs 64
```

**宿主机也要监控。** 容器内的 `nvidia-smi` 看到的显存和宿主机一致。用 `docker stats` 看不到显存占用，要监控显存得在宿主机跑 `nvidia-smi` 或接 Prometheus 的 DCGM 导出器（后面可观测性会展开）。

## 一个完整的多服务推理编排

把 Docker Compose 用起来，本地一套"模型服务 + 向量库 + API"可以这样编排：

```yaml
services:
  llm:
    image: vllm/vllm-openai:latest
    command: ["--model", "Qwen/Qwen2.5-7B-Instruct", "--gpu-memory-utilization", "0.7"]
    ports:
      - "8000:8000"
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  api:
    build: ./backend
    environment:
      - LLM_BASE_URL=http://llm:8000/v1
    ports:
      - "8080:8080"
    depends_on:
      - llm
```

注意 `api` 访问 `llm` 用的是服务名，Compose 内部网络自动解析——和前面学的容器互访是同一套规则。

## 小结

GPU 容器化就是打通三层：宿主机的驱动、NVIDIA Container Toolkit 运行时、镜像里的 CUDA。调通后用 `--gpus all` 一键放行，推理服务优先用官方优化好的镜像而不是自己装，模型权重用卷持久化免去重复下载。到这一步，单个推理服务已经能稳定跑在容器里——下一篇把它推到生产标准：镜像怎么瘦身、健康检查怎么做、日志怎么收集。
