---
title: "Tensors, Linear Layers and Why Init Is Not Trivia"
date: 2024-10-28
categories:
  - Deep-Learning
tags: [深度学习]
description: "Zero init makes neurons symmetric. Kaiming / Xavier keep signals usable."
abbrlink: 852511471
---

文本和图像最后都变成张量。`nn.Linear` 是一层仿射变换。

建模型的固定动作：继承 `nn.Module`，在 `__init__` 声明层，在 `forward` 写数据流，再选损失和优化器。

初始化不是细节。全零会让对称神经元学到同一套更新。Kaiming / Xavier 是为了让信号在深度里不至于一开始就消失或爆炸。
