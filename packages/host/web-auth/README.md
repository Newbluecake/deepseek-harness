# `@deepseek-ai/dsh-host-web-auth`

English | [中文](README.zh.md)

Password login for the Web surface: a function plugin that claims the [webserver](../webserver/README.md)'s single admission seat, so an unauthenticated request reaches neither the SPA dist, nor `/api`, nor a WebSocket upgrade. A browser navigation receives a self-contained login page (401); anything else receives `401 authentication required` as plain text, because rendering HTML into a `fetch` or an `<img>` would only corrupt what the caller expected. The page is served by this package rather than routed through the SPA — an unauthenticated visitor never receives the frontend at all.

Mounting this row is what makes serving beyond loopback defensible. It does not itself widen the bind: reachability remains the webserver config's `host`, and [`dsh-web-app`](../../bundle/web-app/README.md)'s `web-startup` row refuses `--host 0.0.0.0` until its own `allowNonLoopbackHost` is set. The relation holds in the other direction too: a `0.0.0.0` bind whose admission seat no row has claimed is refused by the webserver with 503, so a usable remote deployment needs both switches together.

## Enable remote access

Add these overrides to the Web profile's `cordis.patch.yml` (or the home-level `$DSH_HOME/cordis.patch.yml`). A patch replaces the target row's whole `config`, so the `web-auth` block deliberately restates every key:

```yaml
- id: web-startup
  config:
    allowNonLoopbackHost: true

- id: web-auth
  disabled: false
  config:
    passwordRef: DSH_WEB_PASSWORD
    sessionTtlSeconds: 604800
    maxAttempts: 10
    attemptWindowSeconds: 300
```

Set `DSH_WEB_PASSWORD` through the credential store, then start the profile with `dsh web --host 0.0.0.0`. Put TLS in front before exposing it outside a trusted private network. `dsh --profile web --dump-config` shows the final tree when another overlay may be overriding either row.

## The password

The shared password is a [credential](../../credentials/credentials/README.md) reference (`passwordRef`, default `DSH_WEB_PASSWORD`), so it lives wherever this deployment keeps its other secrets — `.credentials.yaml`, `.env`, or the environment — and rotates without a code change. A malformed reference name fails the load. An unconfigured password refuses every request and answers each login attempt 503: a misconfigured deployment is shut, never open.

Comparison is constant-time, and failed attempts are counted per client address (`maxAttempts` per `attemptWindowSeconds`, default 10 per 5 minutes). A filled window answers 429 and refuses even the correct password, which is what makes an unattended guessing script unprofitable. Windows are keyed by the address the transport reports, so they separate attackers only while those addresses are distinct.

## Sessions and the `webAuth` service

A correct password mints an opaque 32-byte session and returns it as a cookie that is always `HttpOnly`, `SameSite=Strict`, and `Path=/`, plus `Secure` whenever the request arrived over TLS. Sessions are process-local and carry no identity beyond "someone knew the password", so nothing is persisted and a restart invalidates every one of them — the desired property for a credential an operator rotates by editing configuration. `/__auth/logout` revokes server-side, so a captured cookie stops working rather than merely being cleared in one browser.

This package provides `webAuth`, whose single method answers whether a request carries a live session. [`dsh-client-connection`](../../client/connection/README.md) reads it optionally: an authenticated request satisfies the `/api` Host fence without a declared `trustedHosts` authority, because a session cookie is origin-bound and a DNS-rebound page can never present one. The cross-site and Origin fences still apply — a session answers "is this host ours", never "who initiated this fetch". With this row mounted, `allowAuthenticatedPrivilegedMethods` (default on) also decides whether an authenticated caller reaches the configuration plane.

The post-login target (`next`) is resolved with the WHATWG URL parser against a fixed private base and accepted only when it lands on that same origin, because prefix inspection does not agree with a browser: `/\evil.com` and a tab-split `/<tab>/evil.com` both begin with a single `/` yet resolve off-site. The re-emitted value is checked as well, since `/..//evil.com` normalizes to the protocol-relative path `//evil.com`. Anything else becomes the site root, so the login form cannot be turned into an open redirect.

## TLS

Out of scope by design: terminate TLS at a reverse proxy or tunnel. The cookie takes its `Secure` attribute from `X-Forwarded-Proto`, so a correctly configured proxy needs nothing further here. Trusting that header is safe in the one direction it is used — a forged value can only add `Secure`, which a spoofing client harms only itself by triggering. **Without TLS the password and the session cookie cross the network in the clear.**

## Model Experience

None, as the package gates browser HTTP and contributes no prompt section, tool, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One shared password, no accounts** — every visitor who knows it is the same anonymous principal, so the session log cannot attribute work to a person and there is no per-user revocation. Multi-user identity would need a user store, and the session log would need an actor concept it does not have.
- **Sessions do not survive a restart** — deliberate for a process-local secret, but every browser must log in again after an upgrade or a crash.
- **The attempt limiter is process-local and address-keyed, so behind a reverse proxy one attacker locks everyone out** — every visitor then arrives from the proxy's address and shares a single window, and `maxAttempts` failures deny logins deployment-wide until the window elapses. Reading a forwarded-address header instead is not offered, because that value is attacker-controlled and trusting it would let one client mint unlimited windows and remove the limit. Give the harness distinct source addresses when per-visitor limiting matters. A distributed guesser still gets `maxAttempts` per source, so the limiter raises the cost of guessing without substituting for a strong password.
- **No CSRF token on the login form** — the `SameSite=Strict` session cookie and the `/api` fence cover the authenticated surface, but a cross-site POST can still submit a login attempt (which only consumes the attacker's own rate-limit budget).
