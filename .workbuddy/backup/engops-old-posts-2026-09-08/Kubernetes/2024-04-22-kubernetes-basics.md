---
title: Kubernetes：容器编排与声明式管理
date: 2024-04-22
categories:
  - [工程化与运维, Kubernetes]
tags: [Kubernetes, 部署]
description: Kubernetes：容器编排与声明式管理
abbrlink: 1340915078
---

声明期望状态，控制器持续把现状往期望靠拢。

1. Pod 是最小调度单元，Service 提供稳定的访问入口。
2. Deployment 管副本和滚动更新，ConfigMap/Secret 管配置。
3. 就绪探针决定能否接流量，存活探针决定是否重启。
4. 一切皆资源，用 YAML 描述，用 kubectl 或 GitOps 同步。
