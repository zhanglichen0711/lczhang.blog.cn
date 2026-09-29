---
title: LangChain：编排 LLM 的积木箱
date: 2024-10-18
categories:
  - [大模型应用, LangChain]
tags: [LangChain, LLM]
description: LangChain：编排 LLM 的积木箱
abbrlink: 1823148091
---

把 Prompt、模型、检索、记忆抽象成可组装的组件。

1. Chain 串起固定步骤，Agent 让模型决定调用哪些工具。
2. 和具体模型解耦，换模型不改业务代码。
3. 适合快速原型，但要理解底层再上生产。
4. 框架解决的是结构，不是检索质量。
