---
title: "LLM-as-Judge：让模型评价模型"
date: 2025-05-26
categories:
  - [大模型应用, Evaluation]
tags: [评测, LLM-as-Judge]
description: "让强模型按标准给弱模型打分，省人力可规模化，但要用对：给评分标准、控制偏差、校准结果。"
abbrlink: 1291161124
---

评测集设计好了，怎么给"主观质量"批量打分成了瓶颈——人工打分准但太慢太贵，规则只能覆盖格式层。"回答相不相关、有没有忠实于资料"这种质量判断，能不能自动化？答案是 **LLM-as-Judge：让一个强模型扮演裁判，按你给的标准给回答打分。** 它是目前规模化评测主观质量最实用的手段，但用不好会得到一堆"看起来很科学、实际不可信"的分数。这篇讲怎么用对。

## LLM-as-Judge 的基本形态

让裁判模型给"候选回答"打分，本质是一次带评分标准的模型调用：

```python
JUDGE_PROMPT = """你是一个评测裁判。根据给定的标准，判断候选回答的质量。

【评测维度】
1. 相关性：回答是否直接回应了问题（0-5 分）
2. 忠实性：是否只依据给定资料，有无编造（0-5 分）
3. 完整性：关键要点是否覆盖（0-5 分）

【评分标准】
- 5 分：完全符合该维度
- 3 分：基本符合但有明显不足
- 1 分：严重不符合

【用户问题】
{question}

【候选回答】
{answer}

【判定规则】
- 忠实性维度：若回答包含资料中不存在的内容，该维度直接 1 分
- 只输出 JSON：{{"相关性": x, "忠实性": y, "完整性": z}}

判定结果："""

def judge_answer(question: str, answer: str, context: str | None = None) -> dict:
    resp = call_llm(JUDGE_PROMPT.format(
        question=question, answer=answer,
        # context 传给裁判可增强忠实性判断，但注意成本
    ))
    return json.loads(resp)
```

一个关键的实践细节：**裁判的评分标准必须写成"可操作的规则"**，而不是"请评价这个回答"。上面把"忠实性"定义成"资料外内容 → 1 分"，裁判就有明确的判据——标准越可操作，不同裁判（或同裁判不同次）的评分越一致。

## Judge 的三种经典用法

**用法一：单维度打分。** 每次只评一个维度（相关性 OR 忠实性），分数更可靠。多维度塞一次，裁判容易顾此失彼。

**用法二：成对比较。** 给裁判两个回答（如新老版本），问"哪个更好"。研究表明**比较任务比打分任务更可靠**——裁判判断"A 比 B 好"比"给 A 打 4 分"更稳定：

```python
PAIRWISE_PROMPT = """比较下面两个回答哪个更好（针对问题：{question}）。
回答 A：{answer_a}
回答 B：{answer_b}
只输出：A 更好 / B 更好 / 差不多
结论："""
```

**用法三：点检式判定。** 不评"好不好"，只判"是否违反某条硬规则"——"该拒答时是否拒答""是否引用了不存在的出处"。二分类判定比评分可靠得多，适合做门禁。

## 控制 Judge 的四个偏差

LLM-as-Judge 不是客观真理，它有自己的偏差，用之前要知道并控制：

**偏差一：位置偏差（Position Bias）。** 成对比较时，裁判倾向于选先出现的那个。**缓解：交换 AB 顺序各评一次**，结果不一致时标记为"存疑"。

**偏差二：自肥偏差（Self-preference）。** 裁判容易给自己同源的模型（或更"出名"的模型）更高分。**缓解：裁判模型尽量用与被评模型不同源的强模型**；自己训的模型让更强的第三方模型评。

**偏差三：冗长偏差（Verbosity Bias）。** 裁判倾向于给"更长、更花哨"的回答高分，哪怕不更准确。**缓解：评分标准里明确"简洁也加分"或"只看内容不看长度"**，必要时先裁剪再评。

**偏差四：标准漂移（标准不一致）。** 一次评测里，裁判对同一条标准的前后把握会漂移。**缓解：评测时固定 prompt 模板、固定模型、固定参数（temperature=0）**，保证同一次评测的评分口径一致。

## 校准：Judge 分数凭什么可信

Judge 分数是"模型的判断"，不是"事实"。让分数可信的唯一方法是**校准**——拿 Judge 的评分和可信基准对比：

```python
def calibrate_judge(sample_size=30):
    """用 golden set 校准 Judge：人工先评，Judge 再评，算一致率"""
    human_scores = {}   # 人工评分（golden set 里客观可判的部分）
    judge_scores = {}
    for case in GOLDEN_SET[:sample_size]:
        human_scores[case["id"]] = human_score(case)     # 规则/人工
        judge_scores[case["id"]] = judge_answer(case)    # Judge 打分

    # 一致率 = Judge 与可信基准一致的占比
    agreement = sum(1 for k in human_scores
                    if judge_scores[k] == human_scores[k]) / len(human_scores)
    return agreement   # > 0.8 说明 Judge 可用；< 0.7 说明标准要重写
```

校准的两层含义：

1. **用 golden set 客观题校准**：Judge 在这些题上的表现如果和客观答案大面积冲突，说明评分标准写得不对或 Judge 不适合这个任务；
2. **抽样人工复核**：定期抽一部分 Judge 评过的题给人看，人 Judge 一致的题可以放心自动化，**争议案例（接近边界、分数可疑）必须人工仲裁**。

**Judge 的定位是"自动化的大规模初筛"，不是"终极裁判"**——它帮你把 95% 不用人看的题过滤掉，剩下的争议题才值得花人力。

## Judge 评测的工程集成

把 Judge 接进评测流程，通常长这样：

```python
def run_evaluation(test_cases: list[dict]) -> dict:
    results = []
    for case in test_cases:
        answer = rag_system.answer(case["question"])

        # 1. 客观部分用规则判（golden set：拒答、出处、关键词）
        rule_result = rule_check(case, answer)

        # 2. 主观部分用 Judge 判
        judge_result = judge_answer(
            case["question"], answer,
            judge_prompt="qa_quality",   # 按场景选评分标准
        )

        # 3. 结果汇总
        results.append({
            "case": case["id"],
            "rule": rule_result,
            "judge": judge_result,
            "pass": rule_result["pass"] and judge_result["quality"] >= 4,
        })
    return summarize(results)   # 通过率 / 各维度均值 / 失败明细
```

工程集成注意：Judge 调用也是成本（每评一条花一次模型调用），**先规则后 Judge**（规则能判的不麻烦 Judge）、**抽样代替全量**（大规模评测抽代表性的跑），把 Judge 成本控制住。

## 小结

LLM-as-Judge 是规模化评测主观质量的主力手段：给它可操作的评分标准、让它做比较和点检比打分更可靠、控制位置/自肥/冗长偏差、用 golden set 校准保证可信。它定位是"自动化初筛 + 争议题人工仲裁"，不是终极裁判。**Judge 用得好的团队，评测是流水线；用得不好的团队，评测是另一个幻觉来源。**

下一篇把评测接到线上——线上评测怎么做：真实流量的 trace、评分与回归怎么结合。
