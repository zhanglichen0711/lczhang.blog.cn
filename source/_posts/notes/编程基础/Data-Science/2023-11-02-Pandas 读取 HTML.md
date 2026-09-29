---
title: "Pandas 读取 HTML"
date: 2023-11-02
categories:
  - [编程基础, Data Science]
tags: [Python, Pandas]
description: "Pandas 读取 HTML"
abbrlink: 1122372274
---

## 简介

网页上大量数据以 `<table>` 表格形式存在：榜单、行情、排名、年报摘要……`pd.read_html` 能把一个网页里的所有表格一键抓成 DataFrame 列表，省去写爬虫、解析 DOM 的功夫。它不是爬虫框架（不执行 JS、不处理登录），但对"静态 HTML 表格"这一类需求，它是效率最高的工具。

依赖方面，`read_html` 需要一个解析引擎：`lxml`（最快、推荐）或 `bs4 + html5lib`（容错好、纯 Python），装好任意一个即可。

## 基本用法

```python
import io
import pandas as pd

# 一段带表格的 HTML（真实场景来自 requests.get(url).text）
html = '''
<table>
  <tr><th>排名</th><th>球队</th><th>积分</th></tr>
  <tr><td>1</td><td>国安</td><td>58</td></tr>
  <tr><td>2</td><td>申花</td><td>55</td></tr>
</table>
'''

# pandas 3.0 起字符串必须包一层 io.StringIO（旧版本可直接传 str）
tables = pd.read_html(io.StringIO(html))
print(len(tables))        # 输出: 1 → 页面里有几个表就有几个 DataFrame
df = tables[0]
print(df['球队'].tolist())   # 输出: ['国安', '申花']
```

返回值是 **DataFrame 列表**——网页里常有多个表格，`tables[0]` 取第一个，别想当然当成单个 DataFrame 用。

## 常用 API 详解

### 1. match：按表格内容定位目标表

```python
import io
import pandas as pd

html = '''
<table><tr><th>公司</th><th>营收</th></tr>
<tr><td>甲公司</td><td>100</td></tr></table>
<table><tr><th>姓名</th><th>分数</th></tr>
<tr><td>张三</td><td>92</td></tr></table>
'''

# 页面有多个表时，match 用正则筛"包含指定内容"的表，不用数下标
df = pd.read_html(io.StringIO(html), match='分数')[0]
print(df.columns.tolist())   # 输出: ['姓名', '分数']
```

### 2. header / skiprows：修正错位的表头

```python
import io
import pandas as pd

# 第一行是标题文字不是表头，表头在第二行
html = '''
<table>
  <tr><td colspan="2">2023年销售榜</td></tr>
  <tr><th>商品</th><th>销量</th></tr>
  <tr><td>键盘</td><td>310</td></tr>
</table>
'''

df = pd.read_html(io.StringIO(html), header=0)[0]
print(df.columns.tolist())   # 输出: ['2023年销售榜', '2023年销售榜.1'] → 表头识别错了

df = pd.read_html(io.StringIO(html), header=1)[0]   # 指定第2行(序号1)为表头
print(df.columns.tolist())   # 输出: ['商品', '销量']
print(df['销量'].tolist())   # 输出: [310]
```

### 3. index_col 与类型推断

```python
import io
import pandas as pd

html = '''
<table><tr><th>代码</th><th>名称</th><th>涨跌幅</th></tr>
<tr><td>600519</td><td>贵州茅台</td><td>+1.8</td></tr>
<tr><td>000858</td><td>五粮液</td><td>-0.6</td></tr></table>
'''

# 指定第0列做行索引；数值列自动推断为数字类型
df = pd.read_html(io.StringIO(html), index_col=0)[0]
print(df.dtypes['涨跌幅'].name)     # 输出: float64

# 大坑：纯数字的代码列被推断成 int，"000858" 的前导零丢了
print(df.index.tolist())            # 输出: [600519, 858]

# 用 converters 强制按字符串读，保住前导零
df = pd.read_html(io.StringIO(html), index_col=0, converters={'代码': str})[0]
print(df.index.tolist())            # 输出: ['600519', '000858']
print(df.loc['600519', '名称'])     # 输出: 贵州茅台
```

### 4. 抓取真实网页（URL 直接传入）

```python
import pandas as pd

# read_html 也接受 URL，自动下载再解析（适合无 JS 渲染的静态页面）
# 示例：维基百科"世界人口"页面，抓人口概览表
url = 'https://en.wikipedia.org/wiki/World_population'
try:
    tables = pd.read_html(url, match='Region')
    print(f'抓到 {len(tables)} 个含 Region 的表格')
except Exception as e:
    print(f'网络不可达或页面结构变化: {type(e).__name__}')
```

> 网页结构随时会变、反爬策略不可控，正式项目里更稳妥的做法是 `requests` 拿到 HTML 后交给 `read_html`，便于加重试和缓存。

### 5. 千分位与特殊符号：converters 后处理

```python
import io
import pandas as pd

html = '''
<table><tr><th>城市</th><th>人口</th></tr>
<tr><td>上海</td><td>2,476万</td></tr>
<tr><td>北京</td><td>2,184万</td></tr></table>
'''

df = pd.read_html(io.StringIO(html))[0]
# 带千分位和单位的列会被推断成字符串，需要手工清洗
df['人口'] = (df['人口'].str.replace(',', '')
                      .str.replace('万', '').astype(int))
print(df['人口'].tolist())   # 输出: [2476, 2184]
```

## 综合示例

模拟"从财报网页抓多家公司营收表并合并分析"的完整流程：

```python
import io
import pandas as pd

# 两份年报页面的 HTML 片段（结构相同，来自不同年份）
pages = ['''
<table><tr><th>业务</th><th>2023营收</th><th>2023增速</th></tr>
<tr><td>云计算</td><td>120.5</td><td>32%</td></tr>
<tr><td>广告</td><td>80.2</td><td>8%</td></tr></table>
''', '''
<table><tr><th>业务</th><th>2023营收</th><th>2023增速</th></tr>
<tr><td>游戏</td><td>45.8</td><td>15%</td></tr></table>
''']

# 逐页抓表 → match 定位 → 拼成一张总表
frames = [pd.read_html(io.StringIO(p), match='营收')[0] for p in pages]
total = pd.concat(frames, ignore_index=True)
total.columns = ['业务', '营收', '增速']     # 统一列名，去掉年份前缀

# 清洗：去掉 % 号转成小数
total['增速'] = total['增速'].str.rstrip('%').astype(float) / 100
print(total)
# 输出:
#     业务     营收    增速
# 0  云计算  120.5  0.32
# 1   广告   80.2  0.08
# 2   游戏   45.8  0.15
print(f"总营收: {total['营收'].sum():.1f} 亿")   # 输出: 总营收: 246.5 亿
```

## 小结

- `read_html` 返回的是**列表**，先 `len()` 看有几个表，再 `tables[i]` 取用；用 `match` 参数按内容定位比数下标稳健
- 抓到的列名错位、数据带千分位/单位是家常便饭，**读进来只是第一步，清洗才占八成功夫**
- 动态渲染（JS 加载）的页面 `read_html` 抓不到，那类需求需要 `selenium`/`playwright` 先拿到渲染后的 HTML
