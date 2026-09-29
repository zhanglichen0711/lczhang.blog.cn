---
title: "FastAPI 安装与第一个接口"
date: 2023-06-11
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, 后端]
description: "从装环境到跑通第一个接口，理解 uvicorn、main:app 和项目骨架。"
abbrlink: 3218892649
---

上一篇讲了 FastAPI 为什么适合做 AI 应用的服务层。这一篇动手：把环境装好、跑起第一个接口、看懂目录骨架。学框架的第一步不是背 API，而是**让最小系统先转起来**，后面所有概念都建立在"代码能跑"的基础上。

## FastAPI 和 uvicorn 是什么关系

装 FastAPI 之前先理清一个概念：FastAPI 本身**不是一个服务器**，它只是帮你定义"哪些 URL 对应哪些函数"。真正接收 HTTP 请求、把请求喂给你的函数、再把响应发回去的，是 ASGI 服务器。

- **FastAPI**：Web 框架，负责路由、参数、校验、文档；
- **uvicorn**：ASGI 服务器，负责真正在网络层面收发请求。

两者缺一不可。你可以类比成 Flask 和 gunicorn 的关系。所以安装时要一起装：

```bash
# 建议先建虚拟环境，避免污染全局 Python
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate

pip install fastapi "uvicorn[standard]"
```

`uvicorn[standard]` 带了 uvloop 等加速依赖，性能更好，直接装这个标准版即可。

## 写第一个接口

新建 `main.py`：

```python
from fastapi import FastAPI

# 创建应用实例，title 会显示在自动生成的文档页上
app = FastAPI(title="hello-api")


@app.get("/")
def index():
    """根路径：返回一个健康检查信息"""
    return {"message": "Hello FastAPI"}
```

这里出现两个新东西：

1. `app = FastAPI()` —— 创建应用实例，整个服务的"心脏"。后面所有路由都要挂在这个实例上。
2. `@app.get("/")` —— 装饰器，把下面的函数注册成一个"当浏览器访问 `/` 时执行"的处理器。`get` 表示只接受 GET 请求。

函数返回了一个 dict，FastAPI 会自动把它序列化成 JSON 响应——这是它的默认行为，不需要任何额外配置。

## 启动服务

```bash
uvicorn main:app --reload --port 8000
```

命令里 `main:app` 的含义要弄懂：**冒号前是模块名，冒号后是模块里的应用变量名**。`main:app` 就是"去 `main.py` 里找那个叫 `app` 的 FastAPI 实例"。所以：

- 文件名不能乱起，`main.py` 里就叫 `app`，命令就得是 `main:app`；
- 如果你把文件改成 `server.py`、变量改成 `application`，命令要对应改成 `server:application`。

`--reload` 是开发神器：代码一改动，服务自动重启，省得每次手动重启。**生产环境不要开**。

启动后终端会显示 `Uvicorn running on http://127.0.0.1:8000`，服务就绪。

## 验证接口

开两个方式验证：

```bash
# 命令行
curl http://127.0.0.1:8000/
# {"message":"Hello FastAPI"}

# 浏览器打开文档页
# http://127.0.0.1:8000/docs
```

`/docs` 页面是上一篇说的自动文档——能看到刚才定义的接口、参数说明，直接点 "Try it out" 就能发请求。这是写接口过程中最爽的一刻：**代码里还没写一行文档，文档已经可用了**。

再加一个接口感受下 JSON 序列化：

```python
@app.get("/health")
def health():
    return {"status": "ok", "service": "rag-api", "version": "0.1.0"}
```

返回嵌套的 dict 同样没问题，FastAPI 会把整个结构序列化成 JSON。

## 为什么不要自己 json.dumps

很多从 Flask 转过来的人习惯写 `return json.dumps(data)`。在 FastAPI 里**不要这样做**：

```python
# 错误示范：手动序列化
@app.get("/bad")
def bad():
    return json.dumps({"a": 1})   # 响应会是字符串，不是 JSON

# 正确示范：直接返回 Python 对象
@app.get("/good")
def good():
    return {"a": 1}               # FastAPI 自动转 JSON
```

你手动序列化一次，FastAPI 反而会把字符串再当响应体发出去，客户端拿到的 Content-Type 都不对。信任框架，返回 Python 原生结构即可——这也是后面 Pydantic 模型能直接当返回值的基础。

## 项目骨架：从第一天就分层

很多教程 demo 会把所有代码堆在一个文件里，几十个接口后没法维护。从第一天就按领域分层，后面会省很多事：

```text
app/
├── main.py            # 创建 app、挂载路由、注册中间件
├── routers/           # 按业务域拆路由：chat.py、kb.py、auth.py
├── schemas.py         # Pydantic 请求/响应模型
├── services/          # 核心业务逻辑：检索、调用模型、组装答案
├── core/              # 配置、数据库连接、公共依赖
└── models/            # 数据库 ORM 模型（如果接了数据库）
```

原则很简单：**路由层只做参数接收和响应返回，业务逻辑都放 services**。这样接口层薄、逻辑层纯，后面加权限、加缓存、加测试都方便。

## 小结

这一篇把最小系统跑通了：装好 FastAPI + uvicorn，理解了 `main:app` 的加载方式，写并验证了第一个接口，也看到了为什么返回 Python 对象而不是手动 JSON。最后搭的分层骨架会在后面每篇代码示例里体现。

下一篇讲路由和参数——接口真正开始"接收输入"，这也是日常写接口频率最高的一环。
