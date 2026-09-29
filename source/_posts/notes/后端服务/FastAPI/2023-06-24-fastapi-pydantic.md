---
title: "FastAPI 数据模型与校验"
date: 2023-06-24
categories:
  - [后端服务, FastAPI]
tags: [FastAPI, Pydantic, 后端]
description: "用 Pydantic 守住接口边界：进来的数据必须合法，出去的结构必须稳定。"
abbrlink: 3264929159
---

一个接口有两道门要守：**进来的数据必须合法**——不能放脏数据进知识库、进数据库；**出去的结构必须稳定**——不能让内部对象的字段随意泄漏、随意改名。Pydantic 就是守这两道门的工具，而 FastAPI 把它内置成了第一公民。

## 一个模型，两个用途

Pydantic 模型（`BaseModel` 的子类）既能当**请求体**（收进来的 JSON 长这样），也能当**响应模型**（吐出去的 JSON 长这样）。核心思想是：**用字段类型声明规则，让框架去执行校验**。

先看请求侧——定义一个接收文档元数据的模型：

```python
from pydantic import BaseModel, Field


class DocMeta(BaseModel):
    doc_id: int                    # 必须是整数
    title: str                     # 必须是字符串
    chunk_count: int = Field(ge=1) # 至少为 1
    tags: list[str] = []           # 元素必须是字符串的列表
    score: float | None = None     # 可选浮点数
```

把它挂在路由上：

```python
@app.post("/docs")
def create_doc(meta: DocMeta):
    # 走到这里，meta 一定已经通过全部校验
    save_doc(meta)
    return meta
```

客户端传 `{"doc_id": "abc"}`（类型错）或 `{"chunk_count": 0}`（不满足 ≥1），框架直接返回 422 并说明错在哪，函数体一行都不会执行。**你的业务代码里从此不需要再写任何"判断字段是否合法"的 if**——规则都声明在模型里了。

## Field：把约束写得更具体

光靠类型还不够表达"标题不能为空、版本号必须形如 1.2"这类业务规则，`Field` 提供细粒度约束：

```python
class CreateDoc(BaseModel):
    title: str = Field(min_length=1, max_length=200, description="文档标题")
    version: str = Field(pattern=r"^\d+\.\d+$", description="版本号，形如 1.2")
    seq: int = Field(ge=0, le=100_000, description="文档内序号")
```

- `min_length` / `max_length`：字符串长度范围；
- `pattern`：正则约束，版本号必须匹配 `1.2` 这种格式；
- `ge` / `le`：数值上下界。

一个细节值得注意：**`description` 不只是注释**，它会出现在自动文档的字段说明里，前端看 `/docs` 就知道每个字段是什么意思。声明一次，文档免费同步。

## 嵌套模型：结构化对象

真实数据很少是扁平的——一个"检索结果"包含内容、来源文档、得分。嵌套模型表达这种结构比拍平的字典清晰得多，而且**校验会递归执行**：

```python
class Chunk(BaseModel):
    chunk_id: str
    content: str
    meta: DocMeta          # 嵌套的 DocMeta，同样会递归校验


class SearchResult(BaseModel):
    query: str
    total: int
    items: list[Chunk] = []
```

`items` 里每个 `Chunk` 的 `meta` 都会被校验到 `doc_id` 这一层。嵌套多深都没问题，只要类型声明完整。

## 响应模型：锁住出口

出口这扇门更重要。假设内部有这样一个对象，字段比接口想暴露的多：

```python
class InternalDoc(BaseModel):
    doc_id: int
    title: str
    content: str
    secret_note: str     # 内部字段，绝不能返回给调用方
```

用 `response_model` 声明"出口只准长这样"，内部多出来的字段自动被过滤：

```python
class DocOut(BaseModel):
    doc_id: int
    title: str


@app.get("/doc/{doc_id}", response_model=DocOut)
def get_doc(doc_id: int) -> InternalDoc:
    doc = load_internal_doc(doc_id)   # 内部对象字段很"胖"
    return doc                        # 但出口只有 doc_id + title
```

这在 AI 服务里尤其重要：检索返回的内部对象可能带着 embedding 向量、置信度、内部缓存 key，这些字段若随响应泄漏，既拖慢传输又暴露实现细节。**`response_model` 是接口的对外契约**，内部结构怎么改都不影响调用方，只要出口模型稳定。

## 校验失败长什么样

前端需要能定位错误，Pydantic 的错误格式是结构化的：

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "title"],
      "msg": "String should have at least 1 character"
    }
  ]
}
```

`loc` 是错误位置（哪个请求体、哪个字段），`msg` 是人类可读的原因。前端可以直接解析 `loc` 把错误对到表单上，不用后端再包一层"XX 字段不能为空"的字符串。

## 小结

Pydantic 模型 = 请求校验 + 响应契约 + 自动文档，一份声明多处生效。两道门守住之后，接口边界就稳定了：脏数据进不来，多余字段出不去。这也是为什么 FastAPI 体系里"先定义模型再写接口"成了肌肉记忆。

模型之后，下一篇讲依赖注入——把鉴权、数据库会话这类横切逻辑从每个接口里抽出来复用。
