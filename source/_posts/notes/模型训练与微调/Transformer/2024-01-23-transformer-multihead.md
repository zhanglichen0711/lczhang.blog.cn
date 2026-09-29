---
title: "多头注意力与位置编码"
date: 2024-01-23
categories:
  - [模型训练与微调, Transformer]
tags: [Transformer, 多头注意力]
description: "单头注意力只看一种关系，多头并行看多种；位置信息靠位置编码补上。"
abbrlink: 172148261
---

上一篇讲了单头注意力怎么算。但真实 Transformer 用的是**多头注意力**（Multi-Head Attention），并且要给每个词**位置编码**。这一篇把这两个升级讲清楚：为什么一个不够、位置从哪来。

## 为什么需要多个头

单头注意力有一个隐含缺陷：**一次只能建立"一种"相关关系**。看句子"小明把球传给小王，因为他累了"——"他"到底指谁？可能是"小明累了"，也可能是"小王累了"，需要不同的判断角度。单头注意力只能"平均"地看一种关系，容易糊。

多头注意力把 Q/K/V 切成多份，**每份独立算一套注意力**，让不同头学会关注不同维度的关系：

```text
输入
 ├─ 头1：关注"代词指代谁"（语法关系）
 ├─ 头2：关注"词语语义相近"（语义关系）
 ├─ 头3：关注"位置相邻"（局部关系）
 └─ ... 8 个头各看各的
    ↓ 拼接所有头的输出，再过一层线性
最终输出
```

**直觉：多个头 = 多套"注意力视角"并行，最后拼起来**。模型能同时捕捉"指代、语义、句法"等多种关系，表达能力大增。

## 多头注意力怎么实现

实现上不必真的并行多套权重——把维度切块就能达到效果：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class MultiHeadAttention(nn.Module):
    def __init__(self, d_model=512, num_heads=8):
        super().__init__()
        assert d_model % num_heads == 0
        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads   # 每头负责的维度
        self.wq = nn.Linear(d_model, d_model)  # 投影 Q（一次算所有头）
        self.wk = nn.Linear(d_model, d_model)
        self.wv = nn.Linear(d_model, d_model)
        self.out = nn.Linear(d_model, d_model)

    def forward(self, x):
        bsz, seq, _ = x.shape
        q = self.wq(x).view(bsz, seq, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.wk(x).view(bsz, seq, self.num_heads, self.head_dim).transpose(1, 2)
        v = self.wv(x).view(bsz, seq, self.num_heads, self.head_dim).transpose(1, 2)
        # 现在形状 (batch, heads, seq, head_dim)，多头并行算注意力
        scores = q @ k.transpose(-2, -1) / (self.head_dim ** 0.5)
        attn = F.softmax(scores, dim=-1)
        out = attn @ v
        out = out.transpose(1, 2).contiguous().view(bsz, seq, self.d_model)
        return self.out(out)
```

理解两个关键行就够了：

- `view(...).transpose(...)`：把 512 维切成 8 份 × 64 维，变成 `(batch, 8头, seq, 64)`——**之后一次矩阵运算就是 8 头并行**；
- `scores / sqrt(head_dim)`：除以维度开方（缩放点积），防止分数过大导致 softmax 饱和——小细节，训练稳定靠它。

## 位置编码：给"并行"补上顺序

自注意力并行计算有个代价：**它对"顺序"不敏感**。把"我打你"和"你打我"的词换位，注意力结果完全一样——但语义完全不同。RNN 天然按顺序处理所以没这问题，Transformer 必须**显式把位置信息喂进去**。

做法：给每个位置生成一个"位置向量"，加到词向量上：

```python
import math

def positional_encoding(seq_len, d_model):
    pe = torch.zeros(seq_len, d_model)
    position = torch.arange(0, seq_len).unsqueeze(1).float()
    div_term = torch.exp(torch.arange(0, d_model, 2).float() *
                         (-math.log(10000.0) / d_model))
    pe[:, 0::2] = torch.sin(position * div_term)   # 偶维用 sin
    pe[:, 1::2] = torch.cos(position * div_term)   # 奇维用 cos
    return pe

pe = positional_encoding(10, 512)
print(pe.shape)          # (10, 512)：第 i 个位置的编码
```

正弦/余弦编码的性质很妙：**相邻位置的编码相似、距离越远差异越大**，模型能从中感知"谁在谁旁边、相隔多远"。后来的模型也有用可学习位置编码、或旋转位置编码（RoPE，LLM 主流），思想一致：**给并行计算补上位置感**。

## 一个完整的注意力块

多头注意力 + 残差 + 归一化，组成 Transformer 的基本块（编码器层）：

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model=512, num_heads=8, ff_dim=2048):
        super().__init__()
        self.attn = MultiHeadAttention(d_model, num_heads)
        self.norm1 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(               # 前馈网络（FFN）
            nn.Linear(d_model, ff_dim), nn.ReLU(),
            nn.Linear(ff_dim, d_model),
        )
        self.norm2 = nn.LayerNorm(d_model)

    def forward(self, x):
        x = x + self.attn(self.norm1(x))      # 残差连接：防止深层退化
        x = x + self.ff(self.norm2(x))        # Pre-LN 顺序
        return x
```

三个部件各司其职：**多头注意力学关系、FFN 做非线性变换、残差 + LayerNorm 保训练稳定**。这"三件套"重复堆叠就是 Transformer 的全部骨架。

## 小结

多头注意力让模型**同时从多个视角看关系**，位置编码给并行计算**补上顺序感**，再加残差与 LayerNorm 保训练稳定——这就是 Transformer 基本块的完整构成。下一篇把这块积木拼成完整的编码器-解码器架构，看它在翻译任务里怎么工作。
