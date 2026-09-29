---
title: "Matplotlib 散点图"
date: 2024-01-06
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 散点图"
abbrlink: 1122372287
---

# Matplotlib 散点图

## 简介

散点图是探索"两个变量之间有没有关系"的第一工具。把每个样本按 (x, y) 坐标撒到平面上，是聚成一团、拉成一条斜线，还是散落无序——数据关系一眼便知。回归分析、聚类分析之前，先画一张散点图几乎成了条件反射。

散点图的威力不止二维。点的**大小**（`s`）、**颜色**（`c`）都可以映射第三个、第四个变量，做成"气泡图"；配合分类着色还能在同一张图里对比多个群体。可以说散点图是 Matplotlib 中"信息密度/绘制成本"比最高的图表类型。

负责散点的是 `plt.scatter()` 函数。它与折线图的 `plot()` 都能画点，区别在于：`scatter` 允许**逐点**设置大小和颜色（每个点可以不一样），`plot` 只能整组统一设置。要做颜色映射、气泡图，必须用 `scatter`。

## 基本用法

最基础的散点图只需 x、y 两组等长数据。配合 `alpha` 处理点重叠、`edgecolors` 描边增加层次感，是散点图的"出厂三件套"。

```python
import matplotlib
matplotlib.use('Agg')  # 保存图片用 Agg 后端（无显示器环境）
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

np.random.seed(61)
n = 120
height = np.random.normal(168, 9, n)                        # 身高 cm
weight = (height - 100) * 0.9 + np.random.normal(0, 5, n)   # 体重 kg
age = np.random.randint(18, 65, n)

plt.figure(figsize=(9, 5.5))
# s: 点面积(映射年龄), c: 颜色数值(映射年龄), cmap: 色谱
sc = plt.scatter(height, weight, s=age * 2.2, c=age,
                 cmap='viridis', alpha=0.65, edgecolors='white',
                 linewidths=0.6)
plt.colorbar(sc, label='年龄')   # 颜色条解读 c 映射
plt.title('身高-体重-年龄三维关系散点图')
plt.xlabel('身高 (cm)')
plt.ylabel('体重 (kg)')
plt.grid(alpha=0.3)
plt.savefig('scatter_3d.png', dpi=120, bbox_inches='tight')
```

![身高体重年龄三维散点图](/img/image-20260904211329177.png)

这张图其实塞进了四个维度：x 是身高、y 是体重、点的大小和颜色都映射年龄。注意 `s` 是**面积**（平方磅）不是直径，所以把变量线性映射到 `s` 时，视觉差异会被平方放大——大数值差异会更夸张，这是气泡图解读时要知道的"视觉陷阱"。

## 常用 API 详解

### s —— 点的大小

`s` 可以是标量（所有点一样大）或与数据等长的数组（逐点设置）。气泡图就是 `s` 映射某个变量的散点图，常用 `(value - min) * k` 做线性缩放控制点的视觉尺寸。

```python
x = np.arange(1, 8)
sales = [32, 55, 41, 78, 60, 92, 71]
plt.scatter(x, sales, s=sales * 6, alpha=0.6, color='tab:blue')
plt.title('销售额气泡图：面积 ∝ 销售额')
plt.savefig('bubble_s.png', dpi=120, bbox_inches='tight')
```

### c + cmap —— 颜色映射

`c` 传数值数组时配合 `cmap` 做连续色彩映射（记得加 `colorbar`）；传颜色名列表时做分类着色。常用色谱：`viridis`（感知均匀、通用首选）、`YlOrRd`（热力感）、`coolwarm`（正负对比）。

```python
x = np.random.uniform(0, 10, 100)
y = x + np.random.normal(0, 1, 100)
plt.scatter(x, y, c=y, cmap='coolwarm', s=45)
plt.colorbar(label='y 值')
plt.savefig('scatter_cmap.png', dpi=120, bbox_inches='tight')
```

### 分类着色 —— 多群体对比

按类别分组画多个 `scatter` 并各自命名 `label`，是分类散点的标准做法，图例自动生成。比把类别编码成数字再映射颜色更清晰。

```python
classes = ['Iris-setosa', 'Iris-versicolor', 'Iris-virginica']
colors = ['tab:blue', 'tab:orange', 'tab:green']
np.random.seed(62)
centers = [(5.0, 3.4), (5.9, 2.8), (6.6, 3.0)]
scales = [(0.35, 0.38), (0.52, 0.31), (0.64, 0.32)]

plt.figure(figsize=(9, 5.5))
for (cx, cy), (sx, sy), c, name in zip(centers, scales, colors, classes):
    plt.scatter(np.random.normal(cx, sx, 50),
                np.random.normal(cy, sy, 50),
                s=42, alpha=0.7, color=c, edgecolors='white',
                linewidths=0.5, label=name)
plt.title('鸢尾花数据集：花萼长度 vs 花萼宽度（模拟）')
plt.xlabel('花萼长度 (cm)')
plt.ylabel('花萼宽度 (cm)')
plt.legend(title='品种')
plt.grid(alpha=0.3)
plt.savefig('iris.png', dpi=120, bbox_inches='tight')
```

