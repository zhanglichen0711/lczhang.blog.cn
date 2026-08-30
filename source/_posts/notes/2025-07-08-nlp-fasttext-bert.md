---
title: "先 FastText，再 BERT"
date: 2025-07-08
categories:
  - NLP
tags: [NLP, BERT]
description: "基线让大模型的提升变得可解释。"
abbrlink: 2202131050
---

FastText 能做有监督分类也能训词向量。层级标签和短文本上，它经常比一上来微调 BERT 更诚实。

BERT 适合需要语义的中短文本。量化、蒸馏是准确率够用之后的部署动作。低置信度可以交给生成模型兜底，但要留下阈值和抽查记录。
