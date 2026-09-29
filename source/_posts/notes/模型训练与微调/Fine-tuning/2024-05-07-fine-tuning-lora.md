---
title: "LoRA / QLoRA 高效微调"
date: 2024-05-07
categories:
  - [模型训练与微调, Fine-tuning]
tags: [微调, LoRA]
description: "全参微调 7B 要 60GB 显存，LoRA 只训 1% 的参数——低秩适配如何以小博大。"
abbrlink: 596953945
---

全参微调一个 7B 模型要几十 GB 显存，个人和小团队基本无缘。**LoRA**（Low-Rank Adaptation，低秩适配）改变了这一切：它只训练原模型参数的约 1%，把大模型微调的门槛从"多卡机房"拉低到"一张消费级显卡"。这一篇讲清它的原理、为什么有效，以及 QLoRA 又省在哪。

## 全参微调的成本问题

7B 模型全参微调，光参数就要 14GB（fp16），再加上优化器状态、梯度、激活值，显存需求轻松到 60GB+——一张 A100（80GB）才勉强，普通开发者根本够不着。

但一个关键观察带来了转机：**微调真的需要动全部 70 亿个参数吗？**

## LoRA 的核心思想：只学"增量"，不学"全量"

LoRA 的假设很漂亮：预训练模型的权重 $W$ 已经很好了，微调要做的改动 $\Delta W$，虽然矩阵很大，但它的**有效自由度很低**（低秩）。所以不直接学 $\Delta W$，而是把它拆成两个小矩阵的乘积：

$$\Delta W = B \times A$$

其中 $A$（如 $r \times d$）和 $B$（如 $d \times r$）都是小矩阵，$r$（秩）通常取 4~64，远小于模型维度 $d$。

```text
原始：y = W·x            （W 冻结不动）
LoRA：y = (W + B·A)·x    （只训练 A 和 B，两个小矩阵）

参数量对比：
W 是 4096×4096 ≈ 1678 万参数
A、B 若 r=8：4096×8 + 8×4096 ≈ 6.5 万参数  ← 不到 0.4%
```

训练完，把 $W + BA$ 合并回原权重（或单独存 LoRA 权重）。**冻结原模型 + 只训两个小矩阵**，这就是 LoRA"以小博大"的全部秘密。

## 用 PEFT 库跑 LoRA

```bash
pip install peft transformers
```

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model

model = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-1.5B-Instruct", torch_dtype="auto")

lora_config = LoraConfig(
    r=16,                          # 秩：越大表达能力越强，也越贵
    lora_alpha=32,                 # 缩放系数（常取 2×r）
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # 只微调注意力投影
    lora_dropout=0.05,
)

model = get_peft_model(model, lora_config)   # 自动冻结原参数、注入可训小矩阵
model.print_trainable_parameters()
# trainable params: ~2M || all params: ~1.6B || trainable%: 0.13
```

**`trainable%: 0.13`**——只训 0.13% 的参数，效果却能逼近全参微调。这是 LoRA 最有说服力的一点。

## 为什么只调注意力层就够了

`target_modules` 默认指向注意力投影（Q/K/V/O）。经验表明：**大模型的"技能"大部分编码在注意力层**，微调它们足以适配领域任务，前馈层（FFN）可以先不动——需要更强效果时再纳入。别一上来就调所有层，那是拿 LoRA 当全参用。

## 关键超参数

| 参数 | 作用 | 经验值 |
| --- | --- | --- |
| `r`（秩） | 增量矩阵的容量 | 8~64；先 8/16 起步 |
| `lora_alpha` | 增量缩放强度 | 常取 2×r |
| `target_modules` | 要微调的模块 | 先注意力层，需要再扩 |
| 学习率 | 微调纪律不变 | 1e-4 ~ 5e-4（比全参可略大） |

## QLoRA：把 LoRA 再省一截

QLoRA = LoRA + 量化：把**冻结的原模型量化到 4bit**（精度损失极小），只保留 LoRA 增量在正常精度训练。显存需求再砍一半多——**7B 模型 QLoRA 在 12~16GB 显存就能跑**，消费级显卡可及：

```python
from transformers import BitsAndBytesConfig

quant_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype="float16")
model = AutoModelForCausalLM.from_pretrained(..., quantization_config=quant_config)
# 接着用同样的 get_peft_model 注入 LoRA
```

## LoRA 的工程红利

除了省显存，LoRA 还带来两个实践优势：

1. **即插即用**：不同任务各训一个 LoRA（几 MB~几十 MB），切换任务 = 换 LoRA 权重，不用各存一份全量模型；
2. **可合并可逆**：LoRA 权重可以随时合并进原模型，也可以去掉恢复原状——微调"试错"成本极低。

## 小结

LoRA 用"冻结原模型 + 只学低秩增量矩阵"把微调成本降到 1%：**秩 r 控制容量、alpha 控制强度、只调注意力层起步、QLoRA 加 4bit 量化再省一半显存**。它是当前微调大模型的事实标准（你的 QLoRA 实践正是这条技术线）。下一篇进入微调的数据工程：指令微调 SFT，数据怎么构造才是效果的关键。
