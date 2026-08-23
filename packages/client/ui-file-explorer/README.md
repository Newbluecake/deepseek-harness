# @deepseek-ai/dsh-client-ui-file-explorer

English | [中文](README.zh.md)

Browser UI plugin for the workspace file tree, Git status, file preview, and Git history. The plugin contributes the `details` entry and its session-scoped `file-explorer.overlay` child entries through the client slot system. It consumes `ctx.remote.fileExplorer` for Host data and the layout-owned `surfaceCoordinator` for global floating-surface collapse and expansion. It does not depend on the terminal UI plugin.

The node half is an empty Loader entry; the browser half is discovered through the `dsh.client` manifest and the `./client` export. The plugin owns presentation state in an entry-local store and removes all slot registrations and subscriptions with its Cordis fiber.

## Model Experience

### Browser presentation

#### What the model sees

None. The file explorer is a browser presentation surface; `ctx.remote.fileExplorer` contributes no model-visible context.

#### Token effect

None; file browsing does not add tokens to any provider request.

#### KV Cache effect

None; file browsing and Git inspection do not change provider requests.

## Known Limitations and Deferred Work

- **Remote assembly is explicit** — `fileExplorer` must be selected by the application's `api-remotes` composition before this UI plugin can call it.
- **Read-only Git surface** — the UI lists status and diffs but does not stage, discard, commit, or mutate repository state.
- **Text preview only** — binary files and files above the Host preview bound are not rendered as editable documents.
