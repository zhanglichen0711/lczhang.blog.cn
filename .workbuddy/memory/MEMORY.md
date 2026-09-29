# xiaohei-blog 项目长期约定

Hexo 博客（主题 `themes/xiaohei`，自建文档站布局），作者 zhanglichen。

## 目录与分类层级

`source/_posts/{板块}/{一级分类}/{二级分类}/{文章}.md`

- 板块只有两个：`notes`（技术笔记）、`thoughts`（行业思考）。由主题 `scripts/sections.js` 按 `_posts/` 的一级子目录识别，生成 `/notes/` 与 `/thoughts/` 两个板块页。
- `notes`：一级分类用中文（如「大模型应用」），二级分类用英文（如 `RAG`、`Deep-Learning`）。目前 **只有两级目录，没有第三级**。
- `thoughts`：**只有一级分类**（行业发展 / 就业趋势 / 如何学习），无二级。

## front-matter 规范

```yaml
---
title: "标题"
date: 2026-09-12
categories:
  - [大模型应用, RAG]
tags: [RAG]
description: "一句话摘要"
abbrlink: 2139012861
---
```

- `categories` 必须用嵌套数组写全层级；thoughts 文章只写一层（`categories:\n  - 如何学习`）。
- `abbrlink` 全站唯一，由 hexo-abbrlink 插件算法生成：**crc32(title) >>> 0**（lib/logic.js 证实，输入是 title 不是 slug），冲突时 +1。批量生成时用插件自带 `node_modules/hexo-abbrlink/lib/crc32` 保证一致，并对全站查重。
- 文件统一 CRLF 换行。
- 文件命名：`YYYY-MM-DD-slug.md`。

## 改分类后的必做动作

新增或改动一级/二级分类时，必须同步 `themes/xiaohei/_config.yml` 的 `sidebar` 配置，否则侧边栏不显示该分类。注意 Hexo 会把二级分类名 slug 化（空格/点转连字符，如 `Node.js` → `Node-js`、`Data Science` → `Data-Science`），sidebar 里的 path 要用 slug 后的形式。

## 文件命名与 abbrlink 稳定性（重要）

`abbrlink` 一旦发布就不应再变——它直接决定文章 URL。因此：

- **禁止用纯数字序号（1.md / 2.md）作为最终文件名**。序号会因插入、排序调整而变动，导致 abbrlink 重算、URL 全变、已有外链和收录失效。
- 推荐命名：`YYYY-MM-DD-英文slug.md`，或草稿阶段用 `01-vue-pinia.md`（数字前缀保留排序意图，slug 保证稳定）。
- 若用户只写正文、由我来编排 front-matter，必须额外拿到「文件 → 二级分类 → 标题」的映射，分类无法从纯数字推断。

## 批量写作分工约定

- 用户负责正文，我负责 front-matter（title/date/categories/tags/description/abbrlink）与文件重命名。
- 日期编排参数需用户给定：起始日期 + 每篇间隔天数（现有占位文章为 2026-09-15 起、每篇 +2 天）。
- 事实性参数（配置项、启动参数、版本号）联网核对后再写，不臆造。

## 构建

`npm run dev`（本地预览）、`npm run build`（生成）、`npm run deploy`（部署到 GitHub Pages）。
站点地址 https://zhanglichen0711.github.io

## Vue 文章 `{{ }}` 与 Nunjucks（重要坑）

- hexo 渲染管线：marked → Nunjucks(hexo tag) → highlight.js。**正文**里出现 `{{ }}` 会让 Nunjucks 报 `unexpected token }}`，构建直接失败。
- 正文的 `{{ }}` 必须包 `{% raw %}{{...}}{% endraw %}`；**代码块内的不用管**（hljs 会转义成 `&#123;&#123;`，页面显示正常）。给代码块加 raw 反而会显示垃圾标签，禁止。
- 从网页复制的代码常见两类损坏：`&nbsp;`(char 160) 混进标识符（如 `<script set up>`，正则用 `/^<script[\s\u00a0]+setup/`）、整段压缩成一整行丢换行 → 需按内容特征重排成多行代码块并补 ```` ```vue ```` 围栏。
- 主题 post.ejs 已渲染 `page.title` 为 `<h1>`，正文不要再以 `# H1` 开头（会重复），用 `##` 起层级。
