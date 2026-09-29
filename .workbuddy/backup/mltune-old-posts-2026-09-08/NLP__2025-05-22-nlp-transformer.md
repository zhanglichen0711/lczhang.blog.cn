---
title: "Transformer：一块砖，两条路"
date: 2025-05-22
categories:
  - [模型训练与微调, NLP]
tags: [NLP, Transformer]
description: "BERT 双向理解，GPT 自回归生成。"
abbrlink: 2884929297
---

编码器、解码器、多头注意力、前馈层、残差和 LayerNorm 组成可堆叠模块。优势是并行和长程依赖，位置信息要额外编码。

HuggingFace 把加载预训练、换头、微调变成常规动作。数据少时先冻住前面只训头，更稳。领域数据够了再用小学习率全网微调。
