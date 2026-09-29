---
title: "训练技巧：BatchNorm、学习率与早停"
date: 2023-11-09
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 训练技巧]
description: "让深度网络真正训得动的三个工程技巧：BatchNorm 稳分布、学习率调度、初始化与早停。"
abbrlink: 914053672
---

网络搭对了、损失选对了，训练还是不收敛或极慢——这是深度网络的家常便饭。好消息是，工程上积累了一整套"让训练稳定"的技巧。这一篇挑最有用的四样讲：**BatchNorm、学习率调度、好的初始化、早停**。它们不改变模型结构表达力，却常常是"能不能训出来"的分水岭。

## BatchNorm：给每一层"稳住输入分布"

深层网络训练慢的一个隐形原因：**每层输入分布随前层参数变动而漂移**（内部协变量偏移），导致每层都在追一个不断变化的靶子。

Batch Normalization 的做法：**对每一批数据，把该层的激活标准化成均值 0、方差 1，再学一组缩放和平移参数**。效果立竿见影：

- 每层输入分布稳定 → 可用更大的学习率、收敛更快；
- 自带轻微正则效果，有时能替代一部分 Dropout；
- 缓解梯度消失（尤其在深层网络和 sigmoid 系激活时）。

```python
import torch.nn as nn

block = nn.Sequential(
    nn.Linear(256, 256),
    nn.BatchNorm1d(256),   # 1D 给全连接；Conv 用 BatchNorm2d
    nn.ReLU(),
)
```

**关键坑：BatchNorm 的行为在训练和推理时不同**——推理用历史统计而非当前批统计。PyTorch 的 `model.train()` / `model.eval()` 会处理，但如果你手动推理时忘了切 `eval()`，结果会不稳定。另一个坑：**batch 太小（比如 2）时 BatchNorm 统计不准**，可能适得其反。

## 学习率调度：先大步后小步

固定学习率的局限：**前期要大步快速下山，后期要小步精修**——一个值满足不了两头。学习率调度（Scheduler）让学习率随训练进程变化，最常用的是阶梯衰减和余弦退火：

```python
import torch

optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

# 每 3 个 epoch 学习率乘以 0.1（阶梯衰减）
scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=3, gamma=0.1)

for epoch in range(10):
    train_one_epoch()
    scheduler.step()          # 每个 epoch 结束调一次
    print("当前学习率:", optimizer.param_groups[0]["lr"])
```

另外两个高频手段：

- **Warmup**：前几百步学习率从很小线性升到目标值——防止开局大步乱撞，训练大模型几乎必配；
- **余弦退火**：学习率按余弦曲线平滑降到接近 0，常在微调阶段使用。

## 权重初始化：别从零开始

**权重不能全初始化为 0**——那样所有神经元对称，梯度相同，网络退化成一个神经元。常用初始化策略：

```python
def init_weights(m):
    if isinstance(m, nn.Linear):
        # 默认的 Kaiming 初始化已适配 ReLU 家族
        nn.init.kaiming_uniform_(m.weight, a=0.01)

model.apply(init_weights)
```

理解一句话：**初始化让每层的输出方差不要爆炸也不要消失**，和激活函数匹配（ReLU 配 Kaiming，tanh/sigmoid 配 Xavier）。现代框架 `nn.Linear` 有默认初始化，多数情况不用手写——但你要知道"为什么不能全零"。

## 把技巧组装进一次训练

一个"工程化"的训练脚本骨架（前面各篇技巧的收口）：

```python
import torch
import torch.nn as nn

model = SimpleCNN()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=30)

best_val = float("inf")
patience, counter = 5, 0

for epoch in range(30):
    model.train()                     # 开 dropout / BN 统计
    for xb, yb in train_loader:
        optimizer.zero_grad()
        loss = nn.functional.cross_entropy(model(xb), yb)
        loss.backward()
        optimizer.step()

    model.eval()                      # 关 dropout，BN 用历史统计
    val_loss = evaluate(model, val_loader)
    scheduler.step()

    if val_loss < best_val:
        best_val = val_loss
        torch.save(model.state_dict(), "best.pt")
        counter = 0
    else:
        counter += 1
        if counter >= patience:
            print("早停"); break
```

这个骨架包含了：**weight_decay 正则、余弦学习率调度、train/eval 切换、最优模型保存 + 早停**——它就是"能上手的深度学习训练模板"。

## 排查清单：模型训不动时

| 症状 | 优先检查 |
| --- | --- |
| loss 是 NaN | 学习率太大 / 数据含 NaN / 除零 |
| loss 不降 | 学习率太小 / 忘 zero_grad / 标签错位 |
| 收敛极慢 | 没归一化数据 / 没加 BatchNorm / 层太深 |
| 训练好验证差 | 过拟合：早停 + Dropout + 增强 |
| 推理结果飘 | 忘了 model.eval()（BN/Dropout 行为变了） |

## 小结

四个技巧对应四类问题：**BatchNorm 稳住分布好收敛、学习率调度先大步后精修、初始化防对称与爆炸、train/eval 切换保推理正确**。把这些组装成模板后，你会发现"训练一个深度学习模型"从玄学变成了流程——剩下的就是数据和调参的打磨。

单个模型会训了，下一篇实战收尾：把卷积网络、训练技巧串起来，完成一个图像分类小项目。
