---
title: "Pandas Parquet / Feather"
date: 2023-11-07
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas Parquet / Feather"
abbrlink: 1122372275
---

## 简介

CSV 是文本格式，人眼可读但机器遭罪：占空间大、读写慢、类型全靠猜（`000858` 读进来变 `858`）。**Parquet** 和 **Feather** 是两种二进制列式存储格式，专治这些问题：

- **类型保真**：写出去是 `int64`，读回来还是 `int64`，前导零、日期、分类型都不会丢
- **体积极小**：内置压缩，同样的数据通常只有 CSV 的 1/3 到 1/10
- **读取飞快**：列式存储读少数几列时不用扫全表

两者分工：Parquet 压缩更狠、生态更广（Spark/Hive/数据湖标配），适合**长期归档和跨系统交换**；Feather 压缩轻、读写更快，适合**中间结果暂存**。依赖 `pyarrow`（`pip install pyarrow`）。

## 基本用法

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

df = pd.DataFrame({
    '商品': ['机械键盘', '无线鼠标', '显示器支架'],
    '销量': [120, 350, 88],
    '单价': [599.0, 149.0, 259.0],
})

# 写 + 读，API 和 to_csv/read_csv 一一对应
df.to_parquet(WORK + 'sales.parquet', index=False)
back = pd.read_parquet(WORK + 'sales.parquet')
print(back.dtypes['销量'].name)     # 输出: int64 → 类型原样保留

df.to_feather(WORK + 'sales.feather')   # feather 总是写索引
back2 = pd.read_feather(WORK + 'sales.feather')
print(back2.shape)                  # 输出: (3, 3)
```

## 常用 API 详解

### 1. 三种格式体积对比

```python
import os
import numpy as np
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 1万行示例数据：整数列 + 随机小数列
big = pd.DataFrame({'a': range(10000), 'b': np.random.rand(10000).round(2)})
big.to_csv(WORK + 'big.csv', index=False)
big.to_parquet(WORK + 'big.parquet', index=False)
big.to_feather(WORK + 'big.feather')

for ext in ['csv', 'parquet', 'feather']:
    size = os.path.getsize(WORK + f'big.{ext}') / 1024
    print(f'{ext:8s} {size:.1f} KB')
# 输出（数值因数据而异）:
# csv      105.4 KB
# parquet   66.9 KB
# feather   74.5 KB
```

数据列越重复、行数越大，Parquet 的压缩优势越明显（真实业务数据常到 10 倍）。

### 2. columns：只读需要的列

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 列式存储的看家本领：只反序列化指定列，宽表提速明显
df = pd.read_parquet(WORK + 'big.parquet', columns=['b'])
print(df.shape)     # 输出: (10000, 1)
```

### 3. 压缩算法选择

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

df = pd.read_parquet(WORK + 'big.parquet')

# 默认 snappy（快）；归档场景可换 zstd（更小）或 gzip（兼容性最好）
df.to_parquet(WORK + 'big_zstd.parquet', compression='zstd')
back = pd.read_parquet(WORK + 'big_zstd.parquet')   # 读取时自动识别，无需指定
print(back.shape)       # 输出: (10000, 2)
```

### 4. 分区存储：大数据集的目录结构

```python
import os
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 按"年份"分区写出 → 每个年份一个子目录，读时可按分区裁剪
df = pd.DataFrame({
    '年份': [2022, 2022, 2023, 2023],
    '城市': ['北京', '上海', '北京', '上海'],
    'GDP': [4.16, 4.47, 4.38, 4.72],
})
df.to_parquet(WORK + 'gdp_by_year', partition_cols=['年份'])

# 只读 2023 分区，扫描量减半
# 注意：分区列被推断成 int32，过滤值要用数字 2023 而非字符串 '2023'
df23 = pd.read_parquet(WORK + 'gdp_by_year', filters=[('年份', '=', 2023)])
print(df23.shape)     # 输出: (2, 3)
print(sorted(os.listdir(WORK + 'gdp_by_year')))   # 输出: ['年份=2022', '年份=2023']
```

### 5. 保留与还原复杂类型

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 日期、多级索引这类 CSV 存不下的结构，parquet 都能无损往返
df = pd.DataFrame({'日期': pd.to_datetime(['2023-01-01', '2023-01-02']),
                   '销量': [300, 412]})
df = df.set_index('日期')
df.to_parquet(WORK + 'daily.parquet')

back = pd.read_parquet(WORK + 'daily.parquet')
print(type(back.index).__name__)   # 输出: DatetimeIndex → 索引类型没丢
```

## 综合示例

把 CSV 原始数据"格式化"成 Parquet 数据仓库，体会完整的转换流程：

```python
import numpy as np
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 1. 模拟拿到一批 CSV 原始数据（订单号有前导零，CSV 的经典痛点）
raw = pd.DataFrame({
    '订单号': ['0071', '0072', '0073', '0074'],
    '门店': ['中关村', '五道口', '中关村', '西二旗'],
    '金额': np.array([258.0, 99.5, 899.0, 159.0]),
})

# 2. 清洗阶段照常在 DataFrame 里做
raw['大额'] = raw['金额'] > 200

# 3. 落盘为按门店分区的 Parquet 仓库
raw.to_parquet(WORK + 'orders_dw', partition_cols=['门店'])

# 4. 分析时只读"中关村"分区，订单号仍是字符串
zgc = pd.read_parquet(WORK + 'orders_dw', filters=[('门店', '=', '中关村')])
print(zgc['订单号'].tolist())          # 输出: ['0071', '0073'] → 前导零完好
print(f"中关村总金额: {zgc['金额'].sum():.1f} 元")   # 输出: 中关村总金额: 1157.0 元
```

## 小结

- **CSV 管交换（给人看、跨软件），Parquet 管存储（给自己和机器用）**：分析项目的中间结果、数仓分层存储优先 Parquet
- Feather 读写速度更快但压缩弱，适合同一天内反复读写的临时中间层
- `to_feather` 不支持 `index=False`（索引总是写入）；而 `to_parquet` 单文件时建议写 `index=False`，避免读回来多出一列 `Unnamed: 0`
