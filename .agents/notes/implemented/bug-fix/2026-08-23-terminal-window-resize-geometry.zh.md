# Agent Note: 终端窗口 resize 保留用户几何尺寸

Status: implemented

[English](2026-08-23-terminal-window-resize-geometry.md) | 中文

## Problem

浏览器终端窗口通过 `TerminalWindow` 中的指针几何计算调整尺寸，`TerminalView` 则让 xterm 适配新容器并同步 PTY 尺寸。原有的延迟行高调整也会在指针拖拽结束后修改浮动窗口高度。这个延迟调整可能覆盖向下拖拽设置的高度，使窗口向之前的高度恢复。xterm 原生 viewport 滚动条还会占据终端表面的右侧边缘。

## Decision

`TerminalWindow` 负责由指针拖拽和持久化终端 store 提供的完整浮动窗口几何尺寸。`TerminalView` 仅使用 `FitAddon` 和尺寸观察器适配模拟器，并以 debounce 方式同步 PTY 的 `cols`/`rows`；布局变化不再写回窗口几何尺寸。因此窗口会保留用户选定的精确高度，包括不落在整行边界上的高度。

xterm viewport 保留 `overflow-y: scroll`，因此滚动回看仍可用；同时使用 `scrollbar-width: none` 和 WebKit 滚动条规则，在支持的浏览器引擎中隐藏原生滚动条。

## Alternatives considered

**保留行高吸附，只在指针拖拽期间取消。** 不采用，因为延迟回调仍可能与拖拽结束竞争，而且吸附属于浮动窗口的展示策略，不属于终端传输尺寸同步。

**通过禁用 viewport 溢出来隐藏滚动条。** 不采用，因为这会移除终端回看内容的能力，而不是只改变滚动条的视觉表现。

**将滚动条设置为更窄或透明。** 不采用，因为终端表面要求右侧不出现可见滚动条，并且平台相关的滚动条样式仍可能保留或显示原生边缘。

## Consequences

用户可以直接控制浮动窗口尺寸，PTY 仍会收到适配这些尺寸后的 xterm 行列数。终端高度不再标准化到整行，因此最后一行下方可能保留少量空白区域。滚动回看仍可通过鼠标滚轮和键盘访问，但不会显示原生滚动条。

现有的各边和各角 resize 测试覆盖终端窗口几何行为。新增的 xterm 样式测试固定了滚动能力保留和原生滚动条隐藏这两个声明。
