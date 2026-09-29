---
title: "Kubernetes 服务发现：Service 与 Ingress"
date: 2025-05-06
categories:
  - [工程化与运维, Kubernetes]
tags: [Kubernetes, Service, Ingress]
description: "Pod 的 IP 会变，Service 提供稳定入口，Ingress 统一对外路由。"
abbrlink: 3548338343
---

上一篇结尾抛了个问题：Deployment 有 3 个副本，Pod 分布在集群不同节点、IP 各不相同，而且随时可能被重建换 IP——**客户端到底该访问哪个地址？** 直接访问 Pod IP 是行不通的，因为 Pod 是"朝生暮死"的。K8s 的答案是 Service：给一组 Pod 提供稳定的访问入口和负载均衡。

## Service：稳定入口 + 负载均衡

Service 是一个虚拟的稳定地址，它通过标签选择器关联一组 Pod，把流量负载均衡到它们上面：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: rag-api
spec:
  selector:
    app: rag-api            # 选中有这个标签的 Pod
  ports:
    - port: 80              # Service 对外端口
      targetPort: 8000      # 转发到 Pod 的端口
```

```bash
kubectl apply -f service.yaml
kubectl get svc rag-api     # 会看到一个集群内 IP（ClusterIP）
```

关键机制：**Pod 的 IP 再怎么变，只要标签还是 `app: rag-api`，Service 就自动把它纳入负载均衡池**。新 Pod 起来自动接流量，旧 Pod 销毁自动摘除——客户端始终只需要记住 Service 这一个地址。

Service 有几种类型，对应不同的暴露范围：

- **ClusterIP**（默认）：只在集群内部可达。适合服务间调用——API 调向量库、调 Redis，都走 ClusterIP。
- **NodePort**：在每个节点上开一个固定端口（30000-32767），外部可通过 `任意节点IP:NodePort` 访问。适合测试环境快速验证。
- **LoadBalancer**：云厂商（AWS/GCP/阿里云）会分配一个公网负载均衡器，流量打到它再转发进集群。生产环境对外服务的常见选择。

集群内部的服务互访还有一个天然便利：**同命名空间下，直接用 Service 名当域名**。API 服务要调向量库，如果向量库 Service 叫 `milvus`，代码里写 `http://milvus:19530` 就能访问——跟 Docker Compose 里的服务名解析一模一样。

## 集群内 DNS：名字就是地址

Service 之所以能"用名字访问"，是因为集群里有内置 DNS（CoreDNS）。每个 Service 创建后会自动注册一个 DNS 记录：

```
<service-name>.<namespace>.svc.cluster.local
```

同命名空间内可以简写为 `<service-name>`。这套机制让服务间的调用地址**从"写死 IP"变成"写死名字"**——IP 会变，名字稳定，这正是服务发现要解决的核心问题。

## Ingress：集群对外的统一大门

Service 解决了集群内部的服务发现，NodePort 和 LoadBalancer 也能对外暴露，但都有局限：NodePort 端口范围有限、每个服务都要占端口；LoadBalancer 每个服务一个公网 IP，贵且难管理。当集群里有十几个 HTTP 服务要对外时，需要一个**统一的入口，按域名/路径把请求路由到不同服务**——这就是 Ingress。

Ingress 是"第 7 层（HTTP）路由规则"的抽象，它本身不干活，真正转发流量的是 Ingress Controller（常见的有 NGINX Ingress Controller、Traefik）：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: main-ingress
spec:
  rules:
    - host: api.example.com          # 按域名路由
      http:
        paths:
          - path: /qa
            pathType: Prefix
            backend:
              service:
                name: rag-api        # 转发给 rag-api 服务
                port:
                  number: 80
    - host: admin.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin
                port:
                  number: 80
```

这个 Ingress 描述了：访问 `api.example.com/qa` 的流量进 `rag-api`，访问 `admin.example.com` 的进 `admin`。域名、路径、TLS 证书都可以在 Ingress 里统一管理——**对外只暴露一个入口，内部路由规则全部收敛在这里**。

一个典型的流量链路：

```
用户请求 api.example.com/qa
   ↓ DNS 解析
Ingress Controller（唯一的对外入口）
   ↓ 按 host + path 路由
Service rag-api（负载均衡）
   ↓ 按标签选择
Pod 副本 ×3
```

## 实践中的两个关键认知

**第一，Service 只认标签，不认 Deployment。** Service 通过 `selector` 找 Pod，不是通过 Deployment 关联。只要 Pod 标签匹配，不管它是哪个 Deployment 管的，都会被纳进负载均衡池——这也是为什么标签命名要规范、要全局一致。

**第二，Ingress 和 Service 是两层的活。** Ingress 管"外部 → Service"的路由规则，Service 管"→ Pod"的负载均衡。新手常见困惑是"有了 Ingress 还要不要 Service"——**要**，Ingress 的后端指向的就是 Service，两者是上下游关系，不是替代关系。

## 小结

Service 给一组易变的 Pod 一个稳定的名字和入口，集群内靠 DNS 用名字互访；对外暴露则收敛到 Ingress 一个大门，按域名和路径路由到不同服务。到这里，应用的"骨架"——副本、入口、路由——已经齐了。下一篇讲配置：环境变量、配置文件、密钥这些不该写死在镜像里的东西，在 K8s 里用什么对象管理。
