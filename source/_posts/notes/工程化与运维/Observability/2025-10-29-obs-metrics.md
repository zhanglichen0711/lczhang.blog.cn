---
title: "指标监控：Prometheus 与 Grafana"
date: 2025-10-29
categories:
  - [工程化与运维, Observability]
tags: [可观测性, Prometheus, Grafana]
description: "指标采集、查询、告警、可视化，一整套服务健康度仪表盘。"
abbrlink: 3296491234
---

日志是"逐条看"的，适合排查具体问题；但要回答"服务现在整体怎么样"——QPS 多少、延迟高不高、有没有在悄悄变慢——日志就力不从心了。这个"面"上的问题靠**指标（Metrics）**：把请求数、延迟、错误率聚合成数值，持续采集、按时间画曲线。这套体系里，**Prometheus 负责采集和存储指标，Grafana 负责可视化和告警**，是目前事实标准的组合。这篇把指标监控的最小闭环搭起来：应用暴露指标 → Prometheus 采集 → Grafana 看板 + 告警。

## 指标从哪来：让应用暴露 /metrics

Prometheus 的采集模型是**拉取（pull）式**的：它定期访问每个目标服务的 `/metrics` 端点，把指标抓回来。所以第一步是让应用暴露一个 `/metrics` 接口，输出 Prometheus 格式的指标。

Python 生态用 prometheus-client，FastAPI 里可以这样挂：

```python
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import FastAPI, Response
import time

app = FastAPI()

# 定义指标：计数器（请求总数）、直方图（延迟分布）
REQUESTS = Counter("http_requests_total", "总请求数", ["method", "path", "status"])
LATENCY = Histogram("http_request_duration_seconds", "请求延迟", ["method", "path"])

@app.middleware("http")
async def metrics_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    LATENCY.labels(request.method, request.url.path).observe(time.perf_counter() - start)
    REQUESTS.labels(request.method, request.url.path, response.status_code).inc()
    return response

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

三个核心概念记牢：

- **Counter（计数器）**：只增不减的数值，如请求总数、错误总数。看增量用 rate 函数。
- **Gauge（仪表）**：可增可减的当前值，如当前在线连接数、内存占用。
- **Histogram（直方图）**：一组带桶的分布统计，用来算 P50/P95/P99 延迟。

**每个指标建议带 label 打标签**（method、path、status）——没标签的指标只有一根曲线，看不出"哪个接口慢、哪个状态码多"。但 label 也别滥用，每个 label 组合都是一条时间序列，基数爆炸会拖垮 Prometheus。

## Prometheus：配置采集目标

Prometheus 本身是一个独立的服务，配置文件 `prometheus.yml` 里声明要抓哪些目标：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "api"
    static_configs:
      - targets: ["api:8000"]     # 抓取 http://api:8000/metrics
  - job_name: "node"
    static_configs:
      - targets: ["node-exporter:9100"]   # 宿主机系统指标
```

服务多了以后，用 `static_configs` 写死目标不现实，通常配合服务发现（K8s 里 Prometheus 能自动发现 Pod）。K8s 部署 Prometheus 的成熟方案是 **kube-prometheus-stack**（Helm chart，自带 node-exporter、告警规则）。本地或单机场景用 docker compose 就能起一套：

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.53.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:11.1.0
    ports:
      - "3000:3000"
```

Prometheus 自带一个查询界面（9090 端口），支持 PromQL——指标查询语言。但真正看板都在 Grafana 里看。

## Grafana：可视化与告警

Grafana 是可视化层：连上 Prometheus 数据源，把指标画成仪表盘。典型的核心指标面板：

- **RED 指标**（服务健康度三件套）：
  - **Rate**（请求速率）：`sum(rate(http_requests_total[5m])) by (path)`；
  - **Errors**（错误率）：错误请求占比，看有没有在上升；
  - **Duration**（延迟）：`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` 算出 P95 延迟。

- **USE 指标**（资源利用率）：CPU、内存、磁盘，来自 node-exporter 的宿主机指标。

一条 P95 延迟的 PromQL 示例：

```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))
```

## 告警：指标的意义在于触发行动

指标画成曲线只是"事后看"，真正防止事故的是**告警**——指标异常时主动通知人。Prometheus 的告警链路是：**告警规则（在 Prometheus 里评估）→ Alertmanager（去重、分组、路由）→ 通知渠道（邮件、钉钉、企业微信、Slack）**。

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m              # 持续 5 分钟才触发，避免抖动误报
        labels:
          severity: critical
        annotations:
          summary: "错误率超过 5%"
```

Grafana 也内置告警，可以直接在面板上配告警规则，效果类似。**告警设计的心法：规则宁少勿滥**——每条告警都必须"响了一定要有人处理"，没人处理的告警会让人麻木，最终真出事时反而没人看。

## 对 LLM 服务：指标层补什么

传统 RED/USE 指标之外，LLM 服务在指标层还值得加几组专属指标（从应用侧埋点）：

- **token 消耗速率**：`llm_tokens_total{type="input|output", model="..."}`，按模型统计——成本曲线的来源；
- **LLM 调用延迟与错误**：模型调用的 P95、重试次数、超时次数（和 HTTP 层指标分开，因为模型调用可能有自己的重试逻辑）；
- **检索指标**：召回条数分布、检索延迟、空召回率（检索不到内容的占比——**空召回率上升往往是知识库更新的信号**）。

这些指标单独看各有意义，组合起来能回答"服务健康 + 智能层也在健康"。

## 小结

指标监控的闭环是：应用暴露 /metrics（Counter/Gauge/Histogram 带 label）→ Prometheus 定期拉取存储 → Grafana 画 RED/USE 看板 → 告警规则触发通知。对 LLM 服务再叠加 token、模型调用、检索三类专属指标。指标回答"整体健康吗"，但"某个具体请求内部发生了什么"它答不了——下一篇进入追踪：用 Langfuse 记录每一次 LLM 调用的完整细节。
