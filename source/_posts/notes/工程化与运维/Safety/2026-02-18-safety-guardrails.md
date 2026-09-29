---
title: "输出校验与护栏设计"
date: 2026-02-18
categories:
  - [工程化与运维, Safety]
tags: [安全, Guardrails]
description: "输出结构化、内容过策略、格式强校验——在出口装一套护栏。"
abbrlink: 465487424
---

前面几篇的防线大多在"输入侧"和"过程侧"，但 LLM 的输出是不可预测的——**同样的输入，它可能今天给合法 JSON，明天给你一段散文开头**。对把模型输出接到真实系统里的应用（Agent 调工具要解析参数、后端要解析结构化字段），一个格式不合规或内容越界的输出，轻则报错重则出事故。**护栏（Guardrails）就是在模型的出口装一道闸：校验输出格式、检查内容策略、确保它符合下游的消费要求。** 这篇讲护栏设计的三个层次和工程落地。

## 为什么输出必须被"管"

三个理由决定了输出校验不是可选项：

**第一，结构化输出可能不合规。** 让模型返回 JSON，它可能多解释几句、字段名拼错、给非法值。直接 `json.loads` 会崩，或者解析出一个缺字段的对象带病运行。要求模型输出结构化数据时，**必须有配套的格式校验兜底**。

**第二，内容可能越界。** 前面注入篇讲了输出侧策略审查，这里再往前一步：不只是"违规内容"，还包括"不该出现的内容"——模型不该透露系统 prompt、不该重复它不确定的"事实"（幻觉）、不该泄露检索到的受限信息。出口校验是拦下这些的最后机会。

**第三，下游可能被脏数据污染。** Agent 场景里模型输出就是"动作指令"（调哪个工具、传什么参数）。一个幻觉出来的工具名、一个越界的参数值，会直接变成一次真实的调用。**模型输出直接当代码执行，出口校验就是这层的语法检查和安全检查。**

## 护栏三层：格式、内容、动作

### 第一层：格式校验——先保证"能解析"

模型输出结构化数据前，先用"输出约束"降低出错率，再用"解析兜底"处理出错：

```python
def safe_parse_json(text: str) -> dict | None:
    """解析模型输出为 JSON，带清理和兜底"""
    text = text.strip()
    # 常见情况：模型在 JSON 外裹了 ```json 代码块或前后有解释文字
    fence = text.find("```")
    if fence != -1:
        text = text[fence:].split("```", 2)[1] if "json" in text[fence:fence+8] else text[fence+3:].split("```")[0]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
```

配合 Pydantic 做字段级校验（FastAPI 系列讲过），缺字段、类型错、枚举值非法都能拦下：

```python
from pydantic import BaseModel, Field

class ToolCall(BaseModel):
    name: str
    args: dict = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)

parsed = ToolCall.model_validate_json(raw)   # 校验失败会抛异常，由上层兜底
```

**格式校验失败的兜底策略**：重试一次（让模型重新输出，往往第二次就合规了）；仍失败就**降级**——返回固定兜底话术或标记人工处理，绝不把未校验的原始输出直接往下传。

### 第二层：内容校验——保证"该说的才说"

格式之外，内容层面两道检查：

**策略检查**（前面注入篇的输出审查复用）：独立审查模型或规则判断输出是否违反策略。注意**策略里要包含"输出必须忠实于提供的资料"这类防幻觉约束**——对 RAG 应用，可以校验回答中的关键信息是否能在检索到的文档里找到依据（引用溯源，RAG 系列讲过的"必须带出处"原则在这里变成技术校验）。

**敏感信息检查**：输出里是否带了本不该出现的 PII、密钥、内部信息。用正则（手机号、邮箱、AK/SK 格式）+ 规则（禁止输出某些内部标识）拦截：

```python
def contains_secret(text: str) -> bool:
    # 常见密钥格式检测
    patterns = [
        r"sk-[A-Za-z0-9]{20,}",          # OpenAI 风格
        r"AKIA[0-9A-Z]{16}",             # AWS 风格
        r"1[3-9]\d{9}",                  # 手机号（如业务上不允许）
    ]
    return any(re.search(p, text) for p in patterns)
