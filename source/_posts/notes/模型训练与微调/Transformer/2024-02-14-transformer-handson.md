---
title: "动手实现一个简化 Transformer"
date: 2024-02-14
categories:
  - [模型训练与微调, Transformer]
tags: [Transformer, PyTorch]
description: "用 PyTorch 从零搭一个字符级小 GPT，跑通'训练一个能续写的玩具模型'全流程。"
abbrlink: 3812796151
---

前 5 篇把 Transformer 的概念讲完了，这篇落地：用 PyTorch 从零实现一个**字符级迷你 GPT**——输入一段文本（字符序列），训练它预测下一个字符，最后真的能让它"续写"。麻雀虽小五脏俱全：embedding、因果掩码多头注意力、层归一化、训练、采样全都有。跑通它，Transformer 对你就不再有任何黑盒。

## 数据：把文本变成字符序列

用一句有规律的文本当玩具语料，让模型学"续写"：

```python
text = "hello world hello world hello transformer hello "
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}   # 字符 → 索引
itos = {i: c for c, i in stoi.items()}
vocab_size = len(chars)
print(f"字符表: {''.join(chars)} ({vocab_size} 个)")

# 整段文本转成索引序列
data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
```

字符级模型的输入是最小单位（字符），原理和词级完全一样——只是"词表"换成了"字符表"。

## 一个极简 GPT 模型（核心 60 行）

关键组件一个个写：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(42)


class MiniGPT(nn.Module):
    def __init__(self, vocab_size, n_embd=64, n_head=4, n_layer=2, block_size=16):
        super().__init__()
        self.block_size = block_size
        self.token_emb = nn.Embedding(vocab_size, n_embd)   # 字符 → 向量
        self.pos_emb = nn.Embedding(block_size, n_embd)     # 位置 → 向量
        self.blocks = nn.Sequential(*[
            TransformerBlock(n_embd, n_head) for _ in range(n_layer)
        ])
        self.ln_f = nn.LayerNorm(n_embd)
        self.head = nn.Linear(n_embd, vocab_size)           # 预测下一个字符

    def forward(self, idx):
        b, t = idx.shape
        tok = self.token_emb(idx)                            # (b,t,C)
        pos = self.pos_emb(torch.arange(t, device=idx.device))  # (t,C)
        x = tok + pos                                        # 词向量 + 位置编码
        x = self.blocks(x)
        return self.head(self.ln_f(x))                       # (b,t,vocab)
```

```python
class TransformerBlock(nn.Module):
    def __init__(self, n_embd, n_head):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = CausalSelfAttention(n_embd, n_head)
        self.ln2 = nn.LayerNorm(n_embd)
        self.ff = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd), nn.GELU(),
            nn.Linear(4 * n_embd, n_embd),
        )

    def forward(self, x):
        x = x + self.attn(self.ln1(x))    # 自注意力 + 残差
        x = x + self.ff(self.ln2(x))      # 前馈 + 残差
        return x
```

```python
class CausalSelfAttention(nn.Module):
    def __init__(self, n_embd, n_head):
        super().__init__()
        self.n_head = n_head
        self.c_attn = nn.Linear(n_embd, 3 * n_embd)   # 一次算出 Q K V
        self.c_proj = nn.Linear(n_embd, n_embd)

    def forward(self, x):
        b, t, c = x.shape
        qkv = self.c_attn(x)                            # (b,t,3c)
        q, k, v = qkv.chunk(3, dim=-1)                  # 拆成 Q K V
        hd = c // self.n_head
        # 切成多头: (b, heads, t, hd)
        q = q.view(b, t, self.n_head, hd).transpose(1, 2)
        k = k.view(b, t, self.n_head, hd).transpose(1, 2)
        v = v.view(b, t, self.n_head, hd).transpose(1, 2)

        att = (q @ k.transpose(-2, -1)) / (hd ** 0.5)   # 注意力分数
        mask = torch.triu(torch.ones(t, t, device=x.device),
                          diagonal=1).bool()
        att = att.masked_fill(mask, float("-inf"))      # 因果掩码：只看左边
        att = F.softmax(att, dim=-1)
        y = att @ v                                     # (b, heads, t, hd)
        y = y.transpose(1, 2).contiguous().view(b, t, c)
        return self.c_proj(y)
