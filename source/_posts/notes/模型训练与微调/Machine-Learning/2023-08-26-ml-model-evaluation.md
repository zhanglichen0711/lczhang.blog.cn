---
title: "模型评估与交叉验证"
date: 2023-08-26
categories:
  - [模型训练与微调, Machine-Learning]
tags: [机器学习, 模型评估]
description: "准确率会骗人：类别不平衡、过拟合下的评估陷阱，用交叉验证与混淆矩阵把模型看清。"
abbrlink: 2117410589
---

训练完模型，第一个动作往往是打印一行"准确率 95%"。但准确率是个**会骗人的指标**——在真实数据上，95% 可能很好，也可能一文不值。这一篇讲清评估的正确姿势：怎么测、测什么、什么时候要换指标。

## 一个场景看清准确率的陷阱

假设质量缺陷样本里 99% 是"正常"、1% 是"缺陷"。一个**什么都不学、永远预测"正常"**的模型，准确率是 99%——看起来吊打一切。但这个模型实际毫无用处：它一个缺陷都发现不了。

**结论：类别不平衡时，准确率不能当唯一指标**。评估指标必须跟着业务目标走。

## 先看混淆矩阵

所有分类指标都从 4 个数字出发（以"缺陷=正类"为例）：

| | 预测缺陷 | 预测正常 |
| --- | --- | --- |
| 实际缺陷 | TP（真正例） | FN（假负例，漏报） |
| 实际正常 | FP（假正例，误报） | TN（真负例） |

```python
from sklearn.metrics import confusion_matrix

cm = confusion_matrix(y_test, y_pred)
# [[TN, FP],
#  [FN, TP]]
```

关键在**两类错误的代价不同**：质量场景漏报一个缺陷（FN）可能出大事故，误报（FP）只是多派人复查——FN 比 FP 贵得多。只看准确率就把这个差异抹平了。

## 不平衡分类的正确指标

- **召回率（Recall）= TP / (TP+FN)**：缺陷里抓出了多少？漏报敏感场景的死盯指标；
- **精确率（Precision）= TP / (TP+FP)**：说"有缺陷"的里面真有缺陷的比例？误报成本高的场景看它；
- **F1**：两者调和平均，给一个综合分。

```python
from sklearn.metrics import recall_score, precision_score, f1_score

print("召回率:", recall_score(y_test, y_pred))
print("精确率:", precision_score(y_test, y_pred))
print("F1:", f1_score(y_test, y_pred))
```

**鱼与熊掌**：想多抓缺陷（召回高）就得多报（精确降），反之亦然。生产里通常按业务定一个"能接受的误报率"，去最大化召回——这也是后面要讲"阈值可以调"的用武之地（`predict_proba` 的阈值从 0.5 往下调，召回就上去了）。

## 评估必须留"没见过的数据"

模型在训练数据上的准确率毫无意义——它会**记住**数据（尤其树模型、大参数模型），这叫过拟合。评估的铁律：

```python
from sklearn.model_selection import train_test_split

# 切三份：训练 / 验证（调参用）/ 测试（最终验收，只碰一次）
X_train, X_tmp, y_train, y_tmp = train_test_split(X, y, test_size=0.3, random_state=42)
X_val, X_test, y_val, y_test = train_test_split(X_tmp, y_tmp, test_size=0.5, random_state=42)
```

纪律：**测试集只在最终评估时用一次**。反复看测试集结果再回头调参，测试集就"脏了"，评估结果虚高——相当于考试前偷看了答案。

## 交叉验证：数据少时的稳妥评估

数据不多时，"切一次测试集"结果可能受运气影响。交叉验证（K-Fold）把数据切成 K 份，轮流拿 1 份验证、其余训练，K 次结果取平均——每个样本都被验证过一次：

```python
from sklearn.model_selection import cross_val_score

scores = cross_val_score(model, X, y, cv=5)   # 5 折
print("每折得分:", scores)
print("平均:", scores.mean(), "±", scores.std())
```

注意**交叉验证用于选模型/调参**，最终汇报给业务方时，还是用预留测试集的结果——那是模型没见过、最可信的评估。

## 一个泄漏的坑：预处理要在折内做

用 Pipeline + 交叉验证时最容易踩的坑是**信息泄漏**：如果在切分之前就对全量数据做了标准化/填充缺失值，验证折的数据就被"偷看"了。正确做法（Pipeline 自动解决）：

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

pipe = Pipeline([
    ("scale", StandardScaler()),   # 每折内部才 fit，不跨折泄漏
    ("model", LogisticRegression()),
])
scores = cross_val_score(pipe, X, y, cv=5)
```

Pipeline 保证标准化只在每一折的训练部分学习参数，从机制上杜绝泄漏。

## 小结

评估的正确姿势三句话：**别只看准确率（不平衡就上召回/精确/F1）、测试数据必须没见过（留三份+纪律）、数据少用交叉验证（Pipeline 防泄漏）**。模型好不好，不是"训练时多准"，而是"没见过的数据上能不能打"——评估方法论到位，才能判断一次调参是变好还是幻觉。

模型会测了，下一篇给线性模型加"核武器"：支持向量机与核方法——线性的边界不够用时怎么办。
