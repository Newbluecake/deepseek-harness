# Agent Note: Keep browser PTY sessions separate from the model terminal registry

Status: implemented

[English](2026-08-24-terminal-web-raw-pty-contract.md) | 中文

## Problem

浏览器终端与面向模型的终端虽然使用同一个 PTY 基础设施，但它们的会话契约不同。面向模型的 registry 提供带提示符感知的 send、有界行式读取、前台信号结果和由后端负责的就绪检测。浏览器需要原始 ANSI 输出、任意输入序列、调整尺寸、输出序列游标和实时事件转发。

## Decision

`terminal-web` 保留自己的 Agent 作用域会话 registry，直接消费 `ctx.subprocess.spawnTerminal`。subprocess 的 terminal 原语继续作为共享的提供方 seam，负责终端分配、前台进程组信号、调整尺寸和等待进程树完全退出。

`ctx.terminals` 继续负责面向模型的 `TerminalBackendSession` 契约。`terminal-web` 不在其中注册浏览器会话，`terminal-bash` 也不作为浏览器提供方使用。模型后端会安装受控提示符并清理面向模型的输出；将这类会话用于 xterm.js 会改变浏览器需要的原始终端协议。

## Alternatives considered

**将浏览器会话注册到 `ctx.terminals`。** 现有 registry 无法在不削弱面向模型的后端契约的情况下提供原始输出、任意写入、调整尺寸或事件游标；如果增加这些能力，就会把浏览器传输要求加入模型终端契约。

**向 `TerminalBackendSession` 增加浏览器原始方法。** 这会让模型执行 seam 依赖浏览器传输要求，并迫使每个模型后端处理原始事件转发，即使它只支持带提示符感知的交互。

**在新的浏览器专用 substrate 中重复终端分配。** 浏览器服务已经使用中性的 `ctx.subprocess.spawnTerminal` 原语，因此第二套 PTY provider 只会重复进程树、信号和平台清理逻辑，无法消除契约差异。

## Consequences

模型终端会话与浏览器终端会话拥有独立的身份、registry 和所有者清理流程。部署可以替换模型终端后端而不改变浏览器终端行为，也可以替换 subprocess terminal 提供方而不改变任一消费方的会话协议。在独立的 raw-PTY registry 契约出现之前，浏览器终端的 shell 与方言选择仍由浏览器服务负责。

只有在中性的 raw-PTY 会话契约独立规定字节传输、任意写入、调整尺寸、前台信号、输出游标和等待完成的清理后，才重新评估共享；届时面向模型的 registry 可以适配该契约，而不承担浏览器职责。
