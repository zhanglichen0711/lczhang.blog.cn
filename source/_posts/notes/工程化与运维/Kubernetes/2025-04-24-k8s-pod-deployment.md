---
title: "Kubernetes 核心对象：Pod 与 Deployment"
date: 2025-04-24
categories:
  - [工程化与运维, Kubernetes]
tags: [Kubernetes, Pod, Deployment]
description: "Pod 是最小调度单元，Deployment 管副本与滚动更新，别再裸跑 Pod。"
abbrlink: 183693549
---

K8s 概念很多，但绝大多数操作都围绕两个对象展开：**Pod**（最小调度单元）和 **Deployment**（管副本的应用控制器）。把这两个吃透，K8s 的地基就打牢了——后面 Service、ConfigMap、探针全都长在它们之上。

## Pod：一个或多个容器的"最小运行单元"

Pod 是 K8s 里能被调度、被创建、被销毁的最小单元。**一个 Pod 里可以有一个或多个容器**，这些容器共享网络（共用一个 IP）、共享存储卷，就像跑在同一台"逻辑机器"上。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
    - name: app
      image: nginx:1.25
```

最常见的模式是一个 Pod 一个容器——我们平时说的"一个服务副本"，在 K8s 里就是一个 Pod。那为什么要设计成能装多个容器？因为有些场景两个进程必须**同生共死、共享网络**：

- **Sidecar 模式**：主容器是业务应用，旁边挂一个日志采集容器、或一个代理容器。它们共享网络和存储，主容器怎么访问服务，sidecar 也能访问。
- **代理模式**：主容器是推理引擎，sidecar 是鉴权/限流代理，本地拦截所有流量。

不过要克制——**能用独立 Pod 解决的问题不要硬塞进一个 Pod**，Pod 的边界应该是"必须一起调度、一起伸缩"的进程集合。

Pod 是"一次性的"：它被删除后不会自己回来，节点宕机上面的 Pod 也就没了。所以生产环境几乎从不直接创建 Pod——这正是 Deployment 存在的理由。

## Deployment：声明副本数，交给控制器维护

Deployment 是"管 Pod 的控制器"。你告诉它要几个副本、跑什么镜像，它负责创建 Pod、维持数量、出问题时重建：

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
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

逐块拆解：

- `replicas: 3`：期望 3 个副本。Pod 挂了控制器自动补，这就是故障自愈的落地。
- `selector.matchLabels`：控制器靠标签找到自己管的 Pod。**标签是 K8s 里对象关联的纽带**，Deployment 通过 `app: rag-api` 这个标签识别哪些 Pod 归它管。
- `template`：Pod 的模板，控制器按这个模板创建副本。
- `resources.requests / limits`：requests 是调度依据（至少保证这么多），limits 是硬上限（超了会被杀）。**生产环境每个容器都应该配**，否则一个吃内存的应用可能把节点打爆。

部署命令：

```bash
kubectl apply -f deployment.yaml
kubectl get deployment        # 看期望/实际副本数
kubectl get pods -l app=rag-api   # 按标签查 Pod
kubectl scale deployment rag-api --replicas=5   # 手动扩容
```

## 更新与回滚：Deployment 的滚动能力

升级镜像版本是 Deployment 最常用的操作之一。**不要手动删 Pod 再建**——直接改镜像版本重新 apply，Deployment 会自动做滚动更新：

```bash
kubectl set image deployment/rag-api api=registry.example.com/rag-api:1.1
```

K8s 会先起一个新的 Pod，等它通过就绪检查后再停一个旧的，逐个替换，整个过程中服务不中断。如果 1.1 有问题，一键回滚：

```bash
kubectl rollout undo deployment/rag-api
```

滚动更新的完整机制（maxSurge、maxUnavailable、回滚策略）后面有专门一篇细讲，这里先记住：**Deployment 让"升级不中断、出事能回滚"成为默认能力。**

## 实践中的两个常见坑

**坑一：镜像 tag 用 latest。** 跟 Docker 一样，K8s 里千万别用 `image: xxx:latest`。latest 会漂移，而且 K8s 的拉取策略对同名 tag 可能不重新拉取——你今天 apply 的和明天 apply 的可能不是同一个东西。**版本 tag 必须写死**（`1.0`、`abc123`、带构建号）。

**坑二：改了 YAML 忘了 apply。** YAML 文件本身不产生任何效果，`kubectl apply -f` 才是把期望状态提交给集群的动作。改完文件必须 apply（或者用 `kubectl edit` 直接改集群里的配置）。

## 小结

Pod 是最小调度单元，承载一个或几个必须同生共死的容器；Deployment 是 Pod 的控制器，负责维持副本数、滚动更新、故障自愈。生产里永远用 Deployment 管无状态应用，不要裸跑 Pod。现在有了副本，下一个问题立刻出现：**3 个副本的 API 在 3 个不同 IP 的 Pod 里，客户端该访问谁？** 这就轮到 Service 出场了。
