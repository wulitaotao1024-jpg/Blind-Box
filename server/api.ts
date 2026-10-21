import type { DatabaseSync } from 'node:sqlite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createBoxState, draw } from '../src/logic/boxReducer'
import { IPS } from '../src/data/ips'
import { todayStr } from '../src/logic/dates'
import type { BoxState, IpDef } from '../src/logic/types'
import * as db from './db'
import * as auth from './auth'
import {
  HttpError,
  RateLimiter,
  clearSessionCookie,
  clientIp,
  parseCookies,
  readJsonBody,
  sendJson,
  setSessionCookie,
} from './http'

// API 路由层：/api/auth/*、/api/me、/api/draw、/api/share、/api/migrate。
// 抽卡复用前端同源纯函数 boxReducer（PRD F1：保底服务端计数跨设备不清零）。

export interface SupplyDto {
  lastLoginDate: string
  dailyDrawUsed: boolean
  shareDrawUsed: boolean
}

export interface MeDto {
  user: { id: string; username: string }
  box: BoxState
  cards: Array<{ ipId: string; count: number; firstAt: number }>
  supply: SupplyDto
  drawsLeft: number
}

export interface ApiOptions {
  db: DatabaseSync
  /** IP 池（测试可注入合成池；生产默认真实阵容） */
  pool?: IpDef[]
  now?: () => number
  today?: () => string
  /** 登录/注册限流：默认同 IP 10 次 / 10 分钟 */
  rateLimit?: { limit: number; windowMs: number }
}

const drawsLeftOf = (s: { daily_draw_used: number; share_draw_used: number }): number =>
  (s.daily_draw_used ? 0 : 1) + (s.share_draw_used ? 0 : 1)

const toSupplyDto = (s: db.SupplyRow): SupplyDto => ({
  lastLoginDate: s.last_login_date,
  dailyDrawUsed: !!s.daily_draw_used,
  shareDrawUsed: !!s.share_draw_used,
})

const toCardsDto = (rows: db.CardRow[]): MeDto['cards'] =>
  rows.map((r) => ({ ipId: r.ip_id, count: r.count, firstAt: r.first_at }))

// [0,1) 均匀随机：crypto 随机 32 位整数归一化（禁 Math.random，服务端可预测性风险）
const secureRng = (): number => randomBytes(4).readUInt32BE(0) / 0x100000000

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Error && /UNIQUE constraint failed/i.test(err.message)

