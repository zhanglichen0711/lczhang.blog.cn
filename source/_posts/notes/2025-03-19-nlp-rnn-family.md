---
title: "RNN, LSTM and GRU: What Sequence Models Solved"
date: 2025-03-19
categories:
  - NLP
tags: [NLP]
description: "Recurrent models see order. Long specs make the cost obvious."
---

RNN 把上一时刻隐状态传给下一时刻，能看序列，但长程依赖和并行都不理想。LSTM / GRU 用门控减轻遗忘。

短句分类这一代够用。长规范、长标书，代价会明显上去。这就是后面换 Attention 的原因，不是因为 RNN「过时」这个词本身。
