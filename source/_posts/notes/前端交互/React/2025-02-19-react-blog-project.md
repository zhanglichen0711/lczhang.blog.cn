---
title: "React 博客项目"
date: 2025-02-19
categories:
  - [前端交互, React]
tags: [React, 实战]
description: "本章带你从零开始，用 Vite 创建一个 React 博客项目，并理解 JSX 语法和项目结构。"
abbrlink: 1139111529
---

本章带你从零开始，用 Vite 创建一个 React 博客项目，并理解 JSX 语法和项目结构。

------

## 环境准备

在开始之前，确保电脑上已安装 Node.js（建议 v16 以上）。

Node.js 是 JavaScript 的运行时环境，npm 是其自带的包管理器。

### 检查 Node.js 是否已安装

```
$ node -v
v20.10.0
```

如果显示版本号，说明已安装。

如果没有，去 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装。

------

## 创建 React 项目

Vite 是目前最快的前端构建工具之一，对 React 有原生支持。

在终端中进入你想存放项目的目录，执行：

```
$ npm create vite@latest blog-app -- --template react
```

这条命令告诉 Vite：创建一个名为 blog-app 的项目，使用 React 模板。

进入项目目录，安装依赖，启动开发服务器：

```
$ cd blog-app
$ npm install
$ npm run dev
```

浏览器会自动打开 http://localhost:5173，看到 Vite + React 的默认欢迎页面，说明项目启动成功。

> 如果启动时报错提示缺少依赖，可以尝试执行 `npm install` 后重新运行。

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
│   ├── main.jsx            # JS 入口，将 React 组件挂载到 DOM
│   ├── App.jsx             # 根组件，所有页面的外壳
│   ├── App.css             # App 组件的样式
│   ├── index.css           # 全局样式
│   └── assets/             # 需要编译的静态资源（图片等）
```

### 核心文件作用

**index.html** — 浏览器访问的入口文件。

里面有一个 `<div id="root"></div>`，React 应用就挂载到这个 div 上。

**src/main.jsx** — React 应用的启动文件。

它负责找到 `#root` 元素，然后用 `createRoot` 把 `<App />` 组件渲染进去。

```python
// 文件路径：src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 找到 HTML 中的 <div id="root"></div>
// 用 createRoot 创建一个 React 根节点，然后把 <App /> 渲染进去
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**src/App.jsx** — 根组件。

它是所有页面的最外层容器，返回的 JSX 会被渲染到页面上。

> `<React.StrictMode>` 是 React 的严格模式，仅在开发环境生效。它会对组件进行额外检查（如重复渲染），帮你发现潜在问题。生产构建时自动忽略。

------

## JSX 是什么？

**JSX** 是 JavaScript 的语法扩展，让你可以在 JS 中写类似 HTML 的代码。

React 组件本质上就是一个返回 JSX 的函数。

### JSX 与 HTML 的关键区别

| 场景           | HTML                 | JSX                        |
| :------------- | :------------------- | :------------------------- |
| class 属性     | `class="container"`  | `className="container"`    |
| 自闭合标签     | `<img src="...">`    | `<img src="..." />`        |
| 嵌入 JS 表达式 | 不支持               | `<h1>{title}</h1>`         |
| style 属性     | `style="color: red"` | `style={% raw %}{{ color: 'red' }}{% endraw %}` |
| 注释           | `<!-- 注释 -->`      | `{/* 注释 */}`             |
| 事件绑定       | `onclick="fn()"`     | `onClick={fn}`             |

> 为什么用 `className` 而不是 `class`？因为 JSX 本质是 JavaScript，而 `class` 是 JS 的保留关键字。同理，`for` 改为 `htmlFor`。

```python
// JSX 就是 return 后面的这段类 HTML 代码
function Greeting() {
  const name = 'RUNOOB'
  const isLoggedIn = true

  return (
    <div className="greeting">
      {/* JSX 注释：花括号内放任何 JS 表达式 */}
      <h1>Hello, {name}!</h1>
      <p>当前时间：{new Date().toLocaleDateString()}</p>
      {isLoggedIn && <p>欢迎回来！</p>}
    </div>
  )
}
```

记住核心规则：**JSX 中花括号里可以放任何 JS 表达式**——变量、函数调用、三元运算、数组 map 都行。

------

## React 组件 = 函数

React 函数组件的本质是：**一个函数，接收 props 作为参数，返回一段 JSX**。

```python
// 定义一个组件：就是一个返回 JSX 的函数
// 组件名必须大写字母开头
function BlogHeader() {
  return (
    <header>
      <h1>RUNOOB Blog</h1>
    </header>
  )
}

// 使用组件：像 HTML 标签一样写，自闭合或成对都可以
function App() {
  return (
    <div>
      <BlogHeader />
      <main>
        <p>博客内容将在这里展示</p>
      </main>
    </div>
  )
}

export default App
```

> 组件名必须**大写字母开头**。小写开头会被 React 当成普通 HTML 标签（div、span 等），大写开头才会被当做自定义组件处理。

------

## 动手：清空模板，写出博客骨架

把默认生成的 App.jsx 和 App.css 内容清掉，换成博客的基础结构。

```python
// 文件路径：src/App.jsx
import './App.css'

function App() {
  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <header className="navbar">
        <h1 className="logo">RUNOOB Blog</h1>
        <nav>
          <a href="/">首页</a>
          <a href="#">关于</a>
        </nav>
      </header>

      {/* 主内容区 */}
      <main className="container">
        <p>博客内容将在这里展示</p>
      </main>

      {/* 页脚 */}
      <footer className="footer">
        <p>© 2024 RUNOOB Blog. Powered by React.</p>
      </footer>
    </div>
  )
}

export default App

/* 文件路径：src/App.css */
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

.logo {
  font-size: 24px;
  color: #61dafb;
}

.navbar nav a {
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
```

保存后，浏览器会自动刷新，你会看到一个干净的博客骨架：顶部导航栏 + 中间内容区 + 底部页脚。

------

## 本章小结

本章你完成了三件事：用 Vite 创建了 React 项目、理解了 JSX 与 HTML 的关键区别、写出了博客的基础 JSX 骨架。

核心收获：React 组件就是返回 JSX 的函数，JSX 中花括号可以嵌入任何 JS 表达式。