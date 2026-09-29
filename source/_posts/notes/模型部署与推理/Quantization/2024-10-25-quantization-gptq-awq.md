---
title: "权重量化实践：GPTQ 与 AWQ"
date: 2024-10-25
categories:
  - [模型部署与推理, Quantization]
tags: [模型量化, GPTQ, AWQ]
description: "把 7B 模型压进 4GB 的两种主流方案：GPTQ 靠误差补偿、AWQ 靠保护重要权重。"
abbrlink: 1287934108
---

基础概念清楚了，这一篇落地：用两种最主流的 4bit 权重量化——**GPTQ** 和 **AWQ**——把模型压到约 1/4 显存。它们都是 PTQ（训后量化），但误差控制思路不同。理解差异，选型就有依据。

## GPTQ：量化完再"找补"

GPTQ 的核心思路是**逐层误差补偿**：量化某一层时，把量化造成的误差记录下来，用最小二乘调整该层**还没量化的权重**去抵消误差——"拆东墙补西墙"，让整体误差最小。

- 优点：无需训练，只需少量校准数据；
- 代表做法：基于校准数据逐层量化 + 误差回补。

```python
# 用 AutoGPTQ 量化（示例）
from transformers import AutoTokenizer
from auto_gptq import AutoGPTQForCausalLM, BaseQuantizeConfig

model_id = "Qwen/Qwen2.5-7B-Instruct"
quant_config = BaseQuantizeConfig(
    bits=4,                  # 4bit
    group_size=128,          # 每 128 个权重一组算 scale
    desc_act=False,          # 激活是否按行描述（True 更准但慢）
)
tokenizer = AutoTokenizer.from_pretrained(model_id)

model = AutoGPTQForCausalLM.from_pretrained(model_id, quant_config)
# 校准：喂一小批有代表性文本，让量化参考真实激活分布
model.quantize(
    calibration_samples=load_calibration_texts(),   # 如 128 条领域问答
    batch_size=1,
)
model.save_pretrained("qwen-7b-gptq-int4")
```

## AWQ：保护"重要"的权重

AWQ（Activation-aware Weight Quantization）的思路不同：不是量化后补偿，而是**量化前识别出重要权重并保护它**。它观察到：有些权重虽然数值小，但对应的激活幅度大（实际影响大）。对这部分权重，量化时给一个**放大因子**，减少它的量化误差。

- 优点：无需训练/微调，速度比 GPTQ 更好（不需要复杂的逐层优化）；
- 代表：现成 AWQ 模型很多（社区已量化好可直接下载）。

```python
# 用 vLLM 直接加载社区 AWQ 量化好的模型（最省事的路线）
# 先在 HF 找到 -AWQ 后缀的模型，然后：
# vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ --quantization awq
```

**AWQ 的工程红利**：社区（TheBloke 等）把常见模型的 AWQ 版提前量化好了，你不需要自己量化——直接下载就能用，绕开最费时的环节。

## 对比与选型

| | GPTQ | AWQ |
| --- | --- | --- |
| 误差控制思路 | 量化后逐层误差补偿 | 量化前保护高影响权重 |
| 是否需要校准数据 | 需要（影响精度） | 需要少量 |
| 推理速度 | 好 | 通常略快（更简单的反量化） |
| 生态 | AutoGPTQ、vLLM 支持 | vLLM、社区现成模型多 |
| 谁在维护 | 老牌，文档多 | 新一些，开箱体验好 |

**工程建议**：优先找社区现成的 AWQ 版本直接下载；要自己量化私有模型时，GPTQ/AWQ 都行，**实测对比精度与速度再定**（评估方法下一篇）。

## 实际收益长什么样

以 7B 模型为例（FP16 需 14GB）：

```text
GPTQ/AWQ INT4：约 3.5~4GB
→ 一张 8GB 消费卡能跑（之前要 16GB+）
→ 解码吞吐通常比 FP16 高（权重读取量小）
→ 质量损失：多数任务 1~3% 内，需实测
```

这也是"量化让大模型平民化"的原因——70B 模型 4bit 后约 40GB，几张 24GB 卡或一台 A 系列就能自部署。

## 实操注意点

1. **校准数据要和业务分布接近**——用通用文本校准的模型，可能在你领域表现略差；
2. **量化后必须测**（下一篇）：同一评测集上 FP16 vs INT4 对比，别默认"没事"；
3. **推理引擎要用对参数**：vLLM 加载 GPTQ 用 `--quantization gptq`、AWQ 用 `--quantization awq`，配错会直接报错或精度崩坏；
4. **权重 dtype 与 KV Cache dtype 分开考虑**：权重量化了，KV Cache 可以另选精度（下一篇）。

## 小结

GPTQ 与 AWQ 是 4bit 量化的双雄：**GPTQ 量化后逐层补偿误差，AWQ 量化前保护高影响权重**。工程上优先用社区现成 AWQ 权重，私有模型自量化时实测对比。INT4 把 7B 模型从 14GB 压到 4GB、70B 压到 40GB——大模型部署的门槛就是这么降下来的。

权重量化会了，下一篇解决"还有哪能省"：激活量化与 KV Cache 量化——显存大头不只权重。
