---
title: "Function Call Outputs Arguments, Not Prose"
date: 2026-05-20
categories:
  - Agent
tags: [Agent]
description: "The model proposes JSON. Your code executes the side effect."
---

模型只回自然语言时，应用只能靠正则猜意图。Function Call 把约定改成：需要时输出符合 schema 的 JSON，由程序执行，再把结果还回模型。

工具描述要写清「什么时候不该调」。参数校验失败和同一工具连调三次，都要有熔断。
