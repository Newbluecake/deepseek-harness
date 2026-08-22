# Agent Note：跨会话终端 Dock —— 全局发现，属主作用域访问

Status: implemented

[English](2026-08-22-cross-session-terminal-dock.md) | 中文

## Problem

交互式浏览器终端从端到端都被会话作用域绑定。Host 侧 `TerminalWebService` 把每个 PTY 按其属主 `Agent` 建立索引，它的 `list` Remote 只返回调用会话自己的终端，而 Web 客户端停靠的是单一底部面板，其标签页列表只列出当前会话的终端。当同时打开多个会话时，用户必须记住是哪个会话创建了某个终端，先切换到该会话、再打开它的面板，才能找到并重新挂接这个终端。

## Decision

Web 客户端现在渲染一个全局终端 Dock：固定在右下角、macOS 风格的图标，带实时数量角标，一个列出所有会话中每个存活终端的弹出列表（名称、工作目录、运行状态、属主会话标签），并且每个打开的终端对应一个可拖动、可缩放、可最小化/最大化的浮动窗口。

Host 侧 `TerminalWebService` 新增一个 root 作用域的 `listAll` Remote —— 不带线缆身份，因此 Dock 在没有当前会话时也能列出 —— 按全局创建顺序返回所有存活会话，同时 `TerminalWebSessionInfo` 新增 `ownerSessionId` 字段，携带属主 Agent 的 `SessionId`。read/write/signal/kill/rename 仍保持 agent 作用域，并以终端的属主会话寻址，因此用户可以打开并操作另一个会话的终端而无需切换会话；Host 的 `expectOwned` 检查保持不变，仍强制执行属主作用域访问。

窗口几何与叠放顺序是条目本地呈现状态，刻意不持久化：刷新后 Host 的 PTY 仍然存活，但不会自动恢复浮动窗口。Dock 按升序叠放顺序渲染窗口且不设置 z-index，因此 DOM 顺序让最近获得焦点的窗口绘制在最上层；Dock 图标、背板与弹出列表使用一组固定的 z-index 阶梯，位于窗口之上。

## Alternatives considered

**用整页 Terminal Hub（管理视图）代替 Dock。** 被否决，倾向 Dock：最常见的交互是快速重新挂接，弹出列表恰好承载高频操作（打开、新建、重命名、移除）；若批量操作日后有必要，可再补充管理页。

**让终端彻底脱离属主会话（成为独立的 workspace 资源）。** 被否决：这会迫使在权限、关闭策略与删除语义上过早做决定。保留属主会话归属、同时增加全局发现，是更小且可逆的一步，也保留了既有的 Agent 销毁清理。

**持久化窗口位置并在刷新时自动恢复。** 被否决：自动恢复浮动窗口会在进入页面时遮挡界面。终端保留，窗口按需从 Dock 重新打开。

## Consequences

发现是全局的，而挂接是按会话的：Dock 列出所有终端，但每个操作仍解析属主身份，因此跨会话复用无需放宽 Host 的属主检查。列出不需要当前会话，只有新建需要一个（Dock 在当前会话中新建）。两个入口切换 Dock —— Dock 图标与既有的文件浏览器侧栏 Terminal 按钮 —— 二者驱动同一个 `TerminalPanelController`。
