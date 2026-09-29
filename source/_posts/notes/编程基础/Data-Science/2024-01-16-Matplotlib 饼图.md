---
title: "Matplotlib 饼图"
date: 2024-01-16
categories:
  - [编程基础, Data Science]
tags: [Python, Matplotlib]
description: "Matplotlib 饼图"
abbrlink: 1122372289
---

# Matplotlib 饼图

## 简介

饼图是"看构成"的图：一个圆盘代表整体 100%，切出的每块扇形代表各部分占比。"预算花到哪了""时间用在何处""市场份额怎么分"这类问题，饼图一图给答案。

饼图的名声有点两极：支持者爱它直观，反对者嫌人眼对角度差的分辨力弱——相邻两块 25% 和 28% 的扇形，多数人分不出谁大。所以饼图的使用有两条公约：**类别不超过 6 个**（多了切太碎），**占比差异要够大**（都差不多大就改用条形图排序）。

Matplotlib 里 `plt.pie()` 一个函数包办普通饼图、环形图（甜甜圈图）。它在所有绘图函数里参数风格比较特殊——返回值是扇形块和文字的元组，且默认把圆画成椭圆，必须 `plt.axis('equal')` 才是正圆，这是新手必踩的第一个坑。

## 基本用法

`plt.pie(sizes)` 传入一组数值即可，函数自动归一化成占比。配上 `labels`（块外标签）、`autopct`（块内百分比）就是完整版：

```python
import matplotlib
matplotlib.use('Agg')  # 保存图片用 Agg 后端（无显示器环境）
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

os_share = {'Windows': 46.2, 'macOS': 27.8, 'Linux': 14.5,
            'Chrome OS': 6.1, '其他': 5.4}
labels = list(os_share.keys())
sizes = list(os_share.values())
explode = [0.06 if k == 'Windows' else 0 for k in labels]  # 突出最大块

plt.figure(figsize=(7.5, 5.8))
plt.pie(sizes, labels=labels, autopct='%.1f%%', startangle=90,
        counterclock=False, explode=explode,
        colors=['tab:blue', 'tab:orange', 'tab:green', 'tab:red', 'tab:gray'],
        textprops={'fontsize': 11})
plt.title('2023 年桌面操作系统市场份额')
plt.axis('equal')   # 关键！不加会画成椭圆
plt.savefig('pie_basic.png', dpi=120, bbox_inches='tight')
```

![桌面操作系统市场份额饼图](/img/image-20260904211556763.png)

四个参数的用意：`startangle=90` 让第一块从正上方开始（12 点钟方向是阅读起点）；`counterclock=False` 改为顺时针排列（符合多数人的阅读习惯）；`explode` 把最大块向外"掰"出一点强调它；`autopct='%.1f%%'` 是 printf 风格的格式串，两个 `%%` 才能打出百分号本身。

## 常用 API 详解

### labels + autopct —— 标签与百分比

`labels` 摆在扇形外侧，`autopct` 摆在扇形内侧。还可以传函数实现"百分比 + 实际值"双行标注——`autopct` 接收的正是每个扇形的百分数，换算回原始值即可。

```python
plt.pie(sizes, labels=labels,
        autopct=lambda p: f'{p:.1f}%\n({p * total / 100:.0f} 单)')
```

### explode —— 突出扇形

与数据等长的列表，每个元素是该块向外偏移的比例（0.1 即偏移半径的 10%）。只强调一块时其余传 0，突出效果最明显。

```python
explode = [0, 0.1, 0, 0]   # 突出第二块
plt.pie(sizes, explode=explode)
```

### startangle + counterclock —— 起始角与方向

`startangle` 是第一块起始的角度（0 = 3 点钟方向，逆时针度量），`counterclock=False` 切换为顺时针。饼图排序的规范是**从 12 点钟顺时针按占比从大到小**，这两个参数就是把数据排好序后"对表"用的。

```python
plt.pie(sizes, startangle=90, counterclock=False)
```

