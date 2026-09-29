---
title: "React 教程"
date: 2025-01-24
categories:
  - [前端交互, React]
tags: [React, 教程]
description: "React 是一个用于构建用户界面的 JAVASCRIPT 库。"
abbrlink: 2681215202
---

React 是一个用于构建用户界面的 JAVASCRIPT 库。

React 主要用于构建 UI，很多人认为 React 是 MVC 中的 V（视图）。

React 起源于 Facebook 的内部项目，用来架设 Instagram 的网站，并于 2013 年 5 月开源。

React 拥有较高的性能，代码逻辑非常简单，越来越多的人已开始关注和使用它。

------

## React 特点

- **1.声明式设计** −React采用声明范式，可以轻松描述应用。
- **2.高效** −React通过对DOM的模拟，最大限度地减少与DOM的交互。
- **3.灵活** −React可以与已知的库或框架很好地配合。
- **4.JSX** − JSX 是 JavaScript 语法的扩展。React 开发不一定使用 JSX ，但我们建议使用它。
- **5.组件** − 通过 React 构建组件，使得代码更加容易得到复用，能够很好的应用在大项目的开发中。
- **6.单向响应的数据流** − React 实现了单向响应的数据流，从而减少了重复代码，这也是它为什么比传统数据绑定更简单。

## React 实例

```python
<div id="example"></div>
<script type="text/babel">
// 简单的 React 组件
function App() {
    return <h1>Hello, React!</h1>;
}
 
const root = ReactDOM.createRoot(document.getElementById("example"));
// 渲染 React 组件到 DOM
root.render(<App />);
</script>
```

**引入外部脚本：**

```
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js" ></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js" ></script>
```

这三行代码分别引入了 React、ReactDOM 和 Babel Standalone 库。

- React 用于构建用户界面。
- ReactDOM 用于在浏览器中渲染 React 组件。
- Babel Standalone 用于在浏览器中即时编译 JSX 语法。

或者使用 create-react-app 工具（下一章节会介绍）创建的 react 开发环境：

```python
import React from "react";
import ReactDOM from "react-dom/client";

function Hello(props) {
  return <h1>Hello World!</h1>;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Hello />);
```

这时候浏览器打开 **http://localhost:3000/** 就会输出：

```
Hello World!
```

------

## 参考资料

- React 官网：https://react.dev/
- React 中文文档：https://zh-hans.react.dev/
- React Github 源码：https://github.com/facebook/react