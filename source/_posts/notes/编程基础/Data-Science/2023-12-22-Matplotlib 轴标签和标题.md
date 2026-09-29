---
title: "Matplotlib 轴标签和标题"
date: 2023-12-22
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 轴标签和标题"
abbrlink: 1122372284
---

## 简介

一张没有标题的图，像一封没有主题的邮件；没有轴标签的图，像坐标轴上只有神秘数字。标题回答"这张图在讲什么"，轴标签回答"横纵坐标分别是什么、单位是什么"。它们不是装饰，而是降低读者理解成本的刚需。

这一篇把 `title`、`xlabel`、`ylabel`、`xticks` 的排版技巧讲全，顺带解决长标签重叠这个常见痛点。

## 基本用法

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = [1, 2, 3, 4]
y = [23, 45, 34, 56]

plt.plot(x, y, marker='o')
plt.title('第四季度销量')       # 标题
plt.xlabel('月份')              # x 轴标签
plt.ylabel('销量（件）')         # y 轴标签，带单位
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100000000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![基础标题与轴标签](/img/image-20231222100000000.png)

## 常用 API 详解

### 1. 字体大小与颜色

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

plt.plot(np.arange(4), [10, 20, 15, 25])
plt.title('主标题', fontsize=16, color='navy', fontweight='bold')
plt.xlabel('横轴', fontsize=12, color='gray')
plt.ylabel('纵轴', fontsize=12, color='gray')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100100000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![标题与轴标签样式](/img/image-20231222100100000.png)

### 2. 长标签旋转：防止重叠

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

items = ['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04', '2023-01-05']
values = [120, 135, 98, 142, 128]

plt.bar(items, values)
plt.xticks(rotation=45, ha='right')  # 右端对齐，避免标签"倒立"
plt.title('日期轴标签旋转示例')
plt.tight_layout()                    # 自动给旋转标签腾空间
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100200000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![旋转轴标签](/img/image-20231222100200000.png)

### 3. 自定义刻度与刻度标签

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

x = np.linspace(0, 2 * np.pi, 100)
plt.plot(x, np.sin(x))

# 把刻度位置换成更易读的 π 标签
plt.xticks([0, np.pi/2, np.pi, 3*np.pi/2, 2*np.pi],
           ['0', 'π/2', 'π', '3π/2', '2π'])
plt.title('自定义刻度标签为 π 形式')
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100300000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![自定义刻度标签](/img/image-20231222100300000.png)

### 4. 标题位置与多行标题

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

plt.plot(np.arange(4), [3, 5, 4, 6])
plt.title('这是主标题\n（这是副标题）', loc='left', fontsize=14)
# loc='left'/'center'/'right' 控制标题水平位置
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100400000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![多行标题](/img/image-20231222100400000.png)

### 5. 图级别总标题 suptitle

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

fig, axes = plt.subplots(1, 2, figsize=(10, 4))
axes[0].plot([1, 2, 3], [1, 4, 2])
axes[0].set_title('子图 A')
axes[1].plot([1, 2, 3], [2, 1, 3])
axes[1].set_title('子图 B')

fig.suptitle('总标题：两个子图对比', fontsize=16, y=1.02)  # y 控制离顶距离
plt.tight_layout()
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100500000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![suptitle 总标题](/img/image-20231222100500000.png)

## 综合示例

完整排版一张"月度销售业绩"：主标题、副标题、轴标签、单位、旋转刻度：

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
sales = [120, 98, 132, 145, 156, 178, 165, 190, 210, 198, 225, 240]

plt.figure(figsize=(12, 5))
plt.bar(months, sales, color='steelblue')

plt.title('2023 年各月销售额', fontsize=16, fontweight='bold', pad=15)
plt.xlabel('月份', fontsize=12)
plt.ylabel('销售额（万元）', fontsize=12)
plt.xticks(rotation=30, ha='right')

# 在柱顶标注数值
for i, v in enumerate(sales):
    plt.text(i, v + 5, str(v), ha='center', fontsize=9)

plt.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('E:/blog_hexo/xiaohei-blog/source/img/image-20231222100600000.png',
            dpi=120, bbox_inches='tight')
plt.show()
```

![月度销售业绩综合示例](/img/image-20231222100600000.png)

## 小结

- 标题和轴标签必须带**单位**（万元、件、℃），否则数字没有业务意义
- x 轴类别名过长时，用 `rotation=45` + `tight_layout()`，比缩小字号更优雅
- 多子图用 `fig.suptitle()`，单图用 `plt.title()`；别混用导致重叠
- `pad` 参数（标题与图的距离）和 `loc` 参数（对齐）是提升排版精致感的微调利器
