---
title: "入库流水线：解析、清洗与质量门禁"
date: 2025-04-14
categories:
  - [大模型应用, RAG]
tags: [RAG, 入库]
description: "垃圾进垃圾出。解析失败、空页、重复、坏 chunk 都要在进向量库之前拦下，质量门禁比多一条 embedding 重要。"
abbrlink: 2842351578
---

RAG 的质量有一条铁律：**垃圾进，垃圾出。** 检索和生成再优化，也救不了进库时就坏掉的数据。可很多 RAG 项目把精力全放在"检索侧"（调 embedding、加 rerank），却忽略了知识的入口——入库流水线。这篇讲文档从"原始文件"到"可检索 chunk"的完整旅程，重点是：**坏数据必须在进库之前被拦下，而不是进库之后靠检索兜底。**

## 入库流水线的全景

一份文档要变成可检索的 chunk，中间是一条流水线：

```text
原始文档（PDF / Word / Markdown）
   ↓ ① 解析：转成结构化文本
   ↓ ② 清洗：去页眉页脚、目录、乱码
   ↓ ③ 切分：按结构切成 chunk（切分篇讲过）
   ↓ ④ 质量门禁：拦下坏 chunk
   ↓ ⑤ 向量化 + 入库
知识库
```

每一步都可能出错，而错误会在下游放大。下面逐个看。

## 第一步：解析——格式的地狱

解析是把 PDF/Word 变成文本的环节，也是"看起来简单、实际坑最多"的一步。常见问题：

- **PDF 扫描件**：纯图片，直接解析出来是空文本——需要 OCR，而 OCR 有识别错误；
- **多栏排版**：解析可能把左右两栏的文字交叉拼接，读起来是乱的；
- **表格**：解析成文本后结构丢失，表头和数据分离；
- **字体编码**：某些 PDF 的字体映射有问题，解析出乱码或空白。

解析的工程要点：

```python
def parse_document(file_path: str) -> Document:
    """解析入口：按文件类型分发，统一输出 Document"""
    ext = file_path.rsplit(".", 1)[-1].lower()
    if ext in ("pdf",):
        text = parse_pdf(file_path)      # 内部处理扫描件/多栏/表格
    elif ext in ("docx", "doc"):
        text = parse_word(file_path)
    else:
        text = read_text(file_path)      # md/txt 直接读

    # 关键：解析结果必须校验，不能静默出错
    if len(text.strip()) == 0:
        raise ParseError(f"文档解析结果为空，疑似扫描件或编码问题: {file_path}")
    return Document(path=file_path, text=text)
```

**解析错误要显式失败，不要静默产出空文档**——一条"空文本"的文档混进知识库，检索时毫无意义还占空间。解析失败率本身是个该被监控的指标：如果一批文档解析失败率突然升高，通常是格式变了，要提前发现而不是事后在检索质量上吃亏。

## 第二步：清洗——把噪音挡在门外

解析出的文本通常带着噪音：页眉页脚、页码、目录、封面信息、重复的标题、乱码字符。这些噪音如果不清理：

- 检索可能命中"第 3 页"这种无意义碎片；
- chunk 里混着页眉，向量里掺入噪音信号；
- 切分时被目录干扰，结构判断出错。

清洗是规则活，按文档类型定制：

```python
def clean_text(text: str) -> str:
    lines = []
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        # 去掉页码行（如 "第 12 页" / 纯数字页脚）
        if re.fullmatch(r"(第\s*\d+\s*页|-\s*\d+\s*-|\d{1,4})", ln):
            continue
        # 去掉常见页眉（按文档定制：公司名、文档名重复出现）
        if ln in KNOWN_HEADERS:
            continue
        lines.append(ln)
    return "\n".join(lines)
```

清洗规则**必须针对你的文档定制**——通用的清洗器往往会误伤（比如把正文里的数字行当页码删掉）。正确的做法是先抽样看一批原始解析结果，找出噪音模式，再写规则。

## 第三步：质量门禁——坏 chunk 的拦截器

