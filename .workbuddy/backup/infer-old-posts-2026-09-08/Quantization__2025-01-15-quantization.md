---
title: 模型量化：用精度换速度
date: 2025-01-15
categories:
  - [模型部署与推理, Quantization]
tags: [量化, 推理]
description: 模型量化：用精度换速度
abbrlink: 841013864
---

量化把 FP16 权重压成 INT8/INT4，显存减半、速度提升。

1. GPTQ、AWQ 是主流方案，AWQ 对激活异常值更友好。
2. GGUF 面向 CPU 推理，本地跑小模型常用。
3. 量化必然损失精度，先测 perplexity 再上线。
4. 不是所有模型都适合量化，小模型量化后掉点多。
