---
title: "Backprop, Optimizers and the Brakes"
date: 2024-12-14
categories:
  - Deep-Learning
tags: [深度学习]
description: "Clear grads every step. Learning rate beats a fancier block more often than expected."
---

前向算损失，反向传梯度，更新后清零。不清零会把上一步梯度累加上去。

- Momentum：带着历史速度
- Adagrad / RMSProp：按参数自己的历史梯度调步长
- Adam：两者的常用组合

Dropout 和 BatchNorm 是训练刹车。应用侧还有更土的刹车：早停、洗标签、低置信度交给规则。
