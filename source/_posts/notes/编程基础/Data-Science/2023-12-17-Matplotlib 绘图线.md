---
title: "Matplotlib 绘图线"
date: 2023-12-17
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 绘图线"
abbrlink: 1122372283
---

## 简介

线是折线图的脊梁。线的颜色、粗细、虚实、透明度，直接决定读者能否一眼区分多条曲线、是否看得清趋势。Matplotlib 里控制线条的参数挂在 `plot()` 里：`color` 定颜色、`linewidth` 定粗细、`linestyle` 定虚实、`alpha` 定透明度。

这一篇把这些参数组合起来，画出清晰、专业、易读的折线。

## 基本用法

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4, 5]
y = [3, 5, 4, 7, 6]

plt.plot(x, y, color='steelblue', linewidth=2)
plt.title('蓝色实线')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100000000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![蓝色实线基础示例](/img/image-20231217100000000.png)

## 常用 API 详解

### 1. 线型：实线、虚线、点线、点划线

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x), '-',  label='实线 solid')
plt.plot(x, np.cos(x), '--', label='虚线 dashed')
plt.plot(x, np.sin(x) - 1, ':', label='点线 dotted')
plt.plot(x, np.cos(x) - 1, '-.', label='点划线 dashdot')
plt.legend(loc='lower right')
plt.title('四种基本线型')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100100000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![四种基本线型](/img/image-20231217100100000.png)

### 2. 自定义虚线模式

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 10, 100)
# dashes=(画线长, 空白长, 画线长, 空白长)
plt.plot(x, np.sin(x), dashes=[6, 2, 2, 2], color='tomato', label='长-短虚线')
plt.plot(x, np.cos(x), dashes=[10, 3], color='steelblue', label='长虚线')
plt.legend()
plt.title('自定义 dash 模式')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100200000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![自定义 dash 模式](/img/image-20231217100200000.png)

### 3. 线宽与透明度

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 10, 100)
# 基线淡、平均线粗，形成视觉层次
plt.plot(x, np.sin(x) + np.random.normal(0, 0.1, 100), color='gray', alpha=0.5, label='原始波动')
plt.plot(x, np.sin(x), color='crimson', linewidth=3, label='趋势线')
plt.legend()
plt.title('透明度与线宽：突出主线、淡化噪声')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100300000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![透明度与线宽层次](/img/image-20231217100300000.png)

### 4. 颜色表达：命名、十六进制、RGB

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.arange(4)
y = [10, 14, 8, 16]

plt.plot(x, y, color='#2E86AB', linewidth=3, label='十六进制海军蓝')
plt.plot(x, [v + 2 for v in y], color=(0.85, 0.37, 0.34), linewidth=3, label='RGB 橙红')
plt.xticks(x, ['A', 'B', 'C', 'D'])
plt.legend()
plt.title('指定颜色的三种方式')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100400000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![颜色表达方式](/img/image-20231217100400000.png)

### 5. 阶梯图：适合离散状态

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

hours = ['08:00', '09:00', '10:00', '11:00', '12:00']
servers = [5, 6, 8, 8, 10]

# drawstyle='steps-post'：当前值保持到下一个点再跳变
plt.plot(hours, servers, drawstyle='steps-post', marker='o', color='steelblue', linewidth=2)
plt.title('服务器数量（阶梯变化）')
plt.ylabel('台数')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100500000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![阶梯图](/img/image-20231217100500000.png)

## 综合示例

用不同线型画"三个季度的 App 活跃用户"，体现同系列内的对比：

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

weeks = [f'W{i}' for i in range(1, 9)]
q1 = np.array([120, 125, 123, 130, 135, 132, 138, 142])
q2 = q1 * 1.15
q3 = q1 * 1.30

plt.figure(figsize=(10, 5))
plt.plot(weeks, q1, 'o-',  color='#2E86AB', linewidth=2, label='Q1 基线')
plt.plot(weeks, q2, 's--', color='#A23B72', linewidth=2, label='Q2 增长')
plt.plot(weeks, q3, '^:',  color='#F18F01', linewidth=2, label='Q3 爆发')

plt.title('App 周活跃用户趋势（万人）', fontsize=14)
plt.xlabel('周次')
plt.ylabel('活跃用户数（万人）')
plt.legend()
plt.grid(alpha=0.3)
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231217100600000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![活跃用户趋势综合示例](/img/image-20231217100600000.png)

## 小结

- 同一张图里超过两条线，必须用不同 `linestyle` 或颜色区分；色盲友好方案建议线型+颜色双编码
- `alpha` 低于 0.5 的线只适合做背景/置信区间，主线保持 1.0
- 阶梯图 `drawstyle='steps-post'` 适合订单量、在线人数这类"统计整点"的数据
- 颜色不要记名字，直接用十六进制或 RGB 元组，设计稿可以无缝落地