### wedgeprops —— 环形图

`wedgeprops=dict(width=0.42)` 把实心饼"挖空"成环形图。环形图中间的空白正好放总量信息（如"日均 5.2 小时"），信息密度更高，也是当下更流行的样式。

```python
plt.pie(sizes, wedgeprops=dict(width=0.42, edgecolor='white'))
```

### pctdistance / labeldistance —— 文字距离

`pctdistance` 控制百分比文字离圆心的距离（默认 0.6，环形图建议 0.75~0.8 落在环带正中），`labeldistance` 控制外侧标签距离。块多且窄时，内侧百分比可改放图例避免文字挤压。

```python
plt.pie(sizes, autopct='%.1f%%', pctdistance=0.78, labeldistance=1.08)
```

### legend 配合 —— 标签移到图例

类别多时把标签从扇形旁挪到图例：`plt.pie` 不传 `labels`，用返回的 `wedges` 对象生成图例。这是"饼图防挤"的标准手段。

```python
wedges, texts, autotexts = plt.pie(sizes, autopct='%.1f%%')
plt.legend(wedges, labels, loc='center left', bbox_to_anchor=(1.0, 0.5))
```

![环形图与图例布局](/img/image-20260904211556861.png)

### shadow / textprops —— 外观微调

`shadow=True` 给饼加投影（扁平化设计风行后已不流行，慎用），`textprops` 统一设置所有文字的字号、颜色——环形图内浅色块上的白字就是靠它实现的。

```python
plt.pie(sizes, textprops={'fontsize': 10, 'color': 'white'})
```

## 综合示例

一个真实的报表场景：部门预算有 9 个科目，直接画饼会碎成渣。标准处理是**小占比合并**——低于 4% 的科目合并成"其他"，再做带实际金额的环形饼图并突出最大项。

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

raw_items = {'研发': 38.5, '市场': 22.3, '运营': 15.8, '人力': 8.9,
             '财务': 4.2, '行政': 3.6, '法务': 2.1, 'IT 支持': 2.4,
             '差旅': 2.2}
threshold = 4.0
major = {k: v for k, v in raw_items.items() if v >= threshold}
other = sum(v for v in raw_items.values() if v < threshold)
major['其他(合并)'] = other          # 小科目合并，从 9 块减到 6 块

labels = list(major.keys())
sizes = list(major.values())
colors = plt.cm.Set2.colors[:len(sizes)]
explode = [0.05 if k == '研发' else 0 for k in labels]

fig, ax = plt.subplots(figsize=(8.6, 6))
ax.pie(sizes, labels=labels, explode=explode, colors=colors,
       autopct=lambda p: f'{p:.1f}%\n({p * sum(sizes) / 100:.1f} 百万)',
       startangle=90, counterclock=False, pctdistance=0.72,
       wedgeprops=dict(edgecolor='white', linewidth=1.5),
       textprops={'fontsize': 10})
ax.set_title('某科技公司 2023 年度部门预算构成', fontsize=14, pad=16)
plt.axis('equal')
plt.savefig('budget_pie.png', dpi=120, bbox_inches='tight')
```

![部门预算构成饼图](/img/image-20260904211557004.png)

`autopct` 用 lambda 把"占比 + 绝对金额"两行都标出来，省掉读者换算；`plt.cm.Set2` 是柔和的定性色板，块与块之间边界清晰。这套"合并小类 → 定性色板 → 双行标注"的配方，适用于各种构成分析报表。

## 小结

饼图适合"少量类别的构成"，不适合精确比较。三条纪律：

- **类别超过 6 个先合并小项**，"其他"永远放最后；类别差距不大就换条形图；
- **`plt.axis('equal')` 必加**，否则饼变椭圆，占比视觉失真；
- **排序有规范**：从 12 点钟方向顺时针、占比从大到小，靠 `startangle=90` + `counterclock=False` + 预排序三件套实现。
