---
title: "张量：创建、运算与索引"
date: 2023-12-01
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, 张量]
description: "PyTorch 一切操作的对象：张量的创建方式、广播运算、维度操作与索引切片。"
abbrlink: 1444034012
---

深度学习代码 90% 的时间在和张量打交道。张量是 PyTorch 的基本数据类型（对标 numpy 数组），这一篇把最常用的张量操作系统过一遍——它们会在后面每一段模型代码里反复出现。

## 创建张量的常用姿势

```python
import torch

torch.tensor([1, 2, 3])              # 从数据创建
torch.zeros(2, 3)                    # 全 0，形状 (2,3)
torch.ones(2, 3)                     # 全 1
torch.randn(4, 4)                    # 标准正态随机（初始化权重常用）
torch.arange(0, 10, 2)               # [0,2,4,6,8]，类似 range
torch.full((2, 2), 7)                # 填满同一个值
```

**统一的关键字：形状（shape）用元组传**。`torch.zeros(2, 3)` 就是"2 行 3 列"。

## dtype：类型决定内存和精度

模型权重默认用 `float32`，不是 Python 的 `float`（float64）。显式指定类型：

```python
x = torch.tensor([1, 2], dtype=torch.float32)
x = x.float()      # 转 float32（常用）
x = x.long()       # 转整型（标签常用）
```

**最常见的一类报错**：`expected scalar type Long but found Float`——把浮点数据喂给了需要整数的地方（如分类标签）。看到它先查 dtype。

## 索引与切片：和 numpy/Python 一致

```python
x = torch.arange(12).reshape(3, 4)
# tensor([[0, 1, 2, 3],
#         [4, 5, 6, 7],
#         [8, 9, 10, 11]])

x[0]        # 第一行
x[:, 1]     # 第二列
x[1:, :2]   # 后两行的前两列
x[x > 5]    # 布尔索引：大于 5 的元素
```

注意一个细节：**`x[0] = 5` 会原地修改 x（和 numpy 一样，张量是视图或拷贝要分清楚）**。想安全复制用 `x.clone()`。

## 形状操作：reshape 与维度

模型代码里"形状对不上"几乎都是 reshape/维度问题：

```python
x = torch.randn(2, 3, 4)

x.reshape(6, 4)         # 重排成 (6,4)
x.view(6, 4)            # 类似 reshape，要求内存连续
x.transpose(0, 1)       # 交换维度
x.permute(2, 0, 1)      # 任意重排维度顺序（图像 NCHW 常要调）
x.squeeze()             # 去掉长度为 1 的维度
x.unsqueeze(0)          # 加一个维度（如给单张图加 batch 维）
```

图像数据里最常见的操作是 `(B, C, H, W)` 的维度调整，`permute` 和 `unsqueeze` 高频出现。

## 广播机制：不同形状也能算

张量运算时形状不完全一致，PyTorch 会自动**广播**：把维度从尾部对齐，长度为 1 的维度自动扩展。

```python
a = torch.randn(32, 10)     # 一批 32 个样本
b = torch.randn(10)         # 一个偏置向量
c = a + b                   # b 广播成 (32,10) 后相加——每个样本加同一偏置
```

**广播的意义**：参数（偏置、均值）通常是一维的，数据和它运算时不用手动复制成整批形状。广播失效会报 `size mismatch`，说明两边的形状根本对不上——检查维度含义。

## 归约与聚合：把一批压成一个数

```python
x = torch.randn(32, 10)

x.mean()          # 全部平均（标量）
x.mean(dim=0)     # 沿第 0 维平均 → (10,)，即"每个特征的平均"
x.sum(dim=1)      # → (32,)
x.max() / x.argmax(dim=1)   # 最大值 / 每行最大值的下标（预测类别常用）
```

`dim=` 是归约的灵魂：**指定 dim 意味着"沿着这个维度压掉它"**，结果形状里少这一维。多分类预测取类别就是 `logits.argmax(dim=1)`。

## GPU 与 numpy 互转

```python
x = torch.randn(3, 3)

x.cpu()             # 搬到 CPU（GPU 张量才能转 numpy）
x.numpy()           # → numpy 数组（共享内存，改一边另一边也变，注意 clone）
torch.from_numpy(np_arr)   # numpy → 张量

x.to("cuda")        # 搬到 GPU
x.device            # 查看当前在哪
```

**张量在 CPU/GPU 之间不能混算**，数据管线里要统一 device（前面提过，这里给出具体 API）。

## 小结

张量操作按四类记忆：**创建（zeros/randn/arange）、形状（reshape/permute/squeeze）、运算（广播 + dim 归约 + argmax）、搬运（to/device）**。dtype 和 device 是最常踩的两个坑。这些操作练熟后，看模型代码就像看积木拼接——下一篇把最神奇的积木拆开：autograd 到底怎么自动求导。
