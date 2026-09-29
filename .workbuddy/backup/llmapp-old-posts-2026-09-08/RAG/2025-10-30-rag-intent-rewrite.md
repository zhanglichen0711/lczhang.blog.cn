---
title: "意图识别与查询改写"
date: 2025-10-30
categories:
  - [大模型应用, RAG]
tags: [RAG]
description: "不是所有问题都该检索。改写是为了对齐条文口吻。"
abbrlink: 2742877793
---

闲聊、查规范、对比条款、要整改建议，应走不同 Prompt 和过滤条件。

query rewrite 解决的是用户口吻和条文口吻不一致——把「屋面漏了怎么处理」改成规范里更可能出现的说法。

原句 + 改写 + 关键词三路，通常比单路 embedding 稳。rerank 是加分项，不是第一天必须上的组件。
