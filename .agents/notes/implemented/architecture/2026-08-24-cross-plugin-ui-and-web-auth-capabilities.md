# Agent Note: Cross-plugin UI coordination and Web authentication contracts

Status: implemented

English | [中文](2026-08-24-cross-plugin-ui-and-web-auth-capabilities.zh.md)

## Problem

Browser feature plugins need to coordinate floating surfaces, and the Web connection must recognize authenticated requests. Letting one feature consume another feature's internal controller makes the feature unavailable when that sibling is omitted or replaced. Letting the connection package import a password-login implementation makes alternate authentication Providers depend on that implementation's package.

## Decision

`ui-layout` owns the neutral `surfaceCoordinator` service. Floating-surface plugins subscribe to its collapse and expand notifications, while the plugin that owns a surface remains responsible for its own state and teardown. `ui-file-explorer` no longer consumes `terminalPanel` or imports the terminal UI package; its navigation rail owns only file and Git actions. `ui-terminal` keeps its terminal panel controller private to the terminal surface and consumes `surfaceCoordinator` for global actions.

`host-webserver` declares the neutral `WebAuthHandle` contract and its `ctx.webAuth` Context type. Authentication implementations provide that service; `client-connection` consumes the contract through `host-webserver` and does not depend on the password-login package. `host-web-auth` remains the shipped password Provider and the sole owner of the WebServer admission gate in the default Web composition.

The Client Remote list remains an explicit `api-remotes` application allowlist. Remote selection is a build-time and security decision, so this change does not introduce automatic discovery.

## Alternatives considered

**Let `ui-file-explorer` read `terminalPanel` with `ctx.get()`.** This hides the dependency from the injection list but leaves the feature pending or partially functional when the terminal plugin is absent. The shared coordinator names the actual cross-feature need instead.

**Make every feature create its own collapse service.** Separate buses cannot coordinate global shortcuts and add duplicate lifecycle state. One layout-owned service provides one notification source while each consumer keeps its own state.

**Make `client-connection` depend on `host-web-auth` as an optional implementation.** This couples a transport consumer to password sessions and forces alternate authentication Providers to reproduce an implementation package dependency. The contract belongs to the Web host capability, while password login remains replaceable.

**Auto-discover every Remote contribution.** This would weaken the explicit Client allowlist and require new build-time module and declaration generation rules. The existing explicit assembly is retained until an external Remote extension requirement justifies that larger design.

## Consequences

File explorer and terminal UI can now be mounted, replaced, or disabled independently, provided the shared layout surface is present. Authentication Providers can be replaced without changing the connection package. The default Web composition still has one final admission policy and an explicit Remote roster. The browser terminal Host service still owns its current shell-specific PTY implementation; reusing the `dsh-terminal` backend registry remains deferred and documented by that package.
