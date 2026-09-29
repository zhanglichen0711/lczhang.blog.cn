---
title: "Pandas DataFrame"
date: 2023-10-03
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas DataFrame"
abbrlink: 1122372268
---

## 简介

DataFrame 是 Pandas 的主角：**带标签的二维表格**——有行索引（index）、有列名（columns），你可以把它想象成"一张有名字的 Excel 表"。

它是数据清洗、分析、建模的通用载体：每一列可以有自己的类型（数值、字符串、日期混着来），行列都有名字可以直观取用。可以说，Pandas 十八般武艺，八成都耍在 DataFrame 上。

## 基本用法

```python
import pandas as pd

# 最常用：字典创建（键=列名，值=列数据）
df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五', '赵六'],
    '年龄': [18, 19, 20, 19],
    '城市': ['北京', '上海', '北京', '广州'],
    '成绩': [92, 55, 78, 88],
})
print(df)
# 输出:
#    姓名  年龄  城市  成绩
# 0  张三  18  北京  92
# 1  李四  19  上海  55
# 2  王五  20  北京  78
# 3  赵六  19  广州  88

# 体检三件套
print(df.shape)      # 输出: (4, 4)  → 4行4列
print(df.columns.tolist())   # 输出: ['姓名', '年龄', '城市', '成绩']
print(df.dtypes)
# 输出:
# 姓名      str
# 年龄    int64
# 城市      str
# 成绩    int64
# （pandas 3.0 起字符串列显示为 str，旧版本显示为 object）
```

## 常用 API 详解

### 1. 查看数据：head / tail / info / describe

```python
import pandas as pd

df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五', '赵六', '钱七', '孙八'],
    '成绩': [92, 55, 78, 88, 61, 73],
})

print(df.head(3))       # 前3行（默认5行）
print(df.tail(2))       # 后2行
print(df.info())        # 行数、列类型、内存占用、缺失情况一览
print(df['成绩'].describe())
# 输出:
# count     6.000000
# mean     74.500000
# std      14.597945
# ...
```

### 2. 选列与选行

```python
import pandas as pd

df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五'],
    '年龄': [18, 19, 20],
    '成绩': [92, 55, 78],
}, index=['one', 'two', 'three'])

# 取列：[] 返回 Series，[[...]] 返回 DataFrame
print(df['姓名'])              # Series
print(df[['姓名', '成绩']])    # DataFrame（注意双层括号）

# 取行：loc 按标签，iloc 按位置
print(df.loc['two'])                   # 第'two'行（Series）
print(df.iloc[0])                      # 第0行
print(df.loc['one':'three', ['姓名']]) # 标签切片含尾！
# 输出:
#       姓名
# one    张三
# two    李四
# three  王五
```

**高频坑**：`loc` 的切片**包含终点**，`iloc` 的切片不包含终点——和 Python 惯例相反。

### 3. 条件筛选

```python
import pandas as pd

df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五', '赵六'],
    '年龄': [18, 19, 20, 19],
    '成绩': [92, 55, 78, 88],
})

# 单条件 & 多条件（每个条件必须加括号，用 & | ~ 而不是 and or）
print(df[df['成绩'] >= 80])
# 输出:
#    姓名  年龄  成绩
# 0  张三   18    92
# 3  赵六   19    88

print(df[(df['年龄'] >= 19) & (df['成绩'] >= 70)])
# 输出:
#    姓名  年龄  成绩
# 3  赵六   19    88

# query 写法：条件是字符串，可读性更好
print(df.query('年龄 == 19 and 成绩 > 60'))
# 输出:
#    姓名  年龄  成绩
# 3  赵六   19    88
```

### 4. 增删列

```python
import pandas as pd

df = pd.DataFrame({'价格': [100, 200, 300], '数量': [2, 1, 5]})

# 新增列：直接赋值（向量化的性价比计算）
df['总价'] = df['价格'] * df['数量']
df['折扣价'] = (df['总价'] * 0.9).round(2)
print(df)
# 输出:
#    价格  数量   总价   折扣价
# 0  100    2   200  180.00
# ...

# 删除列：drop 指定 axis=1（或 columns）
df = df.drop(columns=['总价'])
print(df.columns.tolist())   # 输出: ['价格', '数量', '折扣价']

# 改列名
df = df.rename(columns={'折扣价': '实付'})
print(df.columns.tolist())   # 输出: ['价格', '数量', '实付']
```

### 5. 修改值与 set_index

```python
import pandas as pd

df = pd.DataFrame({'姓名': ['张三', '李四'], '成绩': [92, 55]})

# loc 定位到具体格子改值
df.loc[df['成绩'] < 60, '成绩'] = 60    # 挂科的都"捞"到60
print(df['成绩'].tolist())              # 输出: [92, 60]

# 把某一列设为行索引
df = df.set_index('姓名')
print(df.index.tolist())                # 输出: ['张三', '李四']
```

## 综合示例

一个"员工薪资表"从建表到分析报告的完整流程：

```python
import pandas as pd
import numpy as np

# 1. 建表（模拟脏数据：有缺失、有离职标记）
df = pd.DataFrame({
    '工号': ['E001', 'E002', 'E003', 'E004', 'E005'],
    '部门': ['技术', '技术', '市场', '市场', '人事'],
    '职级': ['P5', 'P6', 'P3', 'P4', np.nan],
    '月薪': [25000, 38000, 12000, 18000, 10000],
    '在职': [True, True, False, True, True],
})

# 2. 派生列：年薪 + 是否高薪
df['年薪'] = df['月薪'] * 12
df['高薪'] = np.where(df['月薪'] >= 25000, '是', '否')

# 3. 筛选：在职且技术部
active_tech = df[(df['在职']) & (df['部门'] == '技术')]
print(f"在职技术人员: {active_tech['工号'].tolist()}")
# 输出: 在职技术人员: ['E001', 'E002']

# 4. 部门平均月薪（分组聚合初探）
print(df.groupby('部门')['月薪'].mean().round(0))
# 输出:
# 部门
# 人事    10000.0
# 市场    15000.0
# 技术    31500.0

# 5. 按月薪排序取前三
top3 = df.nlargest(3, '月薪')[['工号', '部门', '月薪']]
print(top3.to_string(index=False))
# 输出:
#   工号  部门  月薪
#  E002  技术  38000
#  E001  技术  25000
#  E004  市场  18000
```

## 小结

- DataFrame 万物皆可查，但**选列用 `[]`、选行用 `loc/iloc`**，别混
- 条件筛选三件套：`df[cond]`、`&`/`|` 组合、`df.query()`，各记一招即可横行
- `loc` 切片含尾、`iloc` 切片不含尾，这个不对称要背下来
- 派生列直接 `df['新列'] = 表达式`，这是特征工程最基础的动作
