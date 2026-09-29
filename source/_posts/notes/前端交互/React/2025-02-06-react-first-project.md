---
title: "React 创建第一个项目"
date: 2025-02-06
categories:
  - [前端交互, React]
tags: [React, 项目]
description: "在开始之前，你需要确保已经安装了以下工具："
abbrlink: 1992739907
---

在开始之前，你需要确保已经安装了以下工具：

Node.js 和 npm（Node 包管理器）：React 项目依赖于 Node.js 和 npm 来管理依赖和启动开发服务器。

你可以通过以下命令检查版本，确保已经安装成功：

```
node -v
npm -v
```

代码编辑器推荐使用 VS Code。

### 使用 Vite 创建项目

Vite 是当前 React 官方推荐的首选工具，比传统的 Create React App 更快、更轻量、开发体验更好。

使用 npm 安装：

```
npm create vite@latest my-first-react-app -- --template react
```

提示选项，按默认的回车就好：

命令解释：

- `create vite@latest`：使用最新版 Vite 创建工具。
- `my-first-react-app`：你的项目名称（小写字母 + 连字符推荐）。
- `-- --template react`：指定 React 模板。

**交互过程**（会提示选择）：

- 项目名称：直接回车确认或修改。
- 选择框架：选择 **React**。
- 选择变体：
  - **JavaScript**（推荐入门，先用纯 JS）。
  - **TypeScript**（进阶推荐，类型安全更好，后续可切换）。

我们这里选择 **JavaScript**。

等待几秒钟，项目骨架就创建好了！

### 安装依赖并启动项目

进入项目目录 **cd my-first-react-app**，安装依赖：

```
npm install
```

启动开发服务器：

```
npm run dev
```

浏览器会自动打开 http://localhost:5173（Vite 默认端口）。

你会看到一个欢迎页面，带有 Vite + React 的 Logo 和计数器示例，这就是你的第一个 React 应用在运行！

![image-20260905223332216](E:\blog_hexo\xiaohei-blog\source\img\image-20260905223332216.png)

热模块替换（HMR）体验：修改任何代码（后面会教），保存后页面自动更新，无需刷新！这就是 Vite 的魔法。

### 使用 Create React App 创建项目

Create React App 是一个官方支持的脚手架工具，可以帮助你快速创建一个新的 React 项目。

在终端或命令提示符中，运行以下命令来全局安装 Create React App：

```
npm install -g create-react-app
```

然后，使用 Create React App 创建一个新的项目。假设你的项目名为 my-app：

```
npx create-react-app my-app
```

npx 是 npm 5.2+ 版本自带的一个工具，用于运行本地或远程的 npm 包。

执行成功后，会输出以下内容：

```
The directory my-app contains files that could conflict:

  node_modules/
  package-lock.json
  package.json
  public/
  src/

Either try using a new directory name, or remove the files listed above.
```

项目的目录结构如下：

```
my-app/
├── node_modules/           # 项目依赖库
├── public/                 # 存放静态文件
│   ├── index.html          # 应用的 HTML 模板文件
│   ├── favicon.ico         # 浏览器图标
├── src/                    # 存放源代码
│   ├── App.css             # 样式文件
│   ├── App.js              # 主要的 React 组件
│   ├── index.css           # 全局样式
│   ├── index.js            # React 入口文件
├── package.json            # 配置信息和依赖列表
└── .gitignore              # Git 忽略文件
```

App.js 是主组件文件，定义了一个基础的 React 组件，后期主要改这个文件。

创建项目后，进入项目目录：

```
cd my-app
```

在项目目录中，运行以下命令来启动开发服务器：

```
npm start
```

这将启动一个本地开发服务器，并自动在浏览器中打开 http://localhost:3000。你应该会看到一个 React 的欢迎页面。

## 项目中的关键文件

**`public/index.html`**： 这是项目的 HTML 模板文件。React 会把所有的组件渲染到这里的 `<div id="root"></div>` 中。

**`src/index.js`**： 这是 React 应用的入口文件。它是应用的启动点，通常在这里调用 `ReactDOM.render` 将组件渲染到页面的根节点。

```python
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
```



**`src/App.js`**： 这是默认的根组件，你可以在这里编写自己的代码，构建 UI。

```python
import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1>Hello, React!</h1>
    </div>
  );
}

export default App;
```

**说明：**

- **`import React from 'react';`**: 导入了 React 库，React 是一个用于构建用户界面的 JavaScript 库。
- **`import './App.css';`**: 导入了与当前组件相关的 CSS 文件 `App.css`。
- **`function App() { ... }`**: 这是一个函数组件。函数组件是一个返回 JSX 的 JavaScript 函数。
- **`return (...)`**: 组件的 `return` 语句返回一个 JSX 元素。JSX 是 JavaScript 的语法扩展，允许你在 JavaScript 中编写类似 HTML 的代码。

------

## 修改 App.js 来创建自己的组件

让我们稍微修改 App.js 来展示一个简单的组件，并理解 React 组件的基本构建方式。

1、打开 src/App.js，找到默认代码并进行修改：

```python
import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1>我的第一个 React App!</h1>
      <p>这是一个段落。</p>
    </div>
  );
}

export default App;
```

保存文件后，浏览器会自动刷新并显示你修改后的内容。

## 使用 JSX 语法创建组件

React 组件使用 JSX（JavaScript XML）语法来描述界面结构。

JSX 看起来像 HTML，但它是 JavaScript 的一部分，允许你在组件中直接编写 HTML 标签。

例如，你可以这样创建一个显示个人信息的组件，在 src 目录创建 UserProfile.js 文件，内容如下：

```python
import React from 'react';

function UserProfile() {
  const user = {
    name: 'RUNOOB',
    age: 25,
    location: '中国',
  };

  return (
    <div>
      <h2>{user.name}</h2>
      <p>Age: {user.age}</p>
      <p>Location: {user.location}</p>
    </div>
  );
}

export default UserProfile;
```

然后在 App.js 中使用 UserProfile 组件：

```python
import React from 'react';
import './App.css';
import UserProfile from './UserProfile'; // 引入组件

function App() {
  return (
    <div className="App">
      <h1>我的第一个 React App!</h1>
      <UserProfile />
    </div>
  );
}

export default App;
```

保存文件后，浏览器会自动刷新并显示你修改后的内容。

## 样式与样式文件

React 默认支持 CSS 文件，你可以通过 import './App.css'; 引入样式表来调整应用的外观。

我们也可以使用 CSS 模块 来局部应用样式，或者使用 styled-components 等库进行样式的模块化。

------

## 使用 State 和事件处理

在 React 中，组件可以拥有 state（状态），用于存储和更新组件的数据。

我们可以使用 useState Hook 来定义和更新状态。

例如，我们可以创建一个按钮，点击时更新计数，修改文件， App.js 代码如下，：

```python
import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
  };

  return (
    <div className="App">
      <h1>Click count: {count}</h1>
      <button onClick={handleClick}>Increase</button>
    </div>
  );
}

export default App;
```

