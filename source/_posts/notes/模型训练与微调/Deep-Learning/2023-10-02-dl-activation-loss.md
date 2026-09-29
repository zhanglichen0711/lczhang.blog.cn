---
title: "激活函数与损失函数"
date: 2023-10-02
categories:
  - [模型训练与微调, Deep-Learning]
tags: [深度学习, 激活函数]
description: "激活函数给网络非线性，损失函数告诉网络错多远——两个'函数'决定模型能不能学。"
abbrlink: 990601816
---

训练一个网络，本质是回答两个问题：**它现在错得多离谱**（损失函数）？**怎么让它不这么离谱**（靠梯度更新，下一篇讲）？这一篇把前一个问题拆开——先讲给网络注入非线性的激活函数怎么选，再讲衡量差错的损失函数怎么选。选错它们，模型要么学不动，要么学歪。

## 激活函数：非线性的开关

激活函数夹在每层线性变换之后。没有它，多层网络数学上等价于一层（前篇反复强调）。常用的就三个，各有脾气：

### ReLU：默认首选

```text
ReLU(x) = max(0, x)
```

**优点**：计算极简、正区间梯度恒为 1（梯度不衰减），是当代网络默认激活。
**缺点**：负数区梯度为 0——如果神经元输出长期为负，它可能"死掉"（再也学不动），叫 **Dead ReLU**。

```python
import numpy as np
x = np.array([-2, -0.5, 0, 1, 3])
relu = np.maximum(0, x)
```

### Sigmoid：压到 0~1

把任意实数压到 (0,1)，适合**输出层表达概率**。但当隐藏层激活用，两端梯度趋近 0（梯度消失），深层网络基本学不动——现代网络隐藏层基本不用它了。

### tanh：压到 -1~1

零中心（输出有正有负），比 sigmoid 稍好，但同样有两端饱和问题。现在主要用于特定场景（如 RNN 门控内部）。

**选型口诀**：隐藏层默认 ReLU（及其变体 LeakyReLU）；输出层看任务——二分类用 Sigmoid 出概率，多分类用 Softmax，回归直接用线性（不加激活）。

## Softmax：把分数变成"选哪个"

多分类输出层要的不是每个类一个任意分数，而是**一组合计为 1 的概率**。Softmax 干的就这事：

```python
def softmax(logits):
    exps = np.exp(logits - np.max(logits))   # 减最大值防溢出
    return exps / exps.sum()

print(softmax(np.array([2.0, 1.0, 0.1])))
# [0.659 0.242 0.099]  三类的概率，和为 1
```

## 损失函数：衡量"错多远"

有了输出（概率或数值），拿什么和真实标签比、算出差距，就是损失函数的选择。按任务分两类：

### 分类任务：交叉熵损失

二分类/多分类的标配。直觉：**预测对的那个类的概率越接近 1，损失越小**；预测越离谱（给正确类打了很低概率），损失越大，且是"对数级"惩罚——错得离谱时梯度巨大，能快速纠偏。

```python
import numpy as np

def cross_entropy(y_true, y_pred_proba, eps=1e-12):
    # y_true: 真实类别（one-hot）；y_pred_proba: softmax 输出
    return -np.sum(y_true * np.log(np.clip(y_pred_proba, eps, 1.0)))

y_true = np.array([0, 1, 0])                      # 真实是第 2 类
pred_confident = softmax(np.array([1.0, 5.0, 0.5]))   # 很自信
pred_wrong = softmax(np.array([5.0, 1.0, 0.5]))       # 押错了
print("自信且正确:", cross_entropy(y_true, pred_confident).round(4))
print("押错类:", cross_entropy(y_true, pred_wrong).round(4))
# 押错的损失远大于正确的——梯度会把模型从错误方向"拽"回来
```

工程上不要手写，框架都有现成的（PyTorch 的 `CrossEntropyLoss` 会把 softmax 一起做掉，输入直接传原始 logits）。

### 回归任务：均方误差（MSE）

预测连续数值（温度、价格）时，用预测值和真实值差的平方：

```python
def mse(y_true, y_pred):
    return np.mean((y_true - y_pred) ** 2)

print(mse(np.array([2.5]), np.array([2.0])))   # 0.25
```

MSE 对大误差给平方级惩罚——对离群点敏感。如果数据有大量异常值，可换 MAE（绝对误差）更稳。

## 损失函数的深层作用：梯度从哪来

损失函数不是终点，它的值是**反向传播的起点**：`loss` 对每个参数求偏导，就知道"这个参数该往哪个方向调多少"。所以损失函数的选择直接影响学习信号的质量——选错了（比如分类任务用 MSE），梯度信号弱，模型训练又慢又差。

用 PyTorch 看这三步如何串起来：

```python
import torch.nn.functional as F

logits = model(x_batch)                        # 前向：原始分数
loss = F.cross_entropy(logits, y_batch)        # 损失（含 softmax）
loss.backward()                                # 反向传播算梯度
optimizer.step()                               # 更新参数
```

## 小结

两个函数的选型决定了学习的"方向盘"：**激活函数给网络表达能力（隐藏层 ReLU、分类输出 Softmax），损失函数给网络学习信号（分类交叉熵、回归 MSE）**。理解了它们，下一篇的核心——反向传播——就有一个明确的起点：从 loss 这个标量出发，把梯度一层层传回去。

损失算出来了，下一篇讲最关键的一环：反向传播——梯度是怎么穿过层层网络回到每个参数的。
