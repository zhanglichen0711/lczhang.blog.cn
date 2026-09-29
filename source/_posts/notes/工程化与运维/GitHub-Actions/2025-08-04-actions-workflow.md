---
title: "GitHub Actions 工作流基础：触发与任务编排"
date: 2025-08-04
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, Workflow]
description: "on 触发器细到路径和分支，job 之间用 needs 与 if 编排。"
abbrlink: 1248742443
---

上一篇的 workflow 只用了最简单的触发（push 到 main 就跑）和最简单的编排（一个 job）。真实项目很快会发现两个需求：**不是所有改动都要触发 CI**（改了 README 也跑全量测试太浪费），**不同任务有先后和取舍**（测试没通过就别部署）。这篇把 `on` 触发器讲细，再把 job 的编排机制（needs、if、矩阵）讲清楚。

## 触发器：什么时候跑

### 分支与标签过滤

```yaml
on:
  push:
    branches: [main, "release/*"]   # 只在这些分支的 push 时触发
    tags: ["v*"]                    # 打 v 开头的 tag 时也触发
  pull_request:
    branches: [main]
```

注意分支名含特殊字符要加引号（`"release/*"`），这是 YAML 的语法要求。

### 路径过滤：只有相关文件变了才跑

最实用的省流量手段：**只关心特定目录的改动**。比如一个 monorepo，后端代码和文档在同一仓库：

```yaml
on:
  push:
    branches: [main]
    paths:
      - "backend/**"        # 只有 backend 目录有改动才触发
      - ".github/workflows/**"
```

配套的 `paths-ignore` 反向过滤——比如"README 或文档改动不触发"：

```yaml
on:
  push:
    paths-ignore:
      - "README.md"
      - "docs/**"
```

### 定时与手动触发

```yaml
on:
  schedule:
    - cron: "0 2 * * *"     # 每天 UTC 2:00 跑（北京时间 10:00）
  workflow_dispatch:        # 允许在 GitHub 页面手动触发
```

`schedule` 用 cron 语法（UTC 时区，注意比北京时间慢 8 小时）；`workflow_dispatch` 加上后，Actions 页面会出现"Run workflow"按钮，可以手动点跑并传参数——**调试 CI 时这个按钮很救命**，不用为了触发去空提交。

## job 编排：先后、条件与并行

### needs：控制先后顺序

默认所有 job 并行执行。要让"部署等测试通过"，用 `needs`：

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "跑测试"

  deploy:
    runs-on: ubuntu-latest
    needs: test          # 等 test 成功后才执行
    steps:
      - run: echo "部署"
```

`test` 失败，`deploy` 自动跳过（显示 skipped）。多级依赖可以写多个：`needs: [lint, test]`。

### if：条件执行

某些步骤或 job 只在特定条件下跑。比如**只给打了 tag 的版本做发布**：

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')   # 只有 v 开头的 tag 才跑
    steps:
      - run: echo "发布正式版本"
```

`github` 上下文里有很多可用信息：`github.ref`（当前分支/tag）、`github.event_name`（触发方式）、`github.sha`（提交号）。条件表达式里 `&&`、`||`、`!` 都能用，也可以引用上一步的输出。

### 矩阵：一次定义多版本组合

要测"多个 Python 版本 × 多个操作系统"，不用复制粘贴 job，用矩阵一次搞定：

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        python-version: ["3.10", "3.11", "3.12"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pip install -r requirements-dev.txt
      - run: pytest
```

这会自动生成 2×3=6 个并行 job，每个跑一种组合。跑完在 Actions 页面能看到 6 个格子，哪个组合挂了一目了然——**矩阵是"兼容性测试"的标准做法**。

## 上下文与 secret：job 之间传值

job 之间默认隔离，要传值有几种途径：

- **job 输出**：一个 job 用 `outputs` 暴露值，下游 job 用 `needs.job名.outputs.xxx` 读取；
- **artifact**：上传构建产物（`actions/upload-artifact`），下载给后续 job 或留给人工下载——比如测试报告；
- **cache**：缓存依赖，下一篇专门讲。

敏感信息不写死在 YAML 里，用仓库的 Secrets：

```yaml
steps:
  - name: 部署
    env:
      TOKEN: ${{ secrets.DEPLOY_TOKEN }}
    run: ./deploy.sh
```

Secrets 在仓库 Settings → Secrets and variables → Actions 里配置。**注意 secret 在日志里会被打码，但千万别 echo 出来**——自己打印到日志的打码不保证可靠。

## 小结

触发器的粒度可以细到分支、路径、tag、定时、手动；job 之间用 `needs` 排先后、用 `if` 做条件、用矩阵跑多版本组合。这套编排能力把一条简单的流水线变成了能应对真实发布流程的工具。下一篇解决 CI 里最实际的性能问题：依赖装一遍要几分钟，能不能缓存下来不重复装？
