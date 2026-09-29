---
title: "Pandas JSON"
date: 2023-10-23
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas JSON"
abbrlink: 1122372272
---

## 简介

JSON 是互联网的"官方语言"：API 返回、配置文件、日志、NoSQL 数据库，全是它。它的结构和表格天然有差异——**JSON 是嵌套的树，DataFrame 是平的表**，所以 Pandas 读 JSON 的核心工作就是"把树拍平"。

`pd.read_json` 能处理规整的 JSON，`pd.json_normalize` 专治嵌套结构，这一篇把这两个工具和它们的关键参数讲清楚。

## 基本用法

```python
import pandas as pd
import io

# 最简单的形式：对象数组（每个对象一行）
json_str = '''
[
  {"姓名": "张三", "年龄": 18, "城市": "北京"},
  {"姓名": "李四", "年龄": 19, "城市": "上海"}
]
'''

# 注意：新版pandas里，JSON字符串要包一层 io.StringIO 再传入
df = pd.read_json(io.StringIO(json_str))
print(df)
# 输出:
#    姓名  年龄  城市
# 0  张三   18  北京
# 1  李四   19  上海

# 也可以直接给文件路径或URL
# df = pd.read_json('https://api.example.com/users')
# df = pd.read_json('data.json', orient='records')
```

## 常用 API 详解

### 1. orient：JSON 的五种姿势

`orient` 参数描述"JSON 按什么结构组织"，必须和数据实际形状匹配：

| orient | JSON 结构 | 对应 |
|--------|-----------|------|
| `records` | `[{列:值}, {列:值}]` | 最常见，API标准格式 |
| `columns` | `{列名: {索引: 值}}` | 默认之一 |
| `index` | `{索引: {列: 值}}` | 行优先嵌套 |
| `values` | `[[行1], [行2]]` | 纯二维数组 |
| `split` | `{index:[], columns:[], data:[[]]}` | 索引/列/数据分开 |

```python
import pandas as pd
import io

# records 是接口返回的标准格式，认准它
records = '[{"a":1,"b":"x"},{"a":2,"b":"y"}]'
print(pd.read_json(io.StringIO(records), orient='records'))
# 输出:
#    a  b
# 0  1  x
# 1  2  y
```

### 2. json_normalize：专治嵌套 JSON

```python
import pandas as pd

# 真实API常见结构：字段里套对象
data = [
    {"name": "张三", "profile": {"city": "北京", "vip": True}},
    {"name": "李四", "profile": {"city": "上海", "vip": False}},
]

df = pd.json_normalize(data)
print(df)
# 输出:
#   name profile.city  profile.vip
# 0  张三           北京         True
# 1  李四           上海        False

# sep 参数美化列名
df2 = pd.json_normalize(data, sep='_')
print(df2.columns.tolist())   # 输出: ['name', 'profile_city', 'profile_vip']
```

### 3. 深层嵌套与数组展开

```python
import pandas as pd

# 数组字段 + 多层嵌套
orders = [
    {"订单号": "D001", "客户": {"姓名": "张三", "地址": {"城市": "北京"}},
     "商品": [{"品名": "键盘", "数量": 1}, {"品名": "鼠标", "数量": 2}]},
    {"订单号": "D002", "客户": {"姓名": "李四", "地址": {"城市": "上海"}},
     "商品": [{"品名": "显示器", "数量": 1}]},
]

# record_path 展开数组，meta 带上外层字段
items = pd.json_normalize(
    orders,
    record_path='商品',                      # 数组字段：每个元素一行
    meta=['订单号',
          ['客户', '姓名'],
          ['客户', '地址', '城市']],          # 外层字段用路径列表
)
print(items)
# 输出:
#    品名  数量   订单号 客户.姓名 客户.地址.城市
# 0  键盘     1  D001     张三         北京
# 1  鼠标     2  D001     张三         北京
# 2 显示器     1  D002     李四         上海
```

### 4. to_json：写出的方向参数

```python
import pandas as pd

df = pd.DataFrame({'a': [1, 2], 'b': ['x', 'y']})

print(df.to_json(orient='records', force_ascii=False))
# 输出: [{"a":1,"b":"x"},{"a":2,"b":"y"}]

print(df.to_json(orient='records', lines=True, force_ascii=False))
# 输出（JSON Lines，每行一条，日志/大数据流式处理的标配）:
# {"a":1,"b":"x"}
# {"a":2,"b":"y"}
```

**高频坑**：`to_json` 默认 `force_ascii=True`，中文会变成 `\u5f20\u4e09`，写中文必须加 `force_ascii=False`。

## 综合示例

调接口拿到一批嵌套的用户订单 JSON，清洗成分析友好的宽表：

```python
import pandas as pd

# 1. 模拟API响应
api_response = {
    "code": 0,
    "data": {
        "users": [
            {"uid": 1, "nick": "小明", "level": 3,
             "orders": [{"oid": "a1", "amount": 299.0},
                        {"oid": "a2", "amount": 89.0}]},
            {"uid": 2, "nick": "小红", "level": 5,
             "orders": [{"oid": "b1", "amount": 1599.0}]},
        ]
    }
}

# 2. 取出用户数组
users = api_response['data']['users']

# 3. 订单表：展开 orders 数组，保留用户信息
orders_df = pd.json_normalize(
    users,
    record_path='orders',
    meta=['uid', 'nick', 'level'],
)
print(orders_df)
# 输出:
#   oid  amount  uid nick  level
# 0  a1   299.0    1   小明      3
# 1  a2    89.0    1   小明      3
# 2  b1  1599.0    2   小红      5

# 4. 用户表：每个用户一行（订单数、总消费）
user_df = pd.json_normalize(users).drop(columns='orders')
user_df['订单数'] = user_df['uid'].map(orders_df['uid'].value_counts())
user_df['总消费'] = user_df['uid'].map(orders_df.groupby('uid')['amount'].sum())
print(user_df)
# 输出:
#    uid nick  level  订单数    总消费
# 0    1   小明      3      2   388.0
# 1    2   小红      5      1  1599.0

# 5. 结果序列化为 JSON Lines 存档
WORK = 'E:/workbuddy/2026-09-04-20-53-16/tmp_data/'
user_df.to_json(WORK + 'users.jsonl', orient='records',
                lines=True, force_ascii=False)
print('已存档 users.jsonl')
# 输出: 已存档 users.jsonl
```

## 小结

- **规整 JSON 用 `read_json`，嵌套 JSON 用 `json_normalize`**，后者是处理 API 数据的核心武器
- `record_path` 展开数组（一单多商品→多行），`meta` 用路径列表携带外层字段
- 写中文 JSON 必须 `force_ascii=False`，否则满屏 `\u5f20`
- 日志和流式场景认准 `orient='records', lines=True`（JSON Lines 格式）
