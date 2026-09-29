---
title: "python 数据三剑客-Matplotlib"
date: 2023-07-15
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib的基本使用"
abbrlink: 1122372252
---

## Matplotlib的使用

### 1.单维度数据

```python
#一、单维度数据
# 1.导包
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
# 2.设置matplotlib的引擎，中文支持
matplotlib.use('TkAgg')
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False
# 3.设置画板大小
plt.figure(figsize=(10, 6))
# 4.绘制数据
plt.plot(['李正洋', '郭星辰', '成佳乐'], [92, 88, 93])
# 绘制柱状图
plt.bar(['李正洋', '郭星辰', '成佳乐'], [92, 88, 93])
# 额外配置
# x轴 y轴 标题
plt.xlabel('姓名')
plt.ylabel('成绩')
# y轴刻度
plt.yticks(range(0, 101, 10))
# # y轴数据从0开始
# plt.ylim(0, 100)
# 网格开启
plt.grid()
# 标题
plt.title('学生成绩表')
# 5.展示数据
plt.show()
```

### 2.多维度数据

```python
# 二、多维度数据
# 1.导包
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
# 2.设置matplotlib的引擎，中文支持
matplotlib.use('TkAgg')
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False
# 3.设置画板大小
plt.figure(figsize=(10, 6))
# 4.绘制数据 plot 折线图 scatter 散点图 bar 柱状图
# plt.scatter(['李正洋', '郭星辰', '成佳乐'], [92, 88, 93], label='语文',color='green',linewidths=2)
# plt.scatter(['李正洋', '郭星辰', '成佳乐'], [90, 80, 90], label='数学',color='red',linewidths=2)
# plt.scatter(['李正洋', '郭星辰', '成佳乐'], [80, 90, 80], label='英语',color='blue',linewidths=2)
plt.bar(['李正洋', '郭星辰', '成佳乐'], [92, 88, 93], label='语文',color='green',width=0.2)
plt.bar(['李正洋', '郭星辰', '成佳乐'], [90, 80, 90], label='数学',color='red',width=0.2)
plt.bar(['李正洋', '郭星辰', '成佳乐'], [80, 90, 80], label='英语',color='blue',width=0.2)
# 添加图例
plt.legend()
# y轴刻度
plt.yticks(range(0, 101, 10))
# 添加轴标题
plt.ylabel('成绩')
plt.xlabel('姓名')
# 添加标题
plt.title('学生成绩表')
# 5.展示数据
plt.show()
```
