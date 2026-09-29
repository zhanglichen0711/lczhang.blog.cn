---
title: "Node.js 安装与第一个服务"
date: 2024-05-12
categories:
  - [后端服务, Node.js]
tags: [Node.js, 后端]
description: "装好 Node，用 http 模块写出第一个服务，理解 npm init 和 package.json。"
abbrlink: 201072548
---

上一篇讲了 Node 的定位。这一篇动手把环境装好，用 Node **内置的 `http` 模块**写出第一个 HTTP 服务——先不引入任何框架，这样你能看到 Node 最底层的能力长什么样。明白了底层，后面上 Express 时才会理解它替你做了什么。

## 安装与验证

到 nodejs.org 下载 LTS 版本安装（LTS = 长期支持，稳定优先）。装完验证：

```bash
node -v    # v20.x.x —— Node 版本
npm -v     # 10.x.x  —— 包管理工具版本
```

Node 装好后 npm 是随附的，不用单独装。建议用 **nvm**（Node Version Manager）管理 Node 版本——项目之间 Node 版本不一致时切换方便，不用反复重装。

## 第一个 HTTP 服务：http 模块

Node 标准库自带 `http` 模块，不装任何依赖就能起一个服务器：

```js
// server.js
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hello Node.js');
});

server.listen(3000, () => {
  console.log('服务已启动: http://localhost:3000');
});
```

逐行看它做了什么：

1. `require('http')` —— 引入 Node 内置的 http 模块（require 是 CommonJS 的导入语法，下一篇细讲）；
2. `http.createServer(回调)` —— 创建服务器，**回调在每次收到请求时执行**，参数 `req`（请求）、`res`（响应）；
3. `res.writeHead(200, ...)` —— 写状态码和响应头，这里声明返回文本；
4. `res.end('Hello Node.js')` —— 结束响应并发送内容；
5. `server.listen(3000)` —— 监听 3000 端口。

启动并测试：

```bash
node server.js
# 另开终端
curl http://localhost:3000/
# Hello Node.js
```

注意一个 Node 新手常犯的错误：**改代码后必须重启进程**。`node server.js` 不会像浏览器热更新，要 Ctrl+C 停掉再启动。后面引第三方工具（如 nodemon）可以自动重启。

## 让服务有点"用"：处理路径和参数

真实请求会带路径和参数，`req.url` 里能拿到：

```js
const http = require('http');

const server = http.createServer((req, res) => {
  // 解析 URL：/hello?name=xiaohai
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/hello') {
    const name = url.searchParams.get('name') || '朋友';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `你好，${name}` }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(3000);
```

```bash
curl "http://localhost:3000/hello?name=xiaohai"
# {"message":"你好，xiaohai"}
curl "http://localhost:3000/xxx"
# Not Found
```

`URL` 是 Node 内置类，`new URL(req.url, 基准地址)` 把相对路径补全成完整 URL，就能用 `url.pathname` 和 `url.searchParams` 解析路径和查询参数了。注意这里返回 JSON 时手动了 `JSON.stringify`——等下一篇模块化、后面用 Express 时会有更顺手的处理，先用原生方式感受请求解析的流程。

## npm init：给项目建"身份证"

手写 `server.js` 跑通只是第一步。一个正经项目需要 `package.json`——它记录项目名、依赖、脚本，是 Node 工程的"身份证"：

```bash
npm init -y   # -y 跳过提问，生成默认配置
```

生成的 `package.json` 大概长这样：

```json
{
  "name": "my-gateway",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

马上把启动命令写进 scripts，以后用 `npm start` 而不是记命令：

```json
"scripts": {
  "start": "node server.js"
}
```

```bash
npm start    # 等价于 node server.js
```

`scripts` 是 Node 项目的命令中心：`npm start`、`npm run dev`、`npm test` 都在这里定义，团队协作时入口统一。

## 为什么先不用框架

很多人上来就装 Express，反而看不懂它做了什么。先用 `http` 模块裸写一个服务，你才会明白：**框架解决的是"路由、中间件、参数解析"这些重复劳动**——后面写 Express 篇时，你会清楚地看到它在刚才这段原生代码之上替你省了哪些事。

## 小结

这一篇完成了 Node 的"最小系统"：装环境 → `http.createServer` 起服务 → 解析 URL 和参数 → `npm init` 建立工程骨架。至此你对 Node 服务的基本生命周期有了体感：监听端口、收请求、写响应。

下一篇讲模块系统——代码超过一个文件后，怎么拆分、怎么互相引用，这是 Node 工程的骨架课。
