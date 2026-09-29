---
title: "Function Calling：让模型稳定调用工具"
date: 2025-06-23
categories:
  - [大模型应用, Agent]
tags: [Agent, Function Calling]
description: "模型输出的是'想调哪个工具、传什么参数'的 JSON，不是散文。Schema、描述与错误处理决定工具调用稳不稳。"
abbrlink: 2641794943
---

Agent 能"行动"的前提是模型能表达"我想调用什么工具、传什么参数"。在 Function Calling（函数调用）出现之前，这个表达是靠自然语言——模型说"帮我查一下上海的天气吧"，应用只能靠正则去猜"它是不是要查天气、查哪个城市"。猜就会错。**Function Calling 把"模型想调用工具"从散文变成了结构化协议：模型在需要时输出符合 schema 的 JSON，由程序真正执行函数，再把结果还回模型。** 这是 Agent 行动的起点，也是本篇要讲透的基础。

## 没有 Function Calling 时有多痛

想象做一个"查天气 + 订机票"的助手，模型输出自然语言：

```text
用户：帮我看看上海明天的天气，如果下雨就帮我订后天去北京的票
模型：好的，我来帮您查天气。请问您想查上海哪天的天气？另外订票需要确认您的身份信息……
```

两个问题：第一，模型把任务"说"出来了，但程序不知道它到底要调天气接口还是订票接口；第二，更糟的是模型在**反问用户**——它把"需要工具"和"需要澄清"混在一起。用正则解析这种自由文本，是一场维护噩梦。

Function Calling 的思路是**改变通信协议**：模型的输出不再是一段话，而是一个结构化的"调用意图"：

```json
{
  "tool_calls": [
    {"name": "get_weather", "arguments": {"city": "上海", "date": "明天"}}
  ]
}
```

程序看到这个 JSON，就知道：要调 `get_weather` 工具，参数是 city=上海、date=明天。**模型只负责"提议"，程序负责"执行"——意图的结构化让决策和执行彻底分开。**

## Function Calling 的两种主流形态

**形态一：原生 Function Calling（API 级）。** OpenAI 兼容接口大多支持 `tools` 参数——你在请求里声明有哪些工具（含 schema），模型在需要时会返回 `tool_calls` 而不是普通文本：

```python
from openai import OpenAI

client = OpenAI()

# 1. 声明工具：给模型看"有哪些工具可用、长什么样"
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询指定城市、日期的天气情况",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，如 上海"},
                "date": {"type": "string", "description": "日期，如 明天 / 2025-06-25"}
            },
            "required": ["city"]
        }
    }
}]

# 2. 让模型决策：需要天气就返回 tool_call
resp = client.chat.completions.create(
    model="qwen-plus",
    messages=[{"role": "user", "content": "上海明天天气如何？"}],
    tools=tools,
)

message = resp.choices[0].message
if message.tool_calls:      # 模型提议调用工具
    call = message.tool_calls[0]
    print(call.function.name)        # get_weather
    print(call.function.arguments)   # {"city": "上海", "date": "明天"}
```

**形态二：让模型输出 JSON（无原生支持时）。** 有些模型或场景不适合原生 Function Calling，就退回提示工程的做法——要求模型输出"工具调用"格式的 JSON（提示工程"输出约束"篇讲过怎么让模型稳定吐 JSON）：

```python
TOOL_CALL_PROMPT = """如果需要调用工具，请按以下格式输出：
{"tool": "get_weather", "args": {"city": "上海", "date": "明天"}}
如果不需要调用工具，直接回答用户。

可用工具：
- get_weather(city, date): 查询天气
- book_flight(from, to, date): 预订机票
"""
```

两种形态的选择：**优先用原生 Function Calling**（API 保证 JSON 合法、支持多工具并行、错误处理更完善）；只有在模型不支持时才退回"模型输出 JSON + 应用解析"。

## 工具描述的质量决定调用准不准

Function Calling 的效果，很大程度取决于你怎么写工具的 `description` 和参数 schema。模型靠这些描述决定"何时调、调哪个、传什么"——**描述写得含糊，模型就在工具之间乱猜**：

