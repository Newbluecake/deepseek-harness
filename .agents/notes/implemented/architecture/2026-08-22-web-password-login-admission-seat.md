# Agent Note: Password login as one admission seat in front of the whole Web surface

Status: implemented

English | [中文](2026-08-22-web-password-login-admission-seat.zh.md)

## Problem

The Web GUI was reachable from loopback only, and deliberately so: `dsh web --host 0.0.0.0` was refused outright because the surface drives an agent that runs shell commands, so an open bind publishes remote code execution to the network. That left an operator who genuinely wants to reach their own harness from another machine with no supported answer at all — only an SSH tunnel, or editing the refusal out of the source.

The obvious-looking fix is wrong twice over. Loosening the bind refusal alone publishes an unauthenticated agent. Adding a login check to the `/api` routes alone protects the RPC surface while still serving the SPA, the plugin bundles, and the HMR stream to anonymous visitors — and leaves the next route to be added unprotected by default, which is exactly the per-route trailing-guard failure that [the `/api` browser-trust boundary](2026-07-28-api-browser-trust-boundary.md) already rejected once.

A second problem sits underneath. `trustedHosts` and `--trusted-host` look like access control but are not: they are a DNS-rebinding fence, answering only "is this Host one we serve", never "who is calling". That is why the privileged method set — the whole settings/credentials/preset configuration plane — was pinned to loopback even for a declared authority. A remote operator therefore could not have reached their own configuration plane even if the bind were opened.

## Decision

Add one admission seat to the webserver, and one plugin that claims it.

- **Seat (dsh-host-webserver, `registerGate`)**: a single-owner registration consulted before route matching, before the fallback, and before every upgrade. The webserver is the only layer that sees all three at once, so it is the only place an admission decision covering the whole site can actually be enforced. The `http` arm returns `false` to mean it answered and owns the response; the `upgrade` arm only decides, and a refusal destroys the socket, there being nothing to write once a client has asked to switch protocols. A gate that throws is contained like any handler failure and refuses the request: a broken policy fails closed. An unclaimed seat serves every request on a loopback bind, so the default composition is unchanged; on a `0.0.0.0` bind an unclaimed seat instead refuses every request with 503 and destroys every upgrade, because a published server with no admission owner would serve remote code execution to the network. The seat is re-read per request, so claiming it opens that server and disposing the registration closes it again.

- **Gate (dsh-host-web-auth)**: one shared password resolved through the credentials seam (`passwordRef`, default `DSH_WEB_PASSWORD`), compared in constant time, rate-limited per client address. Success mints an opaque process-local session returned as an `HttpOnly; SameSite=Strict` cookie that gains `Secure` from `X-Forwarded-Proto`. An unconfigured password refuses every request, so mounting the row can never accidentally serve open. A browser navigation gets a self-contained login page emitted by this package — not an SPA route, because "unauthenticated sees nothing" means the dist is never served to an anonymous visitor; everything else gets `401` as plain text, since HTML rendered into a `fetch` only corrupts what the caller expected.

- **The session satisfies the Host fence.** `isTrustedApiRequest` gains an `authenticated` argument: a request carrying a live session passes the Host check without a declared `trustedHosts` authority. This is sound rather than a concession, and for a specific reason: a session cookie is origin-bound. A DNS-rebound page reaches our socket while carrying `Host: evil.example`, so the browser sends evil.example's cookies and can never present ours. Presenting a session is therefore itself proof that the request was not rebound — the exact property `trustedHosts` was introduced to establish. The cross-site and `Origin` comparisons are unaffected and still apply, because a session says which host is ours and never who initiated the fetch.

- **Authenticated callers reach the privileged plane by default** (`allowAuthenticatedPrivilegedMethods`). Proving possession of the deployment password is the same authority an operator sitting at the loopback console already holds; withholding the configuration plane from them would protect nothing while making remote operation useless. A deployment that wants that plane to stay physically local sets it false, and with no authentication row mounted the loopback pin stands regardless.

- **The bind refusal becomes a composition permission** (`allowNonLoopbackHost` on the `web-startup` row, default false). The CLI parse phase cannot see whether an authentication row is mounted, so the permission is explicit rather than inferred. The shipped Web bundle keeps it false and ships `web-auth` disabled: loopback is still the default posture, and an operator opts into remote access by enabling both together. Because that flag is a declaration rather than a proof, the webserver enforces the same requirement where it is actually observable — at dispatch, against the live seat — so setting the flag while forgetting the row yields a refusing server rather than an open one.

- **The post-login target is resolved, not prefix-checked.** `next` goes through the WHATWG URL parser against a fixed private base and must land on that origin, because a browser and a prefix test disagree: `/\evil.com` and a tab-split `/<tab>/evil.com` start with a single `/` and still resolve off-site. The emitted value is re-checked because `/..//evil.com` normalizes to `//evil.com`, which is protocol-relative again.

TLS stays out of scope: terminate it at a reverse proxy or tunnel. Reading `X-Forwarded-Proto` is safe in the one direction it is used, since a forged value can only add the `Secure` attribute, which harms only the client that forged it.

## Alternatives considered

- **Per-user accounts.** Rejected for this change: a user store, credential rotation per user, and an actor concept in the session log are real product surface, and none of it is needed to answer "let my own operator in from another machine". The shared password is honestly a single anonymous principal, and the README says so.
- **Pre-shared token in a URL.** Rejected: a token in a link leaks through history, referrers, and shoulder-surfing, and it cannot be revoked without rotating it for everyone.
- **Gate only `/api`.** Rejected: it leaves the SPA, bundles, and HMR stream anonymous, and re-creates the per-route guard list that the browser-trust boundary decision removed.
- **Require `--trusted-host` in addition to login.** Rejected: it is ceremony that buys nothing. The rebinding property it establishes is already established, and more directly, by the cookie being origin-bound; requiring both would make every authenticated deployment carry a list it does not need.
- **Built-in TLS.** Rejected: certificate acquisition and renewal are a deployment concern with mature tools; duplicating them here would be worse than the proxy every such deployment already runs.

## Consequences

- Any future route, fallback, or upgrade is admitted or refused by construction; there is no per-route authentication decision left to forget.
- A deployment serving beyond loopback enables `web-auth`, sets `allowNonLoopbackHost`, and needs no `trustedHosts` entries. A loopback deployment is unchanged: no gate, no login prompt, no new configuration.
- Misconfiguring one half of that pair is visible immediately: a published bind with no admission row answers 503 everywhere instead of serving the SPA, which is a loud failure rather than a silent exposure.
- Sessions do not survive a restart, so every browser logs in again after an upgrade or crash. This is deliberate for a process-local secret that an operator rotates by editing configuration.
- The privileged-method pin is now conditional on the absence of authentication rather than absolute. Every client-side gate that guessed privilege from the page origin had to follow: settings durability is settled by the shared mirror's first `settings.describe` acting as a probe — a fence 403 settles the caller process-local, an answer means durable — because the server's fence is the only authority that knows whether this caller may write. [The `/api` browser-trust boundary note](2026-07-28-api-browser-trust-boundary.md) retains its media-type fence, its rebinding analysis, and its rejection of per-RPC guards; only its deferral of authentication and the loopback pin's unconditional phrasing are revised here.
- Without TLS in front, the password and session cookie cross the network in the clear. The README states this rather than pretending the cookie flags are sufficient.
