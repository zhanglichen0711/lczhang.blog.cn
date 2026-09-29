---
title: "输出约束：让模型稳定输出 JSON"
date: 2025-01-27
categories:
  - [大模型应用, Prompt-Engineering]
tags: [Prompt, 结构化输出]
description: "自由文本接不进程序。JSON Schema、示例、严格指令三层约束，外加解析兜底。"
abbrlink: 1817551796
---

大模型最让人头疼的一点：它输出的是**自然语言**，而程序需要的是**结构化数据**。模型说"好的，我来帮你查一下天气"的时候，程序没法判断它到底是要调工具还是要闲聊。要做 AI 应用，第一道工程门槛就是：**怎么让模型稳定输出程序能直接消费的结构化内容——最典型的就是 JSON。**

## 为什么"让模型输出 JSON"没那么简单

你可能会想：不就是加一句"请以 JSON 格式输出"吗？试过就知道，模型经常给你惊喜：

```json
好的，以下是您需要的 JSON：
{
  "intent": "查天气",
  "city": "上海",
} 
希望这个回答对您有帮助！
```

问题一：**JSON 外面裹了层人话**——直接 `json.loads` 会抛异常。问题二：**结尾多了个逗号**（尾逗号）——严格解析器直接报错。问题三：字段名可能被模型"自由发挥"成别的。

要稳定拿到干净的 JSON，需要**三层约束 + 一层兜底**，而不是一句"输出 JSON"。

## 第一层约束：用 Schema 定义结构

比"输出 JSON"更精确的是告诉模型**JSON 长什么样**。用 JSON Schema 描述字段、类型、必填项：

```text
【任务】判断用户问题意图，并抽取关键参数
【输出格式】严格按下面的 JSON Schema，不要输出任何其他内容：

{
  "type": "object",
  "properties": {
    "intent": {"type": "string", "enum": ["查天气", "查规范", "闲聊"]},
    "city": {"type": "string"},
    "date": {"type": "string"}
  },
  "required": ["intent"]
}
```

Schema 的价值是**把模型的自由发挥空间压缩到字段级**：它知道 intent 只能取三个值之一，知道 city 是字符串。模型虽然不会"真正理解" Schema 语义，但它能模仿出符合 Schema 的文本结构——配合下面的示例，效果更稳。

## 第二层约束：给一个完整的输出示例

光有 Schema，模型可能给你合法但多余的字段，或者格式漂移。**在提示里放一个完整的"输入→正确输出"示例**，是最有效的格式锁定手段：

```text
【示例】
用户：上海明天天气怎么样？
输出：{"intent": "查天气", "city": "上海", "date": "明天"}
```

示例的作用前面讲过——模型对"照着这个格式来"的模仿能力，远强于对抽象规则的理解。**Schema 描述规则，示例展示规则，两者配合比单独用任何一个都稳。**

## 第三层约束：明确的边界指令

再加一条硬性边界，堵住常见的"自由发挥"：

```text
【硬性要求】
1. 只输出 JSON，不要输出任何解释、前言或后语
2. 不要使用 Markdown 代码块包裹
3. 字段严格使用上面定义的名称，不要改名
4. 无法判断 intent 时，填 "闲聊"
```

这几条看似啰嗦，每条都在堵一个真实踩过的坑：模型输出"以下是 JSON"的前缀、把 JSON 包在 ``` 代码块里、把 `intent` 改写成 `用户意图`。**边界的价值就是让模型在模糊地带的行为由你定义。**

## 兜底层：解析永远要有容错

即使三层约束都做了，线上仍可能遇到不守规矩的输出——模型升级、上下文变化都可能引入新的格式漂移。所以**解析端必须有一层容错兜底**，把"模型不听话"变成"程序不崩溃"：

```python
import json
import re

def safe_parse_json(raw: str) -> dict | None:
    """解析模型输出为 JSON，处理常见的不规范情况"""
    if not raw:
        return None

    text = raw.strip()

    # 情况 1：输出被 Markdown 代码块包裹
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    # 情况 2：JSON 前后裹了说明文字 —— 截取第一个 { 到最后一个 }
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        text = text[first:last + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 情况 3：尾逗号等常见语法错误 —— 做一次清洗重试
        cleaned = re.sub(r",\s*([}\]])", r"\1", text)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None  # 解析失败交给上层兜底（重试或降级）
```

这段容错函数能处理线上 90% 的格式漂移。但它只是**兜底**，不是偷懒的借口——约束层做得越好，兜底层触发越少，成本和体验都更好。

## 更进一步：用工具调用代替"裸 JSON"

如果你用的是支持 Function Calling 的模型（OpenAI 兼容接口大多支持），输出约束其实有更正规的手段——让模型"调用工具"，由框架保证输出是合法 JSON：

```python
from openai import OpenAI

client = OpenAI()

tools = [{
    "type": "function",
    "function": {
        "name": "record_intent",
        "description": "记录用户问题的意图和关键参数",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": ["查天气", "查规范", "闲聊"]},
                "city": {"type": "string"}
            },
            "required": ["intent"]
        }
    }
}]

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "上海明天天气怎么样？"}],
    tools=tools,
    tool_choice={"type": "function", "function": {"name": "record_intent"}},
)

# 输出由 API 保证是合法 JSON，直接解析 arguments
import json
args = json.loads(resp.choices[0].message.tool_calls[0].function.arguments)
print(args)  # {"intent": "查天气", "city": "上海"}
```

Function Calling 把"格式约束"从提示词层面转移到了协议层面，可靠得多——这也是后面 Agent 系列的基础。这里先记住结论：**能走 Function Calling 就别裸写 JSON，裸写 JSON 时用三层约束加一层兜底。**

## 小结

让模型稳定输出 JSON 是 AI 应用的第一道工程门槛。做法是四层：JSON Schema 定义结构 → 完整示例锁定格式 → 硬性边界堵住自由发挥 → 解析容错兜底意外漂移。更进一步，支持 Function Calling 的模型应该直接走工具调用协议，把格式问题从提示层面彻底解决。

下一篇讲思维链——怎么让模型做复杂推理不偷懒。这是从"输出对格式"到"输出对答案"的关键一跃。
