import type { BoxState, DrawResult } from '../logic/types'

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
}

export interface MeDto {
  user: AuthUser
  box: BoxState
  cards: CardDto[]
  supply: SupplyDto
  drawsLeft: number
}

export interface DrawDto {
  result: DrawResult
  isNew: boolean
  box: BoxState
  drawsLeft: number
}

export interface ShareDto {
  drawsLeft: number
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
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
    throw new ApiError(res.status, msg)
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

  async draw(): Promise<DrawDto> {
    return req<DrawDto>('/api/draw', { method: 'POST' })
  },

  async share(): Promise<ShareDto> {
    return req<ShareDto>('/api/share', { method: 'POST' })
  },

  async migrate(input: MigrateInput): Promise<MigrateDto> {
    return req<MigrateDto>('/api/migrate', { method: 'POST', body: JSON.stringify(input) })
  },
}
