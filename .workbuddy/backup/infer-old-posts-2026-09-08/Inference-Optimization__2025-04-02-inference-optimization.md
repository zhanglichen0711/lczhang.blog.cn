---
title: 推理优化：批处理、KV Cache 与投机解码
date: 2025-04-02
categories:
  - [模型部署与推理, Inference Optimization]
tags: [推理优化, 部署]
description: 推理优化：批处理、KV Cache 与投机解码
abbrlink: 3969254657
---

推理优化是系统性问题，不只在模型层。

1. 增大 batch 提升吞吐，但会牺牲单请求延迟，要按业务取舍。
2. KV Cache 是显存大头，长度越长越要控制。
3. 投机解码（speculative decoding）用小模型猜、大模型校验，能提速。
4. 先做 profiling 找到瓶颈，再决定优化哪里。
