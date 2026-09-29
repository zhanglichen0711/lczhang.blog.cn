---
title: "GitHub Actions Secrets 与多环境部署"
date: 2025-08-28
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, Secrets]
description: "密钥分级存放、环境隔离部署，别让生产密钥流进测试流水线。"
abbrlink: 2885240156
---

CI/CD 里最不能出错的就是密钥管理——一旦 API Key、部署令牌被打印进日志或写进仓库历史，等于把钥匙挂在了门口。前面几篇零星提到 Secrets，这篇系统讲清楚：**密钥怎么存、怎么用、怎么按环境隔离**，以及"测试环境部署"和"生产环境部署"在同一套流水线里怎么安全地分开。

## Secrets 的分级存放

GitHub 提供三个层级的 Secrets 存放位置，按需选择：

**Repository secrets（仓库级）**：仓库 Settings → Secrets and variables → Actions。整个仓库的 workflow 都能用。

**Environment secrets（环境级）**：挂在 Environment（如 `test`、`prod`）下的密钥，**只有明确指定该环境的 job 才能访问**。这是多环境隔离的关键。

**Organization secrets（组织级）**：组织下所有仓库共享（企业场景用），个人项目用不到。

```yaml
# 在 job 里指定环境，就能用该环境的 secrets
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: prod          # 关联 prod 环境
    steps:
      - name: 部署
        env:
          PROD_TOKEN: ${{ secrets.PROD_DEPLOY_TOKEN }}
        run: ./deploy.sh
```

## 环境：不只是密钥容器

GitHub 的 **Environment** 概念比"密钥分组"更有用，它自带保护机制：

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment:
      name: prod
      url: https://api.example.com    # 部署完显示在 Actions 页面的链接
    steps:
      - run: echo "部署到生产"
```

在仓库 Settings → Environments 里，每个 Environment 可以配置：

- **required reviewers**：生产部署前必须指定的人批准；
- **wait timer**：部署前的等待时间（冷静期）；
- **deployment branches**：只有特定分支（如 main、release/*）能部署到这个环境。

这些保护对生产环境意义重大：**"误点部署"和"分支不合规部署"被机制挡住**，而不是靠人的细心。测试环境（test）可以放开随便部署，生产环境（prod）加审批——环境的"信任等级"不同，管控力度就该不同。

## 多环境流水线的典型形态

一条完整的"测试 → 生产"流水线通常长这样：

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "跑测试"

  deploy-test:
    runs-on: ubuntu-latest
    needs: test
    environment: test
    steps:
      - name: 部署测试环境
        env:
          ENV: test
          TOKEN: ${{ secrets.TEST_TOKEN }}
        run: ./deploy.sh --env test

  deploy-prod:
    runs-on: ubuntu-latest
    needs: deploy-test          # 测试环境部署成功才轮到生产
    environment: prod           # 生产环境的密钥 + 审批保护
    steps:
      - name: 部署生产环境
        env:
          ENV: prod
          TOKEN: ${{ secrets.PROD_TOKEN }}
        run: ./deploy.sh --env prod
```

三个 job 层层递进：测试通过 → 部署测试环境 → 测试环境 OK → 部署生产（生产环境若配了审批人，会在这里停下来等人批准）。**每个环境用各自的 Secret**，测试流程永远碰不到生产密钥。

## 密钥安全红线

把 GitHub 官方文档和自己的教训浓缩成几条红线：

**红线一：别把密钥写进 YAML。** `run: curl -H "Authorization: token sk-xxxx"` 这种写死明文的行为，等于把密钥提交进仓库历史——**即使后来删掉，历史里还躺着**。

**红线二：别用 echo 打印密钥。** GitHub 会尝试给日志里的 secret 打码，但**自己 echo 出来打码并不可靠**（比如密钥被拆成多段打印就躲过了打码）。任何密钥都只赋值给环境变量，让命令/脚本内部读取，不要主动打印。

**红线三：部署脚本里别有 `set -x`。** `set -x` 会把执行的每条命令（含变量值）打出来，密钥随之泄露。脚本里检查一下有没有这个坑。

**红线四：推送的镜像别带密钥。** Docker build 时把密钥作为构建参数（`--build-arg`）会**留在镜像层里**，任何人拉镜像都能提取。正确姿势是用 BuildKit 的 secret 挂载（`RUN --mount=type=secret`），或运行时才注入环境变量。

**红线五：轮换意识。** 一旦怀疑密钥泄露（比如误传了含密钥的文件），立即去服务商吊销重建，别抱着"应该没人看到"的侥幸。

## 多环境配置 vs 多环境密钥

环境隔离还有个常见误区要想清楚：**"配置不同"和"密钥不同"要分开管理**。

- 非敏感的**配置**（模型名、开关、URL）可以放环境变量，甚至用 Environment 的 Variables 管理，进 workflow 时用 `vars.XXX` 读取；
- 敏感的**密钥**（token、密码）一律 Secrets。

```yaml
env:
  LLM_MODEL: ${{ vars.LLM_MODEL }}      # 环境变量，非敏感
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }} # 密钥
```

分清楚的好处是审计方便：Secrets 列表里每个都是真密钥，不会有"其实是个普通配置"的噪音。

## 小结

Secrets 分仓库级/环境级存放，多环境部署靠 `environment` 关联密钥与保护机制；测试通过 → 测试环境 → 生产环境的链式 job 是最典型形态，层层递进、密钥互不可见。红线记住五条：不写进 YAML、不 echo、不 set -x、build 不嵌密钥、泄露就轮换。下一篇把 CI 推向下一个层次：构建 Docker 镜像并推送镜像仓库，这是"代码合并即部署"流水线里的核心一环。