```

### 第三层：动作校验——保证"能做的才做"

对 Agent/工具调用场景，模型输出到动作之间加一道独立校验（注入篇提过敏感动作确认，这里给完整形态）。校验器**不信任模型输出**，逐字段核对：

```python
class ToolCallValidator:
    """模型输出的工具调用，经过这道闸才允许执行"""

    ALLOWED_TOOLS = {"search_docs", "get_weather", "calc"}
    MAX_ARG_LENGTH = 500

    def validate(self, call: ToolCall) -> tuple[bool, str]:
        if call.name not in self.ALLOWED_TOOLS:
            return False, f"工具 {call.name} 不在白名单"
        if call.confidence < 0.6:
            return False, "置信度过低，拒绝执行"
        for k, v in call.args.items():
            if isinstance(v, str) and len(v) > self.MAX_ARG_LENGTH:
                return False, f"参数 {k} 超长，疑似注入"
        # 业务规则：禁止访问内网/本地的参数
        url = call.args.get("url", "")
        if url.startswith(("http://localhost", "http://127.0.0.1", "http://10.", "http://192.168.")):
            return False, "禁止访问内网地址（SSRF 防护）"
        return True, "ok"
```

**白名单思维**：允许什么显式列出，没列的一律拒绝——比"黑名单拦截已知危险"可靠得多。动作校验的黄金法则是**"模型提议，代码批准"**：模型可以建议调用什么工具，但最终批准权在代码层。

## 护栏的架构形态

护栏不是散落的几个 if，而是**包在模型调用外的一层固定管道**。把前面几层的逻辑收敛成一个通用的 guard 函数，所有模型出口统一过它：

```python
def guarded_call(llm_func, *, schema=None, policy=None, tools=None, **kwargs):
    """统一的护栏出口：格式校验 + 内容检查 + 动作校验 + 审计"""
    raw = llm_func(**kwargs)

    # 审计永远先记录（不管后面过不过）
    audit("llm_output", raw=raw, **kwargs)

    # 1. 格式：有 schema 就解析校验
    if schema:
        parsed = safe_parse(raw, schema) or retry_once(llm_func, **kwargs)
        if parsed is None:
            return fallback("输出格式不符合要求")

    # 2. 内容策略
    if policy and not policy_check(parsed_output):
        return fallback("内容未通过安全策略")

    # 3. 动作校验（工具调用场景）
    if tools and not tools.validate(parsed_output):
        return fallback("动作未通过安全校验")

    return parsed_output
```

统一出口的好处：**新功能接入时默认有护栏**（不会被某个开发忘了加），审计集中（所有输出都有记录），策略调整只改一处。

## 护栏的度：别把应用"护"死

护栏设计要避免两个极端：

**极端一：完全没有护栏。** 模型输出裸奔进下游——格式错误导致崩溃、内容越界导致事故、动作越权导致损失。

**极端二：护栏过重。** 每一步输出都过重模型审查，延迟翻倍；策略过严导致正常回答大量被误拦，用户体验崩塌。

**平衡的心法**：护栏的严格度跟"输出的危险等级"匹配——纯文本问答（无工具、无敏感数据）用轻量护栏（格式可选、内容快检）；能调工具、能访问数据的场景用全量护栏（格式 + 策略 + 动作 + 审计）。**危险等级高的输出，值得花更高的校验成本。**

## 小结

护栏是模型出口的三层闸：格式校验保证"能解析"（约束输出 + Pydantic 校验 + 失败重试兜底）、内容校验保证"该说的才说"（策略审查 + 敏感信息检测 + 引用溯源）、动作校验保证"能做的才做"（白名单工具 + 参数校验 + SSRF 防护）。架构上收敛成统一出口，让新功能默认有护栏，按输出危险等级调节严格度。至此四道防线讲完——最后一篇实战收尾，把输入、模型、输出、数据四层串成一条完整防线。
