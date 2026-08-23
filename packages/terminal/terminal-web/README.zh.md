# @deepseek-ai/dsh-terminal-web

[English](README.md) | 中文

面向浏览器交互式 PTY session 的 Host 服务。`TerminalWebService` 通过带类型的 Remote method 提供创建、写入、resize、signal、重命名、读取 scrollback、列出和关闭终端 session 的能力。每个 session 由调用方 Agent 所有，并在该 Agent dispose 时清理。

本服务注入 `subprocess` 和 `sandboxPolicy`。subprocess provider 负责 PTY 分配和进程树终止；本服务负责面向浏览器的 scrollback、事件转发和 Agent 授权。生成的 `./remote` 和 `./types` 导出由应用的 Remote 组合和浏览器 UI 消费。

本服务有意不消费 `ctx.terminals`。该 registry 的 `TerminalBackendSession` 契约面向模型工具，提供带提示符感知的行式交互；本服务则必须为浏览器终端保留原始 ANSI 输出、任意输入序列、resize 和输出游标。两个消费方共享中性的 `ctx.subprocess.spawnTerminal` 原语；未来若出现 raw-PTY registry，可以分别由各消费方适配，而无需把浏览器方法加入模型终端 seam。

## Model Experience

### Host service

#### What the model sees

无。`TerminalWebService` 是浏览器传输 capability，不贡献模型可见上下文。

#### Token effect

无；终端 I/O 不会向任何 provider request 增加 token。

#### KV Cache effect

无；终端 I/O 不会自动加入 provider context。

## Known Limitations and Deferred Work

- **Shell 启动目前依赖部署环境**：服务以 interactive flag 启动进程用户的 login shell。在出现中性的 raw-PTY registry 契约之前，shell 和 dialect 选择仍由本服务负责；面向模型的 `dsh-terminal` backend registry 有意保持独立。
- **Session 只在进程内存在**：Harness 进程退出后 PTY 和 scrollback 会消失。
- **Scrollback 有界**：保留的输出有上限，长时间运行的 session 可能被截断。
