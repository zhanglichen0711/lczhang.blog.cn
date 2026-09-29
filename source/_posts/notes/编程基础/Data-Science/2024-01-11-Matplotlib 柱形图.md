---
title: "Matplotlib 柱形图"
date: 2024-01-11
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 柱形图"
abbrlink: 1122372288
---

# Matplotlib 柱形图

## 简介

柱形图是"比大小"的王者。它用柱子的高度编码数值，把抽象的数字差变成肉眼可辨的高度差——"A 是 B 的两倍"这句话，在柱形图里就是一根柱子比另一根高一倍，不需要任何心算。

柱形图家族有三个主力成员：**柱形图**（`bar`，竖向，适合类别名较短）、**横向条形图**（`barh`，横向，适合类别名长或类别多的排行榜）、**堆叠柱形图**（`bottom` 参数，展示构成关系）。分组对比则靠"同一类别摆两根柱子"的位移技巧实现。

柱形图有一个铁律必须先记住：**y 轴必须从 0 开始**。柱子靠高度编码数值，如果纵轴被截断，高度比例就失真了——这是数据可视化里最经典（也最容易被媒体滥用）的误导手法。

## 基本用法

`plt.bar(x, height)` 中 x 是类别（字符串会自动按位置摆放），height 是数值。加上数值标注和"最高项高亮"，就是一个合格的业务柱形图。

```python
import matplotlib
matplotlib.use('Agg')  # 保存图片用 Agg 后端（无显示器环境）
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

products = ['笔记本电脑', '智能手机', '平板', '智能手表', '无线耳机']
sales = [458, 892, 326, 512, 735]

plt.figure(figsize=(10, 5.5))
bars = plt.bar(products, sales, color='tab:blue', width=0.55)
bars[sales.index(max(sales))].set_color('tab:red')  # 高亮冠军
for b in bars:                                       # 柱顶标数值
    plt.text(b.get_x() + b.get_width() / 2, b.get_height() + 12,
             f'{b.get_height():.0f}', ha='center', fontsize=10)
plt.title('2023 年双 11 各品类销售额（万元）')
plt.ylabel('销售额 (万元)')
plt.ylim(0, 1000)
plt.grid(axis='y', alpha=0.3)
plt.gca().set_axisbelow(True)  # 网格垫底
plt.savefig('bar_basic.png', dpi=120, bbox_inches='tight')
```

![各品类销售额柱形图](/img/image-20260904211440004.png)

两个值得注意的细节：`bar()` 返回柱子对象列表（BarContainer），可以直接改某一根的颜色做高亮；`plt.text` 配合 `b.get_x() + b.get_width()/2` 把数值标在每根柱子正上方——读者就不必来回对网格读数了。

## 常用 API 详解

### width —— 柱宽与间距

`width` 默认 0.8，取值是"类别间距的比例"。柱子太细显得稀疏、太粗挤在一起，0.5~0.7 之间比较舒服。类别多时记得同步缩小 width。

```python
plt.bar(['A', 'B', 'C', 'D'], [23, 41, 35, 52], width=0.6)
plt.savefig('bar_width.png', dpi=120, bbox_inches='tight')
```

### color / edgecolor —— 配色

`color` 支持统一色、颜色列表（逐柱设色）两种写法；`edgecolor` 给柱子描边，数据少时描边更显精致，但大数据量会增加视觉噪音。

```python
colors = ['tab:red' if v > 40 else 'tab:blue' for v in [23, 41, 35, 52]]
plt.bar(['A', 'B', 'C', 'D'], [23, 41, 35, 52], color=colors,
        edgecolor='white')
plt.savefig('bar_color.png', dpi=120, bbox_inches='tight')
```

### 分组柱形图 —— 位移叠加

没有现成的"分组柱形图"函数，靠手动位移实现：把 x 换成数值位置 `np.arange(n)`，两个系列分别画在 `x - w/2` 和 `x + w/2`，宽度各取 `w`。这是面试和实战都高频的写法。

```python
x = np.arange(4)
w = 0.36
quarters = ['一季度', '二季度', '三季度', '四季度']
online = [286, 312, 358, 421]
offline = [342, 308, 295, 331]

plt.bar(x - w / 2, online, w, label='线上')
plt.bar(x + w / 2, offline, w, label='线下')
plt.xticks(x, quarters)   # 把刻度位置换回季度名
plt.legend()
plt.savefig('bar_grouped.png', dpi=120, bbox_inches='tight')
```

