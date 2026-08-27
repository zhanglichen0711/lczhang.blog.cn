---
title: "Linear Models, KNN and Trees as Honest Baselines"
date: 2024-09-03
categories:
  - Machine-Learning
tags: [机器学习]
description: "Run a cheap baseline before BERT. The gap tells you what the extra cost buys."
---

线性回归给出「损失可导就能迭代」。KNN 强调距离和标准化。树模型在表格数据和需要解释时仍然好用。

文本层级分类可以先跑随机森林和 FastText，再决定上 BERT。基线不是过时作业，是让后面的提升有参照。
