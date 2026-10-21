import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import * as db from '../db'
import { SESSION_TTL_MS } from '../auth'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

let database: DatabaseSync
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blindgap-db-'))
  database = db.openDatabase(join(dir, 'test.db'))
})

afterEach(() => {
  database.close()
  rmSync(dir, { recursive: true, force: true })
})

const seedUser = (id = 'u1'): void => {
  db.insertUser(database, {
    id,
    username: `user-${id}`,
    passHash: 'h',
    passSalt: 's',
    createdAt: 1_700_000_000_000,
  })
}

describe('box_state 持久化', () => {
  it('存取往返保持保底计数与首抽标记同语义', () => {
    seedUser()
    const box = { drawnCount: 42, pitySmall: 3, pityBig: 12, pityHard: 77, firstDrawDone: true }
    db.saveBoxState(database, 'u1', box)
    expect(db.getBoxState(database, 'u1')).toEqual(box)
  })

  it('覆盖写（UPSERT）而不是插第二条', () => {
    seedUser()
    db.saveBoxState(database, 'u1', {
      drawnCount: 1,
      pitySmall: 1,
      pityBig: 1,
      pityHard: 1,
      firstDrawDone: false,
    })
    db.saveBoxState(database, 'u1', {
      drawnCount: 2,
      pitySmall: 0,
      pityBig: 5,
      pityHard: 0,
      firstDrawDone: true,
    })
    const box = db.getBoxState(database, 'u1')!
    expect(box.drawnCount).toBe(2)
    expect(box.firstDrawDone).toBe(true)
    expect(db.getBoxState(database, 'nobody')).toBeUndefined()
  })
})

describe('cards 图鉴', () => {
  it('同一 IP 重复入手 count 累加、first_at 不变', () => {
    seedUser()
    db.incrementCard(database, 'u1', '001', 1000)
    db.incrementCard(database, 'u1', '001', 2000)
    const rows = db.getCards(database, 'u1')
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(2)
    expect(rows[0].first_at).toBe(1000)
    expect(db.getCardCount(database, 'u1', '001')).toBe(2)
    expect(db.getCardCount(database, 'u1', '002')).toBe(0)
  })

  it('存量迁移写入只记 count=1 且幂等（重复写不叠加）', () => {
    seedUser()
    db.insertCardsOnce(database, 'u1', ['001', '005', '008'], 1000)
    db.insertCardsOnce(database, 'u1', ['001'], 2000)
    const rows = db.getCards(database, 'u1')
    expect(rows.map((r) => r.ip_id)).toEqual(['001', '005', '008'])
    expect(rows.every((r) => r.count === 1)).toBe(true)
  })
})

describe('supply 每日补给', () => {
  it('首次建档为今日、两项未用', () => {
    seedUser()
    const s = db.ensureSupplyToday(database, 'u1', '2026-10-20')
    expect(s).toEqual({ last_login_date: '2026-10-20', daily_draw_used: 0, share_draw_used: 0 })
  })

  it('同日保留已用标记；跨天自动重置（F5 逻辑移交服务端）', () => {
    seedUser()
    db.ensureSupplyToday(database, 'u1', '2026-10-20')
    db.updateSupply(database, 'u1', {
      lastLoginDate: '2026-10-20',
      dailyDrawUsed: true,
      shareDrawUsed: true,
    })
    // 同日再取：不清零
    expect(db.ensureSupplyToday(database, 'u1', '2026-10-20').daily_draw_used).toBe(1)
    // 跨天：清零
    const next = db.ensureSupplyToday(database, 'u1', '2026-10-21')
    expect(next).toEqual({ last_login_date: '2026-10-21', daily_draw_used: 0, share_draw_used: 0 })
  })

  it('updateSupply 对新用户也能建档（UPSERT）', () => {
    seedUser('u2')
    db.updateSupply(database, 'u2', {
      lastLoginDate: '2026-10-20',
      dailyDrawUsed: true,
      shareDrawUsed: false,
    })
    expect(db.ensureSupplyToday(database, 'u2', '2026-10-20')).toEqual({
      last_login_date: '2026-10-20',
      daily_draw_used: 1,
      share_draw_used: 0,
    })
  })
})

describe('sessions 会话', () => {
  const now = 1_700_000_000_000

  it('创建 → 解析 → 删除', () => {
    seedUser()
    db.createSession(database, { token: 't1', userId: 'u1', createdAt: now, expiresAt: now + DAY })
    expect(db.resolveSession(database, 't1', now, SESSION_TTL_MS)).toEqual({ userId: 'u1' })
    db.deleteSession(database, 't1')
    expect(db.resolveSession(database, 't1', now, SESSION_TTL_MS)).toBeUndefined()
  })

  it('过期会话解析失败并顺手清理', () => {
    seedUser()
    db.createSession(database, { token: 't2', userId: 'u1', createdAt: now, expiresAt: now - 1 })
    expect(db.resolveSession(database, 't2', now, SESSION_TTL_MS)).toBeUndefined()
    // 已删除：再建同名会话可成功（无残留冲突）
    db.createSession(database, { token: 't2', userId: 'u1', createdAt: now, expiresAt: now + DAY })
    expect(db.resolveSession(database, 't2', now, SESSION_TTL_MS)).toEqual({ userId: 'u1' })
  })

  it('滑动续期：剩余不足 7 天时延长到 now + ttl', () => {
    seedUser()
    const expiresAt = now + 2 * DAY
    db.createSession(database, { token: 't3', userId: 'u1', createdAt: now, expiresAt })
    db.resolveSession(database, 't3', now, SESSION_TTL_MS)
    const renewed = database
      .prepare('SELECT expires_at AS e FROM sessions WHERE token = $token')
      .get({ token: 't3' }) as { e: number }
    expect(renewed.e).toBe(now + SESSION_TTL_MS)
  })

  it('剩余充足时不续期（减少写放大）', () => {
    seedUser()
    const expiresAt = now + 20 * DAY
    db.createSession(database, { token: 't4', userId: 'u1', createdAt: now, expiresAt })
    db.resolveSession(database, 't4', now, SESSION_TTL_MS)
    const row = database
      .prepare('SELECT expires_at AS e FROM sessions WHERE token = $token')
      .get({ token: 't4' }) as { e: number }
    expect(row.e).toBe(expiresAt)
  })

  it('deleteExpiredSessions 只清过期的', () => {
    seedUser()
    db.createSession(database, { token: 'live', userId: 'u1', createdAt: now, expiresAt: now + DAY })
    db.createSession(database, { token: 'dead', userId: 'u1', createdAt: now, expiresAt: now - 1 })
    expect(db.deleteExpiredSessions(database, now)).toBe(1)
    expect(db.resolveSession(database, 'live', now, SESSION_TTL_MS)).toEqual({ userId: 'u1' })
  })
})
