---
title: "Epoch、batch 和训练循环"
date: 2024-11-18
categories:
  - Deep-Learning
tags: [深度学习]
description: "先算清 iteration，再谈训练多久。"
abbrlink: 2350999740
---

Epoch 是整套训练数据过一遍。batch 是一次更新用的样本数。iteration 约等于 `(N + B - 1) // B`。

日志里同时记下这三者，加上学习率和损失，才比较得了两次实验。只说「训了很久」没有信息量。
