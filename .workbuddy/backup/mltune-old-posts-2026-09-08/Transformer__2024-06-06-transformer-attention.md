---
title: Transformer：注意力是核心
date: 2024-06-06
categories:
  - [模型训练与微调, Transformer]
tags: [Transformer, NLP, 深度学习]
description: Transformer：注意力是核心
abbrlink: 1997816247
---

抛弃循环，用自注意力并行捕捉序列内的依赖。

1. Query/Key/Value 三路投影，点积 + softmax 算权重。
2. 多头注意力在不同子空间并行捕捉关系。
3. 位置编码补上顺序信息，残差连接和 LayerNorm 稳定训练。
4. 自注意力是基础块，BERT 和 GPT 的差异主要在掩码方向。
