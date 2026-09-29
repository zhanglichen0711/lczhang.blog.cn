---
title: "PyTorch 实战：训练一个分类模型"
date: 2023-12-31
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, 实战]
description: "用 Fashion-MNIST 走一遍完整项目：自定义数据集、训练、评估、可视化，看懂每段代码为什么存在。"
abbrlink: 325563308
---

PyTorch 六篇的收口：不换花样，用 **Fashion-MNIST**（服装图片 10 类）把前面所有零件组装成**一个真正完整、可运行**的项目。这篇的价值不在模型多好，而在于——每段代码你都知道它为什么存在，遇到问题知道去哪改。

## 目标与结构

```text
fashion_project/
├── dataset.py      # 数据加载
├── model.py        # 网络定义
├── train.py        # 训练主流程
└── utils.py        # 绘图等辅助
```

## dataset.py：数据准备

```python
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

def get_loaders(batch_size=64):
    # 归一化：Fashion-MNIST 官方均值/标准差
    tf = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.286,), (0.353,)),
    ])
    train = datasets.FashionMNIST(root="./data", train=True,
                                  download=True, transform=tf)
    test = datasets.FashionMNIST(root="./data", train=False,
                                 download=True, transform=tf)
    return (DataLoader(train, batch_size, shuffle=True),
            DataLoader(test, batch_size, shuffle=False))

LABELS = ["T恤", "裤子", "套头衫", "裙子", "外套",
          "凉鞋", "衬衫", "运动鞋", "包", "短靴"]
```

`torchvision.datasets` 内置了常用公开数据集，`download=True` 自动下载——训练环境里连数据下载都省了。

## model.py：一个够用的小网络

```python
import torch.nn as nn

class FashionCNN(nn.Module):
    def __init__(self, num_classes=10):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(32 * 7 * 7, 128), nn.ReLU(),
            nn.Linear(128, num_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))
```

输入 28×28 单通道，两次池化后 7×7——`32 * 7 * 7` 的由来是"通道数 × 池化后的尺寸"，改网络时这里最容易算错，用 `print(features(x).shape)` 验一下最稳。

## train.py：完整训练

```python
import torch
import torch.nn as nn

from dataset import get_loaders
from model import FashionCNN

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
train_loader, test_loader = get_loaders()
model = FashionCNN().to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=10)
loss_fn = nn.CrossEntropyLoss()

def train_one_epoch():
    model.train()
    total_loss = 0.0
    for xb, yb in train_loader:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * xb.size(0)
    return total_loss / len(train_loader.dataset)

@torch.no_grad()
def evaluate():
    model.eval()
    correct = total = 0
    for xb, yb in test_loader:
        xb, yb = xb.to(device), yb.to(device)
        correct += (model(xb).argmax(1) == yb).sum().item()
        total += yb.size(0)
    return correct / total

for epoch in range(10):
    loss = train_one_epoch()
    acc = evaluate()
    scheduler.step()
    print(f"epoch {epoch+1:02d}  loss={loss:.4f}  test_acc={acc:.4f}")

torch.save(model.state_dict(), "fashion_cnn.pt")
```

预期：10 个 epoch 后测试准确率约 90%。**注意 `len(train_loader.dataset)` 取的是样本总数**（除以它得到"每样本平均损失"），别和 `len(train_loader)`（批数）搞混。

## utils.py：看一眼模型学到了什么

训练结束最该做的可视化是**看预测对错的样本**，别只盯数字：

```python
import matplotlib.pyplot as plt
import torch

from dataset import LABELS

@torch.no_grad()
def show_predictions(model, loader, device, rows=2, cols=5):
    model.eval()
    xb, yb = next(iter(loader))
    logits = model(xb.to(device))
    preds = logits.argmax(1).cpu()

    fig, axes = plt.subplots(rows, cols, figsize=(cols * 1.6, rows * 1.6))
    for i, ax in enumerate(axes.flat):
        ax.imshow(xb[i].squeeze(), cmap="gray")
        color = "green" if preds[i] == yb[i] else "red"
        ax.set_title(f"真:{LABELS[yb[i]]}\n预:{LABELS[preds[i]]}",
                     color=color, fontsize=9)
        ax.axis("off")
    plt.tight_layout()
    plt.savefig("predictions.png", dpi=120)

# 主程序末尾调用
show_predictions(model, test_loader, device)
```

绿字是预测对的、红字是错的——**看错例比看准确率更能发现模型盲区**（比如"衬衫"和"T恤"互相混淆，说明这两类特征太像，可能需要更多这类样本）。

## 十行代码拿下 Transformer？不，先回顾收获

这个项目的意义在于它验证了一条可复制的主线：

| 环节 | 对应的篇目 | 改任务时要动什么 |
| --- | --- | --- |
| 数据加载 | DataLoader 篇 | 换数据集类/transform |
| 网络结构 | nn.Module 篇 | 换 features/backbone |
| 训练循环 | 训练循环篇 | 基本不用动 |
| 优化与调度 | 优化器篇 | 调 lr/epoch |
| 评估可视化 | 本篇 | 换指标/可视化方式 |

**框架层的骨架是通用的**。做完这个项目，你有能力把任何"结构化的数据问题"翻译成 PyTorch 代码——这也是后续做文本分类、目标检测、乃至微调大模型时，代码层面的共同底座。

## 小结

PyTorch 实战篇跑通了一条完整流水线：**下载数据 → 定义 CNN → 训练（调度+存参）→ 评估 → 可视化错例**。测试集准确率 90% 不是终点，看懂"每段代码为什么存在、出错去哪改"才是。到这一步，深度学习的"工具箱"你已经集齐——剩下的是在真实任务里反复使用它。

PyTorch 六篇收官。下一个版块回到模型本身最核心的结构：Transformer——现代大模型的通用语言。
