---
title: "训练循环：DataLoader 与优化器"
date: 2023-12-24
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, DataLoader, 训练]
description: "数据怎么一批批喂、训练循环怎么写规范、验证与指标怎么组织——完整可复用的模板。"
abbrlink: 1284556597
---

模型结构定义好了，真正的工程是"训练循环"：数据怎么喂、多少轮、怎么验证、怎么存最好的模型。这一篇给出一套**可复用的完整训练模板**，并把 DataLoader、epoch/batch、优化器调度、评估组织讲清楚。

## DataLoader：数据的一批批传送带

`torch.utils.data.DataLoader` 负责把数据集切成 batch、打乱、并行加载：

```python
from torch.utils.data import DataLoader, TensorDataset

# 假设已有 numpy 数据 X, y
X_t = torch.tensor(X, dtype=torch.float32)
y_t = torch.tensor(y, dtype=torch.long)

dataset = TensorDataset(X_t, y_t)          # 把 (数据, 标签) 打包
loader = DataLoader(dataset, batch_size=64, shuffle=True, num_workers=2)

for x_batch, y_batch in loader:            # 每次迭代给一批
    print(x_batch.shape)                   # (64, n_features)
```

关键参数：

- `batch_size`：每批大小（模型更新一次用多少样本）；
- `shuffle=True`：训练要打乱（打破样本顺序依赖），**验证集不打乱**；
- `num_workers`：并行加载线程数，数据量大时提速；
- 自定义数据集只需实现 `__len__` 和 `__getitem__`（图像、文本场景常用）。

## epoch、batch 与 step 的关系

三个词必须分清：

```text
一个样本被用一次 = 一次前向+反向
batch = 一批样本（如 64）→ 每批算一次梯度、更新一次参数（叫一个 step）
epoch = 把全部训练样本过一遍 = 训练集大小 / batch_size 次 step
```

例：10000 样本、batch=64 → 每个 epoch 约 156 个 step。**epoch 是训练的总循环单位，"训了多少轮"指它**。

## 一个完整且规范的单 epoch

训练集和验证集行为不同，函数分开写最清晰：

```python
def train_one_epoch(model, loader, optimizer, loss_fn, device):
    model.train()                      # 开 Dropout/BN 训练行为
    total_loss, total = 0.0, 0

    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * xb.size(0)
        total += xb.size(0)

    return total_loss / total          # 返回平均损失


@torch.no_grad()                       # 装饰器：评估全程不算梯度
def evaluate(model, loader, loss_fn, device):
    model.eval()                       # 关 Dropout，BN 用历史统计
    total_loss, correct, total = 0.0, 0, 0

    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)
        loss = loss_fn(logits, yb)
        preds = logits.argmax(dim=1)
        total_loss += loss.item() * xb.size(0)
        correct += (preds == yb).sum().item()
        total += xb.size(0)

    return total_loss / total, correct / total     # (平均损失, 准确率)
```

两个 `model.train()`/`model.eval()` 的切换点如果漏了，Dropout 在推理时仍开着、BN 用当前批统计——结果不稳定且不可复现，是最隐蔽的 bug。

## 主循环：调度 + 存最优

把优化器、调度、早停组织进主循环：

```python
def fit(model, train_loader, val_loader, epochs=10, lr=1e-3, device="cpu"):
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    loss_fn = torch.nn.CrossEntropyLoss()

    best_acc, best_state = 0.0, None
    history = []

    for epoch in range(epochs):
        train_loss = train_one_epoch(model, train_loader, optimizer, loss_fn, device)
        val_loss, val_acc = evaluate(model, val_loader, loss_fn, device)
        scheduler.step()
        history.append((train_loss, val_loss, val_acc))

        if val_acc > best_acc:                    # 存验证集最好的模型
            best_acc = val_acc
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        print(f"epoch {epoch+1:02d} | train {train_loss:.3f} | "
              f"val {val_loss:.3f} | acc {val_acc:.3f}")

    model.load_state_dict(best_state)             # 最后恢复最优参数
    return model, history
```

## 监控训练的三条曲线

训练时眼睛盯三个数，判断问题在哪：

| 观察 | 判断 |
| --- | --- |
| train loss 下降但 val 不降/上升 | 过拟合 → 早停/Dropout/增强 |
| train 和 val 都不降 | 学不动 → 学习率/模型/数据问题 |
| loss 震荡或 NaN | 学习率过大或数据有 NaN |

**只看准确率会掩盖问题**——打印 loss 曲线才能看出趋势。训练日志里两条 loss 一起打，是最便宜的诊断。

## 可复现性：seed 固定

训练结果每次不一样会让人抓狂，先固定随机种子：

```python
import random
import numpy as np
import torch

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

set_seed(42)
```

## 小结

一套规范的训练流水线 = **DataLoader 分批发、train/eval 两个函数、train 打乱 eval 不打乱、调度器管学习率、只存验证最优、seed 固定**。把这些固化成模板，之后换任何任务都只动数据加载和模型两处——训练本身不再需要思考。

训练循环跑通了，PyTorch 系列最后一篇实战：把前面的零件拼成完整项目，跑一遍并理解每段代码为什么存在。
