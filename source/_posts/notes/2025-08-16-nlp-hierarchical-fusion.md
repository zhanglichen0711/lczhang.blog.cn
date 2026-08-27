---
title: "Hierarchical Text Classification and Multimodal Tie-break"
date: 2025-08-16
categories:
  - NLP
tags: [NLP, 深度学习]
description: "Conflict between image and text should use confidence, not averaging."
---

层级标签要先规定：一级错了二级还评不评、低置信度是拒识还是兜底。

图文冲突时不要平均。一致则输出；冲突取更高置信度并记下分歧；两侧都低则拒识。分类结果应成为检索的路由键，而不是一段散文 query。