```text
差描述：
"get_weather": 查天气
（模型不知道：支持哪些城市？日期格式？查不到返回什么？）

好描述：
"get_weather": 查询指定城市未来几天的天气。
 - 支持国内主要城市，城市名用中文（如"上海"）
 - date 支持"今天/明天"或 YYYY-MM-DD
 - 只有需要天气信息时才调用；闲聊时不要调用
 - 查不到天气时返回空结果并说明，不要编造
```

好描述回答了模型的三个问题：

1. **什么时候该调**（触发条件 + 不该调的情况）；
2. **参数怎么传**（格式、取值范围、必填项）；
3. **失败会怎样**（返回值形态，避免模型把"查询失败"当成"没这回事"继续编）。

写工具描述的经验法则：**把它当成写给一个认真但没见过你系统的开发者的 API 文档**——信息越全，模型调用越准。

## 执行与回填：让模型看到工具结果

模型提议调用工具后，真正的执行在程序侧。执行完要把结果**回填给模型**，让它基于结果继续（这是 Agent 循环的关键一环，Agent 简介篇的"观察"）：

```python
# 3. 程序执行工具
if message.tool_calls:
    for call in message.tool_calls:
        fn = TOOL_REGISTRY[call.function.name]       # 白名单注册表
        result = fn(**json.loads(call.function.arguments))
        # 4. 把执行结果作为 tool 消息回填
        messages.append(message)                      # 模型的 tool_call 提议
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,                  # 关联到对应的 tool_call
            "content": json.dumps(result, ensure_ascii=False),
        })
    # 5. 让模型基于工具结果继续（可能是最终回答，或再调下一个工具）
    resp2 = client.chat.completions.create(model=..., messages=messages)
```

**回填的内容设计很讲究**：给模型看什么，直接决定它下一步的判断。经验：

- 返回**结构化结果**（JSON），不要返回一大段打印日志；
- 关键信息前置，别让模型在长输出里找答案；
- 失败要**显式带错误标记**（如 `{"error": "城市不存在"}`），模型才能正确决定"换个城市重试"还是"告知用户"——**把"查询失败"伪装成正常结果，是 Agent 连环出错的常见根源。**

## 三个必踩的坑

**坑一：工具没有白名单。** 模型能调的工具必须来自你注册的集合（上面代码里的 `TOOL_REGISTRY`），绝不能执行模型"自由发挥"的工具名——模型输出幻觉工具名时，程序要拦截而不是报错崩溃。

**坑二：参数校验缺失。** 模型传的参数可能有类型错误、越界值。执行前用 schema 校验（Pydantic 很合适，提示工程篇讲过），校验失败返回"参数错误"让模型修正，而不是把坏参数直接丢给业务函数。

**坑三：同一工具连续调用没有熔断。** 模型可能在一个失败的工具上反复重试（"再查一次"），既烧钱又陷入死循环。工具执行层要记录调用次数，同一轮对话里对同一工具的连续失败调用要熔断：

```python
def guard_tool_call(tool_name: str, max_retries: int = 3):
    """同一工具连续失败调用的熔断保护"""
    def decorator(fn):
        def wrapper(*args, **kwargs):
            fails = 0
            while True:
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    fails += 1
                    if fails >= max_retries:
                        return {"error": f"工具连续失败 {max_retries} 次，已熔断", "tool": tool_name}
        return wrapper
    return decorator
```

## 小结

Function Calling 是 Agent 行动的起点：它把"模型想调工具"变成结构化协议（输出工具名 + 参数 JSON），让程序能可靠地执行。两个要点：**声明要清楚**（工具描述回答"何时调、传什么、失败怎样"）和**执行要可靠**（白名单注册、参数校验、结果结构化回填、失败显式标记、连续失败熔断）。模型提议，程序批准——这是 Agent 工程的第一条安全边界。

下一篇讲工具侧的设计——Agent 好不好用，一半取决于工具设计得怎么样：名称、参数、错误契约。
