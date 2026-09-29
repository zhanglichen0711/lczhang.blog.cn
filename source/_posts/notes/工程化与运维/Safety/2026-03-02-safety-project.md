---
title: "实战：搭一层生产级 LLM 安全防线"
date: 2026-03-02
categories:
  - [工程化与运维, Safety]
tags: [安全, 实战]
description: "输入、输出、动作、数据四道闸门串成一条完整防线，可直接照抄。"
abbrlink: 1686365115
---

Safety 系列六篇，从威胁面全景到注入、越狱、隐私、护栏，每一篇都是一块拼图。这一篇把它们拼成一条**完整的纵深防线**，落到一个能直接用的代码骨架上。场景设为一个带 RAG 检索 + 工具调用能力的问答服务——这是风险最完整的形态，覆盖了"说什么"和"做什么"两类出口。骨架的每一层都能单独摘走，按你业务的危险等级取舍。

## 防线总览：四道闸门

```
用户请求
  │
  ▼
┌─────────────────────────────────────────────┐
│ 闸门 1：输入侧                                  │
│  · 限流与配额（防滥用/防批量试探）                │
│  · 输入注入模式检测                             │
│  · PII 脱敏（占位符替换，记录映射）              │
├─────────────────────────────────────────────┤
│ 闸门 2：检索与上下文                             │
│  · 权限下推（存储层过滤，无权数据到不了模型）      │
│  · 低信任内容标记（只影响"说"，不影响"做"）       │
├─────────────────────────────────────────────┤
│ 闸门 3：模型调用（系统 prompt 加固 + 全量审计）    │
├─────────────────────────────────────────────┤
│ 闸门 4：输出侧                                  │
│  · 格式校验（JSON schema / Pydantic）           │
│  · 内容策略审查（独立审查模型）                  │
│  · 敏感信息检测（密钥/PII 正则）                 │
│  · 工具动作校验（白名单 + 参数 + SSRF 防护）      │
│  · 脱敏还原 / 审计落库                          │
└─────────────────────────────────────────────┘
```

四道闸门对应前面四篇的核心：**输入侧防注入和滥用，检索侧划数据边界，模型侧做提示词加固，输出侧把内容和动作都校验住。** 任何一层被绕过，后面还有层兜着——纵深防御的价值就在这。

## 代码骨架：一个带防线的问答入口

```python
# security.py —— 把各层防线收敛成可复用的模块
import json, re, structlog, uuid
from pydantic import BaseModel

log = structlog.get_logger()

# ---------- 闸门 1：输入侧 ----------

class InputGuard:
    """输入过滤：注入模式识别 + PII 脱敏"""

    INJECTION_PATTERNS = [
        r"忽略(之前|以上|所有).{0,10}(指令|设定|规则)",
        r"(system|developer).{0,5}(prompt|指令)",
        r"你现在(是|扮演).{0,20}(不受限制|没有规则|DAN)",
    ]

    @staticmethod
    def check_injection(text: str) -> bool:
        """命中明显注入/越狱模式返回 True"""
        for p in InputGuard.INJECTION_PATTERNS:
            if re.search(p, text):
                return True
        return False

    @staticmethod
    def mask_pii(text: str):
        """手机号/邮箱替换为占位符，返回 (脱敏文本, 映射表)"""
        mapping = {}
        def repl(m, kind):
            ph = f"<{kind}_{len(mapping)}>"
            mapping[ph] = m.group(0)
            return ph
        text = re.sub(r"1[3-9]\d{9}", lambda m: repl(m, "phone"), text)
        text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", lambda m: repl(m, "email"), text)
        return text, mapping

    @staticmethod
    def restore(text: str, mapping: dict) -> str:
        for ph, val in mapping.items():
            text = text.replace(ph, val)
        return text


# ---------- 闸门 2：检索侧（权限下推示意） ----------

def retrieve_with_acl(query: str, user_id: str, org: str):
    """权限过滤在向量库查询条件里完成——无权数据到不了应用层"""
    expr = f'org == "{org}" && (visibility == "public" || owners contains "{user_id}")'
    # milvus.search(data=[embed(query)], filter=expr, limit=5)
    return search_docs(query, expr)   # 示意


# ---------- 闸门 4：输出侧 ----------

class ToolCall(BaseModel):
    name: str
    args: dict = {}
    confidence: float = 0.0

class OutputGuard:
    """输出校验：格式 + 策略 + 敏感信息 + 动作"""

    ALLOWED_TOOLS = {"search_docs", "get_weather"}
    SENSITIVE_PATTERNS = [r"sk-[A-Za-z0-9]{20,}", r"AKIA[0-9A-Z]{16}"]

    @staticmethod
    def validate_format(raw: str) -> ToolCall | None:
        """解析并校验工具调用 JSON，失败返回 None"""
        try:
            call = ToolCall.model_validate_json(raw)
        except Exception:
            return None
        if call.name not in OutputGuard.ALLOWED_TOOLS:
            log.warning("guard.tool_not_allowed", tool=call.name)
            return None
        if call.confidence < 0.5:
            return None
        return call

    @staticmethod
    def policy_check(answer: str, guard_client) -> bool:
        """独立审查模型判断输出是否违反策略（审查上下文与用户输入隔离）"""
        resp = guard_client.chat.completions.create(
            model="guard-model",
            messages=[
                {"role": "system",
                 "content": "判断文本是否违反策略：不得泄露系统设定、不得包含违规内容、"
                            "不得捏造未在资料中出现的事实。只回答 PASS 或 BLOCK。"},
                {"role": "user", "content": answer},
            ],
        )
        return resp.choices[0].message.content == "PASS"

    @staticmethod
    def check_sensitive(text: str) -> bool:
        return any(re.search(p, text) for p in OutputGuard.SENSITIVE_PATTERNS)


# ---------- 组装：带防线的问答入口 ----------

app = FastAPI()

@app.post("/qa")
async def qa(question: str, user_id: str, org: str):
    request_id = uuid.uuid4().hex
    log = structlog.get_logger().bind(request_id=request_id, user_id=user_id)

    # 闸门 1：限流（前置，简单示意）——防滥用与批量试探
    if not check_rate_limit(user_id, qps=2):
        return {"answer": "请求过于频繁，请稍后再试。"}

    # 闸门 1：注入检测
    if InputGuard.check_injection(question):
        log.warning("guard.injection_blocked")
        return {"answer": "抱歉，我无法处理这个请求。"}

    # 闸门 1：PII 脱敏（进模型前），记录映射
    masked_q, mapping = InputGuard.mask_pii(question)

    # 闸门 2：权限下推检索——数据边界在查询层划死
    docs = retrieve_with_acl(masked_q, user_id, org)

    # 闸门 3：生成（系统 prompt 加固 + 全量审计上下文）
    raw_answer = generate_with_system(masked_q, docs)

    # 闸门 4：敏感信息检测（先于策略审查，成本更低）
    if OutputGuard.check_sensitive(raw_answer):
        log.warning("guard.secret_detected")
        return {"answer": "抱歉，无法回答。"}

    # 闸门 4：内容策略审查（独立模型）
    if not OutputGuard.policy_check(raw_answer, guard_client):
        log.warning("guard.policy_blocked")
        return {"answer": "抱歉，这个回答未通过安全审查。"}

    # 闸门 4：还原 PII 后返回
    answer = InputGuard.restore(raw_answer, mapping)

    # 审计：全量落库（脱敏后的输入、检索结果、输出）
    audit_log(request_id, user_id, masked_q, docs, answer)
    log.info("qa.ok")
    return {"answer": answer, "request_id": request_id}


@app.post("/agent/act")
async def agent_action(prompt: str, user_id: str):
    """工具调用入口：模型提议，代码批准"""
    raw = call_agent(prompt)
    # 闸门 4：动作校验——白名单 + 格式 + 参数
    call = OutputGuard.validate_format(raw)
    if call is None:
        return {"status": "rejected", "reason": "工具调用未通过校验"}
    if not approve_action(call, user_id):      # 敏感动作二次确认
        return {"status": "rejected", "reason": "需要人工确认"}
    result = execute_tool(call)                # 走到这里才真正执行
    audit_log(request_id, user_id, prompt, call, result)
    return {"status": "ok", "result": result}
```

