---
title: "GitHub Actions 依赖缓存与常用 Action"
date: 2025-08-15
categories:
  - [工程化与运维, GitHub Actions]
tags: [GitHub Actions, 缓存]
description: "pip/npm 依赖缓存命中一次省几分钟，高频 Action 用前先懂原理。"
abbrlink: 1022135682
---

CI 跑一次几分钟，大头往往花在**装依赖**上：Python 项目 `pip install` 几十上百个包，Node 项目 `npm ci` 同样耗时。而且每次提交都重复装一遍——同一份 requirements 从来没变过，凭什么每次重新下载？GitHub Actions 的缓存机制就是为这个设计的：**把不会经常变的依赖存起来，下次跑直接复用。**

## 缓存原理与用法

核心是官方提供的 `actions/cache`：

```yaml
steps:
  - uses: actions/checkout@v4

  - name: 缓存 pip 依赖
    uses: actions/cache@v4
    with:
      path: ~/.cache/pip
      key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements*.txt') }}
      restore-keys: |
        ${{ runner.os }}-pip-
```

拆解三个参数：

- **`path`**：要缓存的目录。各语言依赖的缓存位置不同——pip 是 `~/.cache/pip`，npm 是 `~/.npm`，Go 是 `~/go/pkg/mod`。
- **`key`**：缓存的唯一标识。这里的关键技巧是 `hashFiles(...)`——**依赖清单文件内容变了，key 就变，缓存自动失效**。依赖没变，key 相同，命中缓存。
- **`restore-keys`**：key 完全没命中时的"部分匹配"回退。比如某次只改了 requirements-dev.txt（不在 hash 范围内），主 key 不命中，但 `restore-keys` 能找回上一个相近的缓存。

实际效果：第一次跑还是全量装（顺便写缓存），之后只要依赖文件没变，pip 从缓存装几乎是秒级——**CI 时间能从几分钟压到几十秒**。

## setup-* Action 通常自带缓存

好消息是：官方语言 Action 大多内置了缓存开关，不用手写 cache step。以 Python 为例：

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.11"
    cache: "pip"
    cache-dependency-path: "**/requirements*.txt"
```

Node 同理：

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
```

`cache: "npm"` 会自动缓存 `~/.npm` 并依据 lock 文件（package-lock.json）计算 key。**优先用 setup-* 的内置缓存**，需要定制才手写 actions/cache。判断一个依赖能不能缓存的原则：**内容由 lock 文件/requirements 文件唯一决定、且体积别太离谱**——锁文件是缓存 key 的最好依据。

## 其他几个高频官方 Action

把日常最常用的几个列一下，用前明白它们是干什么的：

**actions/checkout**——拉代码。几乎每个 workflow 的第一步。可以指定分支、fetch 深度：

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0      # 拉全量历史（打版本号、看 diff 需要）
```

**actions/setup-python / setup-node / setup-java**——装语言运行时，配合版本号和缓存。

**actions/upload-artifact / download-artifact**——job 之间或 workflow 结束后传递文件（测试报告、构建产物）：

```yaml
- name: 上传测试报告
  if: always()                      # 测试失败也要上传，方便看报告
  uses: actions/upload-artifact@v4
  with:
    name: test-report
    path: reports/
```

**actions/configure-pages**、**actions/deploy-pages**——配合 GitHub Pages 部署（本系列最后一篇实战会用到）。

## 用第三方 Action 前先看三点

GitHub Marketplace 上有海量第三方 Action，用起来确实方便，但**它本质是别人写的代码，会在你的 CI 环境里执行**。安全三查：

1. **看 Star 和维护状态**——长期不更新的高风险 Action 别用；
2. **看它请求什么权限**——`permissions` 声明过大（比如要整个仓库写权限）的要警惕；
3. **尽量锁版本（@v4 精确到 commit SHA 更稳）**——tag 可以被上游改动，生产项目可考虑用 commit SHA 引用。

判断不了就直接用官方 Actions，官方没有才求助于第三方，这是 CI 安全的基本原则。另外，**workflow 需要的最小权限原则**也在这里适用：

```yaml
permissions:
  contents: read        # 默认只读，需要写权限的操作再单独放开
```

## 小结

缓存是 CI 提速的第一杠杆：用 setup-* 内置缓存或 actions/cache 把依赖按锁文件缓存，命中后从几分钟降到几十秒。高频 Action 记住 checkout/setup-*/artifact 这几个就够起步。下一篇处理 CI/CD 里最敏感的一块：密钥怎么管、测试环境和生产环境的部署怎么区分——Secrets 用错一次，密钥就进日志了。
