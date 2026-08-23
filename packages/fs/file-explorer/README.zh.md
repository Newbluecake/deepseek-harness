# @deepseek-ai/dsh-file-explorer

[English](README.md) | 中文

面向浏览器工作区检查的 Host file-explorer Service Definition 与实现。`FileExplorerService` 通过带类型的 Remote method 提供目录列表、有界 UTF-8 文本读取、Git 状态、文件 diff、Git 历史和仓库相对路径的文件名搜索。它读取调用方 Agent session 的工作区，不执行文件或 Git 修改。

本服务注入 `fs`、`shell` 和 `sandboxPolicy`，因此文件系统和命令执行仍是可替换的 capability。生成的 `./remote` 和 `./types` 导出由应用的 Remote 组合和浏览器 UI 消费。

## Model Experience

### Host service

#### What the model sees

无。`FileExplorerService` 由浏览器传输调用，不贡献模型可见上下文。

#### Token effect

无；文件检查不会向任何 provider request 增加 token。

#### KV Cache effect

无；文件检查不参与 provider request 构造。

## Known Limitations and Deferred Work

- **操作集只读**：不暴露写文件、stage、discard、commit 或其他 Git 修改。
- **预览和搜索有界**：文件内容、Git 输出、历史记录和文件名匹配数量受服务上限约束。
- **Remote 由应用选择**：只有应用的 `api-remotes` 组合挂载生成的 contribution 后，浏览器才能访问 Host 服务。
