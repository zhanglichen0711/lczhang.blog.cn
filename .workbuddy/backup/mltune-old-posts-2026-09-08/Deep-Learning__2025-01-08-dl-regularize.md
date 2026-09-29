---
title: "Dropout、BatchNorm 和早停"
date: 2025-01-08
categories:
  - [模型训练与微调, Deep Learning]
tags: [深度学习]
description: "正则化是刹车。应用侧还有更土的刹车：洗标签和拒识。"
abbrlink: 2681038141
---

Dropout 让网络不能只依赖某个神经元。BatchNorm 减轻各层输入分布漂移。再配上验证集早停，能少做很多无效 epoch。

落到产品里，低置信度样本交给规则或大模型兜底，同样是正则：不要对不确定的输出过于自信。
