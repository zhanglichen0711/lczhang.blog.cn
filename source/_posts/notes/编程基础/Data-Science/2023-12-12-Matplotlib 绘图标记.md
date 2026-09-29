---
title: "Matplotlib 绘图标记"
date: 2023-12-12
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 绘图标记"
abbrlink: 1122372282
---

## 简介

折线图里如果数据点没有标记，就像书里没有章节号——能看出走势，但找不到具体位置。Matplotlib 的 `marker` 参数负责在数据点上"盖章"：`o` 圆点、`s` 方块、`^` 三角、`D` 菱形……合适的小标记能让读者一眼定位关键值，避免被连绵的线淹没。

这一篇系统讲标记符号、大小、颜色、`markevery` 隔点显示，以及散点图中用标记大小表达第三维。

## 基本用法

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4, 5]
y = [10, 14, 13, 17, 15]

plt.plot(x, y, marker='o')     # 在数据点画圆点
plt.title('带标记的折线图')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100000000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![基础圆点标记](/img/image-20231212100000000.png)

## 常用 API 详解

### 1. 常用标记符号一览

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

markers = ['o', 's', '^', 'D', 'v', '<', '>', 'p', '*', 'X']
y_pos = np.arange(len(markers))

for i, m in enumerate(markers):
    plt.scatter(i, 0, marker=m, s=200, color='steelblue')
    plt.text(i, -0.15, m, ha='center', fontsize=10)

plt.title('Matplotlib 常用标记符号')
plt.xlim(-0.5, len(markers) - 0.5)
plt.ylim(-0.3, 0.3)
plt.axis('off')              # 隐藏坐标轴，只看符号
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100100000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![常用标记符号](/img/image-20231212100100000.png)

### 2. 标记大小与内外颜色

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4]
y = [5, 8, 6, 9]

# markersize / markerfacecolor / markeredgecolor 一起控制标记外观
plt.plot(x, y, marker='o', markersize=12,
         markerfacecolor='gold', markeredgecolor='darkred',
         markeredgewidth=2, linewidth=1, color='gray')
plt.title('自定义标记颜色与大小')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100200000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![自定义标记颜色与大小](/img/image-20231212100200000.png)

### 3. markevery：隔点显示标记

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(0, 10, 0.2)
y = np.sin(x)

# 每 5 个点打一个标记：线密集，只标关键点
plt.plot(x, y, marker='o', markevery=5, color='steelblue')
plt.title('markevery=5：避免数据点过多导致的杂乱')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100300000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![markevery 隔点显示](/img/image-20231212100300000.png)

### 4. 散点图：标记大小表达第三维

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

cities = ['北京', '上海', '广州', '深圳', '杭州']
gdp = [4.16, 4.47, 2.88, 3.24, 1.81]      # x 轴：GDP（万亿）
pop = [2.18, 2.49, 1.88, 1.77, 1.24]      # y 轴：人口（千万）
size = [2100, 2400, 1900, 1800, 1200]     # 气泡大小：面积

plt.scatter(gdp, pop, s=size, alpha=0.6, edgecolors='black')
for c, x, y in zip(cities, gdp, pop):
    plt.annotate(c, (x, y), textcoords='offset points', xytext=(5, 5))
plt.xlabel('GDP（万亿）')
plt.ylabel('人口（千万）')
plt.title('城市 GDP-人口-规模 气泡图')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100400000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![气泡图](/img/image-20231212100400000.png)

### 5. 误差条：标记加误差线

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(5)
y = [85, 92, 78, 88, 95]
err = [4, 3, 6, 2, 3]

plt.errorbar(x, y, yerr=err, fmt='o-', capsize=5, color='steelblue', ecolor='gray')
plt.xticks(x, ['A', 'B', 'C', 'D', 'E'])
plt.title('带误差线的成绩对比')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100500000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![误差条图](/img/image-20231212100500000.png)

## 综合示例

把不同标记组合在同一张图里做"产品销量趋势"：新产品突出显示（大圆点），老产品低调显示（小叉号）：

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

months = [f'{i}月' for i in range(1, 7)]
old = [120, 118, 122, 121, 119, 120]
new = [40, 55, 82, 110, 145, 180]

plt.plot(months, old, 'x--', color='gray', markersize=8, label='老产品')
plt.plot(months, new, 'o-', color='crimson', markersize=10,
         markerfacecolor='white', markeredgewidth=2, linewidth=2, label='新产品')
plt.axhline(120, color='gray', linestyle=':', alpha=0.5)
plt.title('新产品上线后销量走势')
plt.ylabel('销量（件）')
plt.legend()
plt.grid(alpha=0.3)
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231212100600000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![产品销量走势综合示例](/img/image-20231212100600000.png)

## 小结

- 折线图默认没有标记，想让读者读得出具体数值，加 `marker='o'` 或对应的符号
- 数据点密集时，用 `markevery` 抽点显示，否则画面变"刺猬"
- 散点图用 `s` 参数映射第三维（如人口、销售额），一图能承载更多信息
- 标记的 `markerfacecolor` / `markeredgecolor` 是组图配色的小技巧：外框色和填充色对比越明显，视觉焦点越强
