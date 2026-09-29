---
title: "实战：把 RAG 服务部署到 Kubernetes"
date: 2025-07-08
categories:
  - [工程化与运维, Kubernetes]
tags: [Kubernetes, RAG, 实战]
description: "镜像、配置、服务、探针、扩缩容，一条龙串起前面所有概念。"
abbrlink: 84326068
---

Kubernetes 系列讲到最后，用一篇实战把所有概念串一遍。目标很具体：把一个 RAG 问答服务完整部署到 K8s 集群——包括 API 服务（无状态，用 Deployment）、Redis 缓存（有状态，用 StatefulSet）、配置与密钥（ConfigMap/Secret）、服务入口（Service/Ingress）、健康保障（三类探针）和弹性伸缩（HPA）。这篇的 YAML 比较多，但每一段都能对应前面某篇讲过的概念，建议照着敲一遍。

## 整体架构

```
Ingress (rag.example.com)
   └── Service rag-api ──→ Deployment rag-api (replicas: 3, HPA)
                              ├── ConfigMap: 模型参数 / 检索配置
                              ├── Secret: LLM API Key
                              └── PVC → 日志/临时数据
   └── Service redis ──→ StatefulSet redis (1 副本, 独立卷)
```

## 第一步：配置与密钥

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rag-config
data:
  LLM_MODEL: "qwen-plus"
  TOP_K: "5"
  RERANK: "true"
  REDIS_URL: "redis://redis:6379"
```

```yaml
# secret.yaml（演示用明文 stringData，生产用外部密钥管理）
apiVersion: v1
kind: Secret
metadata:
  name: rag-secrets
type: Opaque
stringData:
  LLM_API_KEY: "sk-xxxxxx"
```

Redis 地址写 `redis://redis:6379`——用的就是集群内 DNS 按 Service 名解析的能力。

## 第二步：API 服务的 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-api
  template:
    metadata:
      labels:
        app: rag-api
    spec:
      containers:
        - name: api
          image: registry.example.com/rag-api:1.0
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: rag-config
          env:
            - name: LLM_API_KEY
              valueFrom:
                secretKeyRef:
                  name: rag-secrets
                  key: LLM_API_KEY
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1"
          startupProbe:
            httpGet: { path: /healthz, port: 8000 }
            periodSeconds: 5
            failureThreshold: 30        # 最多给 150 秒加载
          readinessProbe:
            httpGet: { path: /ready, port: 8000 }
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /healthz, port: 8000 }
            periodSeconds: 15
            initialDelaySeconds: 10
```

对照概念逐项检查：普通配置从 ConfigMap 来（envFrom 全量注入），密钥从 Secret 来（只挑需要的键），三类探针分工明确——startup 兜底慢启动、readiness 决定接流量、liveness 管日常存活。

## 第三步：Service 与 Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: rag-api
spec:
  selector:
    app: rag-api
  ports:
    - port: 80
      targetPort: 8000
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rag-ingress
spec:
  rules:
    - host: rag.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rag-api
                port:
                  number: 80
```

## 第四步：Redis 有状态部署

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command: ["redis-server", "--appendonly", "yes"]
          volumeMounts:
            - name: data
              mountPath: /data
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
```

StatefulSet 保证 Redis 的 Pod 叫 `redis-0`、卷独立持久化，Service 让 API 能通过 `redis://redis:6379` 访问。

## 第五步：弹性伸缩 HPA

最后给 API 加自动扩缩容——基于 CPU 使用率自动调整副本数：

```bash
kubectl autoscale deployment rag-api --cpu-percent=70 --min=3 --max=10
```

流量上来 CPU 超过 70%，HPA 自动扩到最多 10 个副本；流量回落再缩回 3 个。**扩缩容的对象是无状态的 rag-api（Deployment），Redis 这类有状态服务不参与自动扩缩**——这也是架构上把状态和无状态分开的根本原因。

## 部署与验证

```bash
kubectl apply -f configmap.yaml -f secret.yaml
kubectl apply -f deployment.yaml -f service.yaml -f ingress.yaml
kubectl apply -f redis-sts.yaml -f redis-svc.yaml

# 验证
kubectl get pods                          # 全部 Running 且 Ready
kubectl get svc,ingress
kubectl rollout status deployment/rag-api
curl https://rag.example.com/qa -X POST -d '{"question":"什么是 RAG"}'
```

出问题时的排查顺序（呼应前面讲的工具）：`kubectl get events` 看调度和创建事件 → `kubectl describe pod` 看细节 → `kubectl logs` 看应用日志 → 探针状态不对就先查 /ready 返回什么。

## 小结

回头看这份部署，每一个对象都是前面某篇的落地：镜像和标签规范来自 Docker 系列，Deployment/Service/Ingress 管副本与入口，ConfigMap/Secret 解耦环境与密钥，三类探针保健康，StatefulSet + PVC 管 Redis 的数据，HPA 做弹性。**一套 RAG 服务从代码到生产集群的完整路径就此打通。** K8s 告一段落，下一篇开始进入发布流水线——CI/CD 怎么把这些 YAML 自动部署到集群，GitOps 又是什么。
