---
title: Spring Boot：约定大于配置的 Java 后端
date: 2023-06-15
categories:
  - [后端服务, Spring Boot]
tags: [Spring Boot, 后端]
description: Spring Boot：约定大于配置的 Java 后端
abbrlink: 2337521295
---

自动配置 + 起步依赖，省掉大量 XML 和样板代码。

1. Controller 接 HTTP，Service 写业务，Repository 管数据，分层清晰。
2. 依赖注入优先用构造器注入，单元测试更好写。
3. 打包成可执行 jar，一个进程就能启动整个服务。
4. 约定大于配置，默认值够用，特殊场景再显式覆盖。
