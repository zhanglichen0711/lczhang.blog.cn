---
title: "特征工程与数据预处理"
date: 2023-08-18
categories:
  - [模型训练与微调, Machine-Learning]
tags: [机器学习, 特征工程]
description: "同样的模型喂不同的特征，效果天差地别——分类变量、缺失值、量纲与文本特征的预处理套路。"
abbrlink: 853145242
---

机器学习圈有句老话："**数据和特征决定了效果的上限，模型只是逼近这个上限**"。同一个模型，特征处理得当与否，效果可能差出一大截。这一篇把最常用的特征工程手法过一遍——它们属于"不需要懂高深数学、但生产里每天都在用"的知识。

## 为什么要做特征工程

原始数据通常是"脏的、不规则的"：表格里有文本、有空值、数值量纲差异巨大、类别变量是字符串。模型只会算数，不理解"质量部""红""高"这种标签。**特征工程 = 把原始数据翻译成模型能高效学习的数值特征**。

## 数值特征：量纲要统一

身高 1.8 米和收入 8000 元放一起，数值大的特征会在距离计算里"压过"数值小的。解决办法是**归一化/标准化**：

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler

scaler = StandardScaler()          # 变均值 0、方差 1（最常用）
X_scaled = scaler.fit_transform(X)

minmax = MinMaxScaler()            # 缩放到 [0, 1]
```

对线性模型、SVM、KNN（都依赖距离）**必须做**；对树模型（按阈值切分）不是必须。

**一个必须避免的错**：`fit_transform` 只对训练集调用，测试集/线上数据用 `transform`——否则测试数据的信息泄漏进训练，评估结果虚高。

```python
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)   # fit 只在此处
X_test = scaler.transform(X_test)         # 复用训练集的参数
```

## 类别特征：变成模型能懂的数字

"部门=质量部/技术部/安全部"这种字符串不能直接喂模型。两个方向：

```python
from sklearn.preprocessing import OneHotEncoder

# 1. 独热编码：每个类别一个 0/1 维度（无序类别首选）
encoder = OneHotEncoder(sparse_output=False)
dept_encoded = encoder.fit_transform([["质量部"], ["技术部"], ["安全部"]])
```

独热编码的直觉：把"质量部/技术部/安全部"变成三个开关 `[1,0,0]`、`[0,1,0]`、`[0,0,1]`——模型不用假设"质量部>技术部"这种虚假的大小关系。

**类别很多（几十上百个）时**独热会产生稀疏大矩阵，可用频次编码（用该类别出现频率当数值）或 embedding 降维。

## 缺失值：别假装没有

缺失值处理三选一，按"信息量"取舍：

```python
from sklearn.impute import SimpleImputer

# 1. 数值列：用均值/中位数填充（中位数对离群点更稳）
imputer = SimpleImputer(strategy="median")
# 2. 类别列：用众数，或单独加一个"缺失"类别
imputer = SimpleImputer(strategy="most_frequent")
# 3. 缺失比例过高的列（如 >70%）：直接删列，别硬填
```

工程原则：**先看缺失比例再决定**——漏删一个"80% 都是空的列"，等于喂了一列噪声。

## 文本特征：从字符串到向量

分类里常见的"描述文本"（缺陷描述、施工问题描述），需要转成数值：

```python
from sklearn.feature_extraction.text import TfidfVectorizer

vectorizer = TfidfVectorizer(max_features=5000)   # 限制维度，防爆炸
X_text = vectorizer.fit_transform(["板面出现蜂窝麻面", "钢筋保护层厚度不足"])
```

TF-IDF 把每段文本变成"词的重要度向量"——出现越多越重要（TF），到处都出现的词反而不重要（IDF 惩罚）。它是文本分类（朴素贝叶斯、FastText 之外）最经典的基线。

## 日期与 ID 类特征：常被忽略

- **日期**：别把"2023-08-18"当数值喂——提取 `星期几`、`是否周末`、`距今天数` 才有意义；
- **ID 类**：用户 ID、文档 ID 是"标识"不是"特征"，直接喂会让模型去记忆编号，**一律删掉或做哈希**。

## 完整管线：Pipeline 一键串

特征处理步骤多，手写容易漏（尤其是测试集复用问题）。用 sklearn 的 Pipeline 把所有步骤串起来：

```python
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

pipe = Pipeline([
    ("scale", StandardScaler()),          # 1. 标准化
    ("model", LogisticRegression()),      # 2. 建模
])

pipe.fit(X_train, y_train)
print(pipe.score(X_test, y_test))         # 测试集自动走同样流程
```

Pipeline 保证**训练和预测走完全相同的处理链**，从根上杜绝"训练时忘了某步、预测时漏做"的 bug。

## 小结

特征工程的四个基本动作：**数值特征标准化（fit 只在训练集）、类别变量独热编码、缺失值看比例再处理、文本用 TF-IDF 向量化**，最后用 Pipeline 收口。做好这些，你的逻辑回归/SVM/KNN 就能在真实数据上"站起来"。

特征准备好了，下一篇回答一个尖锐问题：模型到底有没有用？——模型评估与交叉验证，别被一个准确率骗了。
