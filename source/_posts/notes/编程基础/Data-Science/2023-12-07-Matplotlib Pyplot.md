---
title: "Matplotlib Pyplot"
date: 2023-12-07
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib Pyplot"
abbrlink: 1122372281
---

## 简介

`matplotlib.pyplot` 是 Matplotlib 的命令式绘图接口，惯例缩写为 `plt`。它像一支画笔：`plt.plot()` 落笔、`plt.title()` 题字、`plt.show()` 裱框——每个函数都直接作用于"当前图"，写起来一气呵成。

这也是它与面向对象接口（`fig, ax = plt.subplots()`）的区别：pyplot 简单直接，适合快速探索；面向对象风格适合精细控制多子图。这一篇先把 pyplot 用顺，画出第一张像样的折线图。

中文环境第一个坑是字体：Matplotlib 默认字体不支持中文，先全局设置 `font.sans-serif`，否则中文全是方框。

## 基本用法

```python
import matplotlib
matplotlib.use('Agg')  # 无显示器环境用 Agg 后端（交互环境可省略）
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']  # 中文字体
plt.rcParams['axes.unicode_minus'] = False  # 负号正常显示

# 一行数据一条线：x 轴自动给 0,1,2...
plt.plot([88, 92, 90, 95, 89])
plt.title('Python 期中成绩趋势')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100000000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![折线图基础示例](/img/image-20231207100000000.png)

`plot([88, 92, ...])` 只给 y 值时，x 轴默认从 0 开始编号；更常见的写法是 `plt.plot(x, y)` 成对传入。

## 常用 API 详解

### 1. 多条线 + 颜色线型标记

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

quarters = ['Q1', 'Q2', 'Q3', 'Q4']
sales = [128, 156, 149, 188]
profit = [32, 41, 38, 55]

plt.plot(quarters, sales, color='steelblue', marker='o', linewidth=2, label='销售额')
plt.plot(quarters, profit, color='tomato', marker='s', linestyle='--', label='利润')
plt.legend()                  # 图例：显示 label
plt.title('2023 季度销售与利润（万元）')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100100000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![多条线对比图](/img/image-20231207100100000.png)

### 2. fmt 速记字符串

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4]
# 第三个参数是格式串：颜色+线型+标记，'ro--' = 红色 圆点 虚线
plt.plot(x, [10, 15, 13, 18], 'ro--', label='红色圆点虚线')
plt.plot(x, [8, 12, 11, 14], 'g^-', label='绿色三角实线')
plt.legend()
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100200000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![fmt 格式串示例](/img/image-20231207100200000.png)

### 3. 散点、柱状一句话切换

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4, 5]
y = [2, 4, 3, 6, 5]

plt.scatter(x, y, color='darkorange')     # 散点图
plt.title('scatter 散点图')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100300000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![散点图示例](/img/image-20231207100300000.png)

pyplot 里图形类型各是各的函数：`plot` 折线、`bar` 柱状、`scatter` 散点、`pie` 饼图、`hist` 直方图——后几篇会逐一展开。

### 4. 中文标题与坐标轴标签

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

days = ['周一', '周二', '周三', '周四', '周五']
steps = [8200, 11000, 7600, 9500, 12300]

plt.plot(days, steps, marker='o')
plt.title('每日步数')              # 标题
plt.xlabel('日期')                 # x 轴标签
plt.ylabel('步数')                 # y 轴标签
plt.grid(alpha=0.3)                # 浅网格
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100400000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![带轴标签的折线图](/img/image-20231207100400000.png)

### 5. savefig：保存比 show 更重要

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

plt.bar(['A', 'B', 'C'], [3, 7, 5])
plt.title('savefig 演示')

# dpi 控制分辨率（网页 120 足够，印刷用 300）
# bbox_inches='tight' 自动裁掉四周空白
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100500000.png',
            dpi=120, bbox_inches='tight')
print('图片已保存')     # 输出: 图片已保存
plt.show()
```

![savefig 演示图](/img/image-20231207100500000.png)

## 综合示例

用 pyplot 画一张"双城市月气温对比图"，把本篇 API 全部串起来：

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

months = [f'{m}月' for m in range(1, 13)]
beijing = [-4, -1, 6, 14, 20, 24, 26, 25, 20, 13, 5, -2]
guangzhou = [14, 15, 18, 22, 26, 28, 29, 29, 28, 25, 21, 16]

plt.figure(figsize=(10, 5))          # 画布大小（英寸）
plt.plot(months, beijing, 'o-', color='steelblue', label='北京')
plt.plot(months, guangzhou, 's--', color='tomato', label='广州')
plt.axhline(0, color='gray', linewidth=0.8, linestyle=':')  # 0℃ 参考线

plt.title('2023 年北京 / 广州月平均气温对比', fontsize=14)
plt.xlabel('月份')
plt.ylabel('气温 (℃)')
plt.legend(loc='upper left')
plt.grid(alpha=0.3)

plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231207100600000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![双城市气温对比综合示例](/img/image-20231207100600000.png)

## 小结

- pyplot 的套路是"**堆积木**"：plot 画线 → title/xlabel/ylabel 标注 → legend/grid 修饰 → savefig 落盘，顺序不拘，但 savefig 必须在 show 之前（show 会清空画布）
- 中文乱码两行药方：`font.sans-serif` 设为 SimHei/微软雅黑 + `axes.unicode_minus` 设 False
- 快速看数据用 pyplot，要做多子图排版（下一篇的 subplot）时再切面向对象风格
