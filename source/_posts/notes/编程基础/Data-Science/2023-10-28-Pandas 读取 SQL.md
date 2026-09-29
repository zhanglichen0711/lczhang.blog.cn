---
title: "Pandas 读取 SQL"
date: 2023-10-28
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas 读取 SQL"
abbrlink: 1122372273
---

## 简介

前面几篇读的都是文件，但真实公司的数据大多躺在**数据库**里——MySQL、PostgreSQL、SQLite……Pandas 的 `read_sql` 系列函数就是数据库和 DataFrame 之间的桥梁：SQL 负责筛选聚合（数据库最擅长的事），Pandas 负责后续的清洗分析（Python 最擅长的事），各司其职。

这一篇以 Python 内置的 SQLite 为例（零安装、单文件数据库，本地演示最方便），讲清 `read_sql` / `to_sql` 的核心用法。换成 MySQL 只需要把连接对象换成 `sqlalchemy.create_engine(...)`，其余代码一行不改。

## 基本用法

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'

# 建一个本地 SQLite 数据库并写入两张表（真实场景这两步已存在）
con = sqlite3.connect(WORK + 'shop.db')
orders = pd.DataFrame({
    '订单号': ['A001', 'A002', 'A003', 'A004'],
    '客户': ['张三', '李四', '张三', '王五'],
    '金额': [299.0, 158.0, 499.0, 88.0],
})
orders.to_sql('orders', con, index=False, if_exists='replace')

# 核心：read_sql —— 一条 SQL 直接变 DataFrame
df = pd.read_sql('SELECT * FROM orders', con)
print(df.shape)      # 输出: (4, 3)
con.close()
```

`read_sql(sql, con)` 是万能入口：`sql` 是 SQL 字符串（或表名），`con` 是数据库连接。数据库驱动会把查询结果打包成 DataFrame，列名自动带过来。

## 常用 API 详解

### 1. read_sql_query：带条件查询

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

# 只查金额大于100的订单，按金额降序
df = pd.read_sql_query(
    'SELECT 订单号, 金额 FROM orders WHERE 金额 > 100 ORDER BY 金额 DESC', con)
print(df['订单号'].tolist())    # 输出: ['A003', 'A001', 'A002']
con.close()
```

### 2. 参数化查询：防 SQL 注入

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

# 用 ? 占位符传参，值由驱动负责转义，杜绝注入风险
threshold = 100
df = pd.read_sql(
    'SELECT 客户, 金额 FROM orders WHERE 金额 > ?', con, params=(threshold,))
print(len(df))      # 输出: 3
con.close()
```

### 3. SQL 聚合 vs Pandas 聚合

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

# 让数据库做聚合（GROUP BY），Pandas 只接收结果
stat = pd.read_sql(
    'SELECT 客户, COUNT(*) AS 单数, SUM(金额) AS 总额 FROM orders GROUP BY 客户', con)
print(stat)
# 输出:
#   客户  单数    总额
# 0 张三   2  798.0
# 1 李四   1  158.0
# 2 王五   1   88.0
con.close()
```

### 4. to_sql：把分析结果写回数据库

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

result = pd.DataFrame({'客户': ['张三'], '消费等级': ['VIP']})
# if_exists：replace 删表重建 / append 追加 / fail 报错（默认）
result.to_sql('vip_customers', con, index=False, if_exists='replace')
print(pd.read_sql('SELECT * FROM vip_customers', con).shape)   # 输出: (1, 2)
con.close()
```

### 5. chunksize：大表分批读

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

# 千万行的表一次读入会撑爆内存，chunksize 让你分批拿
total = 0
for chunk in pd.read_sql('SELECT 金额 FROM orders', con, chunksize=2):
    total += chunk['金额'].sum()          # 每批只有2行，处理完释放
print(total)    # 输出: 1044.0
con.close()
```

## 综合示例

从数据库读订单，按客户汇总后把"高价值客户"分析结果写回一张新表：

```python
import sqlite3
import pandas as pd

WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
con = sqlite3.connect(WORK + 'shop.db')

# 1. SQL 做筛选：只看 2023 年有消费记录的客户汇总
summary = pd.read_sql(
    '''SELECT 客户, COUNT(*) AS 单数, SUM(金额) AS 总额
       FROM orders GROUP BY 客户''', con)

# 2. Pandas 做分析：总额超过 300 的标记为大客户
summary['类型'] = summary['总额'].apply(lambda x: '大客户' if x > 300 else '普通')

# 3. 写回数据库，供业务系统直接使用
summary.to_sql('customer_level', con, index=False, if_exists='replace')

# 4. 验证
print(pd.read_sql('SELECT * FROM customer_level ORDER BY 总额 DESC', con))
# 输出:
#   客户  单数    总额   类型
# 0 张三   2  798.0  大客户
# 1 李四   1  158.0   普通
# 2 王五   1   88.0   普通
con.close()
```

## 小结

- 连接 MySQL/PostgreSQL 等外部数据库时，用 `sqlalchemy.create_engine('mysql+pymysql://user:pwd@host/db')` 传入 `read_sql`，代码结构完全一致
- **能用 SQL 在数据库端完成的过滤聚合，就别拉全表到内存再算**——传输和内存是最大的瓶颈
- 拼 SQL 字符串时永远用 `params` 占位符，`f-string` 直接拼接是注入漏洞的经典来源
