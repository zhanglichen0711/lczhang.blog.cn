---
title: "文本预处理：分词、清洗与规范化"
date: 2024-02-29
categories:
  - [模型训练与微调, NLP]
tags: [NLP, 分词, 预处理]
description: "脏文本怎么变干净：中文分词、噪声清洗、规范化，预处理决定模型效果的下限。"
abbrlink: 307573553
---

上一篇文章说过：数据质量决定效果上限。NLP 的"数据质量"就是文本预处理——分词对不对、噪声清没清、格式统不统一。这一篇把最常用的预处理三板斧讲透：**分词、清洗、规范化**。别小看这步，真实项目里它常常决定了模型是 80 分还是 95 分。

## 第一板斧：分词

### 中文为什么要分词

"我爱北京天安门"没有空格，模型拿到的是一整串字符。分词把连续文本切成有意义的词，是中文 NLP 的传统第一步：

```bash
pip install jieba
```

```python
import jieba

text = "混凝土结构工程施工质量验收规范"
words = jieba.lcut(text)
print(words)
# ['混凝土', '结构工程', '施工', '质量', '验收', '规范']
```

jieba 是纯 Python 中文分词最常用的库，三种模式：

```python
jieba.lcut(text)                    # 精确模式（默认，最常用）
jieba.lcut(text, cut_all=True)      # 全模式（返回所有可能词，噪声多）
jieba.lcut_for_search(text)         # 搜索引擎模式（精确 + 细分，召回用）
```

### 自定义词典：领域词是分词的胜负手

通用词典分不好领域词——"GB50204""拆模""蜂窝麻面"这类术语经常被切碎。加自定义词典立刻见效：

```python
# 写法一：加载词典文件（每行一个词，可带词频）
jieba.load_userdict("domain_words.txt")

# 写法二：代码里直接加
jieba.add_word("蜂窝麻面")
jieba.add_word("拆模强度")

print(jieba.lcut("板面出现蜂窝麻面属于质量缺陷"))
# ['板面', '出现', '蜂窝麻面', '属于', '质量', '缺陷']
```

**工程建议**：把领域术语表（规范名、工艺名、缺陷名）维护成一个词典文件，项目里统一加载——这是中文 NLP 效果差异最容易被忽视的来源。

### 预训练模型时代的分词

BERT/GPT 这类模型**不用 jieba**，它们有自己的分词器（WordPiece/BPE）把文本切成语义子词，词表固定。**做预训练模型任务时，直接用模型自带的分词器**，别自己 jieba 切完再喂：

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-chinese")
tokens = tokenizer.tokenize("我爱北京天安门")
print(tokens)          # ['我', '爱', '北', '京', '天', '安', '门']（按字/子词切）
print(tokenizer("我爱北京天安门")["input_ids"])   # 直接得到模型要的 ID
```

## 第二板斧：清洗

真实文本（网页、OCR、聊天记录）充满噪声，清洗顺序很重要：

```python
import re

def clean_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)         # 1. 去 HTML 标签
    text = re.sub(r"https?://\S+", "", text)    # 2. 去 URL
    text = re.sub(r"\s+", " ", text)            # 3. 压缩空白
    text = text.strip()
    return text
```

清洗的原则是**克制的白名单思维**：只去掉确定的噪声，别用正则瞎删可能带信息的字符。施工描述里的"5#楼""Φ12@150"这些数字符号往往是有用信息，删了就坏了。

## 第三板斧：规范化

### 统一全半角与大小写

```python
def normalize(text: str) -> str:
    # 全角转半角（中文引号等保留）
    text = text.replace("，", ",").replace("。", ".").replace("：", ":")
    # 统一大小写（英文/编码场景）
    text = text.upper()          # 视任务而定：编码"gb50204"→"GB50204" 更一致
    return text
```

领域文本规范化收益很大：标准编号大小写不统一会导致检索和匹配失败（"gb50204" 和 "GB50204" 是两个词）。

### 停用词（视任务决定）

"的、了、是、在"这类高频无义词，**关键词检索（BM25）场景要删**，语义模型（BERT/向量检索）场景**不必删**——预训练模型知道怎么处理它们：

```python
STOPWORDS = {"的", "了", "是", "在", "和", "与", "及"}

tokens = [w for w in tokens if w not in STOPWORDS]   # 仅词频/关键词场景
```

## 一个完整预处理管线

```python
def preprocess(text: str) -> str:
    text = clean_text(text)        # 清洗：去标签/URL/空白
    text = normalize(text)         # 规范化：全半角、大小写
    return text
```

管线顺序固定：**清洗 → 规范化 →（分词 → 停用词）→ 向量化**。分词和停用词是否要做，取决于下游是传统模型还是预训练模型。

## 小结

预处理三板斧：**分词（中文靠 jieba + 领域词典，预训练任务用自带 tokenizer）、清洗（克制地只去确定噪声）、规范化（统一大小写全半角）**。它们不改变模型，却直接决定喂给模型的数据长什么样——而数据，是效果的天花板。

文本干净了，下一篇把文本变成向量：词向量——从独热到 Word2Vec 与 FastText，看"语义"是怎么被装进数字的。
