# @deepseek-ai/dsh-client-ui-file-explorer

[English](README.md) | 中文

工作区文件树、Git 状态、文件预览与 Git 历史的浏览器 UI 插件。本插件通过 Client slot 系统贡献 `details` 条目及其 session 级 `file-explorer.overlay` 子条目。它消费 `ctx.remote.fileExplorer` 获取 Host 数据，并消费由 layout 所有的 `surfaceCoordinator` 处理浮层的全局收起与展开。本插件不依赖终端 UI 插件。

Node 半侧是空的 Loader 条目；浏览器半侧通过 `dsh.client` 清单和 `./client` 导出发现。本插件在 entry-local store 中持有展示状态，并随 Cordis fiber 释放所有 slot 注册与订阅。

## Model Experience

### 浏览器展示

#### What the model sees

无。文件浏览器是浏览器展示面；`ctx.remote.fileExplorer` 不贡献模型可见上下文。

#### Token effect

无；文件浏览不会向任何 provider request 增加 token。

#### KV Cache effect

无；文件浏览和 Git 检查不会改变 provider request。

## Known Limitations and Deferred Work

- **Remote 装配仍是显式的**：应用的 `api-remotes` 组合必须先选择 `fileExplorer`，本 UI 插件才能调用它。
- **Git 面只读**：UI 展示状态和 diff，但不会 stage、discard、commit 或修改仓库。
- **仅支持文本预览**：二进制文件和超过 Host 预览上限的文件不会作为可编辑文档渲染。
