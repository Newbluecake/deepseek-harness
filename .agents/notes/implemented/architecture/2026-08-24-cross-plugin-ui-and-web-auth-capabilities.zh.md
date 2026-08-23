# Agent Note: 跨插件 UI 协作与 Web 认证 contract

Status: implemented

[English](2026-08-24-cross-plugin-ui-and-web-auth-capabilities.md) | 中文

## Problem

浏览器 feature plugin 需要协作控制浮层，Web connection 需要识别已认证请求。如果一个 feature 消费另一个 feature 的内部 controller，那么省略或替换 sibling 后，该 feature 就无法使用。如果 connection 包导入口令登录实现，那么替代认证 Provider 就会依赖这个具体实现包。

## Decision

`ui-layout` 所有中性的 `surfaceCoordinator` service。浮层插件订阅它的收起与展开通知，各个浮层仍由自己的插件负责状态和资源释放。`ui-file-explorer` 不再消费 `terminalPanel`，也不再导入终端 UI 包；它的导航栏只负责文件与 Git 操作。`ui-terminal` 保留只属于终端界面的 terminal panel controller，并消费 `surfaceCoordinator` 处理全局操作。

`host-webserver` 声明中性的 `WebAuthHandle` contract 及其 `ctx.webAuth` Context 类型。认证实现提供该 service；`client-connection` 通过 `host-webserver` 消费这个 contract，不依赖口令登录包。`host-web-auth` 仍是 Web 组合中的口令 Provider，也是默认组合里 WebServer 准入 gate 的唯一所有者。

Client Remote 列表仍是显式的 `api-remotes` 应用 allowlist。Remote 选择同时是构建期和安全决策，因此本次变更不引入自动发现。

## Alternatives considered

**让 `ui-file-explorer` 通过 `ctx.get()` 读取 `terminalPanel`。** 这会把依赖从注入列表中隐藏，但终端插件缺席时，文件 feature 仍会 pending 或只能部分工作。共享 coordinator 直接命名了真正的跨 feature 需求。

**让每个 feature 创建自己的收起 service。** 分离的 bus 无法协调全局快捷键，还会增加重复的生命周期状态。一个由 layout 所有的 service 提供单一通知源，而每个消费方保留自己的状态。

**让 `client-connection` 可选依赖 `host-web-auth` 实现。** 这会把传输消费方绑定到口令 session，并要求其他认证 Provider 复现实现包依赖。contract 属于 Web host capability，口令登录仍保持可替换。

**自动发现所有 Remote contribution。** 这会削弱显式 Client allowlist，并要求新增构建期模块与声明生成规则。除非出现外部 Remote 扩展需求，否则保留现有显式装配。

## Consequences

只要共享的 layout surface 存在，文件浏览器和终端 UI 就可以独立挂载、替换或关闭。替换认证 Provider 不再需要修改 connection 包。默认 Web 组合仍使用一个最终准入策略和显式 Remote roster。浏览器终端 Host service 仍持有当前面向 shell 的 PTY 实现；复用 `dsh-terminal` backend registry 的工作仍 deferred，并已在该包文档中说明。
