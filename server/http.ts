import type { IncomingMessage, ServerResponse } from 'node:http'
import { SESSION_COOKIE, SESSION_TTL_MS } from './auth'

// 手写 HTTP 小工具（零依赖）：JSON 体读取、响应、cookie、限流桶。

export class HttpError extends Error {
  code?: string
  constructor(
    public status: number,
    message: string,
    code?: string,
  ) {
    super(message)
    this.name = 'HttpError'
    this.code = code
  }
}

export async function readJsonBody(req: IncomingMessage, limitBytes = 8192): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > limitBytes) throw new HttpError(413, '请求体过大')
    chunks.push(buf)
  }
  if (size === 0) throw new HttpError(400, '请求体不能为空')
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  const header = req.headers.cookie
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim())
    } catch {
      out[key] = part.slice(idx + 1).trim()
    }
  }
  return out
}

// 会话 cookie：httpOnly + SameSite=Lax（同源部署，无需 CORS）。
// 已知限制：站点暂为 HTTP 裸 IP，无法加 Secure；上域名 + HTTPS 后补上。
export function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader(
    'set-cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
  )
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

// 客户端 IP：取 X-Forwarded-For 首跳（nginx 用 $remote_addr 覆写，防伪造），否则直连地址
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const addr = req.socket.remoteAddress ?? 'unknown'
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr
}

// 内存限流桶：固定窗口计数。进程重启即清零（MVP 可接受；多实例部署需换 Redis）
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number): { ok: boolean; retryAfterSec: number } {
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
    }
    const rec = this.hits.get(key)
    if (!rec || rec.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return { ok: true, retryAfterSec: 0 }
    }
    if (rec.count >= this.limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)) }
    }
    rec.count += 1
    return { ok: true, retryAfterSec: 0 }
  }
}
