---
title: "指令微调 SFT：数据构造与训练"
date: 2024-05-14
categories:
  - [模型训练与微调, Fine-tuning]
tags: [微调, SFT]
description: "让模型会听话：监督微调的本质、指令数据的构造模板、质量高于数量的数据原则。"
abbrlink: 3028613644
---

预训练教会模型"说话"，指令微调（SFT，Supervised Fine-Tuning）教会模型"听话"——按指令、按格式、按你的业务规矩回答。它是把通用模型变成"领域助手"最直接的一步，而它的效果**几乎完全取决于数据**。这一篇讲透 SFT 的原理与数据工程。

## SFT 在教模型什么

SFT 的训练样本是"（指令，理想回答）"对，目标函数仍是**预测下一个词**，但监督信号来自"你给的标准回答"：

```text
<指令> 请把这段描述分类为质量缺陷的一级/二级类别：
"板面出现大量蜂窝麻面"
<回答> 一级：质量缺陷；二级：蜂窝麻面
```

模型学会的不只是"回答"，而是**你的领域里"好的回答长什么样"**：用什么口径、什么格式、什么语气。SFT = 用示范样本给模型"立规矩"。

## 数据模板：统一格式是关键

SFT 数据的核心是**模板一致性**——所有样本用同一套对话模板，模型才能学到稳定规律。Hugging Face 生态常用 ChatML 格式：

```text
<|im_start|>system
你是一个建筑工程质量专家。依据给定资料回答，说明出处。<|im_end|>
<|im_start|>user
问：混凝土拆模强度要求是什么？<|im_end|>
<|im_start|>assistant
依据 GB50204-2015 第 7.1.4 条，……（引用出处）<|im_end|>
```

```python
def build_chatml(system: str, user: str, assistant: str) -> str:
    return (f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{user}<|im_end|>\n"
            f"<|im_start|>assistant\n{assistant}<|im_end|>")
```

**模板必须和推理时用的一致**（训练用什么格式，线上就发什么格式）——不一致是 SFT 上线效果崩掉的头号原因。

## 数据质量：宁可 500 条精品，不要 5 万条凑数

SFT 领域最反直觉的结论：**质量碾压数量**。几条"标准示范"能教会行为，几千条垃圾数据却能把模型教坏。数据构造的原则：

1. **人工撰写精品示范**：找业务专家写"理想回答"（带出处、带格式）；
2. **覆盖边界情况**：包括"资料不足时应回答不知道"的反例——模型要会拒绝；
3. **多样性优先**：同样的问题换不同问法（模型学的是"如何应对这类输入"）；
4. **去重与清洗**：重复样本会放大偏见，噪声样本（错误答案）直接教坏模型。

```python
# 每条样本自检清单
sample = {
    "instruction": "对下列描述做质量缺陷分类：...",
    "answer": "一级：...；二级：...（依据 XXX）",
    "is_edge_case": True,      # 是否边界样本
    "reviewed_by_expert": True # 是否专家复核
}
```

## 用 Trainer 跑 SFT

```python
from transformers import AutoModelForCausalLM, Trainer, TrainingArguments
from datasets import Dataset

# 数据：每条已是模板拼好的字符串
data = Dataset.from_dict({"text": formatted_samples})
data = data.map(lambda b: tokenizer(b["text"], truncation=True,
                                     padding="max_length", max_length=1024),
                batched=True)

training_args = TrainingArguments(
    output_dir="./sft_qwen",
    num_train_epochs=3,                # SFT 也是少 epoch
    learning_rate=2e-5,                # 微调纪律
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,     # 小显存凑大 batch
    fp16=True,
)

trainer = Trainer(model=model, args=training_args, train_dataset=data)
trainer.train()
model.save_pretrained("./sft_qwen_model")
```

与 LoRA 篇结合就是完整流程：**QLoRA 加载量化模型 → 注入 LoRA → 用 SFT 数据训练 → 保存 LoRA 权重**。

## 训练损失为什么"看起来没用"

SFT 训练时 loss 通常降得不多，甚至接近预训练水平——**别慌，这正常**。因为 SFT 的数据量相对预训练极小，loss 变化微乎其微，真正的检验是**人工评测生成效果**，不是看 loss 曲线。SFT 的验收方式是：拿一批你没见过的指令，看模型回答是否符合你的格式与口径。

## SFT 的常见失败模式

| 症状 | 原因 | 对策 |
| --- | --- | --- |
| 回答不按格式 | 模板不一致 / 样本格式混乱 | 统一模板、清洗数据 |
| 复读机/废话 | 样本质量差、多样性不足 | 提质量、加多样化 |
| 编造出处 | 让模型"记知识"了 | 知识靠 RAG，SFT 只立规矩 |
| 该拒绝时不拒绝 | 缺"不会就说不"的反例 | 补边界样本 |

## 小结

SFT 用"指令-标准回答"示范教会模型**你的规矩**：格式、口径、语气、何时拒绝。效果密码在数据——**模板统一、质量优先、边界覆盖、专家复核**。训练本身只是常规的少 epoch 微调（叠加 LoRA 降门槛），难的是把"什么是好回答"变成几千条干净样本。SFT 让模型"会用"，下一篇的对齐（RLHF/DPO）则让模型"答得好、答得安全"。
