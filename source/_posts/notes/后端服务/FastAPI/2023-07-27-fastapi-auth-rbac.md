---
title: "FastAPI 认证与权限控制"
date: 2023-07-27
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, JWT, 权限, 认证]
description: "用 JWT + RBAC 让接口知道你是谁、能干什么，权限判断沉淀成依赖。"
abbrlink: 1049429505
---

接口一旦对外提供服务，第一件事是回答两个问题：**你是谁**（认证，Authentication）？**你能干什么**（授权，Authorization）？知识库问答这类系统尤其敏感——员工只能看自己部门能看的文档，不能让检索结果跨权限泄漏。这一篇用最主流的 JWT + 角色模型把权限体系搭起来。

## 认证 vs 授权

两个词容易混，先分清：

- **认证**：证明"你是你"。客户端带着用户名密码或 token 来，服务端验证身份，得出"你是哪个用户"。
- **授权**：验证通过之后，"你**能**干什么"。同样是登录用户，普通员工能查自己部门，管理员能查全部。

FastAPI 的依赖注入正好把这两层做成两条链：认证链确认身份，授权链在上面再卡角色。

## JWT 是什么

JWT（JSON Web Token）是目前最主流的无状态认证方案。用户登录成功后，服务端签发一个加密签名的 token 给客户端：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNDIiLCJyb2xlIjoiZWRpdG9yIn0.xxxxx
```

token 由三段组成（头部.载荷.签名），里面**直接编码了用户信息**（比如 `user_id` 和 `role`），并且用密钥签名——服务端不存会话、不查库，只要验签通过就能信任载荷内容。RAG 服务里"把角色、部门过滤下推给检索层"的起点，就是从这个 token 里把 `role`、`dept` 解出来。

## 签发 token

用 `PyJWT`（或 `python-jose`）签发，登录成功后发给客户端：

```python
import time

import jwt

SECRET_KEY = "change-me-in-production"     # 生产环境用环境变量/密钥管理
ALGORITHM = "HS256"


def create_token(user_id: str, role: str, expires_hours: int = 24) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": int(time.time()) + expires_hours * 3600,   # 过期时间
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
```

三个要点：

1. **`exp` 必须设**——token 不带过期时间等于永久通行证，泄漏就失控；
2. 载荷里只放身份信息（user_id、role、dept），**别放敏感数据**，因为 JWT 只是签名不是加密，任何人解码都能看到载荷内容；
3. 密钥绝不能写死在代码里，用环境变量注入。

## 认证依赖：从请求头解出当前用户

FastAPI 的 `OAuth2PasswordBearer` 会自动去请求头 `Authorization: Bearer <token>` 里取 token：

```python
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """认证链：验签 + 查过期，返回当前用户"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"user_id": payload["user_id"], "role": payload["role"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的登录凭证")
```

这就是上一篇讲的依赖注入的实战用法：**每个需要登录的接口，加一个 `Depends(get_current_user)`**，token 无效直接 401，根本到不了业务代码。

## 授权依赖：角色卡点

认证解决"你是谁"，授权解决"你能干什么"。把角色判断也做成依赖，可以无限叠加：

```python
def require_role(*allowed_roles: str):
    """生成一个'要求指定角色'的依赖"""
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="权限不足")
        return user
    return checker


# 用法：只有 admin 能访问
@app.get("/admin/stats")
def admin_stats(_: dict = Depends(require_role("admin"))):
    return ...

# 用法：editor 和 admin 都能改
@app.post("/kb/{doc_id}/update")
def update_doc(_: dict = Depends(require_role("editor", "admin"))):
    ...
```

于是接口的权限门槛变成**声明式的一行**：读代码的人立刻知道这个接口谁能调。401（未登录）和 403（没权限）的区别也自然呈现——前者是认证失败，后者是身份对但资格不够。

## 数据级权限：权限不只拦路由，还要过滤数据

路由级权限只解决"能不能进这个接口"。真正的企业场景还有**数据级权限**：员工能调 `/search`，但检索结果**只能来自本部门的知识库**。这需要在检索层把用户角色/部门下推成过滤条件：

```python
@app.post("/search")
def search(req: SearchRequest, user: dict = Depends(get_current_user)):
    filters = req.filters or {}
    # 把用户所属部门作为强制过滤条件，调用方改不了
    filters["dept"] = user["dept"]
    # 管理层可跨部门，普通员工只能本部门
    if user["role"] not in ("manager", "admin"):
        filters["visible_to"] = user["user_id"]
    return rag_search(req.query, filters=filters)
```

关键点：**权限过滤条件在服务端根据 token 里的身份强制注入**，而不是信任客户端传上来的过滤参数——否则任何用户都能把 `dept` 改成"总经办"看全库。这就是简历里"角色、部门过滤下推为检索表达式，避免串库与越权"的落点：token 里解身份，服务端强制加过滤，检索层只认过滤结果。

## 前端配合

前端登录拿到 token 后，存在本地，每次请求带上：

```js
const resp = await fetch('/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  },
  body: JSON.stringify({ query: '模板拆除时间' }),
});

if (resp.status === 401) { /* 未登录，跳登录页 */ }
if (resp.status === 403) { /* 权限不足，提示 */ }
```

## 小结

一套可用的权限体系 = **JWT 认证（你是谁）→ 角色授权（能进哪个接口）→ 数据过滤（检索能看到哪些数据）**三层。前两层用依赖声明一行到位，第三层在业务里强制注入过滤条件。做到这三点，"按角色隔离可见文档"这类需求就不再是口号。

FastAPI 系列到这儿，单点能力都过完了。最后一篇把它们串起来：从目录结构到完整代码，把一个 RAG 问答服务封装成能上线的 API。
