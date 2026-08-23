# Agent Note: Web 文件浏览器语言图标改用 Devicon

Status: implemented

[English](2026-08-23-web-file-explorer-devicon.md) | 中文

## Problem

工作区文件列表用 `react-icons`（`si` Simple Icons 加上 `di` Devicon 快照）渲染每种语言的文件类型图标。`di` 集合是 Devicon 的极老快照，缺少 TypeScript、C++、Kotlin、C#、YAML 以及文件树识别的其他多种类型，因此两套集合风格混杂，若干类型退回到不一致的单色品牌色。

## Decision

文件浏览器现在用 Devicon `*-original` 图标渲染已识别的文件类型，这些图标从官方 `devicon@2.17.0` npm 包（MIT）生成，内联到 `packages/client/ui-file-explorer/src/client/devicons.tsx` 作为 React 组件。21 种类型映射到 Devicon originals（JavaScript、TypeScript、Python、Java、Go、Rust、C、C++、C#、Ruby、PHP、Swift、Kotlin、HTML5、CSS3、JSON、Markdown、YAML、Bash、PostgreSQL、Docker）；TOML 因 Devicon 没有对应图标，回退到现有的缩写文字徽标。每个内联图标保留上游品牌色并接受 `{ size }` 属性；这些组件可 tree-shaking，且只在包内使用。

内联 vendoring 取代了 `react-icons` 依赖，后者已从包清单中移除。它是工作区内 `react-icons` 的唯一使用者。

## Alternatives considered

**保留 `react-icons/di`，把其余类型重新映射到 Simple Icons。** 无需新增 vendored 源码，但 Devicon 部分停留在旧快照，两套集合依旧混用字形风格。

**依赖 `@devicon/react`。** 它以组件形式提供完整集合，但它是 CommonJS（`require("react")`）且不是 `"type": "module"`，违反本仓库的 ESM 全程约定，而且是一个无人维护的社区封装（v0.0.3）。

**依赖 `devicon` npm 包并在构建期引入 SVG。** 图标保持上游来源，但需要在客户端构建中新增 `.svg` 模块处理和类型声明，相比内联 21 个字形没有实际收益。

## Consequences

文件类型字形统一为当前完整的 Devicon originals，并覆盖文件树识别的除 TOML 之外的全部类型。包不再依赖 `react-icons`；`THIRD_PARTY_NOTICES.md` 和 `pnpm-lock.yaml` 反映了这一移除。重新生成 vendored 模块意味着针对更新的 `devicon` tarball 重跑转换脚本，而不是手工编辑路径数据。
