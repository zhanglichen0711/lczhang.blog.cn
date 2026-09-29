---
title: GitHub Actions：把 CI/CD 写进仓库
date: 2024-12-09
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, CI/CD]
description: GitHub Actions：把 CI/CD 写进仓库
abbrlink: 3828678534
---

事件触发（push/PR/tag）启动 workflow。

1. job 里跑 step，action 是可复用的步骤，市场里能直接引用。
2. 密钥放 secrets，别写进 YAML 或日志。
3. 构建、测试、部署一条流水线自动化，合并即上线。
4. 缓存依赖能显著缩短构建时间。
