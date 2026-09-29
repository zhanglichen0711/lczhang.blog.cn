---
title: "Matplotlib 绘制多图"
date: 2024-01-01
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 绘制多图"
abbrlink: 1122372286
---

# Matplotlib 绘制多图

## 简介

一张图讲一个故事，但一个分析往往有多个故事——趋势一个、占比一个、分布一个。把它们塞进一张坐标系只会乱成一锅粥，正确的做法是"分面"：在一张画布上摆出多个小图，各讲各的，又彼此对齐、方便对比。这就是 Matplotlib 的多图（子图）体系。

Matplotlib 提供三代工具：`plt.subplot()`（状态机式，按网格编号选格子）、`plt.subplots()`（一步拿到所有坐标系数组，现代首选）、`GridSpec`（支持跨行跨列的不规则布局）。三者是递进关系：从"格子随便坐"到"整排包厢"再到"自由拼桌"。

理解子图的关键是建立"画布（Figure）→ 坐标系（Axes）"的两层心智模型：画布是相纸，坐标系是相纸上的每张照片。前面学过的 `title`、`grid` 等函数在子图世界里有各自的 `ax.set_xxx()` 版本。

## 基本用法

`plt.subplots(nrows, ncols)` 是最推荐的入口：一次创建 nrows×ncols 的子图网格，返回画布对象和坐标系数组，用下标访问每个格子。

```python
import matplotlib
matplotlib.use('Agg')  # 保存图片用 Agg 后端（无显示器环境）
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

fig, axes = plt.subplots(2, 2, figsize=(10, 7))
fig.suptitle('subplot 网格布局示例', fontsize=15)

x = np.linspace(0, 2 * np.pi, 100)
axes[0, 0].plot(x, np.sin(x))
axes[0, 0].set_title('(0,0) 正弦')

axes[0, 1].plot(x, np.cos(x), color='tab:orange')
axes[0, 1].set_title('(0,1) 余弦')

axes[1, 0].plot(x, np.tan(x))
axes[1, 0].set_ylim(-5, 5)
axes[1, 0].set_title('(1,0) 正切')

axes[1, 1].plot(x, np.sin(x) * np.cos(x), color='tab:green')
axes[1, 1].set_title('(1,1) 乘积')

plt.tight_layout()
plt.savefig('grid_2x2.png', dpi=120, bbox_inches='tight')
```

![2x2 网格子图布局](/img/image-20260904211211855.png)

注意子图的坐标系是**二维数组**，即使用 `plt.subplot(2,2,3)` 状态机写法画的是"第 3 格"（从 1 数），`axes` 数组里对应的是 `axes[1, 0]`（从 0 数）。两套编号体系并存是新手混乱的最大来源，建议统一用 `plt.subplots()` + 数组下标。

## 常用 API 详解

### plt.subplot() —— 状态机式选格子

`subplot(nrows, ncols, index)` 先定义 nrows×ncols 网格，再选中第 index 格（行优先，从 1 开始）。格子不超过 9 个时可缩写成 `subplot(223)`。适合子图数量少、逐个绘制的简单场景。

```python
plt.figure(figsize=(8, 3))
plt.subplot(1, 2, 1)
plt.plot([1, 4, 2, 6]); plt.title('左边')
plt.subplot(1, 2, 2)
plt.plot([6, 2, 4, 1]); plt.title('右边')
plt.savefig('subplot_simple.png', dpi=120, bbox_inches='tight')
```

### plt.subplots() —— 一步到位的现代写法

返回 `(fig, axes)`，`axes` 是 ndarray，可用 `axes.flat` 或 `axes.ravel()` 展平后配合循环批量绘制——子图多时这是最省事的模式。

```python
fig, axes = plt.subplots(2, 3, figsize=(12, 6))
for ax, k in zip(axes.flat, range(6)):
    ax.plot(np.sin(np.linspace(0, 10, 50) + k))
    ax.set_title(f'相位 {k}')
plt.tight_layout()
plt.savefig('subplots_loop.png', dpi=120, bbox_inches='tight')
```

### fig.add_gridspec() —— 不规则布局

`GridSpec` 允许子图跨行跨列：`gs[:, :2]` 表示"占满 2 行、占前 2 列"。经典应用是"主散点图 + 边缘分布直方图"的组合，一张图同时展示相关关系和各自分布。

```python
fig = plt.figure(figsize=(11, 6))
gs = fig.add_gridspec(2, 3)
ax_main = fig.add_subplot(gs[:, :2])  # 左侧占 2 行 2 列
ax_side = fig.add_subplot(gs[0, 2])   # 右上
ax_bot = fig.add_subplot(gs[1, 2])    # 右下
# 分别在三个 ax 上绘制散点图与边缘直方图
plt.savefig('gridspec_joint.png', dpi=120, bbox_inches='tight')
```

![GridSpec 不规则布局：主图加边缘分布](/img/image-20260904211213278.png)

### sharex / sharey —— 共享坐标轴

