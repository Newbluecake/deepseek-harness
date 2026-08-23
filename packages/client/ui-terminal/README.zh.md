# @deepseek-ai/dsh-client-ui-terminal

[English](README.md) | 中文

跨 session 终端 Dock 与可拖动终端窗口的浏览器 UI 插件。本插件注册到 root 级 `shell.overlay` slot，消费 `ctx.remote.terminalWeb`，并使用由 layout 所有的 `surfaceCoordinator` 处理浮层的全局收起与展开。终端面板状态和窗口几何保存在 entry-local store 中；Host PTY session 仍由终端服务所有。

Node 半侧是空的 Loader 条目；浏览器半侧通过 `dsh.client` 清单和 `./client` 导出发现。终端 UI 不再提供供文件浏览器消费的协调服务。

## Model Experience

### 浏览器展示

#### What the model sees

无。终端 Dock 是浏览器界面；`ctx.remote.terminalWeb` 不贡献模型可见上下文。

#### Token effect

无；终端 UI 操作不会向任何 provider request 增加 token。

#### KV Cache effect

无；终端输入和输出不会由本 UI 插件加入 provider context。

## Known Limitations and Deferred Work

- **Remote 装配仍是显式的**：应用的 `api-remotes` 组合必须先选择 `terminalWeb`。
- **Host 实现面向 shell**：当前 Host 服务启动部署用户的 login shell；backend 选择和完整的全屏终端语义仍待后续拆分。
- **Session 只在进程内存在**：Harness 进程退出后终端窗口不会保留。