切分完之后、入库之前，要过一道质量门禁。这是整个流水线里最容易被省略、却最能省事的一环。门禁拦截四类问题：

```python
def quality_gate(chunks: list[dict]) -> list[dict]:
    """入库质量门禁：拦下不合格 chunk，返回通过列表"""
    passed = []
    for c in chunks:
        content = c["content"].strip()

        # 1. 过短：信息量不足（如少于 20 字）
        if len(content) < MIN_CHUNK_CHARS:
            log.warning("chunk.too_short", doc_id=c["doc_id"])
            continue

        # 2. 过长：切分没切干净（如超过上限 2 倍）
        if len(content) > MAX_CHUNK_CHARS * 2:
            log.warning("chunk.too_long", doc_id=c["doc_id"])
            continue

        # 3. 重复：内容指纹相同（重复入库或切分重叠异常）
        h = hashlib.md5(content.encode()).hexdigest()
        if h in seen_hashes:
            log.warning("chunk.duplicate", doc_id=c["doc_id"])
            continue
        seen_hashes.add(h)

        # 4. 乱码/噪音残留：乱码字符占比过高
        if gibberish_ratio(content) > 0.1:
            log.warning("chunk.gibberish", doc_id=c["doc_id"])
            continue

        passed.append(c)
    return passed
```

四个拦截器各防一类问题：过短防碎片、过长防漏切、重复防脏数据、乱码防解析失败残留。**被拦下的 chunk 要记日志**——门禁不只是过滤器，还是数据健康度的监控点：如果某批文档的拦截率异常升高，说明上游解析或清洗出了问题。

## 为什么"质量门禁比多一条 embedding 重要"

很多人优化 RAG 的第一反应是"换个更好的 embedding 模型"或"加一路召回"。但如果入库时混进了坏数据——乱码 chunk、重复 chunk、无意义的碎片——再好的 embedding 也只是**把垃圾检索得更准**。

数据质量对 RAG 的影响是**结构性的**：坏 chunk 会污染检索结果、误导生成、浪费存储。而修一个坏 chunk 的成本，远高于在入库时拦住它。所以工程上的优先级应该是：

```text
① 入库质量门禁（拦坏数据）  ← 最高优先级
② 切分与元数据（保 chunk 质量）
③ 查询理解与混合检索（提升召回）
④ rerank（压噪音）
⑤ embedding 升级（最后才换）
```

这个顺序可能反直觉（很多人把 ⑤ 当第一步），但它符合"先保证输入健康，再优化处理能力"的工程逻辑。

## 入库的幂等与重跑

流水线还有一个工程要求：**可重跑、不产生脏数据**。文档更新后要重新入库，如果流水线不幂等，重跑一次就多一份重复数据。幂等的两个关键：

```python
# 1. 去重靠内容指纹：相同 hash 的 chunk 覆盖而非追加
# 2. 删除靠版本：重跑前先把该 doc 的旧 chunk 标记失效或删除

def ingest_document(doc_id: str, chunks: list[dict]):
    """幂等入库：先清旧、再写新"""
    # 事务性：同一 doc 的旧 chunk 先失效
    delete_chunks_by_doc(doc_id)
    # 写入新 chunk（带 doc_id/version/hash 元数据）
    insert_chunks(chunks)
```

幂等设计让入库流水线可以安全地重跑、增量更新、失败重试——这在大文档库的日常维护里是刚需。

## 小结

入库流水线是 RAG 质量的第一道关口：解析要显式失败（不静默产空）、清洗按文档定制去噪、质量门禁拦下过短/过长/重复/乱码四类坏 chunk、入库保证幂等可重跑。**质量门禁比多一条 embedding 重要**——再强的检索也救不了进库就坏的数据。优化的优先级永远是：先保证输入健康，再谈检索和生成。

下一篇转向"怎么证明这套系统没变差"——RAG 评测。评测集、命中率、引用校验，把 RAG 从"感觉能用"变成"数据证明能用"。
