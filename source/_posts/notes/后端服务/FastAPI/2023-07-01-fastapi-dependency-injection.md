---
title: "FastAPI 依赖注入与中间件"
date: 2023-07-01
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, 依赖注入, 中间件]
description: "用 Depends 复用鉴权与数据库会话，用中间件处理横切逻辑，让路由保持干净。"
abbrlink: 3735388987
---

一个真实的服务里，"每个接口都要校验登录""每个接口都要拿一个数据库会话""每个响应都要带耗时"——这些是**横切逻辑**，和具体业务无关但每个接口都逃不掉。新手写法是在每个接口里复制一份，后果是改一处漏三处。FastAPI 的依赖注入（DI）就是为根治这个问题设计的。

## 先看痛点

假设三个接口都要校验 token，最粗暴的写法长这样：

```python
@app.get("/a")
def a(authorization: str | None = Header(default=None)):
    check_token(authorization)   # 复制
    ...

@app.post("/b")
def b(authorization: str | None = Header(default=None)):
    check_token(authorization)   # 复制
    ...

@app.delete("/c")
def c(authorization: str | None = Header(default=None)):
    check_token(authorization)   # 复制
    ...
```

等加到第十个接口，想改校验逻辑（比如加个黑名单），得改十个地方。依赖注入做的事就是把这坨复制**收敛成一行声明**。

## 依赖就是普通函数

FastAPI 里的"依赖"不需要任何基类，**就是个普通函数**，返回值可以被路由函数接收：

```python
from fastapi import Depends, FastAPI, Header, HTTPException

app = FastAPI()


def get_token(authorization: str | None = Header(default=None)):
    """从请求头里取出 Bearer token，没有就 401"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    return authorization.removeprefix("Bearer ").strip()
```

## 路由里声明依赖

函数里声明 `token: str = Depends(get_token)`，FastAPI 就会：先执行 `get_token` → 把返回值填进 `token` 参数 → 再执行你的业务函数：

```python
@app.get("/me")
def me(token: str = Depends(get_token)):
    # 走到这里，token 一定是有效的（无效在上面就 401 了）
    return {"token": token}
```

关键点在于：**`get_token` 里抛出的 401 会直接中断请求**，业务函数根本不会执行。这就是"校验前移到依赖里"——每个接口只要写 `Depends(get_token)` 一行，就自动拥有了完整的鉴权逻辑。

## 带清理的依赖：yield 用法

鉴权是纯函数式判断，但数据库会话这类"用完必须释放"的资源，需要 `yield` 依赖。`yield` 之前是"进入时执行"，`yield` 之后是"请求结束时兜底执行"：

```python
from sqlalchemy.orm import Session


def get_db():
    db = SessionLocal()
    try:
        yield db          # 路由函数执行期间，db 可用
    finally:
        db.close()        # 无论正常返回还是抛异常，都会执行


@app.get("/docs/{doc_id}")
def get_doc(doc_id: int, db: Session = Depends(get_db)):
    return db.query(Doc).filter(Doc.id == doc_id).first()
```

`finally` 保证了**即使路由里抛了异常，会话也会被关闭**——不怕任何异常路径漏掉资源清理。这是用 `yield` 而不是返回对象的原因。

## 依赖可以组合

依赖内部可以再依赖别的依赖，FastAPI 会递归解析整个依赖树。把鉴权链搭起来：

```python
def get_current_user(token: str = Depends(get_token)):
    """解析 token 拿当前用户，查无此人则 401"""
    user = find_user_by_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def require_admin(user=Depends(get_current_user)):
    """在 get_current_user 之上再卡一层角色"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@app.get("/admin/stats")
def stats(_: AdminUser = Depends(require_admin)):
    # 走到这里必然是 admin
    return compute_stats()
```

这条链是：`require_admin` → `get_current_user` → `get_token`，一层层校验、一层层通过。路由函数里**看不到任何鉴权代码**，只有一行 `Depends(require_admin)`，读接口的人一眼就知道它的访问门槛是什么。RAG 服务里"员工只能查本部门文档"这类权限，就是在这条链上拿到用户角色后，把过滤条件下推给检索层。

## 中间件：路由之外的一层

依赖解决"接口内部的前置逻辑"，中间件解决"所有请求的全局包裹"。中间件在请求进入路由**之前**执行、在响应返回**之后**收尾，适合 CORS、打请求 ID、记录耗时这类与任何具体接口都无关的事：

```python
import time

from fastapi.middleware.cors import CORSMiddleware


@app.middleware("http")
async def add_process_time(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)          # 放行，等路由执行完
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 生产环境换成具体域名
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`call_next` 是"把请求继续往下传"的钩子，`await call_next(request)` 会等整个请求处理完再回来——所以你能在它前后分别记录开始和结束时间。前端调用跨域接口时的 CORS 报错，就是没加 CORSMiddleware 导致的，属于必配项。

## 什么时候用哪种

| 场景 | 用哪个 |
| --- | --- |
| 每次请求需要且用完要清理（DB 会话、客户端连接） | `yield` 依赖 |
| 纯校验/取数据（鉴权、当前用户、配置） | 普通依赖 `Depends` |
| 全局包裹、与具体接口无关（CORS、日志、耗时） | 中间件 |

## 小结

依赖注入把"接口的公共前置"收敛成声明式的一行，中间件把"全局横切"收在路由之外——两者配合，路由函数最终只剩下它真正该管的业务。这也是为什么 FastAPI 项目里路由普遍"很薄"。

依赖链铺好之后，下一篇讲异步与并发：你的服务在等待数据库、等待大模型时，CPU 到底在干什么，为什么有的接口该用 `async def`。
