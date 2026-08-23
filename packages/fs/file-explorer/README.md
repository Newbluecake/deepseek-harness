# @deepseek-ai/dsh-file-explorer

English | [中文](README.zh.md)

Host file-explorer Service Definition and implementation for browser workspace inspection. `FileExplorerService` provides directory listing, bounded UTF-8 text reads, Git status, file diffs, Git history, and repository-relative filename search through typed Remote methods. It reads the calling Agent session's workspace and performs no file or Git mutation.

The service injects `fs`, `shell`, and `sandboxPolicy`, so filesystem and command execution remain replaceable capabilities. The generated `./remote` and `./types` exports are consumed by the application Remote assembly and browser UI.

## Model Experience

### Host service

#### What the model sees

None. `FileExplorerService` is called by the browser transport and contributes no model-visible context.

#### Token effect

None; file inspection does not add tokens to any provider request.

#### KV Cache effect

None; file inspection is outside provider request construction.

## Known Limitations and Deferred Work

- **Read-only operation set** — no write, stage, discard, commit, or other Git mutation is exposed.
- **Bounded previews and search** — file content, Git output, history, and filename matches are capped by service limits.
- **Application-selected Remote** — the Host service is available to a browser only when the application's `api-remotes` assembly mounts its generated contribution.
