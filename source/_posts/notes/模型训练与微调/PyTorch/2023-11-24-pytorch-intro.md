---
title: "PyTorch 简介：动态图与自动求导"
date: 2023-11-24
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, 深度学习]
description: "为什么选 PyTorch：动态计算图、自动求导、Python 原生——研究到生产的桥梁。"
abbrlink: 1815827559
---

深度学习的前 10 篇把原理讲完了，但没人会手写反向传播去训模型——我们用框架。主流框架里 PyTorch 是当前研究和生产的事实标准。这一篇讲清楚它凭什么：**动态图**和**自动求导**两个设计，让"定义模型"和"调试模型"都异常顺滑。

## PyTorch 是什么

PyTorch 是 Meta 开源的深度学习框架，核心就两层：

1. **张量库**：GPU 加速的多维数组运算（对标 numpy，但能上显卡）；
2. **自动求导**：记录你的计算，自动算梯度——前一篇手写反向传播的活，它全包了。

它和 TensorFlow 最大的理念分歧在**动态计算图**：你的 Python 代码就是计算图本身，写一步、记一步。想 print 中间结果、想在中间加个 if 分支、想动态改网络结构？直接写 Python 就行——**调试体验和写普通 Python 程序一样**，这对研究迭代极其重要。

## 安装与第一个张量

```bash
pip install torch torchvision
```

```python
import torch

# 创建张量（多种方式）
x = torch.tensor([1.0, 2.0, 3.0])
zeros = torch.zeros(2, 3)
rand = torch.randn(4, 4)          # 标准正态分布

print(x.device)   # cpu —— 有 GPU 后可以 .cuda() 或 .to("cuda")
```

## 自动求导：requires_grad 的世界

PyTorch 自动求导的核心是张量上的 `requires_grad` 开关。开启后，这个张量参与的运算会被记录成计算图，调用 `backward()` 时自动算梯度：

```python
x = torch.tensor([2.0], requires_grad=True)
w = torch.tensor([3.0], requires_grad=True)

y = w * x + 1        # y = 7
loss = y ** 2        # loss = 49

loss.backward()      # 自动反向传播
print(w.grad)        # d loss / d w = 2*y*x = 2*7*2 = 28
print(x.grad)        # d loss / d x = 2*y*w = 2*7*3 = 42
```

`w.grad` 就是 w 的梯度——和你手算一致。**你只管描述前向计算，框架自动做反向**。这是 PyTorch 最核心的心智：定义即训练，不需要手写 backward。

## 用 nn.Module 组织模型

`torch.nn` 提供神经网络层和模型容器。定义模型的标准姿势是继承 `nn.Module`：

```python
import torch.nn as nn

class SimpleNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.layer1 = nn.Linear(10, 64)    # 全连接层
        self.layer2 = nn.Linear(64, 2)

    def forward(self, x):
        x = torch.relu(self.layer1(x))     # 前向：定义网络结构
        return self.layer2(x)

model = SimpleNet()
print(model)
```

三个约定：

1. **`__init__` 里声明层**（放 `nn.Module` 容器），参数自动注册；
2. **`forward` 里写前向逻辑**——它就是你前面手写的那个"数据流动"过程；
3. 反向传播**不需要你写**：`loss.backward()` 会沿着 forward 自动求导。

## 训练循环五件套

一个训练 step 的固定五步（前面已见过，这里再固化一次）：

```python
import torch

model = SimpleNet()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.CrossEntropyLoss()

for batch_x, batch_y in data_loader:
    optimizer.zero_grad()      # 1. 清空上一步梯度
    logits = model(batch_x)    # 2. 前向
    loss = loss_fn(logits, batch_y)   # 3. 算损失
    loss.backward()            # 4. 反向，自动填满 model 参数的 .grad
    optimizer.step()           # 5. 按梯度更新参数
```

`optimizer.step()` 内部做的事就是我们手动写的 `w = w - lr * w.grad`，只是支持了 Momentum、Adam 等更聪明的更新规则。

## 为什么要加 device 和 no_grad

两个高频出现的"仪式"，理解后就不晕了：

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)       # 模型搬到 GPU
data = data.to(device)         # 数据也要搬（CPU/GPU 张量不能直接运算）

with torch.no_grad():          # 推理/评估时：不追踪梯度
    logits = model(data)       # 省内存、更快
```

- **device 不一致**是新手最常见报错之一：`Expected all tensors to be on the same device`——模型和输入必须同处 CPU 或 GPU；
- 推理不需要梯度，`no_grad()` 关掉追踪，内存占用大减。

## 小结

PyTorch 的两大核心设计让深度学习"可调试"：**动态图让前向就是普通 Python、自动求导让反向全自动**。`nn.Module` 管结构、五步循环管训练、device/no_grad 是基本功。理解了这些，后面的张量、autograd、模型搭建、训练循环四篇，都是在给这套骨架填细节。

框架心智建立后，下一篇从最基础讲起：张量的创建、运算与索引——PyTorch 的一切数据操作。
