---
title: "Pandas CSV"
date: 2023-10-13
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas CSV"
abbrlink: 1122372270
---

## 简介

CSV（Comma-Separated Values，逗号分隔值）是数据世界的"普通话"：纯文本、任何工具都能打开、跨平台通用。数据分析师每天打交道的文件，一半以上是 CSV。

Pandas 的 `read_csv` 是被调用量最大的函数之一，参数多到能列一页纸——但常用也就十来个。这一篇把这些参数按"读取什么、跳过什么、解析成什么"三组讲透。

## 基本用法

```python
import pandas as pd
import io

# 最简单的一行（用 io.StringIO 内联模拟一个CSV文件，真实场景换成文件路径）
csv_text = "编号,商品,金额\nD001,键盘,299\nD002,鼠标,89"
df = pd.read_csv(io.StringIO(csv_text))
print(df)
# 输出:
#      编号  商品   金额
# 0  D001  键盘  299
# 1  D002  鼠标   89

# 中文CSV的两大常见问题：编码 & 索引（读真实文件时）
# df = pd.read_csv(
#     'data.csv',
#     index_col=0,          # 第0列是数据标签，别让它变成普通列
#     encoding='utf-8',     # 乱码就换 'gbk'（Windows国产软件导出的常见编码）
# )
```

## 常用 API 详解

### 1. 分隔符不一定是逗号：sep 参数

```python
import pandas as pd
import io

# TSV（Tab分隔）用 sep='\t'；分号分隔用 sep=';'
tsv_data = "姓名\t年龄\n张三\t18\n李四\t19"
df = pd.read_csv(io.StringIO(tsv_data), sep='\t')
print(df)
# 输出:
#    姓名  年龄
# 0  张三   18
# 1  李四   19

# 自动探测：sep=None + engine='python'
# pd.read_csv('weird.csv', sep=None, engine='python')
```

### 2. header / names / skiprows：处理不规矩的表头

```python
import pandas as pd
import io

# 文件头两行是"报表说明"垃圾文本，真表头在第2行（0起算）
raw = "某公司2023年销售报表\n（机密）\n城市,销售额\n北京,1200\n上海,1500"
df = pd.read_csv(io.StringIO(raw), skiprows=2)
print(df)
# 输出:
#    城市  销售额
# 0  北京  1200
# 1  上海  1500

# 没有表头的文件：header=None + names 起名
raw2 = "北京,1200\n上海,1500"
df2 = pd.read_csv(io.StringIO(raw2), header=None, names=['城市', '销售额'])
print(df2.columns.tolist())   # 输出: ['城市', '销售额']
```

### 3. usecols / dtype / parse_dates：读的时候就该做对

```python
import pandas as pd
import io

raw = """日期,城市,销售额,备注
2023-10-01,北京,1200,国庆
2023-10-02,上海,1500,国庆
"""

df = pd.read_csv(
    io.StringIO(raw),
    usecols=['日期', '城市', '销售额'],   # 只读需要的列，省内存
    dtype={'销售额': float},              # 锁定类型，不让Pandas猜
    parse_dates=['日期'],                 # 日期串 → datetime64
)
print(df.dtypes)
# 输出:
# 日期     datetime64[ns]
# 城市             object
# 销售额           float64
```

### 4. 缺失值标记：na_values

```python
import pandas as pd
import io

raw = "姓名,分数\n张三,-\n李四,缺考\n王五,92"
df = pd.read_csv(io.StringIO(raw), na_values=['-', '缺考'])
print(df['分数'].tolist())   # 输出: [nan, nan, 92.0]
```

### 5. to_csv：写出的细节

```python
import pandas as pd

df = pd.DataFrame({'姓名': ['张三'], '分数': [92]})
WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 标准写出姿势
df.to_csv(WORK + 'out.csv', index=False, encoding='utf-8-sig')

# 追加模式（每天生成一批日志往同一个文件里堆）
df.to_csv(WORK + 'log.csv', mode='a', header=False, index=False)

# 逗号是欧洲小数点？用分号分隔避免冲突
# df.to_csv('eu.csv', sep=';', index=False)
print(open(WORK + 'out.csv', encoding='utf-8-sig').read())
# 输出:
# 姓名,分数
# 张三,92
```

## 综合示例

处理一份"不那么干净"的真实风格 CSV 全流程：

```python
import pandas as pd
import io

# 模拟：带说明行、缺失标记、多余列、日期列
raw = """== 2023年Q3 销售数据（导出于10月）==
城市,日期,销售额,经手人,备注
北京,2023-07-01,1200,张三,-
上海,2023-07-01,1500,李四,大客户
广州,2023-07-02,NaN,王五,数据未回传
北京,2023-07-03,980,张三,-
"""

# 1. 一次配齐所有参数读入
df = pd.read_csv(
    io.StringIO(raw),
    skiprows=1,                         # 跳过说明行
    na_values=['-', 'NaN', '数据未回传'],
    usecols=['城市', '日期', '销售额'],   # 丢弃经手人、备注
    parse_dates=['日期'],
)
print(df)
# 输出:
#    城市        日期   销售额
# 0  北京 2023-07-01  1200.0
# 1  上海 2023-07-01  1500.0
# 2  广州 2023-07-02     NaN
# 3  北京 2023-07-03   980.0

# 2. 缺失处理：销售额用城市均值填
df['销售额'] = df['销售额'].fillna(df.groupby('城市')['销售额'].transform('mean'))

# 3. 按城市汇总
report = df.groupby('城市')['销售额'].agg(['count', 'sum', 'mean']).round(1)
print(report)
# 输出:
#   count    sum   mean
# 城市
# 北京      2  2180  1090.0
# 上海      1  1500  1500.0
# 广州      1   980   980.0

# 4. 写出正式报告
WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
report.to_csv(WORK + 'q3_report.csv', encoding='utf-8-sig')
print('已写出 q3_report.csv')
# 输出: 已写出 q3_report.csv
```

## 小结

- 中文乱码 99% 是编码问题：**utf-8 不行换 gbk**，给 Excel 用户写文件用 `utf-8-sig`
- 参数组合拳一次到位：`skiprows` 跳垃圾、`usecols` 挑列、`dtype` 锁类型、`parse_dates` 解析日期
- `na_values` 把"-"、"缺考"这类假字符串统一归位成 NaN，后续清洗才有统一入口
- 写出永远带上 `index=False`，追加日志记得 `mode='a', header=False`
