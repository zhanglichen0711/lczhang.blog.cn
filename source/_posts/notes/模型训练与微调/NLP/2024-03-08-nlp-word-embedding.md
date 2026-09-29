---
title: "词向量：从独热到 Word2Vec 与 FastText"
date: 2024-03-08
categories:
  - [模型训练与微调, NLP]
tags: [NLP, 词向量]
description: "怎么把'词'变成有语义的向量：分布假说、Word2Vec 的两种结构、FastText 的字符改进。"
abbrlink: 4016747543
---

NLP 全景里说过：词向量是文本表示的第二次质变——让机器"看到"词与词的语义关系。这一篇讲透词向量的核心思想与两种经典实现，以及 FastText 为什么在小样本和中文上更友好。理解了"词怎么变成向量"，也就理解了 embedding 在一切模型里的位置。

## 核心思想：分布假说

词向量一切方法的哲学基础是一句朴素观察：**"词的语义由它常出现的语境决定"**（distributional hypothesis，分布假说）。

> "苹果"和"香蕉"为什么语义相近？因为它们都常出现在"吃""水果""甜"这样的语境里。

所以训练目标可以变成：**让语境相似的词，向量也相近**——不用任何人工标注，从海量文本里自动学出来。这就是词向量"免费"获得语义的秘诀。

## Word2Vec：从上下文学词

Word2Vec（2013, Mikolov）用神经网络实现分布假说，有两种结构：

### CBOW：用上下文猜中心词

```text
输入: 我 _ 北京      （把"爱"的上下文给模型）
输出: 猜中心词 = 爱
```

### Skip-gram：用中心词猜上下文

```text
输入: 爱
输出: 猜它周围的词（我、北京、天安门...）
```

两种结构学完后，把网络第一层的权重拿出来——**每个词的向量就在里面**。训练完的副产品（词向量）反而是价值核心。

用 gensim 训练自己的词向量：

```python
from gensim.models import Word2Vec
from gensim.models.word2vec import LineSentence

# sentences.txt: 每行一段已分词的文本，词用空格隔开
sentences = LineSentence("corpus.txt")
model = Word2Vec(sentences, vector_size=100, window=5,
                 min_count=2, sg=0, epochs=10)   # sg=0: CBOW；1: Skip-gram

print(model.wv.similarity("缺陷", "质量问题"))     # 语义相近的词相似度高
print(model.wv.most_similar("浇筑", topn=5))      # 找相似词
```

## FastText：词向量的"字符级"改进

FastText（Facebook, 2016）解决了 Word2Vec 的两个问题：

**问题一：生词（OOV）没有向量**。训练语料里没见过的词，Word2Vec 直接没辙。FastText 的答案：**把词拆成字符 n-gram，词的向量 = 字符 n-gram 向量的和**。

```text
"蜂窝" → 拆成子串: "蜂", "窝", "蜂窝", "<蜂", "蜂窝>" ...
vec("蜂窝") = 所有子串向量求和
```

于是**没见过的词也能拼出向量**（只要字符出现过），中文这种组合性强的语言尤其受益。

**问题二：数据少时学不好**。字符信息共享让 FastText 在少量样本上比 Word2Vec 更稳——这对垂直领域（建筑术语、医疗术语）特别重要。

```python
from gensim.models.fasttext import FastText

model = FastText(sentences, vector_size=100, min_count=1, epochs=10)
vec = model.wv["模型没见过的新词"]    # 生词也能拿到向量（字符级兜底）
```

## 词向量的三个经典用法

训练完词向量（或直接用预训练好的），怎么用？

1. **当模型输入**：把句子里的每个词替换成它的向量，喂给下游模型（RNN/CNN 分类）；
2. **算语义相似**：余弦相似度找近义词、算句子相似（词向量平均）；
3. **做检索特征**：传统做法里给文本检索提供语义补充。

**注意时代背景**：2018 年后，BERT 这类预训练模型提供了更强的上下文表示，静态词向量在"深度模型输入"这个位置被替代。但 Word2Vec/FastText 的思想并没有过时——**它仍是理解 embedding 的必修课**，且在一些场景（轻量基线、离线语义词典）依然实用。

## 和现在的关系：一切皆 Embedding

"词向量"今天被统称为 **Embedding**，但思想一脉相承：把离散的 ID（词、字符、甚至用户、文档）映射成稠密向量，让相似的东西向量相近。

- 词 → Embedding（Word2Vec/FastText/BERT）
- 文档 → Embedding（RAG 里的向量化，BGE-M3 等）
- 连 Transformer 里的 token embedding 位置，本质都是同一件事

**你现在 RAG 里做的 embedding，就是词向量思想在文档级别的延伸**——这就是为什么懂词向量，才能真正理解向量检索为什么有效。

## 小结

词向量的心智链：**分布假说（语境定语义）→ Word2Vec 从上下文学向量 → FastText 用字符 n-gram 解决生词与小样本**。它是 NLP 从"符号"走向"语义数字"的转折点，也是今天一切 embedding（包括 RAG 向量化）的思想源头。

向量有了，下一篇用它们做 NLP 最经典的任务：文本分类——从朴素贝叶斯到 FastText，看基线模型怎么一步步逼近业务可用。
