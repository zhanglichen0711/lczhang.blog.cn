---
title: "Pandas Series"
date: 2023-09-28
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas Series"
abbrlink: 1122372267
---

## 简介

Series 是 Pandas 的两大核心数据结构之一，你可以把它理解为**"带索引的一维数组"**——左边一列标签（index），右边一列数据（values）。

NumPy 数组只有位置没有名字，而 Series 给每个数据挂上了"名牌"：`s['北京']` 比 `arr[3]` 可读性强得多。它是 DataFrame 的"单列原型"，理解了 Series，DataFrame 就理解了一半。

## 基本用法

```python
import pandas as pd

# 最常用：从字典创建（键做索引，值做数据）
s = pd.Series({'北京': 2189, '上海': 2487, '广州': 1881, '深圳': 1768})
print(s)
# 输出:
# 北京    2189
# 上海    2487
# 广州    1881
# 深圳    1768
# dtype: int64

# 从列表创建（默认整数索引）
s2 = pd.Series([90, 85, 78])
print(s2.values)    # 输出: [90 85 78]（数据本体，是个ndarray）
print(s2.index)     # 输出: RangeIndex(start=0, stop=3, step=1)
```

三个组成部分记牢：`values`（数据）、`index`（索引）、`dtype`（类型）。

## 常用 API 详解

### 1. 两种取值方式：标签 loc vs 位置 iloc

```python
import pandas as pd

s = pd.Series({'北京': 2189, '上海': 2487, '广州': 1881, '深圳': 1768})

# [] 里放"标签"：按名字取
print(s['上海'])            # 输出: 2487

# .loc 只认标签
print(s.loc[['北京', '深圳']])
# 输出:
# 北京    2189
# 深圳    1768

# .iloc 只认位置序号
print(s.iloc[0], s.iloc[-1])   # 输出: 2189 1768
print(s.iloc[1:3])             # 位置切片：含头不含尾
# 输出:
# 上海    2487
# 广州    1881
```

### 2. 向量化运算与布尔筛选

```python
import pandas as pd

s = pd.Series([92, 55, 78, 43, 88], index=['张三', '李四', '王五', '赵六', '钱七'])

# 运算作用在每个值上，索引保持不动
print((s * 0.6 + 40).round(1))
# 输出:
# 张三    95.2
# 李四    73.0
# ...

# 布尔筛选：一句话找出挂科的人
print(s[s < 60])
# 输出:
# 李四    55
# 赵六    43

# 筛选后取索引
print(s[s >= 90].index.tolist())   # 输出: ['张三']
```

### 3. 缺失值 NaN

```python
import numpy as np
import pandas as pd

s = pd.Series([1.0, np.nan, 3.0, np.nan, 5.0])

print(s.isna())          # 输出: [False  True False  True False]
print(s.notna().sum())   # 输出: 3（有效值个数）
print(s.dropna())        # 输出: 0号1.0 2号3.0 4号5.0
print(s.fillna(0))       # NaN 填 0
print(s.fillna(s.mean()))# NaN 填均值 → [1.0, 3.0, 3.0, 3.0, 5.0]
```

### 4. 统计一把梭

```python
import pandas as pd

s = pd.Series([92, 55, 78, 43, 88])

print(s.mean(), s.std().round(2))    # 输出: 71.2 21.32
print(s.max(), s.idxmax())           # 输出: 92 0（最大值及其位置）
print(s.describe())                  # 一次性输出 count/mean/std/min/四分位/max
# 输出:
# count     5.000000
# mean     71.200000
# ...
```

### 5. 增删改与改名（pandas 3.0 兼容写法）

```python
import pandas as pd

s = pd.Series([1, 2, 3])

# 追加：老版本 s.append() 已删除，必须用 pd.concat
s = pd.concat([s, pd.Series([4, 5], index=[3, 4])])
print(s.tolist())      # 输出: [1, 2, 3, 4, 5]

# 删除：drop 按标签
print(s.drop(0).tolist())    # 输出: [2, 3, 4, 5]

# 改名：rename 传字典
temps = pd.Series([20, 25], index=['Mon', 'Tue'])
print(temps.rename({'Mon': '周一', 'Tue': '周二'}).index.tolist())
# 输出: ['周一', '周二']
```

## 综合示例

用 Series 做一个"城市气温周报"分析器：

```python
import numpy as np
import pandas as pd

week = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
bj = pd.Series([28, 31, np.nan, 33, 30, 29, 27], index=week, name='北京')
gz = pd.Series([35, 36, 34, 37, 36, 35, 33], index=week, name='广州')

# 1. 补缺失：温度用前后均值插值（比填0合理得多）
bj = bj.interpolate()
print(f"北京周三(插值后): {bj['周三']:.1f}℃")   # 输出: 北京周三(插值后): 32.0℃

# 2. 每日对比：广州比北京热多少（索引自动对齐相减）
diff = gz - bj
print(diff.round(1))
# 输出:
# 周一     7.0
# 周二     5.0
# 周三     2.0
# 周四     4.0
# 周五     6.0
# 周六     6.0
# 周日     6.0

# 3. 高温预警日：广州超过 36℃ 的日子
print(gz[gz > 36].index.tolist())    # 输出: ['周四']

# 4. 周报摘要
for name, s in [('北京', bj), ('广州', gz)]:
    print(f"{name}: 均值{s.mean():.1f}℃ 最热{s.max()}℃({s.idxmax()}) "
          f"波动±{s.std():.1f}℃")
# 输出:
# 北京: 均值30.0℃ 最热33.0℃(周四) 波动±2.2℃
# 广州: 均值35.1℃ 最热37℃(周四) 波动±1.3℃
```

## 小结

- Series = 索引 + values，**按标签取用 `loc`、按位置取用 `iloc`**，别再裸用 `[]` 混两种语义
- 两个 Series 运算时**索引自动对齐**，没有配对的位置产生 NaN——这是 Pandas 最强大也最容易出乎意料的特性
- `append` 方法在 pandas 2.0 后已移除，追加数据一律 `pd.concat`
- 缺失值别无脑填 0：时间序列用 `interpolate()` 插值、统计场景用均值/中位数填充更合理
