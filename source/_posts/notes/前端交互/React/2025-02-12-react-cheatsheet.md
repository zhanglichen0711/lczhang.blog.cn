---
title: "React 参考手册"
date: 2025-02-12
categories:
  - [前端交互, React]
tags: [React, 手册]
description: "React 手册包含了各种核心 API、Hooks、组件生命周期方法等。"
abbrlink: 683979779
---

React 手册包含了各种核心 API、Hooks、组件生命周期方法等。

以下是一份完整的 React 参考手册，内容覆盖从基础到高级的所有核心概念（基于 React 18+ 现代实践，优先函数组件 + Hooks），每个表格包含**概念/语法**、**描述**、**示例代码** 和 **注意事项**。

### 1、JSX 基础

| 概念/语法        | 描述                                           | 示例代码                                                     | 注意事项                            |
| :--------------- | :--------------------------------------------- | :----------------------------------------------------------- | :---------------------------------- |
| JSX 基本结构     | 类似 HTML 的语法，编译为 `React.createElement` | `return <div>Hello</div>;`                                   | 必须有单个根元素，可用 `<></>` 碎片 |
| 表达式嵌入       | 用 `{}` 嵌入 JS 表达式（只能表达式，不能语句） | `<h1>{name.toUpperCase()}</h1>`                              | 支持计算、变量、三元等              |
| 属性绑定         | class → className，for → htmlFor               | `<div className="box" htmlFor="id">`                         | 驼峰命名（如 `tabIndex`）           |
| 自闭合标签       | 所有标签必须闭合                               | `<img src="..." alt="..." />`                                | 无子元素的标签必须自闭合            |
| 条件渲染         | 三元运算符或 `&&`                              | `{isLogin ? <User /> : <Login />}`<br>`{count > 0 && <span>{count}</span>}` | `&&` 用于"存在则渲染"               |
| 列表渲染         | 用 `map()`，必须加 `key`                       | `{items.map(item => <li key={item.id}>{item.name}</li>)}`    | key 必须唯一稳定，避免用 index      |
| 注释             | 用 `{/* */}`                                   | `{/* 这是一个注释 */}`                                       | 放在 JSX 内                         |
| 碎片（Fragment） | 空标签，避免额外 DOM                           | `<><p>1</p><p>2</p></>` 或 `<React.Fragment>`                | 短语法 `<></>` 更常用               |

### 2、 组件基础

| 概念/语法        | 描述                                   | 示例代码                                                     | 注意事项               |
| :--------------- | :------------------------------------- | :----------------------------------------------------------- | :--------------------- |
| 函数组件（推荐） | 首字母大写，返回 JSX                   | `function App() { return <div>Hello</div>; }`                | 现代首选，无 this      |
| 类组件（遗留）   | 使用 `class` 继承 `React.Component`    | `class App extends React.Component { render() { return <div/>; } }` | 仅用于理解旧代码       |
| Props 传递       | 单向数据流，从父传子                   | `<Child name="QiXin" age={25} />`<br>子组件：`function Child({name}) {...}` | 只读，不可修改         |
| 默认 Props       | `defaultProps`（函数组件用参数默认值） | `function Child({name = 'Guest'}) {...}`                     | ES6 默认参数更简洁     |
| Props 类型检查   | PropTypes（或 TypeScript）             | `Child.propTypes = { name: PropTypes.string.isRequired }`    | 开发模式警告，生产移除 |
| 组件组合         | 嵌套、children                         | `<Card><h1>Title</h1></Card>`<br>父：`{props.children}`      | children 是特殊 Prop   |

### 3、状态与 Hooks（核心）

| Hook / 概念 | 描述                             | 示例代码                                                     | 注意事项                   |
| :---------- | :------------------------------- | :----------------------------------------------------------- | :------------------------- |
| useState    | 声明状态变量                     | `const [count, setCount] = useState(0);`<br>`<button onClick={() => setCount(c => c+1)}>` | set 函数式更新避免陈旧状态 |
| useEffect   | 副作用（挂载、更新、清理）       | `useEffect(() => { ... }, [dep]);`<br>返回清理函数           | 空数组 [] 只挂载一次       |
| useRef      | 保存可变值或 DOM 引用            | `const inputRef = useRef(null);`<br>`inputRef.current.focus();` | 不触发重渲染               |
| useContext  | 消费 Context，避免 Prop Drilling | `const theme = useContext(ThemeContext);`                    | 与 Context.Provider 配合   |
| useReducer  | 复杂状态逻辑（类似 Redux）       | `const [state, dispatch] = useReducer(reducer, initial);`    | 用于多相关状态             |
| useMemo     | 缓存计算结果                     | `const memoValue = useMemo(() => compute(), [dep]);`         | 避免昂贵计算重执行         |
| useCallback | 缓存函数引用                     | `const handle = useCallback(() => {...}, [dep]);`            | 优化子组件 Props           |
| 自定义 Hook | 封装可复用逻辑                   | `function useFetch(url) { ... return data; }`                | 以 use 开头                |

