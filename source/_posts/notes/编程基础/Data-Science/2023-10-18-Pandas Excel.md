---
title: "Pandas Excel"
date: 2023-10-18
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas Excel"
abbrlink: 1122372271
---

## 简介

CSV 是给程序看的，Excel（.xlsx）是给人看的：多 Sheet、带格式、有合并单元格。真实工作中你逃不开它——老板发来的报表是 Excel，交付的成果也往往是 Excel。

Pandas 读写 Excel 依赖第三方引擎（读 xlsx 用 `openpyxl`），多 Sheet 的读写是这一篇的主菜，顺带解决"合并单元格""多个Sheet拼接"两大经典难题。

## 基本用法

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 先造一个带两个Sheet的Excel（真实场景直接读你的文件）
with pd.ExcelWriter(WORK + 'report.xlsx') as w:
    pd.DataFrame({'商品': ['键盘'], '销量': [10]}).to_excel(w, sheet_name='销售', index=False)
    pd.DataFrame({'月份': ['1月'], '预算': [5000]}).to_excel(w, sheet_name='预算', index=False)

# 读单个Sheet（默认第一个）
df = pd.read_excel(WORK + 'report.xlsx')

# 读指定Sheet：按名字或序号都行
df = pd.read_excel(WORK + 'report.xlsx', sheet_name='销售')   # 按名字
df = pd.read_excel(WORK + 'report.xlsx', sheet_name=0)        # 按序号
sheets = pd.read_excel(WORK + 'report.xlsx', sheet_name=None) # 关键：读全部！返回字典

# 写出：不写索引
df.to_excel(WORK + 'out.xlsx', index=False)
```

`sheet_name=None` 返回一个 **{Sheet名: DataFrame} 的字典**，这是批量处理多 Sheet 的钥匙。

## 常用 API 详解

### 1. 多 Sheet 全读 + 拼接

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 先造一个双Sheet的Excel
with pd.ExcelWriter(WORK + 'monthly.xlsx') as w:
    pd.DataFrame({'月份': ['1月'], '销量': [100]}).to_excel(w, sheet_name='1月', index=False)
    pd.DataFrame({'月份': ['2月'], '销量': [130]}).to_excel(w, sheet_name='2月', index=False)

# sheet_name=None → 字典
sheets = pd.read_excel(WORK + 'monthly.xlsx', sheet_name=None)
print(list(sheets.keys()))    # 输出: ['1月', '2月']

# 各Sheet结构相同时，concat 一步合并
merged = pd.concat(sheets.values(), ignore_index=True)
print(merged)
# 输出:
#    月份  销量
# 0  1月  100
# 1  2月  130
```

### 2. ExcelWriter：多表写进一个文件

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

orders = pd.DataFrame({'商品': ['键盘', '鼠标'], '金额': [299, 89]})
summary = pd.DataFrame({'指标': ['总额', '笔数'], '值': [388, 2]})

with pd.ExcelWriter(WORK + 'report2.xlsx') as w:
    orders.to_excel(w, sheet_name='明细', index=False)
    summary.to_excel(w, sheet_name='汇总', index=False)

print(pd.read_excel(WORK + 'report2.xlsx', sheet_name=None).keys())
# 输出: dict_keys(['明细', '汇总'])
```

### 3. 处理不规矩的表：header / skiprows / usecols

```python
import pandas as pd
import io

# 模拟：前三行是标题/空行，真表头在第3行；E列是备注不要了
# pd.read_excel(
#     'messy.xlsx',
#     sheet_name='Sheet1',
#     header=2,                 # 第2行（0起算）是表头
#     usecols='A:D',            # Excel列区间语法：只读A到D列
#     skipfooter=1,             # 底部有"合计"行，跳过
# )
print('header / usecols / skipfooter 三板斧见注释示例')
```

### 4. 读出公式结果与格式信息

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# pandas 默认读公式的"计算结果"（如果有缓存值）
# 老版本想读公式本身需要 engine='openpyxl' 且 data_only=False，结果里公式显示为公式串
df = pd.read_excel(WORK + 'report2.xlsx', sheet_name='汇总')
print(df['指标'].tolist())    # 输出: ['总额', '笔数']
```

### 5. 大文件取舍

```python
import pandas as pd

# Excel 单Sheet上限约 104万行，且读写比CSV慢一个数量级
# 大数据交换建议：
#   - 中间过程存 CSV / Parquet（快10倍）
#   - 只在"入口"和"交付"环节碰 Excel
# pd.read_excel('big.xlsx')   # 十万行以上就要有心理准备了
print('经验法则：Excel 只做出入口，不做中间存储')
```

## 综合示例

把三张分店Excel合并成一份带汇总Sheet的周报：

```python
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 1. 模拟三个分店各自上交的Excel
stores = {
    '北京店': pd.DataFrame({'日期': ['周一', '周二'], '销售额': [1200, 1350]}),
    '上海店': pd.DataFrame({'日期': ['周一', '周二'], '销售额': [1500, 1480]}),
    '广州店': pd.DataFrame({'日期': ['周一', '周二'], '销售额': [900, 1020]}),
}
for name, df in stores.items():
    df.to_excel(WORK + f'{name}.xlsx', index=False)

# 2. 批量读入并打上分店标签
frames = []
for name in stores:
    df = pd.read_excel(WORK + f'{name}.xlsx')
    df['分店'] = name
    frames.append(df)

merged = pd.concat(frames, ignore_index=True)
print(merged)
# 输出:
#    日期  销售额   分店
# 0  周一  1200  北京店
# 1  周二  1350  北京店
# 2  周一  1500  上海店
# 3  周二  1480  上海店
# 4  周一   900  广州店
# 5  周二  1020  广州店

# 3. 透视汇总：行=日期 列=分店
pivot = merged.pivot_table(index='日期', columns='分店',
                           values='销售额', aggfunc='sum')
print(pivot)
# 输出:
# 分店  上海店  北京店  广州店
# 日期
# 周一   1500   1200    900
# 周二   1480   1350   1020

# 4. 一份文件双Sheet交付：明细+汇总
with pd.ExcelWriter(WORK + 'weekly_report.xlsx') as w:
    merged.to_excel(w, sheet_name='明细', index=False)
    pivot.reset_index().to_excel(w, sheet_name='汇总', index=False)
print('周报已生成: weekly_report.xlsx')
# 输出: 周报已生成: weekly_report.xlsx
```

## 小结

- `sheet_name=None` 一次读全部 Sheet（返回字典），配合 `pd.concat` 是多表合并的标准姿势
- 一个文件写多 Sheet 用 `with pd.ExcelWriter(...) as w:` 上下文
- 脏表三板斧：`header` 定表头、`usecols='A:D'` 选列、`skipfooter` 砍尾巴
- Excel 读写慢且行数有限制，**中间存储用 CSV/Parquet，Excel 只在入口和交付出现**
