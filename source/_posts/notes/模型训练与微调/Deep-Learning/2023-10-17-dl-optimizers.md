---
title: "梯度下降与优化器"
date: 2023-10-17
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 优化器]
description: "拿着梯度怎么下山：学习率、SGD、Momentum、Adam，以及训练不稳的常见原因。"
abbrlink: 2761198620
---

反向传播算出了梯度（往哪走），但**一步走多大、怎么走得又稳又快**，是优化器（Optimizer）的事。这一篇讲梯度下降的三种形态和主流优化器的演进逻辑——从"裸 SGD"到"默认就选 Adam"，理解每一步在解决什么问题。

## 下山类比

把"最小化损失"想成在群山间找最低点：你站在山坡上（当前参数），梯度告诉你"最陡的下坡方向"。梯度下降就是反复执行：**看最陡方向 → 迈一步 → 再看 → 再迈**。学习率就是步长。

## 三种梯度下降：用多少数据算梯度

| 形态 | 每次用多少数据 | 特点 |
| --- | --- | --- |
| 批量梯度下降 | 全部数据 | 方向准但每步巨慢，数据一大不可行 |
| 随机梯度下降（SGD） | 1 个样本 | 快但噪声大，步子乱跳 |
| 小批量 SGD（Mini-batch） | 一批（32~256） | **实际默认**：平衡噪声与效率 |

现代说的 "SGD" 基本都是小批量版。一批 64 个样本算一次梯度、更新一次参数，一个 epoch（跑完整数据一遍）更新 `总数/64` 次。

## 学习率：唯一最重要的超参数

学习率 $\eta$ 决定每一步迈多大：

- **太大**：步子跨过最低点来回震荡，甚至损失发散（越训越大）；
- **太小**：走得慢，还可能困在局部坑里出不来；
- 经验值：一般从 1e-3 起步，观察损失曲线再调。

```python
# 一个最简单的参数更新（自己实现 SGD）
w = w - learning_rate * w.grad
```

**判断学习率对不对的方法**：训练时打印 loss——正常应该平滑下降；如果 loss 震荡剧烈或直接变成 NaN，先怀疑学习率过大。

## 从 SGD 到 Adam：每一步解决一个问题

裸 SGD 有两个毛病：**方向只看当前梯度（容易震荡）**、**每个参数用同一个步长（不合理）**。优化器的演进就是逐个解决它们：

### Momentum：给更新"加惯性"

像滚下山的小球，动量累积历史方向，抑制震荡、加速通过平坦区：

```python
v = 0.9 * v - lr * grad    # v 累积历史梯度
w = w + v
```

### Adam：自适应步长（默认首选）

Adam = Momentum + RMSProp（按参数历史梯度大小自动缩放步长）：梯度大的参数步子自动变小，梯度小的参数步子自动变大。几乎不用调就能训得很好，**当代默认优化器**。

```python
import torch

# PyTorch 一行切换优化器
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
# optimizer = torch.optim.SGD(model.parameters(), lr=1e-2, momentum=0.9)
```

Adam 常见默认参数（β1=0.9、β2=0.999、lr=1e-3）多数场景直接用就行，**别一上来就花大力气调 Adam 的 β**——先调学习率。

## 训练循环完整长这样

把前几篇串起来，一个完整的训练轮：

```python
import torch

model = SimpleNet()                       # 模型
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = torch.nn.CrossEntropyLoss()

for epoch in range(10):
    for x_batch, y_batch in train_loader:    # 一批批喂
        optimizer.zero_grad()                # 清空上一步梯度（关键！）
        logits = model(x_batch)              # 前向
        loss = loss_fn(logits, y_batch)      # 损失
        loss.backward()                      # 反向算梯度
        optimizer.step()                     # 更新参数
    print(f"epoch {epoch}: loss = {loss.item():.4f}")
```

新手最容易漏的一行是 `optimizer.zero_grad()`：**不清零，梯度会跨 batch 累积**，参数更新方向被历史梯度污染，loss 越来越怪。

## 常见训练不稳的排查顺序

模型不收敛时，别乱调，按顺序查：

1. **loss 是不是 NaN** → 学习率太大 / 数据有 NaN；
2. **loss 完全不降** → 学习率太小 / 梯度消失（检查激活与初始化）/ 数据没归一化；
3. **训练降、测试不降** → 过拟合（下一篇的领域）；
4. **loss 震荡剧烈** → 调小学习率或加 warmup。

## 小结

优化器的心智模型：**SGD 打底、Momentum 加惯性、Adam 自适应步长（默认首选）**。真正值得花时间的是学习率——从 1e-3 起步看曲线。记住训练循环的四步（zero_grad → forward → backward → step）和那个最容易漏的 `zero_grad()`，你就能把模型"训起来"。

模型能训练了，下一篇讲训练中最大的敌人：过拟合，以及正则化怎么对付它。
