---
title: "VLM 实战：图像理解与文档解析"
date: 2025-10-27
categories:
  - [大模型应用, Multimodal]
tags: [VLM, 多模态]
description: "让模型看图做事：文档解析、图像问答、信息抽取。注意图像 token 成本、分辨率与结构化输出。"
abbrlink: 180137639
---

上一篇建立了多模态的认知，这一篇直接上手——用 VLM（视觉语言模型）做两件最常用的实事：**图像问答**（给图问问题）和**文档解析**（把图文混合的文档变成结构化数据）。会调 VLM 接口、会设计"看图"的提示、会处理它的输出，多模态应用的基本功就齐了。

## 调 VLM：图像是怎么"传"给模型的

VLM 的调用方式和文本模型基本一致，差别在 message 里多了图像内容。以 OpenAI 兼容接口为例：

```python
from openai import OpenAI
import base64

client = OpenAI()

def image_to_base64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

# 1. 图像问答：图片 + 问题一起发给模型
def ask_image(image_path: str, question: str) -> str:
    resp = client.chat.completions.create(
        model="qwen-vl-max",          # 视觉模型
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{image_to_base64(image_path)}"}},
                {"type": "text", "text": question},
            ],
        }],
    )
    return resp.choices[0].message.content

print(ask_image("leak_photo.jpg", "这张照片反映了什么质量问题？"))
```

要点：

- **图以 base64（或 URL）传入**，和文本一起组成 content 数组；
- **模型要选视觉模型**（qwen-vl / gpt-4o 等），普通文本模型不收图；
- **问题要具体**——VLM 和文本模型一样吃"提示质量"，"这张图怎么样"和"这张图里防水层有哪些可见缺陷，按严重程度列出"得到的回答质量完全不同。

## 结构化输出：让"看图结果"能被程序消费

业务里不能让模型返回一段散文，要用输出约束（提示工程篇的方法）让 VLM 返回结构化 JSON：

```python
def inspect_image(image_path: str) -> dict:
    """缺陷照片检测结果结构化输出"""
    resp = client.chat.completions.create(
        model="qwen-vl-max",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{image_to_base64(image_path)}"}},
                {"type": "text", "text": """分析这张建筑质量缺陷照片，输出 JSON：
{"defect_type": "裂缝/渗漏/空鼓/其他", 
 "severity": "轻微/中等/严重",
 "location": "缺陷所在部位（如 屋面西南角）",
 "description": "一句话描述可见现象",
 "suggested_action": "处理建议"}
只输出 JSON。"""},
            ],
        }],
        response_format={"type": "json_object"},   # 部分接口支持强制 JSON
    )
    return json.loads(resp.choices[0].message.content)
```

工程要点和文本结构化完全一致：schema 明确、给示例、解析兜底（输出约束篇的 safe_parse_json 直接复用）。**唯一的新变量是"看图"本身可能出错**——模型可能看错缺陷类型，所以结构化输出的字段最好带上置信度（`"confidence": 0.9`），让下游能对低置信结果做人工复核。

## 文档解析：把"图里的字"变成数据

多模态在文档处理上最大的价值：**处理那些 OCR 搞不定、或纯 OCR 不够的文档**。三类典型：

**场景一：复杂版式 PDF 转文本。** 扫描 PDF、多栏排版、表格混排——传统 OCR 对版式理解差，VLM 能"看版面"，理解标题层级、表格结构：

```python
def parse_pdf_page(image_path: str) -> dict:
    """把 PDF 的一页（转成图片）解析成结构化文本"""
    resp = client.chat.completions.create(
        model="qwen-vl-max",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{image_to_base64(image_path)}"}},
                {"type": "text", "text": """把这一页的内容转成 Markdown：
1. 保留标题层级（# 一级、## 二级）
2. 表格转成 Markdown 表格
3. 图片/图表用 [图片描述] 占位并简述内容
4. 不要遗漏任何文字"""},
            ],
        }],
    )
    return resp.choices[0].message.content
```

**场景二：图表理解。** 流程图、架构图、数据图表——用户问"这张架构图里服务之间怎么通信"，VLM 能看图回答。这是纯文本 RAG 永远做不到的。

**场景三：图文混合文档的整体理解。** "这份验收报告里，哪些条款没通过、依据是什么"——模型要同时读文字和看表格/图章。VLM 把"读文档"从"读文字"升级成"读版面"。

## 工程化的三个关键决策

**决策一：图的分辨率与压缩。** 图像 token 成本和分辨率正相关。原则：**够用就好**——文档解析需要看清小字，用高分辨率；缺陷照片判断整体情况，压缩到合理尺寸即可。超大图（如几百 MB 的图纸）要先切片（分成多个 tile 分别送）再汇总。

**决策二：能截取就别传整图。** 很多场景不需要整张图——"判断这块区域的裂缝"传裁剪后的局部，比传整张全景图便宜且准确。**输入裁剪是降本增效的第一手段。**

**决策三：与传统 CV 分工。** 前面反复强调：批量检测用 CV（毫秒级、几厘钱），VLM 只处理 CV 搞不定的（低置信样本、需要理解的场景）。**把 VLM 当"需要时再用的理解层"，而不是"所有图像的默认处理器"。**

## 踩过的三个坑

**坑一：模糊图直接送 VLM。** 低分辨率、模糊、倾斜的图，VLM 会"看图说瞎话"——自信地编造细节。**输入先做质量检查**（分辨率、清晰度），太差的图要么预处理（增强/矫正），要么明确告知用户"图太模糊无法准确判断"，而不是让模型硬答。

**坑二：忽略"看图"的提示工程。** 有人以为 VLM 看图不需要提示技巧——错。图 + 一段好提示的输出质量，远高于图 + 一句"分析一下"。**看图也要给任务、给边界、给输出格式**（文本提示的整套方法论在图模态同样适用）。

**坑三：把 VLM 输出当权威。** VLM 会看错、会幻觉（看图编细节）。**关键判断（缺陷定级、合规结论）不能只靠 VLM 一次输出**——要置信度、要人工抽检、要规则复核（与评测篇的方法论一致）。

## 小结

VLM 实战两件事：图像问答（图 + 问题送模型）和文档解析（看图转结构化数据，是 RAG 的上游）。工程要点：结构化输出 + 置信度（看错要能被发现）、按需裁剪压缩（控成本提准确）、文档解析覆盖 OCR 搞不定的复杂版式。三个坑：模糊图硬送（先质检）、忽略看图提示（图模态也要提示工程）、把 VLM 当权威（加置信度和复核）。**VLM 把"读图"变成了可编程的能力——但它是"理解层"不是"检测器"，用对位置才有价值。**

下一篇讲图文结合的业务落地——质检与文档场景里，VLM 和传统 CV、RAG 怎么配合成完整方案。
