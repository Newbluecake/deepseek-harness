# Agent Note: Web file explorer language icons move to Devicon

Status: implemented

English | [中文](2026-08-23-web-file-explorer-devicon.zh.md)

## Problem

The workspace file list rendered per-language file type glyphs from `react-icons` (`si` Simple Icons plus the `di` Devicon snapshot). The `di` set is a very old snapshot of Devicon that omits TypeScript, C++, Kotlin, C#, YAML, and several other kinds the file tree recognizes, so the two sets mixed styles and several kinds fell back to inconsistent monochrome brand colors.

## Decision

The file explorer now renders recognized file types with Devicon `*-original` glyphs, vendored inline into `packages/client/ui-file-explorer/src/client/devicons.tsx` as React components generated from the official `devicon@2.17.0` npm package (MIT). Twenty-one kinds map to Devicon originals (JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, Ruby, PHP, Swift, Kotlin, HTML5, CSS3, JSON, Markdown, YAML, Bash, PostgreSQL, Docker); TOML, which Devicon has no glyph for, falls through to the existing abbreviation text badge. Each vendored glyph keeps its upstream brand colors and takes a `{ size }` prop; the components are tree-shakeable and internal to the package.

Vendoring replaced the `react-icons` dependency, which is removed from the package manifest. It was the only workspace consumer of `react-icons`.

## Alternatives considered

**Keep `react-icons/di` and remap the remaining kinds onto Simple Icons.** No new vendored source, but the Devicon half stays frozen on an old snapshot and the two sets keep mixing glyph families.

**Depend on `@devicon/react`.** It ships the full set as components, but it is CommonJS (`require("react")`) and not `"type": "module"`, which violates the repo's ESM-everywhere rule, and it is an unmaintained community wrapper (v0.0.3).

**Depend on the `devicon` npm package and import SVGs at build time.** Keeps the icons upstream, but requires new `.svg` module handling and type declarations in the client build for no functional gain over inlining the 21 glyphs.

## Consequences

File type glyphs are consistent, current Devicon originals and cover every kind the tree recognizes except TOML. The package no longer depends on `react-icons`; `THIRD_PARTY_NOTICES.md` and `pnpm-lock.yaml` reflect that removal. Regenerating the vendored module means re-running the converter against a newer `devicon` tarball rather than editing path data by hand.
