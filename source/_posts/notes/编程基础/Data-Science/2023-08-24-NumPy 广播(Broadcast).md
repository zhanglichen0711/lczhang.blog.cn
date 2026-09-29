---
title: "NumPy 广播(Broadcast)"
date: 2023-08-24
categories:
  - [编程基础, Data Science]
tags: [Python, Numpy]
description: "NumPy 广播(Broadcast)"
abbrlink: 1122372260
---

## 简介

矩阵加法教科书上要求"形状必须相同"，但 NumPy 里 `(3,4) + (4,)` 居然不报错还能算对——这就是**广播（Broadcasting）**：当两个数组形状不同时，NumPy 自动"复制"较小的数组，把形状补齐再运算。

广播是 NumPy 向量化运算的基石，也是最容易让人懵的机制。理解它只需要两条规则，背下来以后，90% 的形状错误都能自己推理出原因。

## 基本用法

**广播两条规则：**

1. 两个数组从**最后一个维度向前**逐个比较，每个维度要么相等，要么其中一个是 1，要么该维度不存在（缺失当作 1）
2. 维度为 1 或缺失的那一方，沿着该维度"复制"自己，直到形状一致

```python
import numpy as np

# 经典例子：二维数组 + 一维向量
a = np.array([[ 0,  0,  0],
              [10, 10, 10],
              [20, 20, 20],
              [30, 30, 30]])     # shape (4, 3)

b = np.array([1, 2, 3])          # shape (3,)

print(a + b)
# b 被广播成 4 行，相当于：
# [[1 2 3],
#  [1 2 3],
#  [1 2 3],
#  [1 2 3]]
# 输出:
# [[ 1  2  3]
#  [11 12 13]
#  [21 22 23]
#  [31 32 33]]
```

注意广播是**概念上的复制**，内存里并没有真的复制 4 份，所以零开销。

## 常用 API 详解

### 1. 标量广播：无处不在

```python
import numpy as np

a = np.array([1.0, 2.0, 3.0])

print(a * 2)        # 标量广播成 [2,2,2] → 输出: [2. 4. 6.]
print(a > 1.5)      # 输出: [False  True  True]

# 常见用途：数据归一化
temps = np.array([36.5, 37.0, 38.5])
print((temps - 36.5) / 0.1)   # 输出: [ 0.  5. 20.]
```

### 2. 列向量广播：shape (n,1) 是关键

```python
import numpy as np

col = np.arange(1, 4).reshape(3, 1)   # shape (3, 1) —— 注意是二维！
row = np.array([10, 20, 30])           # shape (3,)

print(col + row)
# col 沿列复制 → (3,3)，row 沿行复制 → (3,3)
# 输出:
# [[11 21 31]
#  [12 22 32]
#  [13 23 33]]

# 这就是 fromfunction 九九乘法表的广播写法
print(col * np.array([1, 2, 3]))
# 输出:
# [[1 2 3]
#  [2 4 6]
#  [3 6 9]]
```

### 3. 广播失败案例：读懂报错

```python
import numpy as np

a = np.ones((3, 4))
b = np.ones((3,))

try:
    a + b
except ValueError as e:
    print(e)
# 输出: operands could not be broadcast together
# with shapes (3,4) (3,)
# 原因：从后往前比，4 vs 3 既不相等也不是1 → 失败

# 解决：把 b 变成 (3,1) 的列向量，或 b[:4] 截断
print(a + np.ones((3, 1)))    # (3,4)+(3,1) → 列方向广播，OK
```

### 4. 主动广播：np.broadcast_to / np.broadcast_arrays

```python
import numpy as np

b = np.array([1, 2, 3])

# broadcast_to：显式声明广播后的形状（只读视图）
view = np.broadcast_to(b, (4, 3))
print(view.shape)       # 输出: (4, 3)

# 看看两个数组各自广播成了什么样
x = np.arange(4).reshape(4, 1)
y = np.arange(3)
bx, by = np.broadcast_arrays(x, y)
print(bx.shape, by.shape)   # 输出: (4, 3) (4, 3)
```

## 综合示例

学生成绩的"按行/按列"统计归一化，一行代码各归各位：

```python
import numpy as np

# 4个学生 × 3门课
scores = np.array([[92, 88, 95],
                   [55, 60, 48],
                   [78, 82, 85],
                   [90, 65, 70]])

# 1. 每门课减去全班的总平均（标量广播）
centered = scores - scores.mean()
print(f"总平均: {scores.mean():.1f}")   # 输出: 总平均: 75.7

# 2. 每门课减去该课程的平均分（列均值 (3,) 广播到 (4,3)）
col_centered = scores - scores.mean(axis=0)
print(col_centered.round(1))
# 输出:
# [[ 13.2  14.2  20.5]
#  [-23.8 -13.8 -26.5]
#  [ -0.8   8.2  10.5]
#  [ 11.2  -8.8  -4.5]]

# 3. 每个学生除以自己的满分基准（行向量 (4,1) 广播）
personal_best = scores.max(axis=1).reshape(4, 1)
ratio = scores / personal_best          # (4,3) / (4,1) → 列方向广播
print(ratio.round(2))
# 输出:
# [[0.97 0.93 1.  ]
#  [0.92 1.   0.8 ]
#  [0.92 0.96 1.  ]
#  [1.   0.72 0.78]]

# 4. 距离矩阵：广播替代双重循环
pts = np.array([[0, 0], [3, 4], [6, 8]])
diff = pts.reshape(3, 1, 2) - pts.reshape(1, 3, 2)   # (3,1,2)-(1,3,2)→(3,3,2)
dist = np.sqrt((diff ** 2).sum(axis=2))
print(dist.round(2))
# 输出:
# [[ 0.    5.   10.  ]
#  [ 5.    0.    5.  ]
#  [10.    5.    0.  ]]
```

## 小结

- 广播规则一句话：**从后往前比维度，相等或为 1 就能补**
- `(3,)` 和 `(3,1)` 天差地别：前者按行铺、后者按列铺，reshape 成 `(n,1)` 是解决"该广播却没广播"的标准手术
- 广播失败时报错会写明两个 shape，从最后一个维度开始逐对排查即可
- 广播是零拷贝的虚拟复制，放心用；只有 `np.broadcast_to(...).copy()` 才会真正占内存
