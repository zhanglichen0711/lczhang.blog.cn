---
title: vLLM：连续批处理让推理更快
date: 2024-08-28
categories:
  - [模型部署与推理, vLLM]
tags: [vLLM, 推理]
description: vLLM：连续批处理让推理更快
abbrlink: 3384363459
---

vLLM 用 PagedAttention 管理 KV Cache，把吞吐量提上去。

1. 连续批处理（continuous batching）：请求来了就拼进当前 batch，不等整批。
2. PagedAttention 把 KV Cache 切成页，减少显存碎片。
3. 搭一个 OpenAI 兼容接口，业务方几乎无感切换。
4. 先测延迟和吞吐，再调 max_num_seqs 这类参数。
