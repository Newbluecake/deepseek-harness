/** Narrow host-boundary coverage that Node's real HTTP parser cannot produce. */

import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebGate, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { apply, type Config } from '../src/index.ts'

const CONFIG: Config = {
  passwordRef: 'DSH_WEB_PASSWORD',
  sessionTtlSeconds: 60,
  maxAttempts: 2,
  attemptWindowSeconds: 60,
}

let context: Context | undefined

afterEach(async () => {
  vi.useRealTimers()
  await context?.fiber.dispose()
  context = undefined
})

/** Mount the plugin around a recorded gate and a fixed credential. */
async function mounted(): Promise<{ ctx: Context; gate: WebGate; dispose: () => Promise<void> }> {
  const ctx = new Context()
  context = ctx
  let gate: WebGate | undefined
  ctx.provide('webServer', {
    registerGate(value: WebGate) { gate = value; return () => { gate = undefined } },
  } as WebServer)
  ctx.provide('credentials', {
    resolve: () => Promise.resolve({ value: 'secret', source: 'test' }),
  })
  const fiber = ctx.plugin({ apply }, CONFIG)
  await fiber.await()
  expect(gate).toBeDefined()
  return { ctx, gate: gate as WebGate, dispose: () => fiber.dispose() }
}

/** Minimal response recorder for gate calls. */
function response(): { value: ServerResponse; state: { status?: number; body?: string } } {
  const state: { status?: number; body?: string } = {}
  return {
    state,
    value: {
      writeHead(status: number) { state.status = status; return this },
      end(body?: string) { if (body !== undefined) state.body = body; return this },
    } as ServerResponse,
  }
}

/** Request with parser-impossible URL/address omissions and optional body chunks. */
function request(options: {
  url?: string
  method?: string
  headers?: IncomingMessage['headers']
  chunks?: string[]
  remoteAddress?: string
}): IncomingMessage {
  const req = Readable.from((options.chunks ?? []).map(chunk => Buffer.from(chunk))) as unknown as IncomingMessage
  Object.assign(req, {
    url: options.url,
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    socket: options.remoteAddress === undefined ? {} : { remoteAddress: options.remoteAddress },
  })
  return req
}

describe('host boundary fallbacks', () => {
  it('uses the root path when a synthetic request has no URL', async () => {
    const { ctx, gate } = await mounted()
    expect(ctx.webAuth.isAuthenticated({ headers: {} })).toBe(false)
    const navigation = response()
    expect(await gate.http(request({ headers: { accept: 'text/html' } }), navigation.value)).toBe(false)
    expect(navigation.state.status).toBe(401)
    expect(navigation.state.body).toContain('name="next" value="/"')

    const loginPage = response()
    expect(await gate.http(request({ url: '/__auth/login', method: 'GET' }), loginPage.value)).toBe(false)
    expect(loginPage.state.status).toBe(200)
  })

  it('keys a login attempt as unknown when the transport has no remote address', async () => {
    const { gate } = await mounted()
    const denied = response()
    expect(await gate.http(request({
      url: '/__auth/login',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      chunks: ['password=wrong'],
    }), denied.value)).toBe(false)
    expect(denied.state.status).toBe(401)
  })

  it('drains and refuses an oversized chunked body', async () => {
    const { gate } = await mounted()
    const denied = response()
    expect(await gate.http(request({
      url: '/__auth/login',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      chunks: ['x'.repeat(8_000), 'y'.repeat(300), 'z'],
      remoteAddress: '127.0.0.1',
    }), denied.value)).toBe(false)
    expect(denied.state.status).toBe(413)
  })

  it('sweeps expiry tables on the interval and clears it on disposal', async () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { dispose } = await mounted()
    await vi.advanceTimersByTimeAsync(60_000)
    await dispose()
    expect(clear).toHaveBeenCalledOnce()
  })
})
