# @deepseek-ai/dsh-client-ui-terminal

English | [中文](README.zh.md)

Browser UI plugin for the cross-session terminal Dock and draggable terminal windows. The plugin registers into the root `shell.overlay` slot, consumes `ctx.remote.terminalWeb`, and uses the layout-owned `surfaceCoordinator` for global surface collapse and expansion. Terminal panel state and window geometry live in an entry-local store; Host PTY sessions remain owned by the terminal service.

The node half is an empty Loader entry; the browser half is discovered through the `dsh.client` manifest and the `./client` export. The terminal UI no longer provides a coordination service consumed by the file explorer.

## Model Experience

### Browser presentation

#### What the model sees

None. The terminal Dock is a browser surface; `ctx.remote.terminalWeb` contributes no model-visible context.

#### Token effect

None; terminal UI activity does not add tokens to any provider request.

#### KV Cache effect

None; terminal input and output are not added to provider context by this UI plugin.

## Known Limitations and Deferred Work

- **Remote assembly is explicit** — `terminalWeb` must be selected by the application's `api-remotes` composition.
- **Host implementation is shell-oriented** — the current Host service starts the deployment user's login shell; backend selection and full-screen terminal semantics remain future work.
- **Sessions are process-local** — terminal windows do not survive Harness process exit.
