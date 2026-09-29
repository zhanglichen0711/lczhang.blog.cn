---
title: "React 简介"
date: 2025-01-30
categories:
  - [前端交互, React]
tags: [React, 简介]
description: "React 是由 Facebook（现 Meta）开发并于 2013 年开源的 JavaScript 库"
abbrlink: 3435504910
---

React 是由 Facebook（现 Meta）开发并于 2013 年开源的 JavaScript 库，专门用于构建用户界面，特别是单页应用程序（SPA）。

React 允许开发者使用声明式的方式来构建可复用的 UI 组件。

### React 的定位

- **不是框架，而是库**：React 专注于视图层（MVC 中的 V），不像 Angular 那样提供完整的框架解决方案
- **组件化思想**：将 UI 拆分成独立、可复用的组件
- **JavaScript 为中心**：一切皆 JavaScript，包括结构、样式和逻辑

------

## React 的核心特点

### 1. 声明式编程（Declarative）

**传统命令式编程**：告诉计算机怎么做

```
// 原生 JavaScript（命令式）
const button = document.getElementById('myButton');
button.addEventListener('click', function() {
  const counter = document.getElementById('counter');
  const currentValue = parseInt(counter.textContent);
  counter.textContent = currentValue + 1;
});
```

**React 声明式编程**：告诉计算机要什么结果

```
// React（声明式）
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**优势**：

- 代码更简洁直观
- 更容易理解和维护
- 减少手动操作 DOM 的错误
- 状态和 UI 保持同步

### 2. 组件化（Component-Based）

React 的核心是组件化思维，把 UI 拆成独立、可复用、可组合的组件，就像搭积木一样，每个组件只关心自己的状态（state）和属性（props），逻辑清晰、易于维护。

React 应用由一个个独立的组件构成，每个组件：

- 封装了自己的结构、样式和逻辑
- 可以接收输入（props）
- 可以维护内部状态（state）
- 可以被复用和组合

```python
// 一个简单的组件
function Welcome({ name }) {
  return <h1>Hello, {name}!</h1>;
}

// 组件的复用和组合
function App() {
  return (
    <div>
      <Welcome name="Alice" />
      <Welcome name="Bob" />
      <Welcome name="Charlie" />
    </div>
  );
}
```

**组件化的优势**：

- **复用性**：同一组件可在多处使用
- **可维护性**：修改组件不影响其他部分
- **可测试性**：独立组件易于单元测试
- **协作性**：团队成员可并行开发不同组件

### 3. 虚拟 DOM（Virtual DOM）

#### 什么是虚拟 DOM？

虚拟 DOM 是真实 DOM 的 JavaScript 对象表示，是一个轻量级的内存中的数据结构。

#### 工作原理：

```
1. 状态改变
   ↓
2. 生成新的虚拟 DOM 树
   ↓
3. 与旧虚拟 DOM 树进行对比（Diffing）
   ↓
4. 计算出最小差异（Reconciliation）
   ↓
5. 只更新真实 DOM 中变化的部分
```

- Virtual DOM 是浏览器 DOM 的一个轻量级 JavaScript 对象表示。
- 当状态发生变化时，框架（如 React）会先在 Virtual DOM 中进行计算和比较（diff 算法）。
- 然后通过 patch 过程，只将最小必要的更新应用到 Real DOM 上。

#### 为什么需要虚拟 DOM？

真实 DOM 操作的问题：

- DOM 操作非常慢（相比 JavaScript 运算）
- 频繁的 DOM 操作会导致页面重排和重绘
- 直接操作 DOM 容易出错

虚拟 DOM 的优势：

- **性能优化**：批量更新，减少真实 DOM 操作次数
- **跨平台**：虚拟 DOM 可以渲染到不同平台（Web、移动端、桌面）
- **声明式**：开发者只需关心状态，不用手动操作 DOM

#### 示例对比：

```
// 假设要更新 1000 个列表项
const items = Array(1000).fill(0).map((_, i) => i);

// 传统方式：每次都操作真实 DOM（慢）
items.forEach(item => {
  const li = document.createElement('li');
  li.textContent = item;
  ul.appendChild(li); // 1000 次 DOM 操作
});

// React 方式：通过虚拟 DOM 批量更新
function ItemList() {
  return (
    <ul>
      {items.map(item => <li key={item}>{item}</li>)}
    </ul>
  );
}
// React 会智能地批量更新 DOM
```

### 4. 单向数据流（Unidirectional Data Flow）

React 的数据是单向向下流的，Parent (父) → Child (子)，Child 不能反向到 Parent：

React 采用自顶向下的数据流动方式：

```
父组件
  ↓ (props)
子组件
  ↓ (props)
孙组件
```

**特点**：

- 数据从父组件流向子组件
- 子组件通过回调函数向父组件通信
- 数据流向清晰，便于追踪和调试

```python
function Parent() {
  const [message, setMessage] = useState('Hello');
  
  return (
    <Child 
      message={message}  // 数据向下传递
      onUpdate={setMessage}  // 通过回调向上通信
    />
  );
}

function Child({ message, onUpdate }) {
  return (
    <div>
      <p>{message}</p>
      <button onClick={() => onUpdate('Updated!')}>
        Update
      </button>
    </div>
  );
}
```

## React 的主要优势

### 1. 学习曲线相对平缓

- 核心 API 较少
- 主要使用 JavaScript 知识
- 概念清晰，文档完善

### 2. 强大的生态系统

- **路由**：React Router
- **状态管理**：Redux, Zustand, Jotai
- **UI 库**：Material-UI, Ant Design, Chakra UI
- **工具链**：Create React App, Vite, Next.js

### 3. 广泛的社区支持

- GitHub 上最受欢迎的前端库之一
- 大量的第三方组件和工具
- 活跃的社区和丰富的学习资源

### 4. 性能优异

- 虚拟 DOM 优化
- 按需渲染
- 代码分割和懒加载支持

### 5. 跨平台能力

- **React Native**：开发移动应用
- **React Native for Windows**：桌面应用
- **React 360**：VR 应用

### 6. 企业级应用支持

被众多知名公司使用：

- Facebook/Meta
- Instagram
- Netflix
- Airbnb
- Uber
- 腾讯、阿里巴巴等

------

## React 的适用场景

### 适合使用 React 的场景：

- 单页应用（SPA）
- 需要频繁更新的动态界面
- 复杂的交互式 UI
- 需要组件复用的大型项目
- 需要跨平台开发的应用

### 不太适合的场景：

- 简单的静态网站（可能过度设计）
- SEO 要求极高的网站（需配合 Next.js 等 SSR 方案）
- 团队对 JavaScript 不熟悉

------

## React 与其他框架的对比

| 特性       | React    | Vue        | Angular      |
| :--------- | :------- | :--------- | :----------- |
| 类型       | 库       | 渐进式框架 | 完整框架     |
| 学习曲线   | 中等     | 较平缓     | 较陡峭       |
| 灵活性     | 高       | 中         | 低（约定多） |
| 生态系统   | 非常丰富 | 丰富       | 完整集成     |
| 企业支持   | Meta     | 独立       | Google       |
| TypeScript | 支持良好 | 支持良好   | 原生支持     |

------

## React 的发展历程

- **2013**：React 开源
- **2015**：React Native 发布
- **2016**：React 16（Fiber 架构）
- **2019**：React Hooks 正式发布
- **2020**：并发模式实验版
- **2022**：React 18（并发渲染）
- **2024-2025**：React Compiler、Server Components 等新特性