### 4、生命周期（类组件 vs Hooks）

| 阶段            | 类组件方法                                          | Hooks 等价                         | 注意事项            |
| :-------------- | :-------------------------------------------------- | :--------------------------------- | :------------------ |
| 挂载（Mount）   | constructor → render → componentDidMount            | useEffect(() => {…}, [])           | 初始化状态/API 调用 |
| 更新（Update）  | shouldComponentUpdate → render → componentDidUpdate | useEffect(() => {…}, [dep]) + memo | 依赖变化触发        |
| 卸载（Unmount） | componentWillUnmount                                | useEffect 返回清理函数             | 清除定时器/订阅     |
| 错误处理        | componentDidCatch                                   | ErrorBoundary 组件                 | Hooks 无直接等价    |

### 5、上下文与全局状态

| 概念        | 描述           | 示例代码                                                     | 注意事项               |
| :---------- | :------------- | :----------------------------------------------------------- | :--------------------- |
| Context API | 全局数据共享   | `const ThemeContext = createContext();`<br>`<Provider value="dark">` | 避免过度使用，性能消耗 |
| useContext  | 在函数组件消费 | `const theme = useContext(ThemeContext);`                    | 简洁替代 Consumer      |

### 6、高级特性（React 18+）

| 概念             | 描述                   | 示例代码                                                  | 注意事项         |
| :--------------- | :--------------------- | :-------------------------------------------------------- | :--------------- |
| Concurrent Mode  | 可中断渲染，提升响应性 | `<React.StrictMode>` + Transitions                        | 自动批处理更新   |
| Suspense         | 懒加载/数据获取等待    | `<Suspense fallback={<Loading/>}><LazyComp /></Suspense>` | 与 lazy 配合     |
| React.lazy       | 代码分割懒加载         | `const Lazy = React.lazy(() => import('./Comp'));`        | 需 Suspense 包裹 |
| startTransition  | 标记非紧急更新         | `startTransition(() => setQuery(e.target.value));`        | 保持 UI 响应性   |
| useDeferredValue | 延迟非紧急值           | `const deferred = useDeferredValue(query);`               | 输入防抖类似     |

### 7、性能优化

| 技巧                  | 描述                         | 示例代码                                          | 注意事项         |
| :-------------------- | :--------------------------- | :------------------------------------------------ | :--------------- |
| React.memo            | 浅比较 Props，避免不必要渲染 | `export default React.memo(Component);`           | 函数组件专用     |
| useMemo / useCallback | 缓存值/函数                  | 如上                                              | 防止子组件重渲染 |
| 键（key）优化         | 稳定唯一 key                 | 如列表渲染                                        | 避免 index       |
| 虚拟列表              | 长列表优化（react-window）   | `<FixedSizeList height={500} itemCount={1000} />` | 第三方库         |

### 8、常见生态工具

| 工具            | 用途         | 安装/用法                                                    | 注意事项           |
| :-------------- | :----------- | :----------------------------------------------------------- | :----------------- |
| React Router v6 | 路由导航     | `npm i react-router-dom`<br>`<BrowserRouter><Routes><Route path="/" element={<Home/>}/></Routes></BrowserRouter>` | 嵌套路由、Outlet   |
| Redux Toolkit   | 全局状态管理 | `npm i @reduxjs/toolkit react-redux`                         | RTK Query 数据获取 |
| React Hook Form | 表单处理     | `useForm()`                                                  | 性能高，验证简单   |
| Axios / Fetch   | 数据请求     | `fetch('/api')`                                              | useEffect 中使用   |
| Tailwind / MUI  | UI 样式      | `npm i tailwindcss` 或 `mui`                                 | 快速美化           |

### 9、调试与最佳实践

| 项目              | 描述                         | 工具/方法                    |
| :---------------- | :--------------------------- | :--------------------------- |
| 调试工具          | 查看组件树、Props、Hooks     | React DevTools（浏览器插件） |
| Strict Mode       | 发现潜在问题                 | `<React.StrictMode>`         |
| ESLint + Prettier | 代码规范                     | VS Code 插件                 |
| 测试              | Jest + React Testing Library | `npm i --save-dev jest`      |