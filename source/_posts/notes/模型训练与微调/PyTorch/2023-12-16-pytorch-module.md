---
title: "用 nn.Module 搭建模型"
date: 2023-12-16
categories:
  - [模型训练与微调, PyTorch]
tags: [PyTorch, nn.Module]
description: "nn.Module 如何组织参数与结构：Sequential、子模块、forward 与常用层速查。"
abbrlink: 1506816750
---

模型不只是一堆张量运算——它要有参数、有结构、能被优化器更新、能被保存加载。`nn.Module` 就是 PyTorch 管理这一切的容器。这一篇讲清 nn.Module 的三个能力：**自动收集参数、模块化组合、state_dict 序列化**，以及常用层怎么选。

## nn.Module 在做什么

```python
import torch.nn as nn

class MyNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)   # 子模块：参数由它管理
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        return self.fc2(torch.relu(self.fc1(x)))
```

三个隐式能力，是框架替你做的：

1. **参数自动注册**：在 `__init__` 里把层赋给 `self.xxx`，它的参数会自动进 `model.parameters()`——优化器、保存、搬 GPU 一次全管；
2. **前向即结构**：`forward` 定义数据怎么流，自动求导从这里出发；
3. **状态序列化**：`state_dict()` 拿到全部参数，可保存可加载。

验证参数收集：

```python
model = MyNet()
print([p.shape for p in model.parameters()])
# [torch.Size([256, 784]), torch.Size([256]), torch.Size([10, 256]), torch.Size([10])]
# 两层权重 + 两层偏置，全被自动收进来了
```

## 两种搭建风格：继承 vs Sequential

简单顺序结构用 `nn.Sequential` 一行流，更灵活的结构用继承式。两者常混用：

```python
# 风格一：Sequential —— 适合"纯顺序"的骨干
backbone = nn.Sequential(
    nn.Linear(784, 256),
    nn.ReLU(),
    nn.Linear(256, 128),
    nn.ReLU(),
)

# 风格二：继承 —— 需要分支/复用/自定义 forward 时
class Classifier(nn.Module):
    def __init__(self, backbone, num_classes=10):
        super().__init__()
        self.backbone = backbone       # 复用传入的骨干
        self.head = nn.Linear(128, num_classes)

    def forward(self, x):
        feat = self.backbone(x)
        return self.head(feat)

model = Classifier(backbone)
```

**经验法则：顺序结构用 Sequential，有分叉/条件/需要把模块当参数传时用继承**。真实项目两者嵌套使用。

## 常用层速查

| 层 | 用途 | 例子 |
| --- | --- | --- |
| `nn.Linear(in, out)` | 全连接 | 分类头 |
| `nn.Conv2d(c_in, c_out, k)` | 图像卷积 | CNN 特征 |
| `nn.MaxPool2d(k)` | 下采样 | CNN |
| `nn.BatchNorm1d/2d` | 归一化 | 稳定训练 |
| `nn.Dropout(p)` | 防过拟合 | 全连接前 |
| `nn.Embedding(n, d)` | 词嵌入 | 文本/ID 特征 |
| `nn.LSTM / nn.GRU` | 序列 | 时序 |
| `nn.TransformerEncoderLayer` | 注意力 | 文本 |

初始化常用序列容器：`nn.Sequential`、`nn.ModuleList`（列表存子模块）、`nn.ModuleDict`（字典存）。**注意别用 Python 原生 list 存子模块**——`self.layers = [nn.Linear(...) for ...]` 不会注册参数，必须用 `nn.ModuleList`：

```python
layers = nn.ModuleList([nn.Linear(64, 64) for _ in range(4)])  # 参数会被收集
```

## forward 里的两个实践细节

**一：forward 里只用函数式操作也行**。不一定要"一层一个属性"，简单操作直接函数式：

```python
import torch.nn.functional as F

def forward(self, x):
    x = F.relu(self.fc1(x))       # 函数式 relu，不需要 nn.ReLU 实例
    x = F.dropout(x, p=0.3, training=self.training)  # 手动跟随训练状态
    return self.fc2(x)
```

**二：训练/推理行为开关 `self.training`**。Dropout、BatchNorm 训练推理行为不同，PyTorch 用 `model.train()` / `model.eval()` 切换 `self.training`。自定义模块里如果行为依赖训练态，读这个标志。

## 保存与加载：state_dict 的哲学

训练成果就三行：

```python
# 保存（推荐只存参数，不存整个对象）
torch.save(model.state_dict(), "model.pt")

# 加载（先建同结构模型，再灌参数）
new_model = Classifier(backbone)
new_model.load_state_dict(torch.load("model.pt"))
new_model.eval()     # 推理前切 eval
```

**为什么不直接 `torch.save(model)`**：整个对象序列化会把结构代码耦合进去，类定义一改就加载失败。`state_dict` 只存参数（张量字典），结构由代码保证，更稳。`load_state_dict` 报"size mismatch"就是结构对不上。

## 小结

nn.Module 是模型的组织单元，三个能力最要紧：**子模块参数自动收集（用 ModuleList 别用 list）、forward 定义前向、state_dict 负责保存加载**。层怎么选记个大概，用的时候查文档；风格上顺序用 Sequential、复杂用继承。掌握它，你就能把"原理篇"里的任何网络结构翻译成可训练的代码。

模型定义好了，下一篇把数据端接上：DataLoader、训练循环、指标评估——让模型真正"跑起来"。