### bottom —— 堆叠柱形图

第二组数据传 `bottom=第一组数据`，柱子就会"叠"在第一组上面。三组以上逐层传递 `bottom=组1+组2`（用 `np.add` 或直接相加）。堆叠图适合看**总量 + 构成**，但不适合精确比较中间层的大小。

```python
plt.bar(quarters, online, label='线上')
plt.bar(quarters, offline, bottom=online, label='线下')
for i, total in enumerate(np.array(online) + np.array(offline)):
    plt.text(i, total + 10, f'{total}', ha='center')  # 顶部标总量
plt.legend()
plt.savefig('bar_stacked.png', dpi=120, bbox_inches='tight')
```

![分组与堆叠柱形图对比](/img/image-20260904211440449.png)

同一份数据的两种呈现：分组图便于**比较各组内部**线上线下谁高，堆叠图便于**比较总量**（Q4 总额 752 万领先一眼可见）。选哪种取决于你想让读者先看到什么。

### plt.barh() —— 横向条形图

把坐标轴转 90 度：x 变数值、y 变类别。类别名是中文长词（城市、产品全名）时横排远比竖排易读，排行榜类图表几乎都用它。注意横条的"高度从 0 开始"铁律变成了"x 轴从 0 开始"。

```python
plt.barh(['上海', '北京', '深圳'], [19137, 18654, 17821])
plt.xlabel('平均月薪 (元)')
plt.savefig('barh.png', dpi=120, bbox_inches='tight')
```

### plt.axvline() / plt.axhline() —— 参考线

在柱形图上加一条平均线、目标线，能让"谁在平均线之上"立刻可见。`linestyle='--'` 加 `label` 进图例，是性价比最高的增值元素。

```python
plt.bar(['A', 'B', 'C', 'D'], [23, 41, 35, 52])
plt.axhline(y=np.mean([23, 41, 35, 52]), color='red',
            linestyle='--', label='平均')
plt.legend()
plt.savefig('bar_refline.png', dpi=120, bbox_inches='tight')
```

## 综合示例

综合运用横排、排序、条件配色和参考线，做一个"城市月薪排行榜"：条形按数值降序排列（barh 需先升序排序数据）、过线城市蓝色/未过线灰色、红色虚线标出八城平均。

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

cities = ['上海', '北京', '深圳', '广州', '杭州', '成都', '南京', '武汉']
salary = [19137, 18654, 17821, 13928, 16213, 11437, 12811, 11908]

order = np.argsort(salary)                    # 升序 → barh 从下往上画
cities_s = [cities[i] for i in order]
salary_s = [salary[i] for i in order]

fig, ax = plt.subplots(figsize=(10, 5.8))
colors = ['tab:gray' if s < 15000 else 'tab:blue' for s in salary_s]
bars = ax.barh(cities_s, salary_s, color=colors, height=0.6)
for b in bars:                                # 条尾标数值
    ax.text(b.get_width() + 180, b.get_y() + b.get_height() / 2,
            f'{b.get_width():,.0f}', va='center', fontsize=10)
ax.axvline(x=np.mean(salary), color='tab:red', linestyle='--',
           linewidth=1.4, label=f'八城平均 {np.mean(salary):,.0f} 元')
ax.set_title('2023 年主要城市平均月薪排行（元/月）', fontsize=13, loc='left')
ax.set_xlabel('平均月薪 (元)')
ax.set_xlim(0, 22500)
ax.legend(loc='lower right')
ax.grid(axis='x', alpha=0.3)
ax.set_axisbelow(True)
plt.tight_layout()
plt.savefig('salary_rank.png', dpi=120, bbox_inches='tight')
```

![城市月薪排行榜横向条形图](/img/image-20260904211441174.png)

这张图的配方可以复用到任何排行榜：`np.argsort` 排序 → 条件配色强调目标子集 → 条尾标数值 → 参考线给"整体水位"。注意 barh 是从 y 轴底部往上画的，所以要降序显示就得先升序排数据——这是 barh 最反直觉的一处。

## 小结

柱形图简单，但好柱形图有讲究。三条铁律：

- **y 轴（或 barh 的 x 轴）永远从 0 开始**，截断坐标轴的柱形图 = 视觉造假；
- **类别多就横排**：barh 让中文长标签和数值都平铺可读，配合排序更有说服力；
- **分组靠位移（x±w/2），堆叠靠 bottom**：两个"手工技巧"记熟，柱形图家族就全通关了。
