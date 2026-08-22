/**
 * The login page served to unauthenticated visitors.
 *
 * Self-contained markup with no script imports and no dependency on the built
 * frontend dist: an unauthenticated visitor must not receive the SPA at all,
 * so the login page cannot be one of its routes.
 * @module @deepseek-ai/dsh-host-web-auth/login-page
 */

/** Escape text for interpolation into an HTML attribute or text node. */
function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }
  return text.replace(/[&<>"']/gu, character => entities[character] as string)
}

/**
 * Render the login page.
 * @param options - the post-login redirect target and an optional error to show.
 * @returns a complete HTML document.
 */
export function renderLoginPage(options: { next: string; error?: string }): string {
  const error = options.error === undefined
    ? ''
    : `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>登录 · DeepSeek Harness</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    background: #f6f7f9; color: #1a1a1a;
  }
  main {
    width: min(360px, calc(100vw - 48px)); padding: 32px;
    background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06);
  }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  p.hint { margin: 0 0 24px; color: #6b7280; font-size: 13px; }
  label { display: block; margin-bottom: 8px; font-weight: 500; }
  input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit;
    border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: inherit;
  }
  input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
  button {
    margin-top: 16px; width: 100%; padding: 10px 12px; font: inherit; font-weight: 500;
    color: #fff; background: #2563eb; border: 0; border-radius: 8px; cursor: pointer;
  }
  button:hover { background: #1d4ed8; }
  p.error {
    margin: 0 0 16px; padding: 10px 12px; font-size: 13px;
    color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0d10; color: #e5e7eb; }
    main { background: #15181d; box-shadow: none; border: 1px solid #262b33; }
    p.hint { color: #9ca3af; }
    input { background: #0b0d10; border-color: #363c46; color: inherit; }
    p.error { color: #fca5a5; background: #2a1416; border-color: #5b2326; }
  }
</style>
</head>
<body>
<main>
  <h1>DeepSeek Harness</h1>
  <p class="hint">此实例需要口令才能访问。</p>
  ${error}
  <form method="POST" action="/__auth/login">
    <input type="hidden" name="next" value="${escapeHtml(options.next)}">
    <label for="password">访问口令</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <button type="submit">登录</button>
  </form>
</main>
</body>
</html>
`
}
