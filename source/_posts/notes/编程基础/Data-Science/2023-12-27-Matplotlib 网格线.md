---
title: "Matplotlib 网格线"
date: 2023-12-27
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 网格线"
abbrlink: 1122372285
---

## 简介

网格线是坐标纸上的淡色方格：它让读者不需要伸长手指去对齐坐标轴，就能估出数据点的横纵坐标。但网格线也是双刃剑——太粗太密会让画面变乱，太细则失去辅助意义。

Matplotlib 用 `plt.grid(True)` 开启网格，再用 `linestyle`、`alpha`、`which` 控制风格。这一篇讲怎么让网格线"恰到好处"。

## 基本用法

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(5)
y = [10, 14, 8, 16, 12]

plt.plot(x, y, marker='o')
plt.xticks(x, ['A', 'B', 'C', 'D', 'E'])
plt.grid(True)
plt.title('默认网格线')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100000000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![默认网格线](/img/image-20231227100000000.png)

## 常用 API 详解

### 1. 只开横线或竖线

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(5)
y = [10, 14, 8, 16, 12]

plt.bar(x, y)
plt.xticks(x, ['A', 'B', 'C', 'D', 'E'])
plt.grid(axis='y', alpha=0.5)   # 只画水平网格，辅助比较高度
plt.title('只显示水平网格')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100100000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![只显示水平网格](/img/image-20231227100100000.png)

### 2. 网格线样式

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.grid(linestyle='--', alpha=0.4, color='gray', linewidth=0.8)
plt.title('虚线半透明网格')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100200000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![虚线半透明网格](/img/image-20231227100200000.png)

### 3. 主次刻度网格

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 10, 100)
plt.plot(x, np.cos(x))

# 先打开 minor 刻度，再画 minor 网格
plt.minorticks_on()
plt.grid(which='major', linestyle='-', alpha=0.6)
plt.grid(which='minor', linestyle=':', alpha=0.3)
plt.title('主刻度实线 + 次刻度点线网格')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100300000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![主次刻度网格](/img/image-20231227100300000.png)

### 4. 双 y 轴与各自网格

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(1, 6)
temperature = [20, 25, 28, 30, 27]
rainfall = [5, 15, 35, 20, 10]

fig, ax1 = plt.subplots()
ax1.plot(x, temperature, 'o-', color='tomato', label='气温')
ax1.set_xlabel('月份')
ax1.set_ylabel('气温 (℃)', color='tomato')
ax1.tick_params(axis='y', labelcolor='tomato')
ax1.grid(axis='y', alpha=0.3)

ax2 = ax1.twinx()                       # 共享 x 轴，右侧新建 y 轴
ax2.bar(x, rainfall, alpha=0.4, color='steelblue', label='降雨量')
ax2.set_ylabel('降雨量 (mm)', color='steelblue')
ax2.tick_params(axis='y', labelcolor='steelblue')

plt.title('气温与降雨量双 y 轴')
fig.tight_layout()
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100400000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![双 y 轴与网格](/img/image-20231227100400000.png)

### 5. 关闭网格线

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

plt.plot(np.arange(4), [1, 3, 2, 4])
plt.grid(False)                 # 极简风格的图用得到
plt.title('无网格线')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100500000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![无网格线](/img/image-20231227100500000.png)

## 综合示例

画一张"服务器负载"图，用主网格定位、次网格辅助、双 y 轴展示 CPU 和内存：

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

hours = np.arange(24)
cpu = 30 + 40 * np.sin((hours - 8) * np.pi / 12) + np.random.normal(0, 5, 24)
mem = 40 + 30 * np.sin((hours - 6) * np.pi / 12) + np.random.normal(0, 4, 24)

fig, ax1 = plt.subplots(figsize=(12, 5))
ax1.plot(hours, cpu, 'o-', color='crimson', label='CPU 使用率')
ax1.set_xlabel('小时')
ax1.set_ylabel('CPU (%)', color='crimson')
ax1.tick_params(axis='y', labelcolor='crimson')
ax1.set_xticks(hours[::2])
ax1.grid(which='major', axis='y', linestyle='-', alpha=0.4)
ax1.minorticks_on()
ax1.grid(which='minor', axis='y', linestyle=':', alpha=0.2)

ax2 = ax1.twinx()
ax2.plot(hours, mem, 's--', color='steelblue', label='内存使用率')
ax2.set_ylabel('内存 (%)', color='steelblue')
ax2.tick_params(axis='y', labelcolor='steelblue')

fig.suptitle('24 小时服务器负载监控', fontsize=14)
fig.tight_layout()
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231227100600000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![24小时服务器负载监控](/img/image-20231227100600000.png)

## 小结

- 柱状图、折线图建议只开 **水平网格**（axis='y'），竖线会切断柱子、干扰读数
- `alpha=0.3` 左右是网页展示的安全值：能辅助对齐，又不会和线条抢戏
- 双 y 轴用 `ax.twinx()`，左右刻度分开设；网格通常只画在一侧，避免两套网格打架
- 需要精细读数时打开 minor 网格，否则只保留 major 网格即可
