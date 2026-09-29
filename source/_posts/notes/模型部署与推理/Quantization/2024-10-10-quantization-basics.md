---
title: "量化基础：INT8 与 INT4、对称与非对称"
date: 2024-10-10
categories:
  - [模型部署与推理, Quantization]
tags: [模型量化]
description: "量化映射的数学：scale 与 zero-point、对称 vs 非对称、INT8 与 INT4 的粒度区别。"
abbrlink: 2884958225
---

上一篇讲了量化"是什么、为什么快"，这一篇看量化"怎么做"：一个浮点权重怎么变成整数、误差怎么控制、不同方案差在哪。不用深数学，但要把几个反复出现的概念（scale、zero-point、对称/非对称、按行/按组）讲明白——读任何量化工具的文档，这些都是高频词。

## 量化的基本映射

把浮点范围 $[min, max]$ 映射到整数范围（INT8 是 [-128, 127]），需要两个参数：

```text
scale（缩放因子）= (max - min) / (qmax - qmin)
量化：q = round(real / scale) + zero_point
反量化：real ≈ (q - zero_point) × scale
```

```python
import numpy as np

def quantize(real, bits=8):
    qmin, qmax = -(2**(bits-1)), 2**(bits-1) - 1
    rmin, rmax = real.min(), real.max()
    scale = (rmax - rmin) / (qmax - qmin)
    q = np.clip(np.round(real / scale), qmin, qmax).astype(np.int8)
    return q, scale, rmin

w = np.random.randn(64).astype(np.float32)
w_q, scale, rmin = quantize(w)          # 每个权重从 4 字节 → 1 字节
w_deq = w_q.astype(np.float32) * scale  # 反量化近似还原
print("最大误差:", np.abs(w - w_deq).max().round(5))
```

**误差来源**：`round` 的舍入 + 极值被截断。量化误差不可避免，目标是把误差控制在"对输出影响可接受"。

## 对称 vs 非对称

- **对称量化**：零点就是 0（`real ∈ [-max, max]`），只需一个 scale——实现简单，GPU 友好；
- **非对称量化**：允许零点偏移（`zero_point ≠ 0`）——对分布偏置的权重更准，但要多存一个参数、计算略复杂。

```text
对称：  [--max----0-----max--] → [-128 ... 127]
非对称：[min-------0----max--] → [-128 ... 127]（zero_point 平移）
```

**实践**：多数 LLM 权重量化用对称或近似对称（权重大致以 0 为中心）；非对称常在激活量化里用（激活全是正值）。

## 量化粒度：一行一个 scale，还是全层一个

量化误差对**粒度**极其敏感。全层一个 scale，遇到极端权重就全毁了；给每个通道/每组单独算 scale，误差显著变小：

| 粒度 | 精度 | 存储/计算开销 |
| --- | --- | --- |
| Per-tensor（全层一个 scale） | 差 | 最小 |
| Per-channel（每行/每列一个） | 好 | 略增 |
| Per-group（如每 128 个权重一组，GPTQ/AWQ 常用） | 最好 | 略增（组大小可调） |

**这就是 GPTQ/AWQ 精度能接近 FP16 的关键之一**：它们用细粒度（group）量化，把每个小分组的误差都单独控制。

## INT8 vs INT4：位宽背后是容量与精度

| | INT8 | INT4 |
| --- | --- | --- |
| 每个权重 | 1 字节 | 0.5 字节 |
| 7B 模型权重 | ~7GB | ~3.5GB |
| 精度损失 | 极小 | 需校准/微调补偿 |
| 硬件支持 | 好（CUDA 原生） | 需要反量化到 INT8 计算 |

注意一个坑：**INT4 存储、但计算时通常先反量化到 INT8 或 FP16 再算**（消费级 GPU 没有原生 INT4 算力）。所以 4bit 模型"省的是显存与带宽"，单步计算未必比 INT8 快。选型时想清楚你要的是"装得下"还是"更快"。

## 校准数据：量化的"参照系"

PTQ 量化时，决定 scale 需要看权重的实际分布。静态量化（尤其激活量化）还需要一小批**校准数据**（calibration dataset）跑一遍模型，观察激活的范围来定 scale：

```python
# 校准数据的作用：喂一批有代表性的文本，记录每层激活的 min/max
# 校准集选得越贴近真实使用场景，量化误差越小
```

校准集要与业务分布相近（问答任务就喂问答样本），这是量化质量的一个隐形决定因素。

## 小结

量化实现三要素：**scale 把浮点映射到整数（round 是误差来源）、对称/非对称决定是否要 zero-point、量化粒度（per-group 优于 per-tensor）决定误差大小**。INT8 近乎无损、INT4 靠细粒度逼近精度同时省 75% 显存，计算时通常反量化到 INT8。概念齐了，下一篇上手两个主流工具：GPTQ 与 AWQ。