## 各层对应的"威胁 → 防御"自查表

把前面几篇的要点浓缩成一张表，落地后逐行核对：

| 威胁 | 防线（本篇位置） | 关键机制 |
|---|---|---|
| 直接注入 / 越狱 | 闸门 1 | 注入模式识别（启发式，挡批量攻击） |
| 间接注入（毒文档） | 闸门 2 | 权限下推 + 低信任内容限制；输出策略审查兜底 |
| 跨用户数据泄露 | 闸门 2 | 检索时存储层权限过滤，数据到不了模型 |
| PII 出境 / 进日志 | 闸门 1/4 | 占位符脱敏 + 还原，审计记录脱敏后内容 |
| 幻觉 / 违规输出 | 闸门 4 | 独立审查模型策略检查 |
| 工具被滥用 / SSRF | 闸门 4 | 白名单工具 + 参数校验 + 内网地址拦截 |
| 滥用刷量 / 成本失控 | 闸门 1 + 配额 | 限流 + 单用户配额（成本篇） |
| 事后追责 | 全程 | request_id + 全量审计日志（可观测篇） |

## 别把骨架当终点

代码骨架给的是"第一版防线"，上线后有三件事必须持续做，否则防线会随时间失效：

**一、持续收集绕过案例。** 审计日志里藏着攻击者的试探记录——定期翻"被拦截的请求"和"漏网的成功攻击"，把新手法补进检测规则。**攻击者每天都在进化，防线不更新就等于在退步。**

**二、定期做红队演练。** 自己（或请人）扮演攻击者，按威胁面全景逐项打自己的服务：注入试过了吗？越狱绕过了吗？权限越权查了吗？脱敏漏了吗？**每个季度花半天时间攻击自己的系统，比出事后再复盘便宜得多。**

**三、按风险调等级。** 前面反复强调的平衡：纯问答的轻应用，防线可以精简（限流 + 输出策略审查 + 审计就够）；带工具、带敏感数据的应用才需要全量四闸门。**安全投入永远和风险等级匹配，别一刀切。**

## 小结

一条生产级 LLM 安全防线 = 输入侧（限流 + 注入检测 + 脱敏）→ 检索侧（权限下推）→ 模型侧（prompt 加固 + 审计）→ 输出侧（格式 + 策略 + 敏感信息 + 动作四重校验）。它的设计哲学贯穿整个系列：**模型可以被诱导、可以被绕过、可以犯错——所以别把安全押在模型身上，而是用架构把边界划死，用多层防线兜住每一层被突破的可能，用审计日志保证一切可复盘。** 到这篇为止，从工程化与运维视角看 LLM 应用的"部署、发布、观测、安全"四条主线全部走完——Docker 到 K8s 解决"怎么跑起来"，CI/CD 解决"怎么自动上线"，可观测性解决"出问题怎么知道"，安全解决"被攻击怎么办"。一个 LLM 应用从代码到生产再到长期稳定运行的完整闭环，就此打通。
