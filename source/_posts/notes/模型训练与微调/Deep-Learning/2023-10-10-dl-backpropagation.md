---
title: "反向传播：梯度是怎么算出来的"
date: 2023-10-10
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 反向传播]
description: "链式法则驱动的误差回传：损失怎么穿过层层网络，算出每个参数的调整方向。"
abbrlink: 3601216704
---

前向传播算出了预测和损失，但网络有成千上万个参数——**每个参数该往哪个方向调、调多少**？反向传播（Backpropagation）就是回答这个问题的算法，它是深度学习的发动机。这一篇不用复杂的数学符号堆砌，从"链式法则"这个唯一依赖的直觉出发，把它讲明白。

## 问题的本质：求每个参数的偏导

训练的目标是让损失 $L$ 变小。对某个权重 $w$，我们想知道：$w$ 变一点点，$L$ 变多少？这就是 $\frac{\partial L}{\partial w}$。有了它，更新规则很简单：

$$w \leftarrow w - \eta \cdot \frac{\partial L}{\partial w}$$

（$\eta$ 是学习率，下一篇讲。）所以**整个训练 = 反复算每个参数的偏导，然后往"让损失变小"的方向迈一步**。

## 链式法则：唯一需要理解的数学

反向传播不发明新数学，它只做一件事：**按计算顺序反着用链式法则**。

看一个串起来的例子：$L = (z-2)^2$，而 $z = w \cdot x + b$（一个最简单的网络）。想求 $\partial L / \partial w$：

$$\frac{\partial L}{\partial w} = \frac{\partial L}{\partial z} \cdot \frac{\partial z}{\partial w} = 2(z-2) \cdot x$$

关键洞察：**算"前面的参数"的梯度时，可以直接复用"后面的"梯度**——从输出往输入一路乘过去。这就是"反向"二字的来历：误差从输出层往输入层一层层传回去，每层只要算"局部梯度"，乘上从上一层传下来的值即可。

## 手算一次 2 层网络的反向

沿用上一篇的网络，走一遍"前向 → 反向"：

```python
import numpy as np

# 前向（沿用上一篇）
x = np.array([1.0, 2.0])
W1 = np.array([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]])
b1 = np.array([0.01, 0.02, 0.03])
W2 = np.array([[0.7, 0.8, 0.9]])
b2 = np.array([0.1])

y_true = np.array([2.0])
z1 = W1 @ x + b1
a1 = np.maximum(0, z1)          # ReLU
z2 = W2 @ a1 + b2
loss = 0.5 * (z2 - y_true) ** 2   # MSE，0.5 是为了求导好看
print("预测:", z2, "损失:", loss)

# ---- 反向：从 loss 往回推 ----
# 1. dL/dz2
dz2 = (z2 - y_true)                       # [1]

# 2. 输出层：dL/dW2 = dz2 * a1^T；dL/db2 = dz2
dW2 = dz2.reshape(1, 1) * a1.reshape(1, 3)
db2 = dz2.copy()

# 3. 误差传到隐藏层：dL/da1 = W2^T @ dz2
da1 = W2.T @ dz2                          # [3]
# 4. ReLU 的导数：输入 >0 的位置梯度保留，否则为 0
dz1 = da1 * (z1 > 0)                      # [3]
# 5. 输入层权重：dL/dW1 = dz1 * x^T
dW1 = np.outer(dz1, x)
db1 = dz1.copy()

print("dW1:\n", dW1)   # 每个隐藏权重该往哪调
```

请对照注释看每一行的来源——你会发现它**严格是前向的逆过程**，每一步都在用"上一层传下来的梯度 × 本层局部导数"。框架（PyTorch）做的事和这段代码完全一样，只是自动完成了。

## 自动求导：为什么你不用手写

真实网络几十层、几百万参数，手写反向会死人。深度学习框架的杀手锏是**自动求导**：你在代码里描述前向计算，框架记录下计算图，调用 `loss.backward()` 时自动按图反向算梯度。

```python
import torch

W1 = torch.randn(3, 2, requires_grad=True)   # requires_grad：我要它的梯度
W2 = torch.randn(1, 3, requires_grad=True)
b1 = torch.zeros(3, requires_grad=True)
b2 = torch.zeros(1, requires_grad=True)

x = torch.tensor([1.0, 2.0])
y_true = torch.tensor([2.0])

z1 = torch.relu(W1 @ x + b1)
z2 = W2 @ z1 + b2
loss = (z2 - y_true).pow(2)

loss.backward()            # 自动反向：每个 requires_grad 的张量拿到 .grad
print(W1.grad)             # 和手算的 dW1 一致
```

**你只需保证前向计算正确，梯度框架全包**。这解释了 PyTorch 等框架为什么"定义即训练"——它把最难的数学自动化了。

## 反向传播的经典困境：梯度消失

链式法则的代价在深层网络暴露：梯度从输出一路乘回输入，每层乘一个小于 1 的数（sigmoid 导数最大才 0.25），**乘几十次后梯度趋近于 0**——浅层参数几乎收不到更新信号，网络"前面学不动"。这就是"梯度消失"，也是 ReLU 取代 sigmoid、BatchNorm 出现的原因（后面专篇讲）。

## 小结

反向传播 = **链式法则的工程化应用**：误差从输出逐层回传，每层用"上游梯度 × 本层局部导数"算自己的参数梯度。理解它，你就能看懂为什么激活函数选 ReLU、为什么要有 BatchNorm、为什么学习率不能乱调——它们全是在和"梯度信号的质量"较劲。现代框架自动做反向，但你得知道它在做什么，才能调试"模型不学习"这类问题。

梯度算出来了，怎么用它更新参数才高效？下一篇：梯度下降与优化器。
