---
title: "逻辑回归与分类问题"
date: 2023-08-11
categories:
  - [模型训练与微调, Machine-Learning]
tags: [机器学习, 逻辑回归]
description: "线性回归做不了分类？逻辑回归如何把分数变成概率，再到二分类决策。"
abbrlink: 2117755956
---

前面讲的线性回归在预测"连续数值"——房价、温度、销量。但机器学习里另一半常见问题是**分类**：这封邮件是不是垃圾邮件？这个零件有没有缺陷？这种"是/否"的问题，用线性回归直接拟合是不合适的。处理二分类的入门算法，就是逻辑回归。

## 为什么线性回归不适合分类

直观想：把"缺陷=1、正常=0"当目标去拟合一条直线，问题立刻暴露——

1. 直线的输出是**任意实数**（可能是 -3，也可能是 7），而我们要的是 0 或 1；
2. 直线对极端样本敏感，决策边界会被少数离群点带偏；
3. 无法给出"概率感"——业务上需要"这条质量缺陷的置信度是 92%"。

所以需要把线性输出**压到一个区间**，让它能当概率用。

## 从线性分数到概率：sigmoid

逻辑回归的核心就一步：把线性模型的输出 $z = w^Tx + b$ 塞进 **sigmoid 函数**：

$$\hat{y} = \sigma(z) = \frac{1}{1 + e^{-z}}$$

sigmoid 的性质：输入任意实数，输出永远落在 **(0, 1)** 之间。$z$ 越大越接近 1，$z$ 越小越接近 0——刚好能解释成"属于正类的概率"。

```python
import numpy as np


def sigmoid(z):
    return 1 / (1 + np.exp(-z))

z = np.array([-5, -1, 0, 1, 5])
print(sigmoid(z))
# [0.007 0.269 0.5 0.731 0.993]
```

拿到概率后，二分类决策只需一个阈值（默认 0.5）：概率 ≥ 0.5 判为正类，否则负类。

## 用 sklearn 三步搞定

```python
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 造一个二分类数据集
X, y = make_classification(n_samples=1000, n_features=8, random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
print("准确率:", accuracy_score(y_test, y_pred))
```

sklearn 的 `LogisticRegression` 已经把 sigmoid、参数学习、正则化全封装好了。重点理解**它返回的不仅是类别，还有概率**——生产里判断"要不要人工兜底"用的就是概率：

```python
proba = model.predict_proba(X_test[:3])[:, 1]   # 正类概率
print(proba)
```

## 怎么看模型学到了什么

逻辑回归是"白盒"模型——权重直接可解释：

```python
for name, coef in zip(["x1", "x2", "x3"], model.coef_[0]):
    print(f"{name}: {coef:.3f}")
```

权重的符号和大小告诉业务方：哪个特征在推高"缺陷概率"、哪个在压低。这在工程质量缺陷这类需要向业务解释的场景里，比黑盒模型值钱得多。

## 一个被名字误导的点

**逻辑回归是分类算法，不是回归算法**。名字里的"回归"来自历史渊源——它是在线性回归的框架上改了输出层和目标函数。记住：看名字判断用途会翻车，看它解决什么问题才靠谱。

它作为"线性分类器"的代表，优点是**快、可解释、是很多基线模型的起点**；缺点也明显——只能学线性边界，特征和目标的关系复杂时就力不从心（那时就需要后面的 SVM 核方法、树模型）。

## 小结

逻辑回归 = **线性模型 + sigmoid 压出概率 + 阈值做决策**。它是分类问题的入门课：帮你建立"模型输出概率、业务按阈值决策"的框架。准确率之外，记得用概率和权重做解释——模型能说清"为什么"，才敢在生产里用。

下一篇进入机器学习里"七分靠数据"的那部分：特征工程——同样的模型，喂不同的特征，效果天差地别。
