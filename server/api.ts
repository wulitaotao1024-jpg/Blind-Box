import type { DatabaseSync } from 'node:sqlite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createBoxState, draw, nextStateAfter } from '../src/logic/boxReducer'
import { IPS } from '../src/data/ips'
import { isOfferExhausted, buildOffer } from '../src/logic/offer'
import { OFFER_REROLL_LIMIT, OFFER_SIZE } from '../src/logic/types'
import { todayStr } from '../src/logic/dates'
import type { BoxState, IpDef, Rarity } from '../src/logic/types'
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
  /** 分享领到、尚未抽掉的次数 */
  drawsBonus: number
}

export interface MeDto {
  user: { id: string; username: string }
  box: BoxState
  cards: Array<{ ipId: string; count: number; firstAt: number }>
  supply: SupplyDto
  drawsLeft: number
}

/** 赌盒六选一的一批盒子（F1 交互）：内容完全不可见，连系列都不公开 */
export interface OfferBoxDto {
  opened: boolean
  /** 只有已经拆开的盒子才回传里面是谁 + 它的档位，用于回看自己拆了哪只 */
  rarity?: Rarity
  ipId?: string
}

export interface OfferDto {
  /** 本批 id：抽卡时要回传，服务端据此校验「只能从这一批里挑一个」 */
  offerId: string
  boxes: OfferBoxDto[]
  rerollsLeft: number
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

// 剩余抽数 = 今日登录补给（1 发，未用才有）+ 分享领到但还没抽掉的余额。
// 分享不再「占掉」一次抽数，而是真给 +1 —— 抽一次才减一，避免「点了分享反而少一发」。
const drawsLeftOf = (s: { daily_draw_used: number; draws_bonus: number }): number =>
  (s.daily_draw_used ? 0 : 1) + (s.draws_bonus > 0 ? s.draws_bonus : 0)

const toSupplyDto = (s: db.SupplyRow): SupplyDto => ({
  lastLoginDate: s.last_login_date,
  dailyDrawUsed: !!s.daily_draw_used,
  shareDrawUsed: !!s.share_draw_used,
  drawsBonus: s.draws_bonus ?? 0,
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

  const noDrawsError = () =>
    new HttpError(409, '今日补给已用完，明天登录 +1，或分享再 +1', 'NO_DRAWS')

  // 赌盒六选一：取当批 8 只封着的盒子（没有/已拆完就新开一批；reroll=true 换新一批并扣一次换批额度）
  const handleOffer = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const userId = requireUser(req, res)
    if (!userId) return
    const body = (await readJsonBody(req)) as { reroll?: boolean }
    const day = today()
    const supply = db.ensureSupplyToday(database, userId, day)
    const box = db.getBoxState(database, userId) ?? createBoxState()
    const current = db.getOffer(database, userId, day)

    if (body.reroll === true) {
      // 先做「这一批能不能换」的校验，再看还有没有次数 —— 否则没次数时错误语义会被吞掉
      if (!current) throw new HttpError(400, '当前没有可更换的一批，请先取一批盒子')
      if (current.opened.length > 0) {
        throw new HttpError(409, '这一批已经拆过了，不能整批换掉', 'OFFER_OPENED')
      }
      if (current.rerolls_left <= 0) {
        throw new HttpError(409, '换一批次数已用完，就从这一批里挑一只吧', 'NO_REROLL')
      }
      if (drawsLeftOf(supply) <= 0) throw noDrawsError()
      const fresh = db.createOffer(database, {
        id: randomBytes(16).toString('hex'),
        userId,
        day,
        ids: buildOffer(box, pool, secureRng),
        rerollsLeft: current.rerolls_left - 1,
        now: now(),
      })
      return sendJson(res, 200, toOfferDto(fresh, box))
    }

    // 非换批：没有 / 已拆完 → 新开一批（换批额度重置）；否则原样返回（保留已拆状态）
    if (!current || isOfferExhausted(current.ids.length, current.opened.length)) {
      if (drawsLeftOf(supply) <= 0) throw noDrawsError()
      const fresh = db.createOffer(database, {
        id: randomBytes(16).toString('hex'),
        userId,
        day,
        ids: buildOffer(box, pool, secureRng),
        rerollsLeft: OFFER_REROLL_LIMIT,
        now: now(),
      })
      return sendJson(res, 200, toOfferDto(fresh, box))
    }
    sendJson(res, 200, toOfferDto(current, box))
  }

  // 内容完全不可见：未拆的盒子只回 opened:false，连「系列」都不下发（真·盲盒，前端拿不到答案）
  const toOfferDto = (row: db.OfferRow, box: BoxState): OfferDto => ({
    offerId: row.id,
    boxes: row.ids.map((id, i) => {
      const ip = pool.find((p) => p.id === id)
      const opened = row.opened.includes(i)
      return opened && ip
        ? { rarity: ip.rarity, opened: true, ipId: id }
        : { opened: false }
    }),
    rerollsLeft: row.rerolls_left,
  })

  const handleDraw = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const userId = requireUser(req, res)
    if (!userId) return
    const body = (await readJsonBody(req, 8192, true)) as { offerId?: string; pickIndex?: number }
    const supply = db.ensureSupplyToday(database, userId, today())
    const box = db.getBoxState(database, userId) ?? createBoxState()

    // —— 赌盒六选一：玩家挑了当批第 N 个盒子 ——
    // 校验顺序很关键：先判「这个盒子能不能拆」，再判「还有没有次数」，
    // 否则次数为 0 时会先把「已拆过 / 批次失效」这些明确语义吞成一句「补给用完」。
    if (body.offerId && Number.isInteger(body.pickIndex)) {
      const idx = body.pickIndex as number
      const offer = db.getOffer(database, userId, today())
      if (!offer || offer.id !== body.offerId) {
        throw new HttpError(400, '这一批盒子已失效，请重新取一批', 'OFFER_STALE')
      }
      if (idx < 0 || idx >= offer.ids.length) {
        throw new HttpError(400, '没有这个盒子', 'PICK_NOT_IN_OFFER')
      }
      if (offer.opened.includes(idx)) {
        throw new HttpError(409, '这个盒子已经拆过了，换一个吧', 'PICK_ALREADY_OPENED')
      }
      if (drawsLeftOf(supply) <= 0) throw noDrawsError()
      const ip = pool.find((p) => p.id === offer.ids[idx])
      if (!ip || ip.status !== 'ready') {
        throw new HttpError(400, '这只还没上架', 'PICK_NOT_READY')
      }
      // 不再强制「首抽必是老皮」：玩家从这一批里随便赌哪一只都行（老皮改由偶发彩蛋掉落）

      const next = nextStateAfter(box, ip.rarity)

      // 首抽批 / 保底批是「整批同一档」——这是为了保证「赌哪只都兑现」。
      // 但如果不处理，玩家把剩下 5 个也拆了就等于白拿 6 张同档卡，经济体系会被击穿。
      // 所以在拆掉第一个之后，把还没拆的那几个换回常规批（已拆的那个原样保留）。
      const rarityOf = (id: string) => pool.find((p) => p.id === id)?.rarity
      const batchRarity = rarityOf(offer.ids[0])
      const sameTierBatch =
        batchRarity !== undefined && offer.ids.every((id) => rarityOf(id) === batchRarity)
      let refreshedIds: string[] | null = null
      if (sameTierBatch && offer.ids.length - offer.opened.length > 1) {
        const normal = buildOffer(
          { ...next, firstDrawDone: true, pitySmall: 0, pityBig: 0, pityHard: 0 },
          pool,
          secureRng,
        )
        let k = 0
        refreshedIds = offer.ids.map((id, i) =>
          i === idx || offer.opened.includes(i) ? id : normal[k++] ?? id,
        )
      }

      const nextSupply: db.SupplyRow = {
        last_login_date: supply.last_login_date,
        daily_draw_used: 1,
        share_draw_used: supply.share_draw_used,
        draws_bonus: supply.daily_draw_used ? Math.max(0, supply.draws_bonus - 1) : supply.draws_bonus,
      }

      database.exec('BEGIN IMMEDIATE')
      let isNew: boolean
      try {
        isNew = db.getCardCount(database, userId, ip.id) === 0
        db.saveBoxState(database, userId, next)
        db.incrementCard(database, userId, ip.id, now())
        db.updateSupply(database, userId, {
          lastLoginDate: nextSupply.last_login_date,
          dailyDrawUsed: !!nextSupply.daily_draw_used,
          shareDrawUsed: !!nextSupply.share_draw_used,
          drawsBonus: nextSupply.draws_bonus,
        })
        db.markOfferOpened(database, offer.id, idx)
        if (refreshedIds) db.updateOfferIds(database, offer.id, refreshedIds)
        database.exec('COMMIT')
      } catch (err) {
        database.exec('ROLLBACK')
        throw err
      }

      const updated = db.getOffer(database, userId, today())
      return sendJson(res, 200, {
        result: { ipId: ip.id, rarity: ip.rarity, forcedBy: 'pick' },
        isNew,
        box: next,
        drawsLeft: drawsLeftOf(nextSupply),
        offer: updated ? toOfferDto(updated, next) : null,
      })
    }

    if (drawsLeftOf(supply) <= 0) throw noDrawsError()

    // 与前端同序：先扣今日登录补给，没有才扣分享余额
    const consumeDaily = !supply.daily_draw_used
    const nextSupply: db.SupplyRow = {
      last_login_date: supply.last_login_date,
      daily_draw_used: 1,
      share_draw_used: supply.share_draw_used,
      draws_bonus: consumeDaily ? supply.draws_bonus : Math.max(0, supply.draws_bonus - 1),
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
        drawsBonus: nextSupply.draws_bonus,
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

  // 分享补给：每天一次，点一次「复制链接」就 +1 发（余额 +1，抽一次减一）。
  // 之前是「标记已用」，结果分享后总次数不增反减 —— 这里改为真加次数。
  const handleShare = (req: IncomingMessage, res: ServerResponse): void => {
    const userId = requireUser(req, res)
    if (!userId) return
    const supply = db.ensureSupplyToday(database, userId, today())
    let next: db.SupplyRow = supply
    if (!supply.share_draw_used) {
      next = { ...supply, share_draw_used: 1, draws_bonus: supply.draws_bonus + 1 }
      db.updateSupply(database, userId, {
        lastLoginDate: supply.last_login_date,
        dailyDrawUsed: !!supply.daily_draw_used,
        shareDrawUsed: true,
        drawsBonus: next.draws_bonus,
      })
    }
    sendJson(res, 200, {
      granted: !supply.share_draw_used,
      drawsLeft: drawsLeftOf(next),
      supply: toSupplyDto(next),
    })
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
      draws_bonus: 0, // 迁移不继承本地分享余额：以服务端当日分享为准
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      db.saveBoxState(database, userId, box)
      db.insertCardsOnce(database, userId, collected, now())
      db.updateSupply(database, userId, {
        lastLoginDate: nextSupply.last_login_date,
        dailyDrawUsed: !!nextSupply.daily_draw_used,
        shareDrawUsed: !!nextSupply.share_draw_used,
        drawsBonus: nextSupply.draws_bonus,
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
        case 'POST /api/offer':
          return await handleOffer(req, res)
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
