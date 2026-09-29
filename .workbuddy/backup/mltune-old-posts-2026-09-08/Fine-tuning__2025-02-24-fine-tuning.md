---
title: Fine-tuning：让大模型学会你的领域
date: 2025-02-24
categories:
  - [模型训练与微调, Fine-tuning]
tags: [Fine-tuning, LLM]
description: Fine-tuning：让大模型学会你的领域
abbrlink: 1224903869
---

在预训练权重上继续训练，适配特定任务或风格。

1. 全参微调贵，LoRA 只训低秩矩阵，显存和成本都低得多。
2. 数据质量比数量重要，标注要一致，噪声会反向放大。
3. 微调改变行为，RAG 补充知识，两者可配合使用。
4. 先跑通再微调：能靠 Prompt 解决的，不一定值得训。
