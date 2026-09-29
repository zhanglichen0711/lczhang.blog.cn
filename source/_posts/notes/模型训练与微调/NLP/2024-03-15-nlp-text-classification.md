---
title: "文本分类：朴素贝叶斯到 FastText"
date: 2024-03-15
categories:
  - [模型训练与微调, NLP]
tags: [NLP, 文本分类]
description: "从'词频统计'到'词向量平均'：文本分类的基线模型怎么选，效果怎么稳步提升。"
abbrlink: 2461459681
---

文本分类是 NLP 落地最广的任务：工单自动分派、缺陷描述定级、垃圾评论拦截……都是"给一段文本贴标签"。这一篇沿着模型演进的路线走一遍：**朴素贝叶斯 → TF-IDF + 线性模型 → FastText**，理解每步在解决什么问题，以及什么时候够用、什么时候该上预训练模型（下一篇）。

## 建立基线：朴素贝叶斯

最朴素但有效的思路：把文本当作"词的袋子"（词序不重要），用每个词在各类别里的出现概率来投票：

```python
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

pipe = Pipeline([
    ("vec", CountVectorizer(tokenizer=lambda s: s.split())),  # 已分词文本
    ("clf", MultinomialNB()),
])
pipe.fit(train_texts, train_labels)
print("准确率:", pipe.score(test_texts, test_labels))
```

朴素贝叶斯假设词之间独立（所以叫"朴素"），现实中不成立，但**作为基线它又快又稳**——先跑它拿到一个"分数下限"，后面所有模型都跟它比。

## 提升：TF-IDF + 线性模型

朴素贝叶斯对"高频无意义词"一视同仁。TF-IDF 给词加权：**出现越多越重要、到处都有反而不重要**，配合线性模型（逻辑回归/SVM）通常能再涨几个点：

```python
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer

pipe = Pipeline([
    ("tfidf", TfidfVectorizer(max_features=50000, ngram_range=(1, 2))),
    ("clf", LogisticRegression(max_iter=1000)),
])
pipe.fit(train_texts, train_labels)
print("TF-IDF + LR 准确率:", pipe.score(test_texts, test_labels))
```

`ngram_range=(1, 2)` 把"相邻两个词"也当特征——"质量缺陷"这种组合词的语义就进来了。**TF-IDF + 线性模型的组合，是传统文本分类的"天花板级基线"**。

## FastText：词向量的轻量分类

传统方法的问题是**稀疏**：每个词是一个维度，没见过的组合特征就失效。FastText 把文本分类做成"词向量取平均 + 线性分类"，稠密且快：

```python
from gensim.models import fasttext
# 或用 fasttext 官方库
import fasttext

# 数据格式：每行 "__label__类别 已分词文本"
model = fasttext.train_supervised(
    input="train.txt",
    lr=1.0, epoch=25, wordNgrams=2,   # wordNgrams 抓词序
)

print(model.test("test.txt"))          # (样本数, 精确率, 召回率)
print(model.predict("板面 蜂窝 麻面 严重"))
# (('__label__缺陷',), array([0.97]))
```

FastText 相对传统方法的优势：**快（可训亿级样本）、能处理生词（字符 n-gram）、自带词序信息**。在很多"标注数据几千条、类别几十个"的业务场景，FastText 训出来就接近可用了——它也是你简历里"对比随机森林、FastText、BERT 后采用 BERT"这条选型路线中的关键参照物。

## 什么时候该升级到 BERT

传统模型和 FastText 的天花板是**语义**："混凝土强度不足"和"构件承载力不够"在词面上毫无重叠，但语义相同——词袋模型永远认不出。这类需求出现了，就该上预训练模型（BERT）：

| 场景 | 该用什么 |
| --- | --- |
| 类别靠关键词区分、数据几千条 | TF-IDF / FastText 足够，快且稳 |
| 表述多样、需要语义理解、追求上限 | BERT 等预训练模型微调 |
| 数据只有几百条 | 先跑基线，再考虑预训练 + 数据增强 |

**选型铁律：先跑基线，再谈升级**。很多团队一上来就微调 BERT，却连 FastText 能到多少分都不知道——先有对比，才知道升级值不值。

## 分类任务的效果评估

文本分类评估别只看准确率（类别不平衡时会被骗），用宏平均 F1 看各类别综合表现：

```python
from sklearn.metrics import classification_report

print(classification_report(test_labels, preds))
# 看每个类别的 precision/recall/F1，重点关注样本少的类别
```

**每一类都要看**——缺陷分类里"次要缺陷"样本少，如果它 F1 只有 0.3，说明模型实际不可用，只是整体准确率好看。

## 小结

文本分类的升级路线：**朴素贝叶斯（基线）→ TF-IDF+线性（强基线）→ FastText（轻量语义）→ BERT（语义天花板）**。每一步解决前一步的一个短板。工程上记住：先建基线、对比着升级；评估按类别看 F1，别被整体准确率骗。这个"选型-对比-评估"的方法论，在你做任何分类任务（包括缺陷定级）时都能复用。

词袋模型到词向量都试过了，下一篇进入真正"处理序列"的模型：RNN 与 LSTM——为什么它们曾是不可替代的序列建模者。
