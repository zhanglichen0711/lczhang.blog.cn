---
title: Evaluation：证明模型这次比上次好
date: 2025-06-17
categories:
  - [大模型应用, Evaluation]
tags: [Evaluation, LLM]
description: Evaluation：证明模型这次比上次好
abbrlink: 3901122131
---

评测集固定，指标可比，否则优化就是玄学。

1. 准确率、召回率、LLM-as-judge，各管一段。
2. 构建回归集，每次改动跑一遍，防止回退。
3. 上线前留一手 golden set 兜底。
4. 没有评测的 RAG 或 Agent，上线等于裸奔。
