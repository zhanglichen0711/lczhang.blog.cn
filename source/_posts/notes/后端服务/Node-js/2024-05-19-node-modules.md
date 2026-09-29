---
title: "Node.js 模块系统"
date: 2024-05-19
categories:
  - [后端服务, Node.js]
tags: [Node.js, 模块, npm]
description: "CommonJS 与 ESM 两套模块语法、npm 依赖管理、工程目录怎么拆。"
abbrlink: 1319939752
---

代码超过一个文件，就得考虑怎么拆分、怎么互相引用。Node 的模块系统经历了两个时代：早期生态基于 **CommonJS**（`require`），后来 ECMAScript 官方标准 **ESM**（`import`）逐渐成为主流。两种写法你都会在真实项目里遇到，这一篇把它们的关系讲清楚。

## CommonJS：Node 的"原生"模块

从第一篇的 `server.js` 开始，Node 文件默认就是 CommonJS 模块。一个文件想导出内容给别人用，用 `module.exports`；别人想引入，用 `require`：

```js
// utils.js
function formatSources(sources) {
  return sources.map(s => `[${s.doc_id}] ${s.title}`).join('\n');
}

module.exports = { formatSources };   // 导出对象
```

```js
// server.js
const { formatSources } = require('./utils');

console.log(formatSources([{ doc_id: 'A1', title: 'GB50204' }]));
// [A1] GB50204
```

两个关键点：

1. `require('./utils')` 的 **`./` 必须写**——不带 `./` 表示去找 node_modules 里的第三方包（`require('express')`）；
2. **每个文件是独立作用域**：文件里声明的变量默认不外泄，只有 `module.exports` 出去的东西别人才能看到。这是 Node 工程能拆文件的前提。

## 拆一个真实的模块：网关的鉴权

把鉴权逻辑拆成独立模块，`server.js` 只负责组装：

```js
// auth.js
const tokens = new Set();

function issue(userId) {
  const token = `${userId}-${Date.now()}`;
  tokens.add(token);
  return token;
}

function verify(token) {
  return tokens.has(token);
}

module.exports = { issue, verify };
```

```js
// server.js
const { issue, verify } = require('./auth');

const server = http.createServer((req, res) => {
  const token = req.headers['authorization'];
  if (!verify(token)) {
    res.writeHead(401);
    res.end('unauthorized');
    return;
  }
  ...
});
```

职责分离：`auth.js` 只管令牌的签发与校验，`server.js` 只管请求分发。改动鉴权逻辑时，只动 `auth.js` 一个文件。

## ESM：标准语法

2015 年 ECMAScript 引入了官方模块语法 `import` / `export`。在 Node 里启用有两种方式：package.json 加 `"type": "module"`，或文件用 `.mjs` 后缀：

```json
// package.json
{
  "name": "my-gateway",
  "type": "module"   // 加了它，.js 文件按 ESM 解析
}
```

```js
// utils.js
export function formatSources(sources) {
  return sources.map(s => `[${s.doc_id}] ${s.title}`).join('\n');
}
```

```js
// server.js
import { formatSources } from './utils.js';   // ESM 下相对导入要带扩展名
```

两种语法对比：

| | CommonJS | ESM |
| --- | --- | --- |
| 导入 | `require('./utils')` | `import x from './utils.js'` |
| 导出 | `module.exports = {...}` | `export function ...` |
| 同步加载 | 是 | 是（Node 里） |
| 谁在用 | 老项目、Node 生态早期 | 新项目主流、前端同构 |

新项目建议直接用 ESM（`"type": "module"`）；但读老代码、维护别人项目时 CommonJS 也必须看得懂。**两套语法都认识，是现代 Node 工程师的基本功**。

## npm：依赖从哪来

模块不只有自己写的，还有海量第三方包。装包的命令：

```bash
npm install express          # 装进 dependencies，写入 package.json
npm install -D nodemon       # -D：只在开发环境用（devDependencies）
npm install                  # 根据 package.json 恢复全部依赖
```

装完后项目里出现 `node_modules/`（所有包的实际代码）和 `package-lock.json`（锁死每个包的精确版本，保证团队装出来一致）。

**node_modules 永远不要提交到 git**——别人 clone 项目后执行 `npm install` 就能恢复。这也是为什么工程必须带 package.json 的原因。

## 工程目录怎么拆

模块系统的意义最终落到工程结构上。一个 Node 网关项目的常见布局：

```text
gateway/
├── package.json
├── server.js            # 入口：组装 app、监听端口
├── app.js               # 创建 Express 实例、挂路由（可单独测试）
├── routes/              # 路由：auth.js、proxy.js
├── middleware/          # 中间件：auth.js、ratelimit.js、logger.js
├── services/            # 业务：上游调用、聚合逻辑
├── config.js            # 读取环境变量
└── tests/               # 测试
```

**入口薄、路由薄、逻辑下沉**——和 FastAPI 系列的分层思想完全一致：`server.js` 只负责启动，`routes` 只做分发，真正干活的全在 `services` 和 `middleware`。不同语言的工程美学是相通的。

## 小结

模块系统是 Node 工程的骨架课：`require` / `module.exports`（CommonJS）是存量主力，`import` / `export`（ESM）是未来主流；`npm` 管理第三方依赖，`package.json` + lock 文件保证工程可复现；目录按"入口 / 路由 / 中间件 / 服务"分层，代码才能长而不乱。

下一篇把服务从"原生 http"升级到框架层——Express，路由、中间件、参数解析这些重复劳动，它替你包圆了。