```

三个组件拼起来就是**完整的迷你 GPT**：token+位置 embedding → N 层（掩码多头注意力 + 前馈 + 残差 + LayerNorm）→ 输出层。对比一下前面架构篇的图，每一行代码都能对上号。

## 训练：预测下一个字符

```python
block_size = 16

def get_batch():
    """随机取一段长为 block_size 的序列，目标是被右移一位的下一个字符"""
    ix = torch.randint(0, len(data) - block_size - 1, (8,))
    x = torch.stack([data[i:i + block_size] for i in ix])
    y = torch.stack([data[i + 1:i + block_size + 1] for i in ix])
    return x, y

model = MiniGPT(vocab_size)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2)

for step in range(2000):
    x, y = get_batch()
    logits = model(x)                          # (8, 16, vocab)
    loss = F.cross_entropy(logits.view(-1, vocab_size), y.view(-1))
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 400 == 0:
        print(f"step {step:4d}  loss={loss.item():.4f}")
```

loss 会从接近 log(vocab) 一路降到很小——说明模型学会了从上下文预测下一个字符。

## 采样：让它自己续写

训练完后，给模型一个开头，让它一个字符一个字符地"想"出来：

```python
@torch.no_grad()
def generate(model, start="hello", n_new=40):
    model.eval()
    idx = torch.tensor([[stoi[c] for c in start]], dtype=torch.long)
    for _ in range(n_new):
        idx_cond = idx[:, -block_size:]        # 只看最近 block_size 个字符
        logits = model(idx_cond)               # (1, t, vocab)
        probs = F.softmax(logits[0, -1], dim=-1)   # 最后一个位置的预测
        next_char = torch.multinomial(probs, 1)    # 按概率采样
        idx = torch.cat([idx, next_char], dim=1)
    return "".join(itos[i.item()] for i in idx[0])

print(generate(model, "hello", 30))
```

预期输出会是训练文本风格的续写（重复出现 "hello world"、"transformer" 之类的片段）。把语料换成你感兴趣的文本（比如一篇博客），改改 `text` 就能训练出"模仿该文风"的玩具模型——**GPT 的原理你已经亲手实现了一遍**。

## 这个玩具和真实 LLM 差在哪

诚实收尾：这个 60 行模型和真实的 DeepSeek/Qwen 差距在**规模与工程**，不在原理——

| 维度 | 玩具（本篇） | 真实 LLM |
| --- | --- | --- |
| 参数 | ~10 万 | 十亿~万亿级 |
| 数据 | 一句文本 | 数万亿 token |
| 训练 | 单机 CPU/秒级 | 数千 GPU、数月 |
| 细节 | 基础版 | RoPE、GQA、SwiGLU 等优化 |

**但骨架完全一致**——你写的每个组件（embedding、因果注意力、残差、LayerNorm、下一词预测）在真实模型里原样存在。理解了这个玩具，读任何 LLM 的架构论文都不会再觉得陌生。

## 小结

从零实现简化 Transformer = 亲手验证前面所有概念：**token embedding 加位置编码、多头因果注意力、残差前馈块、交叉熵预测下一词、温度采样续写**。代码跑通那一刻，"Transformer 是黑盒"的心理障碍就消失了——它不过是一堆你已经看得懂的矩阵运算。这也是通向大模型应用（RAG、Agent）最扎实的底层课。

Transformer 六篇收官。下一个版块用 NLP 把这些能力用起来——从分词到 BERT，再到你正在做的大模型应用。
