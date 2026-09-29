---
title: "深度学习实战：图像分类小项目"
date: 2023-11-16
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 实战]
description: "把 CNN、训练技巧、评估串成完整项目：从数据准备到提交一个能用的图像分类模型。"
abbrlink: 188757675
---

前 9 篇把深度学习的零件都过了一遍。这一篇做收口：把它们组装成一个**能跑通的图像分类小项目**（CIFAR-10：10 类日常物体）。目标不是刷 SOTA，而是让你看到一条完整的、可复制的训练流水线——之后换数据集、换模型，改的都是局部。

## 项目结构

```text
cifar_classifier/
├── data.py         # 数据加载与增强
├── model.py        # CNN 定义
├── train.py        # 训练主循环
└── predict.py      # 用训练好的模型预测
```

## data.py：数据准备

```python
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

def get_loaders(batch_size=64):
    # 训练：增强（翻转/裁剪）+ 归一化
    train_transform = transforms.Compose([
        transforms.RandomHorizontalFlip(),
        transforms.RandomCrop(32, padding=4),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.491, 0.482, 0.447),
                             std=(0.247, 0.243, 0.262)),
    ])
    # 验证：只归一化，不做增强
    val_transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.491, 0.482, 0.447),
                             std=(0.247, 0.243, 0.262)),
    ])

    trainset = datasets.CIFAR10(root="./data", train=True,
                                download=True, transform=train_transform)
    valset = datasets.CIFAR10(root="./data", train=False,
                              download=True, transform=val_transform)

    return (DataLoader(trainset, batch_size=batch_size, shuffle=True,
                       num_workers=2, pin_memory=True),
            DataLoader(valset, batch_size=batch_size, shuffle=False))
```

注意归一化的均值和标准差是 **CIFAR-10 数据集的统计值**（各通道），换数据集要重新算——这是数据准备最常见的坑。

## model.py：一个够用的 CNN

```python
import torch.nn as nn

class CifarCNN(nn.Module):
    def __init__(self, num_classes=10):
        super().__init__()
        self.features = nn.Sequential(
            # 3→32 通道
            nn.Conv2d(3, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.Conv2d(32, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.MaxPool2d(2),                       # 32→16

            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
            nn.MaxPool2d(2),                       # 16→8
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(64 * 8 * 8, 256), nn.ReLU(),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))
```

结构遵循前面讲的模式：**两组"双卷积 + BatchNorm + 池化"提特征，全连接做分类**。卷积后加 BatchNorm 是让这个"小网络"也能稳定训练的关键。

## train.py：训练主循环

```python
import torch
import torch.nn as nn
from data import get_loaders
from model import CifarCNN

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
train_loader, val_loader = get_loaders()
model = CifarCNN().to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=5e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=20)
loss_fn = nn.CrossEntropyLoss()

best_acc = 0.0
for epoch in range(20):
    model.train()
    total_loss = 0.0
    for xb, yb in train_loader:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    model.eval()
    correct = total = 0
    with torch.no_grad():                 # 推理阶段不追踪梯度，省内存
        for xb, yb in val_loader:
            xb, yb = xb.to(device), yb.to(device)
            pred = model(xb).argmax(dim=1)
            correct += (pred == yb).sum().item()
            total += yb.size(0)

    acc = correct / total
    print(f"epoch {epoch:02d}  loss={total_loss/len(train_loader):.3f}  val_acc={acc:.3f}")

    if acc > best_acc:
        best_acc = acc
        torch.save(model.state_dict(), "best.pt")

print("最佳验证准确率:", best_acc)
```

几个"工程肌肉记忆"点：**数据搬到 device、训练/验证模式切换、`torch.no_grad()` 推理省内存、只存验证集最好的模型**。

## predict.py：跑推理

```python
import torch
from PIL import Image
from torchvision import transforms
from model import CifarCNN

classes = ["飞机", "汽车", "鸟", "猫", "鹿", "狗", "蛙", "马", "船", "卡车"]

def predict(img_path):
    model = CifarCNN()
    model.load_state_dict(torch.load("best.pt", map_location="cpu"))
    model.eval()                          # 必须切 eval，否则 BN/Dropout 行为不对

    transform = transforms.Compose([
        transforms.Resize((32, 32)),
        transforms.ToTensor(),
        transforms.Normalize((0.491, 0.482, 0.447), (0.247, 0.243, 0.262)),
    ])
    img = transform(Image.open(img_path)).unsqueeze(0)   # 加 batch 维

    with torch.no_grad():
        logits = model(img)
        prob = torch.softmax(logits, dim=1)[0]

    top2 = torch.topk(prob, 2)
    for score, idx in zip(top2.values, top2.indices):
        print(f"{classes[idx]:>4}: {score.item():.2%}")

predict("test_cat.jpg")
```

## 这个项目教你的"模式"

| 环节 | 你会得到什么 |
| --- | --- |
| 数据 | 增强只加训练集；归一化统计量要按数据集 |
| 模型 | CNN = 卷积提特征 + 全连接分类；BatchNorm 让小网也能训 |
| 训练 | zero_grad/backward/step 四步曲 + 学习率调度 + 存最优 |
| 评估 | 用没见过的验证集，别拿训练集自嗨 |
| 推理 | eval 模式 + no_grad + softmax 出概率 |

**这套模式换任务只动三处**：数据加载（换数据集）、模型结构（换主干）、类别数——其余骨架通用。之后做文本分类、缺陷检测、迁移学习，你会发现骨架似曾相识。

## 小结

一个图像分类项目的完整闭环走完了：数据（增强+归一化）→ CNN（特征+分类）→ 训练（调度+早停+存最优）→ 评估（验证集准确率）→ 推理（softmax 概率）。这套流水线是从"会调 API"到"能独立完成模型任务"的分水岭——把它吃透，深度学习的大门就真正打开了。

Deep-Learning 十篇到此收官。接下来进入工具篇：把这些模型用 PyTorch 更顺手地搭出来。
