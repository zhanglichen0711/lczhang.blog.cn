---
title: PyTorch：动态图与张量运算
date: 2024-02-16
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, 深度学习]
description: PyTorch：动态图与张量运算
abbrlink: 611543871
---

Tensor 是基本数据结构，在 GPU 上做并行计算。

1. 动态图让调试直观，前向定义即计算图，改模型不改图。
2. autograd 自动求导，反向传播一行 `backward()`。
3. `Dataset` 定义读取，`DataLoader` 管批处理和打乱。
4. 训练前先 `model.train()`，评估先 `model.eval()`。
