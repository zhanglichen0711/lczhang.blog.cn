---
title: "反向传播与优化器"
date: 2024-12-14
categories:
  - Deep-Learning
tags: [深度学习]
description: "更新后必须清梯度。学习率比换一个更花哨的块更常成为原因。"
---

前向算损失，反向传梯度，更新后清零。不清零会把上一步梯度累加进去。

Momentum 带着历史速度走。Adagrad / RMSProp 按参数自己的历史梯度调步长。Adam 是两者的常用组合。平坦区域和鞍点是纯 SGD 容易卡住的地方，也是这些方法出现的原因。
