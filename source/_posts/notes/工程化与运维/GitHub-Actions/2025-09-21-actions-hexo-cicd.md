---
title: "实战：Hexo 博客自动发布流水线"
date: 2025-09-21
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, Hexo, 实战]
description: "git push 即发布：用官方 Pages Action 替代 hexo-deployer。"
abbrlink: 1790984732
---

GitHub Actions 系列最后一篇，用最贴近日常的场景收口——**博客自动发布**。Hexo 博客的常规发布方式是本地 `npm run deploy`，把生成好的静态文件推到 GitHub Pages。这套流程有个不便：每次发文章都要在本地装好 Node、跑构建、再 deploy，换个电脑还得重配环境。配一条 GitHub Actions 流水线后，**本地只需要 `git push`，剩下的构建和发布全部自动完成**——这就是持续部署最直观的体验。

## 思路：push 触发，构建后部署 Pages

博客仓库的工作流可以设计为：

```
本地：git add + commit + push（Markdown 源文件）
  ↓ 触发 workflow
runner：装 Node → npm ci → hexo generate（生成 public/）
  ↓
部署到 GitHub Pages（站点上线）
```

对比之前的做法：**本地不再需要 Node 环境和 hexo 依赖**，只要能 `git push` 就行；构建在云端干净的 runner 上完成，环境问题从源头消失。而且多人协作时，谁都可以发文章，不依赖某一台电脑。

## 完整 workflow

```yaml
name: Deploy Blog

on:
  push:
    branches:
      - main
  workflow_dispatch:        # 手动触发按钮

permissions:
  contents: read
  pages: write
  id-token: write           # Pages 部署需要的 OIDC 令牌

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # 拉全量历史（hexo 文章按 git 历史排序时需要）

      - name: 安装 Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: 安装依赖
        run: npm ci

      - name: 生成静态站点
        run: npm run build      # hexo generate

      - name: 上传构建产物
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: 部署到 GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

对比传统的 hexo-deployer-git 方案，这套用的是 GitHub 官方的 Pages Action，有几个优势：

- **不再需要单独的 deploy token**：`pages: write` + `id-token: write` 用 OIDC 临时令牌部署，比配置一个长期有效的 GitHub Token 更安全，也不用担心 token 过期；
- **部署可回滚**：Pages 部署历史里有每次版本，出问题能快速回到上一版；
- **不用维护 gh-pages 分支**：部署产物由 Actions 托管。

## 仓库与 Pages 的配套设置

要让这个 workflow 跑通，Pages 的部署源要改成 GitHub Actions：

1. 仓库 Settings → Pages → **Build and deployment 的 Source 选 "GitHub Actions"**；
2. 仓库需要有内容能触发首次部署（workflow 文件本身提交后即可手动触发一次）；
3. 站点域名是 `https://<用户名>.github.io/<仓库名>/`（如果仓库名就是 `<用户名>.github.io`，则是根域名）。

**注意根路径问题**：如果博客部署在子路径（不是用户主页仓库），`_config.yml` 里的 `url` 和 `root` 要配置成对应路径，否则生成出来的链接会 404——这是子路径 Pages 站点最常见的坑。

## 本地仍想预览怎么办

有人会担心：全自动部署之后，本地还能不能预览？

完全可以——**发布走 Actions，预览走本地**，两者不冲突：

```bash
npm install        # 本地装依赖（或复用已有的 node_modules）
npx hexo server    # 本地预览 http://localhost:4000
```

写文章时的流程建议：

1. 本地 `npx hexo server` 实时预览效果；
2. 满意后 `git add`、`git commit`；
3. `git push` —— 剩下的交给 Actions；
4. 到仓库 Actions 页签看部署进度，一两分钟后站点更新。

## 这条流水线还能扩展什么

博客是最简单的静态站，但它演示的流水线形态可以迁移到更复杂的项目：

- **加 CI 步骤**：发布前先跑 Markdown lint（检查链接、front-matter 格式），坏文章进不了线上；
- **多环境**：main 分支部署正式站，其他分支部署 preview 站（`deploy-pages` 的 preview 模式）；
- **接图片优化**：构建后跑一遍图片压缩再上传，站点体积更小。

本质没变——**任何"源文件 → 构建 → 发布"的过程，都能用同一套模式自动化**。博客只是最容易上手、最有成就感的第一个例子。

## 小结

Hexo 自动发布流水线的核心就三件事：push 触发、云端构建生成 public/、官方 Pages Action 部署。从此发文章 = git push，换电脑也能发。GitHub Actions 六篇到此讲完——从最小 workflow 到触发编排、缓存、密钥、镜像流水线再到这个实战，一条完整的 CI/CD 能力线已经打通。下一篇进入一个新领域：服务上线之后怎么知道它健不健康？可观测性系列开始。
