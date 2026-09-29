# 小黑程序员

Eason 的个人博客骨架：Hexo 7 + 自研主题 `xiaohei`。  
定位：**小黑程序员 · AI 大模型应用开发**。英文名：**Eason**。签名：**Split the model. Ship the system.**

推荐 GitHub 仓库名：`zhanglichen0711.github.io`  
站点地址：`https://zhanglichen0711.github.io`

## 本地预览

需要 Node.js 18+。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:4000`。

## 日常更新

1. 学习笔记放到 `source/_posts/notes/`
2. 行业思考放到 `source/_posts/thoughts/`
3. 文首 front-matter 按现有文章抄一份：

```markdown
---
title: 标题
date: 2026-08-26
categories: 学习笔记
tags: [RAG, Milvus]
description: 一句话摘要，会出现在首页和搜索里
---
```

`categories` 只用这两个：`学习笔记` 或 `行业思考`。  
标签用具体技术：`Python` `MySQL` `Redis` `Milvus` `RAG` `Agent` `行业动态` `岗位趋势` `如何学习`。

然后：

```bash
npx hexo new post notes/标题也可以
# 或直接新建 md
npm run dev
```

## 部署到 GitHub Pages

1. 在 GitHub 建仓库 `zhanglichen0711.github.io`（Public）
2. 本机配置 SSH key
3. 确认根目录 `_config.yml` 里：

```yaml
url: https://zhanglichen0711.github.io
root: /
deploy:
  type: git
  repo: git@github.com:zhanglichen0711/zhanglichen0711.github.io.git
  branch: main
```

4. 执行 `npm run deploy`

若仓库不是用户站而是普通项目仓库，把 `url` 改成 `https://zhanglichen0711.github.io/仓库名`，`root` 改成 `/仓库名/`。

也可以不用 `hexo-deployer-git`，改成 GitHub Actions：把 `hexo generate` 的 `public/` 推到 `gh-pages` 或仓库根目录。

## 必须替换的资源

| 文件 | 说明 |
| --- | --- |
| `source/img/wechat-qr.jpg` | 换成你的微信二维码，顶栏按钮会弹出它 |
| `source/img/avatar.jpg` | 已放动漫程序员头像，可再换 |
| `source/img/cover.jpg` | 首页封面，可再换 |
| `themes/xiaohei/_config.yml` 里的 Giscus 字段 | 评论开通后填写 |

头像、封面、占位二维码已经生成在 `source/img/`。

## 开通 Giscus 评论

1. 仓库 Settings → Features 打开 Discussions
2. 打开 [https://giscus.app/zh-CN](https://giscus.app/zh-CN)
3. 安装 Giscus GitHub App，选这个博客仓库
4. 把页面给出的 `repo`、`repo_id`、`category`、`category_id` 填进 `themes/xiaohei/_config.yml`
5. 重新 `hexo g` / `deploy`

没填 id 之前，评论区会是空的，不影响其它功能。

## 主题改哪里

- 站点名、作者、部署：根目录 `_config.yml`
- 菜单、签名、社交、Giscus：`themes/xiaohei/_config.yml`
- 颜色和排版：`themes/xiaohei/source/css/style.css`
- 关于页 / 友链：`source/about/index.md`、`source/links/index.md`

深浅色按钮写在顶栏，选择存在 `localStorage`，并跟随系统偏好作为默认值。

## 已实现功能

- 极简白 + 终端感深色，一键切换
- 站内搜索（`search.json`）
- 文章阅读进度
- 右侧目录
- 同标签相关笔记
- Giscus 评论位
- 关于页、友链、Atom 订阅
- 微信二维码按钮

## 目录

```
xiaohei-blog/
  _config.yml
  package.json
  source/
    _posts/notes|thoughts/
    about/ links/ img/
  themes/xiaohei/
    layout/ source/ scripts/ _config.yml
```
