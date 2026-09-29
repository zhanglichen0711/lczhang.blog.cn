---
title: "GitHub Actions 简介：把 CI/CD 写进仓库"
date: 2025-07-20
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, CI/CD]
description: "CI/CD 不是额外系统，是跟着代码提交一起走的自动化流水线。"
abbrlink: 2405557960
---

手动部署有多痛，做过的人都知道：提交代码 → SSH 上服务器 → 拉代码 → 装依赖 → 重启服务，一套流程每天重复，还容易在某一步敲错命令。更隐蔽的问题是"别人能不能也这么干"——**只有你一个人会部署，服务就绑定在你身上**。CI/CD 解决的是把"构建-测试-部署"这套重复劳动自动化：代码一提交，机器自动帮你跑完后面所有步骤。GitHub Actions 是其中门槛最低的一种——**它直接长在 GitHub 里，不需要单独的 CI 服务器，配置文件写在仓库里，跟着代码走。**

## CI 和 CD 分别是什么

先把概念拆开：

- **CI（持续集成，Continuous Integration）**：代码频繁合并到主干，每次合并/推送都自动跑构建和测试，尽早发现集成问题。核心是"**小步快跑，随时知道代码是好的**"。
- **CD（持续部署/交付，Continuous Delivery/Deployment）**：CI 通过后，自动把产物部署到环境。持续交付是"一键可部署"，持续部署是"自动部署"。

GitHub Actions 把两者都覆盖：一个仓库里写 workflow，既能跑测试（CI），也能在测试通过后自动构建镜像、部署上线（CD）。

## 一个最小 workflow 长什么样

在仓库里建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements-dev.txt
      - run: pytest
```

文件一提交，GitHub 就会在"每次 push 到 main、每次提 PR"时自动执行这个 workflow。结构拆开看：

- **`name`**：workflow 的名字，显示在仓库的 Actions 页签里。
- **`on`**：触发条件——什么时候跑。这里是 push 到 main 和 PR 时跑。
- **`jobs`**：一组任务。每个 job 在独立的虚拟机（runner）上运行。
- **`steps`**：job 里的步骤，从上到下依次执行。
- **`uses`**：复用别人写好的 Action（步骤模板），`actions/checkout@v4` 把代码拉下来，`actions/setup-python@v5` 装好指定版本的 Python。
- **`run`**：直接执行 shell 命令。

提交后到仓库的 **Actions 页签**看运行结果——绿色对勾是通过，红色叉是失败，点进去能看到每一步的完整日志。**失败的一步会高亮**，排查 CI 问题就是找到第一个失败步骤看日志。

## 为什么值得为博客/项目配 CI

对个人项目和团队，CI/CD 的收益是实实在在的：

**第一，把"只有我会部署"变成"提交即部署"。** 前面聊过这套博客要手动 `npm run deploy`。配上 GitHub Actions 后，本地只需要 `git push`，流水线自动构建并发布——部署从"手动仪式"变成"推送的副作用"。

**第二，质量门禁前置。** 测试、lint、构建检查在合并前自动跑，坏代码进不了主干。PR 页面上直接显示 CI 通过/失败，代码评审的人不用自己拉下来跑一遍。

**第三，环境标准化。** workflow 里的每一步都在干净的 runner 上执行，用什么 Python 版本、装什么依赖全部写死在 YAML 里——**"在我的机器上能过"在 CI 里不成立**，环境是全新的、可复现的。

**第四，免费额度对开源和轻量项目够用。** 公共仓库免费，私有仓库每月也有免费分钟数，个人项目基本够跑。

## workflow、job、step 的关系

三个层级的嵌套关系值得记牢，后面所有配置都在这个框架里：

```
Workflow（一次 CI/CD 流程）
 ├── Job 1: test（在 ubuntu runner 上）
 │    ├── Step 1: checkout 代码
 │    ├── Step 2: 装依赖
 │    └── Step 3: 跑测试
 └── Job 2: deploy（在 ubuntu runner 上，等 Job 1 通过）
      ├── Step 1: 构建镜像
      └── Step 2: 推送/部署
```

**同一个 job 里的 steps 共享文件系统**（前一步下载的东西后一步能用）；**不同 job 之间是隔离的**，要传数据得用 artifact 或缓存机制。后面几篇会逐个展开这些机制。

## 小结

CI/CD 把"构建-测试-部署"从手动重复劳动变成跟着代码走的自动化流水线。GitHub Actions 的优势是零额外基础设施、配置进仓库、按 push/PR 自动触发。这一篇建立了 workflow/job/step 的整体框架，下一篇深入 `on` 的触发条件和 job 之间的编排——什么时候跑、多个 job 怎么排队协作，这是把流水线从"能跑"调到"跑得对"的关键。