![鸢尾花分类散点图](/img/image-20260904211329446.png)

三个品种在"花萼长 vs 花萼宽"平面上几乎线性可分——这种"分类是否好分"的直觉判断，正是散点图在机器学习入门里的核心用途。

### alpha —— 处理重叠

大数据量散点最容易糊。`alpha` 半透明后，重叠区域的颜色会加深，密度信息反而浮现出来——点越多，越要把 alpha 调小（千点级建议 0.3~0.5，万点级 0.1~0.3）。

```python
x = np.random.normal(0, 1, 3000)
y = np.random.normal(0, 1, 3000)
plt.scatter(x, y, s=14, alpha=0.25, color='tab:purple')
plt.title('3000 个点，alpha=0.25 显示密度')
plt.savefig('scatter_alpha.png', dpi=120, bbox_inches='tight')
```

### marker —— 点形状

与折线图共用同一套标记字符。多系列散点换形状（配合换颜色），在黑白打印场景下依然可辨。

```python
plt.scatter(x1, y1, marker='o', label='对照组')
plt.scatter(x2, y2, marker='^', label='实验组')
```

### plt.colorbar() —— 颜色条

把颜色映射的"数值-颜色"对照表画出来，`label` 注明映射的变量名。只要用了 `c=数值数组`，就应该有 colorbar，否则读者无法解码颜色含义。

```python
sc = plt.scatter(x, y, c=z, cmap='viridis')
plt.colorbar(sc, label='温度 (℃)')
```

### np.polyfit —— 散点配趋势线

散点图常配一条回归线说明趋势方向。`np.polyfit(x, y, 1)` 做一次拟合，`np.polyval` 算出预测值后 `plot` 叠加虚线即可，不需要引入 sklearn。

```python
coef = np.polyfit(x, y, 1)            # 一次多项式系数
xs = np.linspace(x.min(), x.max(), 100)
plt.plot(xs, np.polyval(coef, xs), '--', color='tab:red', linewidth=2)
```

## 综合示例

一个接近真实业务的"城市房价分析"：200 个小区的二手房单价 vs 距市中心距离，点的大小和颜色映射小区规模评级，并叠加线性趋势线量化"每远一公里降价多少"。

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

np.random.seed(63)
n = 200
distance = np.random.uniform(1, 25, n)                          # 距市中心 km
price = 95 * np.exp(-distance / 12) + np.random.normal(0, 7, n) # 指数衰减+噪声
size = np.random.uniform(3, 12, n)                              # 小区规模评级

fig, ax = plt.subplots(figsize=(10, 5.8))
sc = ax.scatter(distance, price, s=size * 28, c=size, cmap='YlOrRd',
                alpha=0.75, edgecolors='gray', linewidths=0.5)
plt.colorbar(sc, label='小区规模评级')

coef = np.polyfit(distance, price, 1)
xs = np.linspace(0, 26, 100)
ax.plot(xs, np.polyval(coef, xs), color='tab:blue', linewidth=2.2,
        linestyle='--', label=f'线性趋势 y={coef[0]:.2f}x{coef[1]:+.1f}')

ax.set_title('某市二手房单价 vs 距市中心距离（气泡=小区规模）', fontsize=13)
ax.set_xlabel('距市中心距离 (km)')
ax.set_ylabel('单价 (万元/㎡)')
ax.legend(loc='upper right')
ax.grid(alpha=0.3)
plt.tight_layout()
plt.savefig('house_price.png', dpi=120, bbox_inches='tight')
```

![二手房价格与距离散点图](/img/image-20260904211329755.png)

趋势线斜率约 -3.1，即平均每远离市中心 1 公里单价降约 3.1 万/㎡；但散点整体呈弧形下弯而非直线，说明真实的衰减更接近指数型——这张图正好演示了"用散点图发现线性假设不够好"的典型分析过程。

## 小结

散点图是关系探索的起点，也是"一张图塞多个维度"的大师。三条经验：

- **点越多 alpha 越小**：重叠不是要掩盖的问题，而是要放大的密度信号；
- **`s` 是面积不是直径**：数值映射时警惕视觉平方放大效应，避免夸大差异；
- **用了 `c=数值` 就配 colorbar**，颜色没有解码表等于白映射；趋势线用 `np.polyfit` 现场算即可，别为一条线引入整个 sklearn。
