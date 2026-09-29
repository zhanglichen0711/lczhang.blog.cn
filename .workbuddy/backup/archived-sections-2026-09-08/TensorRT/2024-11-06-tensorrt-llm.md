---
title: TensorRT-LLM：面向 NVIDIA 的推理优化
date: 2024-11-06
categories:
  - [模型部署与推理, TensorRT]
tags: [TensorRT, 推理]
description: TensorRT-LLM：面向 NVIDIA 的推理优化
abbrlink: 2856347764
---

TensorRT-LLM 是 NVIDIA 的 LLM 推理库，靠算子融合和量化压榨硬件。

1. 算子融合减少 kernel 启动次数，量化降低显存和带宽。
2. 需要先转成特定格式再构建引擎，构建慢、推理快。
3. 适合在自有 GPU 上长期跑固定模型，不适合频繁换模型。
4. 量化会掉精度，要用评测集验证。
