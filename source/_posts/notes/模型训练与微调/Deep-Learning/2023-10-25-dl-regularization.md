---
title: "过拟合与正则化"
date: 2023-10-25
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 过拟合, 正则化]
description: "训练 99、测试 70——过拟合怎么发生，Dropout、权重衰减、早停与数据增强怎么治。"
abbrlink: 712968067
---

深度模型参数多、表达能力强，一个几乎必然遇到的问题是：**训练集上表现越来越好，测试集上却停滞甚至变差**——模型开始"背答案"而不是"学规律"。这就是过拟合，深度学习训练里最大的敌人之一。这一篇先看清它怎么发生，再讲四件趁手的兵器。

## 过拟合长什么样

训练时同时看训练和验证两条曲线：

```text
训练 loss：持续下降
验证 loss：先降后升（从某个点开始背离）
        ▲ 这里开始过拟合
        │ 训练 loss
        │━━━━━━━━━━━━
        │        ╱ 验证 loss
        └────────────────► epoch
```

判断标准很简单：**验证 loss 开始不降反升、而训练 loss 还在降**，就是过拟合的信号。模型把训练数据里的噪声和个例也记住了，失去了泛化能力。

## 为什么会过拟合

三个放大器：

1. **模型容量 > 数据信息量**：几百万参数配几千样本，模型有足够"内存"把每个训练样本背下来；
2. **训练太久**：模型先学规律、后记个例——epoch 过多就是给背答案留时间；
3. **数据太单一**：样本分布覆盖不全，模型没见过"变化"。

理解成因后，正则化的思路就清晰了：**限制模型"背答案"的能力，逼它学更通用的规律**。

## 兵器一：Dropout（随机关闭神经元）

训练时**随机让一部分神经元失活**（输出置 0），迫使网络不能依赖任何单个神经元，逼出冗余、分散的表征：

```python
import torch.nn as nn

model = nn.Sequential(
    nn.Linear(784, 512),
    nn.ReLU(),
    nn.Dropout(0.3),        # 30% 神经元随机失活
    nn.Linear(512, 10),
)

# 注意：PyTorch 的 Dropout 只在训练时生效
# 模型切到 eval 模式后自动关闭：
model.eval()    # 推理时关闭 dropout
```

要点：**dropout 只在训练开，推理关**。PyTorch 里调用 `model.train()` / `model.eval()` 会自动切换，别自己手动实现导致训练推理不一致。

## 兵器二：权重衰减（L2 正则）

给损失函数加一项"权重平方和"惩罚，逼权重保持小值——**权重小 = 模型"平滑" = 不过度依赖某个特征**：

```python
# 两种等价写法
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
# weight_decay 就是在 loss 里加 λ·Σw²，默认推荐 1e-4~1e-5
```

## 兵器三：早停（Early Stopping）

**在验证 loss 开始变差的地方停止训练**——简单到不用改模型：

```python
best_val_loss = float("inf")
best_state = None

for epoch in range(100):
    train_one_epoch(model, train_loader)
    val_loss = evaluate(model, val_loader)

    if val_loss < best_val_loss:
        best_val_loss = val_loss
        best_state = {k: v.clone() for k, v in model.state_dict().items()}  # 存最好
    else:
        patience -= 1
        if patience <= 0:      # 连续 N 轮没变好就停
            print("早停于 epoch", epoch)
            break

model.load_state_dict(best_state)   # 恢复最好的那版参数
```

早停几乎是零成本的保险：**永远保留验证集上最好的模型**，而不是训练到最后的那个。

## 兵器四：数据增强（最治本）

过拟合的根源之一是数据不够多样。图像领域最有效的手段是**在训练时动态制造"合理变化"**：随机翻转、裁剪、旋转、加噪——让模型见过同一个样本的无数变体：

```python
from torchvision import transforms

train_transform = transforms.Compose([
    transforms.RandomHorizontalFlip(),      # 随机翻转
    transforms.RandomRotation(10),          # 随机旋转
    transforms.RandomCrop(32, padding=4),   # 随机裁剪
    transforms.ToTensor(),
])

# 验证/测试集：只做标准化，不做增强！
val_transform = transforms.Compose([transforms.ToTensor()])
```

**铁律：增强只加在训练集**。测试集做增强等于把考试变难，评估结果失真。

## 组合策略怎么选

| 情况 | 优先手段 |
| --- | --- |
| 刚开始训练就过拟合（数据太少） | 数据增强 + 早停 |
| 训练中后期开始背离 | 早停 + Dropout |
| 模型复杂、样本量一般 | Dropout + 权重衰减 |
| 无论如何都救不回 | 上预训练模型（迁移学习，Fine-tuning 篇讲） |

**先做早停（零成本），再按数据量上 Dropout / 权重衰减 / 数据增强**——顺序是从便宜到贵。

## 小结

过拟合 = 模型背答案不学规律。四件兵器各管一摊：**Dropout 断依赖、权重衰减压权重、早停截时机、数据增强扩见识**。判断信号是"验证 loss 掉头而训练 loss 还在降"。训练是取舍的艺术——模型要在"记得住"和"学得会"之间找到平衡，正则化就是这杆天平。

模型能稳训练了，下一篇讲视觉领域的核心结构：卷积神经网络 CNN，为什么它能高效处理图像。
