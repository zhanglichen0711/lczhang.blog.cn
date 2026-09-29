---
title: "vLLM 生产部署：多模型与可观测"
date: 2025-03-04
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, 生产部署]
description: "从开发机到生产：容器化、多模型共享显存、健康检查与监控，让推理服务立得住。"
abbrlink: 1578808295
---

vLLM 服务在开发机跑通只是第一步，生产环境要解决：怎么部署成稳定服务、怎么一个入口管多个模型、出问题了怎么发现。这一篇讲生产化的三件事：**容器化部署、多模型管理、健康检查与监控**。

## 容器化部署

生产标准姿势是 Docker/K8s 容器。Dockerfile 极简：

```dockerfile
FROM vllm/vllm-openai:latest

# 模型可以打进镜像或挂载
ENV HF_HOME=/models
WORKDIR /app
EXPOSE 8000
ENTRYPOINT ["vllm", "serve", "Qwen/Qwen2.5-7B-Instruct",
            "--port", "8000",
            "--gpu-memory-utilization", "0.90",
            "--max-model-len", "8192",
            "--served-model-name", "qwen-7b"]
```

```bash
docker build -t llm-gateway .
docker run --gpus all -p 8000:8000 llm-gateway
```

**关键实践**：

1. **`--served-model-name` 设成业务名**（如 `qwen-7b`），别让客户端依赖易变的仓库路径；
2. **模型文件提前下载/挂载**，避免每次启动拉权重（又慢又依赖网络）；
3. K8s 部署时声明 GPU 资源（`nvidia.com/gpu: 1`），别让调度器乱放。

## 多模型：一个入口管多个

业务常常要同时服务多个模型（小模型做分类、大模型做生成；或不同版本灰度）。vLLM 支持一个进程加载多个模型：

```bash
vllm serve \
  Qwen/Qwen2.5-7B-Instruct \
  Qwen/Qwen2.5-1.5B-Instruct \
  --served-model-name qwen-7b qwen-1.5b \
  --port 8000
```

```python
client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
# 按模型名切换，底层共享 KV 显存池
r1 = client.chat.completions.create(model="qwen-7b", messages=[...])
r2 = client.chat.completions.create(model="qwen-1.5b", messages=[...])
```

共享显存意味着要规划好总容量——**各模型的权重 + 各模型的 KV Cache 都在一块显存里**。模型多了显存吃紧时，分两个进程部署更稳（故障隔离也更好）。

## 健康检查与探活

K8s 依赖探针判断服务是否正常：

```yaml
# deployment 里的探针配置
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 120    # 大模型加载慢，给足启动时间
readinessProbe:
  httpGet:
    path: /health
    port: 8000
```

**注意大模型服务启动慢**（7B 加载几十秒、70B 几分钟），`initialDelaySeconds` 要给够，否则容器反复被杀重启。

## 可观测：上线前装好眼睛

推理服务是成本大户，监控至少要覆盖三组：

**系统层**（Prometheus + Grafana）：

```text
GPU 利用率（nvidia-smi / DCGM 指标）
显存占用（尤其 KV Cache 是否吃满）
vLLM 自身指标（/metrics：吞吐、排队数、生成延迟分布）
```

**业务层**：

```python
# 每个请求埋点日志：耗时、token 数、模型、是否流式
{
  "request_id": "...", "model": "qwen-7b",
  "prompt_tokens": 512, "completion_tokens": 128,
  "latency_s": 1.8, "ttft_ms": 350,
  "timestamp": "..."
}
```

**告警线参考**：

| 指标 | 告警线 |
| --- | --- |
| GPU 显存使用率 | >95% 持续 → 降并发或扩容 |
| 队列/排队数 | 持续增长 → 请求超过吞吐能力 |
| p95 生成延迟 | 超过业务 SLA 线 |
| 错误率/超时率 | >1% 持续 |

## 服务发现与路由

多个 vLLM 实例/多卡场景，前面一般有负载均衡或网关（Node 网关篇的角色）：

```text
业务服务 → 网关/负载均衡 → vLLM 实例（多副本，按 GPU 分布）
                             └→ 健康检查失败自动摘除
```

推理服务无状态（模型权重固定），可以水平扩副本——扩的是吞吐，不是单请求延迟。

## 上线清单

- [ ] Docker/K8s 部署，GPU 资源声明
- [ ] `served-model-name` 统一业务命名
- [ ] 健康检查探针（启动延迟给够）
- [ ] GPU/显存/延迟指标监控 + 告警
- [ ] 压测定容量：并发上限、副本数
- [ ] 模型文件预下载，启动不依赖网络

## 小结

vLLM 生产化三件事：**容器化部署（GPU 声明 + 模型预下载）、多模型管理（共享显存或分进程）、可观测（/health 探活 + GPU/延迟监控 + 业务埋点）**。推理服务立得住的标志不是"能起服务"，而是"挂了能发现、慢了能告警、扩容有依据"。最后把这一切接进真实业务——下一篇：RAG 问答服务的推理底座。
