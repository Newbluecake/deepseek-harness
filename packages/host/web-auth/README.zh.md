# `@deepseek-ai/dsh-host-web-auth`

[English](README.md) | 中文

Web 界面的口令登录：一个函数插件，占据 [webserver](../webserver/README.zh.md) 唯一的准入座位，因此未认证请求既到不了 SPA 产物，也到不了 `/api`，更到不了 WebSocket 升级。浏览器导航收到一个自包含的登录页（401）；其余请求收到纯文本 `401 authentication required`——把 HTML 塞进 `fetch` 或 `<img>` 只会破坏调用方原本期待的内容。登录页由本包直接吐出，而不是走 SPA 路由：未认证访客根本拿不到前端资源。

挂载本行才使得 loopback 之外的服务变得站得住脚。它本身不放宽绑定：可达性仍由 webserver 配置的 `host` 决定，而 [`dsh-web-app`](../../bundle/web-app/README.zh.md) 的 `web-startup` 行在自己的 `allowNonLoopbackHost` 未开启前仍拒绝 `--host 0.0.0.0`。反过来也一样：绑定 `0.0.0.0` 却没有任何行占据准入座位时，webserver 会以 503 拒绝一切请求，因此这两个开关必须一起打开才能得到一个可用的远程部署。

## 开启远程访问

把下面这些覆盖写进 Web profile 的 `cordis.patch.yml`（或 home 级的 `$DSH_HOME/cordis.patch.yml`）。patch 会替换目标行的整个 `config`，因此 `web-auth` 这一段刻意重述了每一个键：

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

通过凭据存储设置 `DSH_WEB_PASSWORD`，然后以 `dsh web --host 0.0.0.0` 启动该 profile。在把它暴露到受信任的专用网络之外以前，请先在前方架好 TLS。当怀疑另一个 overlay 覆盖了这两行中的某一行时，用 `dsh --profile web --dump-config` 查看最终的树。

## 口令

共享口令是一个[凭据](../../credentials/credentials/README.zh.md)引用（`passwordRef`，默认 `DSH_WEB_PASSWORD`），因此它存放在本部署存放其他密钥的地方——`.credentials.yaml`、`.env` 或环境变量——并且无需改代码即可轮换。引用名不合法会导致加载失败。口令未配置时拒绝一切请求，并对每次登录尝试返回 503：配置错误的部署是关闭的，绝不会是敞开的。

比对为常数时间，失败尝试按客户端地址计数（每 `attemptWindowSeconds` 允许 `maxAttempts` 次，默认 5 分钟 10 次）。窗口填满后返回 429，连正确口令也一并拒绝——这正是让无人值守的猜解脚本无利可图的原因。窗口按传输层报告的地址计数，因此只有在这些地址彼此不同时才能区分攻击者。

## 会话与 `webAuth` 服务

口令正确会签发一个 32 字节的不透明会话，并以 Cookie 返回，该 Cookie 恒为 `HttpOnly`、`SameSite=Strict`、`Path=/`，并在请求经由 TLS 到达时附加 `Secure`。会话是进程内的，除"某人知道口令"之外不携带任何身份信息，因此不做持久化，重启即全部失效——对于一个靠改配置轮换的凭据而言，这正是我们想要的性质。`/__auth/logout` 在服务端吊销，因此被窃取的 Cookie 会真正失效，而不只是在某一个浏览器里被清掉。

本包提供 `webAuth` 服务，其唯一方法回答"该请求是否携带存活会话"。[`dsh-client-connection`](../../client/connection/README.zh.md) 以可选方式读取它：已认证请求无需声明 `trustedHosts` 权威即可通过 `/api` 的 Host 围栏，因为会话 Cookie 与源绑定，被 DNS 重绑定的页面永远拿不出它。跨站与 Origin 围栏依然生效——会话回答的是"这个 host 是不是我们的"，从不回答"这个 fetch 是谁发起的"。挂载本行后，`allowAuthenticatedPrivilegedMethods`（默认开启）进一步决定已认证调用方能否触及配置面。

登录后的跳转目标（`next`）由 WHATWG URL 解析器针对一个固定的私有基址解析，只有落在同一 origin 上才被接受——因为前缀检查与浏览器的判断并不一致：`/\evil.com` 与被制表符切开的 `/<tab>/evil.com` 都以单个 `/` 开头，却都会解析到站外。重新吐出的值同样要检查，因为 `/..//evil.com` 会归一化成协议相对路径 `//evil.com`。其余一切都退回站点根路径，因此登录表单无法被变成开放重定向。

## TLS

刻意不在范围内：请在反向代理或隧道处终止 TLS。Cookie 的 `Secure` 属性取自 `X-Forwarded-Proto`，因此正确配置的代理无需在此额外做任何事。在它被使用的这一个方向上信任该请求头是安全的——伪造的值只能添上 `Secure`，触发它只会损害伪造者自己。**没有 TLS 时，口令与会话 Cookie 以明文穿越网络。**

## 模型体验

无，因为本包只管浏览器 HTTP 准入，不贡献任何提示词片段、工具或会话事件。

#### KV 缓存影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与遗留工作

- **单一共享口令，没有账号** — 每个知道口令的访客都是同一个匿名主体，因此会话日志无法把工作归属到具体的人，也不存在按用户吊销。多用户身份需要一个用户存储，且会话日志需要一个它目前没有的 actor 概念。
- **会话不跨重启存活** — 对于进程内密钥这是刻意为之，但升级或崩溃后每个浏览器都需要重新登录。
- **尝试限流是进程内且按地址计数的，因此在反向代理之后，一个攻击者就能锁死所有人** — 此时所有访客都来自代理自己的地址，共用同一个窗口，`maxAttempts` 次失败会让整个部署在窗口结束前都无法登录。这里不提供改读转发地址头的选项，因为该值由攻击者控制，信任它会让单个客户端凭空造出无限多个窗口，等于取消限流。当需要按访客限流时，请让 Harness 拿到彼此不同的来源地址。分布式猜解方每个来源仍能拿到 `maxAttempts` 次，因此限流抬高了猜解成本，但不能替代一个强口令。
- **登录表单没有 CSRF token** — `SameSite=Strict` 的会话 Cookie 与 `/api` 围栏已覆盖已认证面，但跨站 POST 仍可提交一次登录尝试（而这只会消耗攻击者自己的限流额度）。
