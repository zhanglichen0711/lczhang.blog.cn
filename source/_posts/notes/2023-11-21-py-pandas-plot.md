---
title: "用 Pandas 看分布，再用图确认"
date: 2023-11-21
categories:
  - Python
tags: [Python, Pandas]
description: "先 info 和 value_counts，再决定要不要上 BERT。"
---

数据分析三件套的顺序应是：表 → 统计 → 图，而不是先画一张好看的柱状图。

读入样本后先看缺失、类别计数、文本长度分位数。类别极度不均衡时，准确率会骗人。图只回答一个问题：是不是失衡、有没有极端长文本。

Matplotlib 设中文字体是为了读得清，不是为了装饰。评测集也应先过这一层，再拿去对比 FastText 和 BERT。
