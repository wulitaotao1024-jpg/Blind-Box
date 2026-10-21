import type { BoxState, DrawResult, Rarity } from '../logic/types'

// 盒隙前端 API 客户端：唯一与后端 /api 通信的入口（同源，cookie 自动随行）。
// 后端契约见 docs/plans/2026-10-20-login-system.md §3.3。

export interface AuthUser {
  id: string
  username: string
}

export interface CardDto {
  ipId: string
  count: number
  firstAt: number
}

export interface SupplyDto {
  lastLoginDate: string
  dailyDrawUsed: boolean
  shareDrawUsed: boolean
  /** 分享领到、尚未抽掉的次数（服务端余额，抽一次减一） */
  drawsBonus: number
}

export interface MeDto {
  user: AuthUser
  box: BoxState
  cards: CardDto[]
  supply: SupplyDto
  drawsLeft: number
}

/** 明牌六选一：服务端发的一批盒子（6 只编号 + 已拆记录 + 换批额度） */
export interface OfferBoxDto {
  /** 这个盒子属于哪个系列（档位）：玩家能看到的唯一线索 */
  rarity: Rarity
  opened: boolean
  /** 已经拆开的盒子才回传里面是谁 */
  ipId?: string
}

export interface OfferDto {
  offerId: string
  boxes: OfferBoxDto[]
  rerollsLeft: number
  /** 首抽：整批都是引导款（挑哪只都是 №000） */
  firstDrawOnly: boolean
}

export interface DrawDto {
  result: DrawResult
  isNew: boolean
  box: BoxState
  drawsLeft: number
  /** 指定抽（六选一）时回传这一批的最新状态；随机抽为 null */
  offer: OfferDto | null
}

export interface ShareDto {
  /** 本次是否真的加了一发（每日仅一次） */
  granted: boolean
  drawsLeft: number
  supply: SupplyDto
}

export interface MigrateInput {
  box?: Partial<BoxState>
  collected?: string[]
  supply?: { lastLoginDate?: string; dailyDrawUsed?: boolean; shareDrawUsed?: boolean }
}

export interface MigrateDto {
  migrated: boolean
  box: BoxState
  cards: CardDto[]
  supply: SupplyDto
  drawsLeft: number
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // 空响应或非 JSON：保留 null
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : '') || `请求失败（${res.status}）`
    const code =
      body && typeof body === 'object' && 'code' in body
        ? String((body as { code: unknown }).code)
        : undefined
    throw new ApiError(res.status, msg, code)
  }
  return body as T
}

export const api = {
  async register(username: string, password: string): Promise<{ user: AuthUser }> {
    return req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  async login(username: string, password: string): Promise<{ user: AuthUser }> {
    return req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  async logout(): Promise<{ ok: boolean }> {
    return req('/api/auth/logout', { method: 'POST' })
  },

  async me(): Promise<MeDto> {
    return req<MeDto>('/api/me')
  },

  /** 明牌六选一：取当批 6 只；reroll=true 整批换掉（每天 2 次，且拆过就不能换） */
  async offer(input?: { reroll?: boolean }): Promise<OfferDto> {
    return req<OfferDto>('/api/offer', { method: 'POST', body: JSON.stringify(input ?? {}) })
  },

  /** 抽一发：不传 pick 走旧随机抽；传 pick 表示从这一批里赌的第 N 个盒子 */
  async draw(pick?: { offerId: string; pickIndex: number }): Promise<DrawDto> {
    return req<DrawDto>('/api/draw', { method: 'POST', body: JSON.stringify(pick ?? {}) })
  },

  async share(): Promise<ShareDto> {
    return req<ShareDto>('/api/share', { method: 'POST' })
  },

  async migrate(input: MigrateInput): Promise<MigrateDto> {
    return req<MigrateDto>('/api/migrate', { method: 'POST', body: JSON.stringify(input) })
  },
}
