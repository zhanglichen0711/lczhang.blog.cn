---
title: "Intent, Rewrite and Multi-query Retrieval"
date: 2025-10-30
categories:
  - RAG
tags: [RAG]
description: "Not every question should search. Rewrites close the wording gap."
---

意图识别负责分流：闲聊、查规范、比条款，走不同 Prompt 和过滤。query rewrite 解决用户口吻和条文口吻不一致。

原句 + 改写 + 关键词三路，通常比单路 embedding 稳。rerank 是加分项，不是第一天必须。