export function createApiHandler(options: ApiOptions) {
  const { db: database } = options
  const pool = options.pool ?? IPS
  const now = options.now ?? (() => Date.now())
  const today = options.today ?? (() => todayStr())
  const limiter = new RateLimiter(
    options.rateLimit?.limit ?? 10,
    options.rateLimit?.windowMs ?? 10 * 60 * 1000,
  )

  const limitOrThrow = (req: IncomingMessage): void => {
    const { ok, retryAfterSec } = limiter.check(clientIp(req), now())
    if (!ok) throw new HttpError(429, `操作太频繁，请 ${retryAfterSec} 秒后再试`)
  }

  const currentUserId = (req: IncomingMessage): string | null => {
    const token = parseCookies(req)[auth.SESSION_COOKIE]
    if (!token) return null
    return db.resolveSession(database, token, now(), auth.SESSION_TTL_MS)?.userId ?? null
  }

  const requireUser = (req: IncomingMessage, res: ServerResponse): string | null => {
    const userId = currentUserId(req)
    if (!userId) {
      sendJson(res, 401, { error: '未登录' })
      return null
    }
    return userId
  }

  const issueSession = (userId: string): string => {
    const token = auth.newToken()
    db.createSession(database, {
      token,
      userId,
      createdAt: now(),
      expiresAt: now() + auth.SESSION_TTL_MS,
    })
    return token
  }

  const handleRegister = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    limitOrThrow(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const username = auth.validateUsername(body.username)
    if (!username) {
      throw new HttpError(400, '用户名需 2-20 位，支持字母、数字、下划线或中文')
    }
    const password = auth.validatePassword(body.password)
    if (!password) {
      throw new HttpError(400, '密码需 8-64 位')
    }
    const { hash, salt } = auth.hashPassword(password)
    const id = auth.newUserId()
    try {
      db.insertUser(database, { id, username, passHash: hash, passSalt: salt, createdAt: now() })
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, '用户名已被注册，去登录试试', 'USERNAME_TAKEN')
      throw err
    }
    setSessionCookie(res, issueSession(id))
    sendJson(res, 201, { user: { id, username } })
  }

  const handleLogin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    limitOrThrow(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    // 格式非法也走统一 401：不泄露「用户不存在」与「格式错误」的区别
    const username =
      typeof body.username === 'string' ? auth.normalizeUsername(body.username) : null
    const password = typeof body.password === 'string' ? body.password : null
    if (!username || !password) {
      throw new HttpError(400, '请输入用户名和密码')
    }
    const user = db.findUserByUsername(database, username)
    if (!user) {
      // 无此用户：仍对假哈希验一次，让两种失败耗时接近（防用户名枚举）
      auth.verifyPasswordUniform(password, undefined)
      throw new HttpError(401, '该账号尚未注册，请先注册', 'NO_USER')
    }
    if (!auth.verifyPassword(password, user.pass_salt, user.pass_hash)) {
      throw new HttpError(401, '登录失败，密码不正确', 'BAD_CREDENTIAL')
    }
    db.touchLastLogin(database, user.id, now())
    setSessionCookie(res, issueSession(user.id))
    sendJson(res, 200, { user: { id: user.id, username: user.username } })
  }

  const handleLogout = (req: IncomingMessage, res: ServerResponse): void => {
    const token = parseCookies(req)[auth.SESSION_COOKIE]
    if (token) db.deleteSession(database, token)
    clearSessionCookie(res)
    sendJson(res, 200, { ok: true })
  }

  const handleMe = (req: IncomingMessage, res: ServerResponse): void => {
    const userId = requireUser(req, res)
    if (!userId) return
    const user = db.findUserById(database, userId)
    if (!user) {
      clearSessionCookie(res)
      sendJson(res, 401, { error: '未登录' })
      return
    }
    const supply = db.ensureSupplyToday(database, userId, today())
    const box = db.getBoxState(database, userId) ?? createBoxState()
    sendJson(res, 200, {
      user: { id: user.id, username: user.username },
      box,
      cards: toCardsDto(db.getCards(database, userId)),
      supply: toSupplyDto(supply),
      drawsLeft: drawsLeftOf(supply),
    } satisfies MeDto)
  }

  const handleDraw = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const userId = requireUser(req, res)
    if (!userId) return
    const supply = db.ensureSupplyToday(database, userId, today())
    if (drawsLeftOf(supply) <= 0) {
      throw new HttpError(409, '今日补给已用完，明天登录 +1，或分享再 +1')
    }
    const box = db.getBoxState(database, userId) ?? createBoxState()

    // 与前端 performDraw 同序：先扣登录补给，登录已用才扣分享补给
    const consumeShare = !!supply.daily_draw_used
    const nextSupply: db.SupplyRow = {
      last_login_date: supply.last_login_date,
      daily_draw_used: 1,
      share_draw_used: consumeShare ? 1 : supply.share_draw_used,
    }

    const { result, next } = draw(box, secureRng, pool)

    // 事务：box_state + cards + supply 原子落库，中途失败整体回滚
    database.exec('BEGIN IMMEDIATE')
    let isNew: boolean
    try {
      isNew = db.getCardCount(database, userId, result.ipId) === 0
      db.saveBoxState(database, userId, next)
      db.incrementCard(database, userId, result.ipId, now())
      db.updateSupply(database, userId, {
        lastLoginDate: nextSupply.last_login_date,
        dailyDrawUsed: !!nextSupply.daily_draw_used,
        shareDrawUsed: !!nextSupply.share_draw_used,
      })
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }

    sendJson(res, 200, {
      result,
      isNew,
      box: next,
      drawsLeft: drawsLeftOf(nextSupply),
    })
  }

  const handleShare = (req: IncomingMessage, res: ServerResponse): void => {
    const userId = requireUser(req, res)
    if (!userId) return
    const supply = db.ensureSupplyToday(database, userId, today())
    if (!supply.share_draw_used) {
      db.updateSupply(database, userId, {
        lastLoginDate: supply.last_login_date,
        dailyDrawUsed: !!supply.daily_draw_used,
        shareDrawUsed: true,
      })
    }
    // 走到这里分享补给必已被标记为今日已用：剩余 = 登录补给
    sendJson(res, 200, { drawsLeft: supply.daily_draw_used ? 0 : 1 })
  }

  const handleMigrate = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const userId = requireUser(req, res)
    if (!userId) return
    const body = (await readJsonBody(req)) as Record<string, unknown>

    const existingBox = db.getBoxState(database, userId)
    const serverHasState = (existingBox?.drawnCount ?? 0) > 0 || db.hasAnyCards(database, userId)
    const supply = db.ensureSupplyToday(database, userId, today())
    const cards = db.getCards(database, userId)

    // 幂等：服务端已有抽盒记录/卡片时不覆盖（二次迁移 = 原样返回现状）
    if (serverHasState) {
      sendJson(res, 200, {
        migrated: false,
        box: existingBox ?? createBoxState(),
        cards: toCardsDto(cards),
        supply: toSupplyDto(supply),
        drawsLeft: drawsLeftOf(supply),
      })
      return
    }

    const poolIds = new Set(pool.map((p) => p.id))
    const rawBox = (body.box ?? {}) as Partial<BoxState>
    const box: BoxState = {
      drawnCount: Number.isFinite(rawBox.drawnCount) ? Math.max(0, Math.floor(rawBox.drawnCount!)) : 0,
      pitySmall: Number.isFinite(rawBox.pitySmall) ? Math.max(0, Math.floor(rawBox.pitySmall!)) : 0,
      pityBig: Number.isFinite(rawBox.pityBig) ? Math.max(0, Math.floor(rawBox.pityBig!)) : 0,
      pityHard: Number.isFinite(rawBox.pityHard) ? Math.max(0, Math.floor(rawBox.pityHard!)) : 0,
      firstDrawDone: !!rawBox.firstDrawDone,
    }
    const collected = Array.isArray(body.collected)
      ? body.collected.filter((id): id is string => typeof id === 'string' && poolIds.has(id))
      : []

    const rawSupply = (body.supply ?? {}) as Record<string, unknown>
    const payloadIsToday = rawSupply.lastLoginDate === today()
    const nextSupply: db.SupplyRow = {
      last_login_date: today(),
      daily_draw_used: payloadIsToday && rawSupply.dailyDrawUsed ? 1 : 0,
      share_draw_used: payloadIsToday && rawSupply.shareDrawUsed ? 1 : 0,
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      db.saveBoxState(database, userId, box)
      db.insertCardsOnce(database, userId, collected, now())
      db.updateSupply(database, userId, {
        lastLoginDate: nextSupply.last_login_date,
        dailyDrawUsed: !!nextSupply.daily_draw_used,
        shareDrawUsed: !!nextSupply.share_draw_used,
      })
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }

    sendJson(res, 200, {
      migrated: true,
      box,
      cards: toCardsDto(db.getCards(database, userId)),
      supply: toSupplyDto(nextSupply),
      drawsLeft: drawsLeftOf(nextSupply),
    })
  }

  return async function apiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (!path.startsWith('/api/')) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      const route = `${req.method ?? 'GET'} ${path}`
      switch (route) {
        case 'POST /api/auth/register':
          return await handleRegister(req, res)
        case 'POST /api/auth/login':
          return await handleLogin(req, res)
        case 'POST /api/auth/logout':
          return handleLogout(req, res)
        case 'GET /api/me':
          return handleMe(req, res)
        case 'POST /api/draw':
          return await handleDraw(req, res)
        case 'POST /api/share':
          return handleShare(req, res)
        case 'POST /api/migrate':
          return await handleMigrate(req, res)
        default:
          sendJson(res, 404, { error: 'not_found' })
      }
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(
          res,
          err.status,
          err.code ? { error: err.message, code: err.code } : { error: err.message },
        )
        return
      }
      console.error('[api] 未处理异常:', err)
      sendJson(res, 500, { error: '服务器开小差了，请稍后再试' })
    }
  }
}
