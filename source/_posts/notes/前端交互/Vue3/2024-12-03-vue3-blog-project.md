---
title: "Vue3 博客项目"
date: 2024-12-03
categories:
  - [前端交互, Vue3]
tags: [Vue3, 实战]
description: "本章带你从零开始，用 Vite 创建一个 Vue3 博客项目，并理解项目里每个文件的作用。"
abbrlink: 572196027
---

本章带你从零开始，用 Vite 创建一个 Vue3 博客项目，并理解项目里每个文件的作用。

------

## 环境准备

在开始之前，需要确保电脑上已经安装了 Node.js。

Node.js 是 JavaScript 的运行时环境，它让我们可以在浏览器之外运行 JS 代码。

Vue3 的开发工具链（Vite、npm）都依赖 Node.js。

### 检查 Node.js 是否已安装

打开终端（Windows 用 CMD 或 PowerShell，Mac 用终端），输入以下命令：

```
$ node -v
v20.10.0
```

如果显示版本号（建议 v16 以上），说明已安装。

如果没有，去 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装即可。

> 安装 Node.js 时会自动附带 npm（Node 包管理器）。
>
> 验证命令：
>
> ```
> npm -v
> ```

------

## 创建 Vue3 项目

Vue 官方推荐使用 **create-vue** 脚手架工具来初始化项目。

在终端中进入你想存放项目的目录，执行：

```
npm create vue@latest blog-app
```

执行后会出现一系列选项，按以下方式选择：

| 选项             | 选择 | 说明               |
| :--------------- | :--- | :----------------- |
| Add TypeScript?  | No   | 初学者先用纯 JS    |
| Add JSX Support? | No   | 模板语法更直观     |
| Add Vue Router?  | Yes  | 后面会用到路由     |
| Add Pinia?       | Yes  | 状态管理，后续会用 |
| Add Vitest?      | No   | 暂不需要测试       |
| Add ESLint?      | No   | 初学者暂时不用     |

选择完成后，按提示依次执行：

```
$ cd blog-app
$ npm install
$ npm run dev
```

此时浏览器会自动打开 http://localhost:5173，看到 Vue 的默认欢迎页面，说明项目启动成功。

> `npm install` 会根据 package.json 下载所有依赖包到 node_modules 目录，这一步需要联网，首次执行可能需要几分钟。

------

## 项目目录结构详解

打开 blog-app 文件夹，你会看到以下结构：

```
blog-app/
├── index.html              # 入口 HTML 文件
├── package.json            # 项目配置与依赖列表
├── vite.config.js          # Vite 构建工具配置
├── public/                 # 不经过编译的静态资源
├── src/
│   ├── main.js             # JS 入口，创建并挂载 Vue 应用
│   ├── App.vue             # 根组件，所有页面的外壳
│   ├── assets/             # 需要编译的静态资源（CSS、图片）
│   ├── components/         # 可复用的 Vue 组件
│   ├── views/              # 页面级组件（路由对应的页面）
│   ├── router/             # 路由配置
│   └── stores/             # Pinia 状态管理
```

### 核心文件作用

**index.html** — 浏览器访问的入口文件。

Vite 会自动将 src/main.js 注入到这个文件中，你不需要手动引入任何 JS。

**src/main.js** — Vue 应用的启动文件。

它负责创建 Vue 应用实例、注册插件（路由、状态管理）、并将应用挂载到 HTML 页面上。

**src/App.vue** — 根组件。

它是所有页面的最外层容器，通常包含导航栏、页脚和路由出口。

------

## 单文件组件（SFC）

Vue 中每个 `.vue` 文件称为一个「单文件组件」（Single File Component）。

它把同一个组件的模板、逻辑和样式封装在一起，一个文件就是一个独立的功能单元。

### SFC 三段式结构

```html
<script setup>
// 第三部分：逻辑 — 在这里写 JS
const message = 'Hello Vue3!'
</script>

<template>
  <!-- 第一部分：模板 — 在这里写 HTML -->
  <h1>{{ message }}</h1>
</template>

<style scoped>
/* 第二部分：样式 — 在这里写 CSS */
h1 {
  color: #42b883;
}
</style>
```

这三个标签的顺序可以任意排列，但业界习惯是：**script → template → style**。

| 区块             | 作用                       | 一句话理解       |
| :--------------- | :------------------------- | :--------------- |
| `<script setup>` | 写 JS 逻辑、定义数据和方法 | 控制组件做什么   |
| `<template>`     | 写 HTML 结构、绑定数据     | 控制组件长什么样 |
| `<style scoped>` | 写 CSS 样式                | 控制组件好不好看 |

> `scoped` 属性让当前组件的样式只作用于自身，不会污染其他组件。这是 Vue 单文件组件的核心特性之一。

------

## 模板语法 vs JSX

Vue 默认使用 **模板语法** 来编写界面。

模板语法就是写在 `<template>` 中的、带 Vue 特殊指令的 HTML。

| 特性       | 模板语法          | JSX                     |
| :--------- | :---------------- | :---------------------- |
| 语法形式   | HTML + Vue 指令   | JavaScript 中写类 HTML  |
| 学习成本   | 低，接近原生 HTML | 需要理解 JSX 编译机制   |
| 灵活性     | 中，声明式        | 高，可以用 JS 任意操作  |
| Vue 推荐度 | 默认推荐          | 可选支持                |
| 适用场景   | 绝大多数页面开发  | 需要复杂逻辑动态生成 UI |

本教程全部使用模板语法，因为它是 Vue 最自然、最适合初学者的写法。

------

## 动手：清空模板，写出博客骨架

现在把默认生成的 App.vue 内容清空，换成我们博客的基础骨架。

```html
<script setup>
// 后续会在这里添加逻辑
</script>

<template>
  <div id="app">
    <!-- 顶部导航栏 -->
    <header class="navbar">
      <h1>My Blog</h1>
      <nav>
        <a href="/">首页</a>
        <a href="#">关于</a>
      </nav>
    </header>

    <!-- 主内容区 -->
    <main class="container">
      <p>博客内容将在这里展示</p>
    </main>

    <!-- 页脚 -->
    <footer class="footer">
      <p>© 2024 My Blog. Powered by Vue3.</p>
    </footer>
  </div>
</template>

<style>
/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}

/* 导航栏 */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 40px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.navbar h1 {
  font-size: 24px;
  color: #42b883;
}

.navbar a {
  margin-left: 20px;
  text-decoration: none;
  color: #333;
}

/* 主内容区 */
.container {
  max-width: 960px;
  margin: 40px auto;
  padding: 0 20px;
}

/* 页脚 */
.footer {
  text-align: center;
  padding: 20px;
  color: #999;
  border-top: 1px solid #eee;
}
</style>
```

保存后，浏览器会自动刷新，你会看到一个干净的博客骨架：顶部导航栏 + 中间内容区 + 底部页脚。

这就是我们后续所有章节的起点。

------

## 本章小结

本章你完成了三件事：用 Vite 创建了 Vue3 项目、理解了目录结构和 SFC 三段式、写出了博客的基础 HTML 骨架。

核心收获：知道一个 `.vue` 文件由 template / script / style 三部分组成，以及如何让 Vue 项目跑起来。