`plt.subplots(..., sharex=True)` 让同列子图共享 x 轴，配合 `gridspec_kw={'height_ratios': [...]}` 调整行高比例。`plt.tight_layout()` 会自动去掉被共享轴的重复刻度标签。

```python
fig, (ax1, ax2) = plt.subplots(2, 1, sharex=True,
                               gridspec_kw={'height_ratios': [3, 1]})
ax1.plot(np.arange(50), np.cumsum(np.random.randn(50)))
ax2.bar(np.arange(50), np.abs(np.random.randn(50)))
plt.savefig('sharex.png', dpi=120, bbox_inches='tight')
```

### plt.tight_layout() —— 自动排版

自动调整子图间距，防止标题、轴标签互相重叠。`rect=[left, bottom, right, top]` 参数把子图压缩进画布的某个区域，给 `suptitle` 和脚注让位（值域 0~1）。

```python
fig, axes = plt.subplots(2, 2, figsize=(9, 7))
fig.suptitle('总标题', fontsize=14)
for i, ax in enumerate(axes.flat):
    ax.set_title(f'子图 {i + 1}')
plt.tight_layout(rect=[0, 0, 1, 0.94])  # 顶部留 6% 给总标题
plt.savefig('tight_rect.png', dpi=120, bbox_inches='tight')
```

### fig.add_subplot() —— GridSpec 搭档

`add_gridspec` 定义网格后，用 `fig.add_subplot(gs[...])` 领取格子，切片语法即"占哪几行哪几列"。它比老式的 `GridSpec` 类 + `add_subplot(spec)` 写法更简洁。

```python
gs = fig.add_gridspec(2, 2, width_ratios=[2, 1])
ax_a = fig.add_subplot(gs[0, 0])  # 宽列
ax_b = fig.add_subplot(gs[0, 1])  # 窄列
```

### plt.subplot_mosaic() —— 按布局字符串摆图

`subplot_mosaic()` 用 ASCII 艺术直接"画"出布局，每个字母对应一个子图，返回"字母 → ax"的字典。布局复杂时比数字切片直观得多，是较新版本（3.3+）才有的福利。

```python
fig, axd = plt.subplot_mosaic(
    [['main', 'main', 'side'],
     ['main', 'main', 'bottom']],
    figsize=(10, 5))
axd['main'].plot([1, 2, 3])
axd['side'].set_title('side')
plt.savefig('mosaic.png', dpi=120, bbox_inches='tight')
```

## 综合示例

金融时间序列的经典排版：上面 3/4 高度画净值走势（折线 + 7 日均线），下面 1/4 画成交量（红涨绿跌柱形图），两层共享时间轴——下滑查看时上下天然对齐。

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

np.random.seed(53)
t = np.arange(1, 91)
price = 100 + np.cumsum(np.random.normal(0.15, 1.2, 90))
volume = np.random.randint(2, 12, 90) + 6 * np.abs(np.random.normal(0, 1, 90))

fig, (ax_price, ax_vol) = plt.subplots(
    2, 1, figsize=(11, 7), sharex=True,
    gridspec_kw={'height_ratios': [3, 1]})   # 上 3 下 1 的行高比

ax_price.plot(t, price, color='tab:blue', linewidth=1.8, label='净值')
ma = np.convolve(price, np.ones(7) / 7, mode='valid')  # 7 日移动平均
ax_price.plot(t[6:], ma, color='tab:orange', linewidth=1.5,
              linestyle='--', label='7 日均线')
ax_price.set_ylabel('价格 (元)')
ax_price.set_title('某基金 90 天净值走势与成交量（共享时间轴）')
ax_price.legend(loc='upper left')
ax_price.grid(alpha=0.3)

# 涨红跌绿（A股配色习惯）
colors = np.where(np.diff(price, prepend=price[0]) >= 0,
                  'tab:red', 'tab:green')
ax_vol.bar(t, volume, color=colors, alpha=0.7)
ax_vol.set_ylabel('成交量 (万份)')
ax_vol.set_xlabel('交易日')
ax_vol.grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.savefig('fund_dashboard.png', dpi=120, bbox_inches='tight')
```

![基金净值与成交量双层图](/img/image-20260904211214157.png)

这个例子浓缩了多图绘制的四个关键技巧：`height_ratios` 控制行高比例、`sharex=True` 共享时间轴、`np.convolve` 现场算均线、涨跌着色。稍微改改就能套用到股票、传感器、日志量等任何时间序列。

## 小结

多图绘制的心法是"先想布局，再画内容"。三条建议：

- **首选 `plt.subplots()`**：一次拿全 axes 数组，配 `axes.flat` 循环最省心；状态机式 `subplot()` 只留给一两张图的场景；
- **编号体系别混用**：`subplot(2,2,3)` 从 1 数，`axes[1,0]` 从 0 数，统一用后者；
- **子图多必加 `tight_layout()`**：否则标题、标签重叠几乎是必然；有 `suptitle` 时记得 `rect` 留白。
