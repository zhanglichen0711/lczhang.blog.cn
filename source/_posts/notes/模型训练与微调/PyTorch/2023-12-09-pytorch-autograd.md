---
title: "autograd 自动求导"
date: 2023-12-09
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, autograd]
description: "PyTorch 的杀手锏：计算图怎么记录、backward 怎么算梯度，以及 detach 和 no_grad 的差别。"
abbrlink: 2306533608
---

前一篇反向传播讲了梯度怎么手算，这一篇看 PyTorch 怎么把它**全自动**。核心是 autograd 系统：你在代码里写前向，它默默记录一张"计算图"，你调用 `backward()`，梯度沿图自动回传。理解它的三个概念（requires_grad、计算图、no_grad/detach），模型训练代码就不再有任何黑盒。

## 计算图：自动求导的地基

对开启了 `requires_grad` 的张量做运算时，PyTorch 会记录"这个结果是怎么算出来的"——哪些输入、什么运算。这个记录就是计算图。

```python
import torch

x = torch.tensor([2.0], requires_grad=True)   # 叶子节点：需要梯度
w = torch.tensor([3.0], requires_grad=True)

y = w * x          # 中间节点：记录 y = w*x
z = y + 1          # 中间节点
loss = z ** 2      # 输出节点

print(loss.grad_fn)  # <PowBackward0> —— 记录着"loss 是 z**2 算出来的"
```

每个结果张量的 `.grad_fn` 指向"生成我的那个运算的反向函数"。`loss.backward()` 就是沿着这条链从后往前跑这些反向函数，把梯度一路乘回 `x` 和 `w`。

## backward：梯度填到 .grad

```python
loss.backward()

print(x.grad)   # tensor([42.])  计算: d loss/d x
print(w.grad)   # tensor([28.])
```

只有 `requires_grad=True` 的张量会拿到 `.grad`。非叶子节点的梯度默认不保留（省内存），需要时用 `.retain_grad()`。

## 一个典型的训练用法：对"参数"求导

实际训练中，你几乎不给输入开 requires_grad，而是给**模型参数**开——模型参数的 `requires_grad` 在 `nn.Module` 里默认就是 True：

```python
import torch.nn as nn

model = nn.Linear(3, 1)          # 两个参数：weight 和 bias
for name, param in model.named_parameters():
    print(name, param.shape, param.requires_grad)
# weight torch.Size([1, 3]) True
# bias   torch.Size([1])    True

x = torch.randn(4, 3)
y_true = torch.randn(4, 1)

loss = ((model(x) - y_true) ** 2).mean()
loss.backward()                  # 自动算出 model.weight.grad / model.bias.grad
print(model.weight.grad)
```

训练循环里 `optimizer.step()` 读的就是这些 `.grad`——**反向传播到这一步，框架全包了**。

## no_grad vs detach：什么时候"切断"

自动求导不是免费的：它要存计算图，占内存、拖速度。推理和评估阶段不需要梯度，有两种"切断"方式：

```python
# 方式一：with no_grad —— 块内所有计算都不建图（推理标准姿势）
with torch.no_grad():
    logits = model(x)          # 不存图、省内存、快

# 方式二：detach —— 从图中"摘下来"一个张量（值保留，但不参与反向）
emb = feature.detach()          # 冻结这个特征，后续运算不回传梯度到 feature
```

区别一句话：**`no_grad` 是上下文（整个块不算梯度），`detach` 是对象（这个张量不再连图）**。典型场景：

- 推理/评估 → `with torch.no_grad()`；
- 训练里想"冻结某些中间结果"（比如只更新部分网络）→ `.detach()`；
- 反向传播已经完成，只是取个值显示 → 两者皆可。

## 梯度累积的坑：为什么每步要 zero_grad

`backward()` 是把梯度**累加**到 `.grad` 上，不是覆盖。所以每个 step 前必须清零：

```python
optimizer.zero_grad()    # 把 model 所有参数的 .grad 置零
loss.backward()
optimizer.step()
```

如果忘了 `zero_grad`，上一个 batch 的梯度会叠加进来，参数更新方向被污染——loss 会越来越诡异。这也是新手最常踩的 bug 之一（前面训练篇提过，这里给到机制层面的解释）。

## 调试技巧：验证梯度对不对

自己实现模块时想确认反向没错，用数值梯度对比——把参数微调一点点，看 loss 变化是否和 `.grad` 一致：

```python
param = model.weight
eps = 1e-4

loss1 = loss_fn(model(x), y)
loss1.backward()
grad_auto = param.grad.clone()

# 数值梯度：手动扰动算近似
with torch.no_grad():
    param.add_(eps)
    loss2 = loss_fn(model(x), y)
    param.sub_(eps)
grad_numeric = (loss2 - loss1) / eps

print("自动梯度:", grad_auto.flatten()[:3])
print("数值梯度:", grad_numeric.flatten()[:3])
# 两者应接近——不一致说明反向实现有问题
```

## 小结

autograd 的三板斧：**requires_grad 开启追踪、计算图记录来源、backward 沿图回传**。使用上记住三件事：`loss.backward()` 自动填 `.grad`、每步先 `zero_grad`、推理用 `no_grad`/冻结用 `detach`。理解了这套机制，训练循环的每一步对你都是透明的。

梯度能自动算了，下一篇进入模型工程的正题：用 nn.Module 把"网络结构"组织成可以训练、可以保存的模块。
