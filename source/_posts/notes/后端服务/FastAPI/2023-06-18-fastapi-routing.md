---
title: "FastAPI 路由与参数"
date: 2023-06-18
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, 路由, 后端]
description: "路径、查询、请求体三类参数的正确姿势，以及路由设计里的两个坑。"
abbrlink: 1423080864
---

接口存在的意义是接收输入、返回输出。FastAPI 的输入从三个地方来：**路径**（`/kb/42`）、**查询串**（`?page=2&size=10`）、**请求体**（POST 的 JSON）。这一篇把三类参数讲透，顺便说两个新手最容易踩的坑。

## 参数的三类来源

先记一个判断口诀：**路径参数定位资源，查询参数做过滤，请求体承载复杂结构**。

- 路径参数：URL 里的一部分，用来指"哪一条数据"，如 `/doc/42` 的 `42`；
- 查询参数：`?` 后面，用来"怎么处理这批数据"，如分页、排序、过滤条件；
- 请求体：跟着 POST/PUT 走，放一坨结构化数据，如搜索条件、要创建的文档内容。

## 路径参数：带类型的占位符

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/kb/{doc_id}")
def get_doc(doc_id: int):
    return {"doc_id": doc_id}
```

`{doc_id}` 是占位符，函数参数 `doc_id: int` 声明了它的类型。这里有两个关键点：

1. **访问 `/kb/42` 时 `doc_id` 自动等于 42**，FastAPI 会从路径里把它解析出来；
2. **类型声明 `int` 不是装饰**——传 `/kb/abc` 会直接返回 422（参数校验失败），**根本不会执行函数体**。类型不对的数据在门口就被拦住了，这正是"把校验前移"的意义：你的业务代码永远不需要处理"doc_id 是字符串"这种情况。

## 查询参数：可选、默认值、可选可空

查询参数写在函数签名里，**没有在路径占位符中出现的参数默认从查询串取**：

```python
@app.get("/search")
def search(
    q: str,                    # 必填
    page: int = 1,             # 可选，默认 1
    size: int = 20,            # 可选，默认 20
    source: str | None = None, # 可选，可以完全不传
):
    return {"q": q, "page": page, "size": size, "source": source}
```

三种形态要分清：

| 写法 | 含义 | 请求示例 |
| --- | --- | --- |
| `q: str` | 必填，缺了直接 422 | `/search?q=建筑规范` |
| `page: int = 1` | 可选，不传用默认值 | `/search?q=x` 也行 |
| `source: str \| None = None` | 可选且允许空，常用于"这个过滤条件可以不传" | 不传就是 None |

第三种最常用——搜索接口的过滤条件（按文档类型、按部门、按时间范围）大多是可选的，用 `str | None = None` 表达"要么给字符串要么给 None"，语义干净。

## 请求体：复杂结构交给 Pydantic 模型

查询参数一多 URL 就会又长又乱。当请求需要携带结构化的条件时，用 POST + 请求体，FastAPI 会自动把 JSON 体解析成 Pydantic 模型并校验：

```python
from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str                       # 必填
    top_k: int = 8                   # 可选，默认 8
    doc_types: list[str] = []        # 限定搜索范围
    filters: dict[str, str] = {}     # 附加过滤条件


@app.post("/search")
def search(req: SearchRequest):
    # req 已经是校验过的 SearchRequest 实例
    return run_search(req.query, top_k=req.top_k, doc_types=req.doc_types)
```

好处：**校验逻辑在模型定义里声明一次**（哪些字段必填、什么类型、默认值多少），函数体里直接当普通对象用，不用手动 `request.json()` 再自己判断字段在不在。请求体校验失败时，FastAPI 返回 422 并精确指出是哪个字段、为什么失败，前端能直接定位到表单输入框。

## 两个必踩的坑

### 坑一：路由顺序敏感

FastAPI 按声明顺序匹配 URL。`/users/me` 必须写在 `/users/{uid}` 之前，否则请求 `/users/me` 时，`me` 会被当成 `{uid}` 捕获——若 `uid` 声明为 `int` 还会直接 422：

```python
# 先声明"具体"的路由
@app.get("/users/me")
def get_me():
    return {"user": "current_user"}

# 再声明"通配"的路由
@app.get("/users/{uid}")
def get_user(uid: int):
    return get_user_by_id(uid)
```

**原则：把"字面量路径"写在"带参数的路径"前面**。类似的还有 `/doc/version/latest` 要在 `/doc/{id}` 之前。

### 坑二：别用查询参数表达复杂结构

有人会把搜索条件全塞进查询串：`/search?query=x&type=a&type=b&status=1&dept=2&from=...`，参数超过四五个时，调用方拼 URL 都费劲。**参数结构复杂就换 POST + Body 模型**，可读性和可扩展性都更好——后面要加过滤字段，只是给模型加一个属性的事，不用改 URL 语义。

## 状态码约定

接口返回码要符合语义，别什么都 200：

```python
from fastapi import HTTPException

@app.post("/doc", status_code=201)
def create_doc(req: DocRequest):
    ...

@app.get("/doc/{doc_id}")
def get_doc(doc_id: int):
    doc = find_doc(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc

@app.delete("/doc/{doc_id}", status_code=204)
def delete_doc(doc_id: int):
    ...
```

- 创建成功 → **201**（`status_code=201`）；
- 资源不存在 → **404**（抛 `HTTPException`，带 `detail` 给调用方可读的原因）；
- 参数错误 → **422**（框架自动，无需你写）；
- 删除成功 → **204**。

`HTTPException` 是显式中断流程的正确姿势：抛出去后函数体停止，错误信息随响应返回，不用 `return {"error": ...}` 这种 200 包装错误的做法。

## 小结

路径参数定位、查询参数过滤、请求体承载结构——三类参数的分工清晰后，接口定义就顺了。配合类型注解，参数校验、错误定位都由框架接管，你能把精力放在业务上。别忘了路由顺序那句口诀：字面量在前，参数在后。

下一篇讲数据模型——让请求和响应的结构都由 Pydantic 严格把关，这是接口稳定的另一块基石。
