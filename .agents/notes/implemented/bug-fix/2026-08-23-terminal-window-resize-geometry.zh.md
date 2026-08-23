# Agent Note: 终端窗口 resize 保留用户几何尺寸

Status: implemented

[English](2026-08-23-terminal-window-resize-geometry.md) | 中文

## Problem

浏览器终端窗口通过 `TerminalWindow` 中的指针几何计算调整尺寸，`TerminalView` 则让 xterm 适配新容器并同步 PTY 尺寸。原有的延迟行高调整也会在指针拖拽结束后修改浮动窗口高度。这个延迟调整可能覆盖向下拖拽设置的高度，使窗口向之前的高度恢复。xterm 原生 viewport 滚动条还会占据终端表面的右侧边缘，而且视觉样式没有和终端统一。

## Decision

`TerminalWindow` 负责由指针拖拽和持久化终端 store 提供的完整浮动窗口几何尺寸。`TerminalView` 仅使用 `FitAddon` 和尺寸观察器适配模拟器，并以 debounce 方式同步 PTY 的 `cols`/`rows`；布局变化不再写回窗口几何尺寸。因此窗口会保留用户选定的精确高度，包括不落在整行边界上的高度。

xterm viewport 保留 `overflow-y: scroll`，因此滚动回看仍可用。滚动条默认零宽且透明，鼠标悬停时扩展到 8px，viewport 正在滚动时也扩展显示。thumb 使用现有的 elevated scrollbar token，并在最后一次滚动事件 800ms 后移除活动状态。

## Alternatives considered

**保留行高吸附，只在指针拖拽期间取消。** 不采用，因为延迟回调仍可能与拖拽结束竞争，而且吸附属于浮动窗口的展示策略，不属于终端传输尺寸同步。

**通过禁用 viewport 溢出来隐藏滚动条。** 不采用，因为这会移除终端回看内容的能力，而不是只改变滚动条的视觉表现。

**使用全局滚动条的常规宽度。** 不采用，因为完整宽度的原生样式在黑色终端表面上过于突出。

**永久隐藏滚动条。** 不采用，因为用户会失去回看位置和鼠标滚动的可靠视觉提示。

## Consequences

用户可以直接控制浮动窗口尺寸，PTY 仍会收到适配这些尺寸后的 xterm 行列数。终端高度不再标准化到整行，因此最后一行下方可能保留少量空白区域。滚动回看仍可通过鼠标滚轮和键盘访问。鼠标未接近 viewport 且没有滚动时，滚动条保持低存在感；鼠标悬停或开始滚动后，会显示使用主题 token 的 8px thumb，便于鼠标操作。

现有的各边和各角 resize 测试覆盖终端窗口几何行为。新增的 xterm 样式测试固定了滚动能力保留、默认低存在感、hover 扩展和滚动中显示这几个行为。
