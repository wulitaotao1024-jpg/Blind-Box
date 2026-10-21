import { createRequire } from 'node:module'
import type { BoxState } from '../src/logic/types'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'

// node:sqlite 是 Node 22.5+ 的新内置模块，不在 Vite 5.4 的内置清单里——
// 静态 import 会被 Vite 解析器误判为裸包（vitest / vite build --ssr 均复现）。
// 改用 createRequire 在运行时加载：绕开打包器静态解析，Node 原生按 node: 协议加载。
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

export type DatabaseSync = DatabaseSyncType

// 数据访问层：零依赖 node:sqlite（DatabaseSync + WAL）。
// 全部 SQL 参数化；行类型与前端 BoxState / storage.ts 的 Persisted 同语义（PRD F1：服务端计数跨设备不清零）。

export interface UserRow {
  id: string
  username: string
  pass_hash: string
  pass_salt: string
  created_at: number
  last_login_at: number | null
}

export interface CardRow {
  ip_id: string
  count: number
  first_at: number
}

export interface SupplyRow {
  last_login_date: string
  daily_draw_used: number
  share_draw_used: number
}

export interface SessionRow {
  token: string
  user_id: string
  created_at: number
  expires_at: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  pass_hash    TEXT NOT NULL,
  pass_salt    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS box_state (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  drawn_count     INTEGER NOT NULL DEFAULT 0,
  pity_small      INTEGER NOT NULL DEFAULT 0,
  pity_big        INTEGER NOT NULL DEFAULT 0,
  pity_hard       INTEGER NOT NULL DEFAULT 0,
  first_draw_done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cards (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_id    TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, ip_id)
);
CREATE TABLE IF NOT EXISTS supply (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_login_date  TEXT NOT NULL DEFAULT '',
  daily_draw_used  INTEGER NOT NULL DEFAULT 0,
  share_draw_used  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec('PRAGMA busy_timeout=3000')
  db.exec(SCHEMA)
  return db
}

// —— 用户 ——

export function insertUser(
  db: DatabaseSync,
  user: { id: string; username: string; passHash: string; passSalt: string; createdAt: number },
): void {
  db.prepare(
    `INSERT INTO users (id, username, pass_hash, pass_salt, created_at, last_login_at)
     VALUES ($id, $username, $passHash, $passSalt, $createdAt, NULL)`,
  ).run({
    id: user.id,
    username: user.username,
    passHash: user.passHash,
    passSalt: user.passSalt,
    createdAt: user.createdAt,
  })
}

export function findUserByUsername(db: DatabaseSync, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = $username').get({ username }) as
    | UserRow
    | undefined
}

export function findUserById(db: DatabaseSync, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = $id').get({ id }) as UserRow | undefined
}

export function touchLastLogin(db: DatabaseSync, userId: string, now: number): void {
  db.prepare('UPDATE users SET last_login_at = $now WHERE id = $id').run({ now, id: userId })
}

// —— 抽盒状态（保底计数）——

const rowToBox = (row: Record<string, unknown>): BoxState => ({
  drawnCount: Number(row.drawn_count),
  pitySmall: Number(row.pity_small),
  pityBig: Number(row.pity_big),
  pityHard: Number(row.pity_hard),
  firstDrawDone: Number(row.first_draw_done) === 1,
})

export function getBoxState(db: DatabaseSync, userId: string): BoxState | undefined {
  const row = db.prepare('SELECT * FROM box_state WHERE user_id = $userId').get({ userId })
  return row ? rowToBox(row) : undefined
}

export function saveBoxState(db: DatabaseSync, userId: string, box: BoxState): void {
  db.prepare(
    `INSERT INTO box_state (user_id, drawn_count, pity_small, pity_big, pity_hard, first_draw_done)
     VALUES ($userId, $drawnCount, $pitySmall, $pityBig, $pityHard, $firstDrawDone)
     ON CONFLICT(user_id) DO UPDATE SET
       drawn_count = $drawnCount, pity_small = $pitySmall, pity_big = $pityBig,
       pity_hard = $pityHard, first_draw_done = $firstDrawDone`,
  ).run({
    userId,
    drawnCount: box.drawnCount,
    pitySmall: box.pitySmall,
    pityBig: box.pityBig,
    pityHard: box.pityHard,
    firstDrawDone: box.firstDrawDone ? 1 : 0,
  })
}

// —— 图鉴卡片 ——

export function getCards(db: DatabaseSync, userId: string): CardRow[] {
  return db
    .prepare('SELECT ip_id, count, first_at FROM cards WHERE user_id = $userId ORDER BY ip_id')
    .all({ userId })
    .map((r) => ({ ip_id: String(r.ip_id), count: Number(r.count), first_at: Number(r.first_at) }))
}

export function getCardCount(db: DatabaseSync, userId: string, ipId: string): number {
  const row = db.prepare('SELECT count FROM cards WHERE user_id = $userId AND ip_id = $ipId').get({
    userId,
    ipId,
  })
  return row ? Number(row.count) : 0
}

export function incrementCard(db: DatabaseSync, userId: string, ipId: string, now: number): void {
  db.prepare(
    `INSERT INTO cards (user_id, ip_id, count, first_at) VALUES ($userId, $ipId, 1, $now)
     ON CONFLICT(user_id, ip_id) DO UPDATE SET count = count + 1`,
  ).run({ userId, ipId, now })
}

// 存量迁移：一次性写入（count=1，本地从未记录重复张数）；冲突忽略保证幂等
export function insertCardsOnce(db: DatabaseSync, userId: string, ipIds: string[], now: number): void {
  const stmt = db.prepare(
    `INSERT INTO cards (user_id, ip_id, count, first_at) VALUES ($userId, $ipId, 1, $now)
     ON CONFLICT(user_id, ip_id) DO NOTHING`,
  )
  for (const ipId of ipIds) stmt.run({ userId, ipId, now })
}

export function hasAnyCards(db: DatabaseSync, userId: string): boolean {
  const row = db.prepare('SELECT 1 AS x FROM cards WHERE user_id = $userId LIMIT 1').get({ userId })
  return row !== undefined
}

// —— 每日补给（登录 +1 / 分享 +1，每日各 1 次）——

// 跨天自动重置（前端 F5 逻辑移交服务端）：无行则建档，非今日则清零两项已用标记
export function ensureSupplyToday(db: DatabaseSync, userId: string, today: string): SupplyRow {
  db.prepare(
    `INSERT INTO supply (user_id, last_login_date, daily_draw_used, share_draw_used)
     VALUES ($userId, $today, 0, 0)
     ON CONFLICT(user_id) DO UPDATE SET
       last_login_date = $today,
       daily_draw_used = CASE WHEN supply.last_login_date = $today THEN supply.daily_draw_used ELSE 0 END,
       share_draw_used = CASE WHEN supply.last_login_date = $today THEN supply.share_draw_used ELSE 0 END`,
  ).run({ userId, today })
  return db
    .prepare(
      'SELECT last_login_date, daily_draw_used, share_draw_used FROM supply WHERE user_id = $userId',
    )
    .get({ userId }) as unknown as SupplyRow
}

export function updateSupply(
  db: DatabaseSync,
  userId: string,
  next: { lastLoginDate: string; dailyDrawUsed: boolean; shareDrawUsed: boolean },
): void {
  db.prepare(
    `INSERT INTO supply (user_id, last_login_date, daily_draw_used, share_draw_used)
     VALUES ($userId, $lastLoginDate, $dailyDrawUsed, $shareDrawUsed)
     ON CONFLICT(user_id) DO UPDATE SET
       last_login_date = $lastLoginDate, daily_draw_used = $dailyDrawUsed, share_draw_used = $shareDrawUsed`,
  ).run({
    userId,
    lastLoginDate: next.lastLoginDate,
    dailyDrawUsed: next.dailyDrawUsed ? 1 : 0,
    shareDrawUsed: next.shareDrawUsed ? 1 : 0,
  })
}

// —— 会话 ——

export function createSession(
  db: DatabaseSync,
  session: { token: string; userId: string; createdAt: number; expiresAt: number },
): void {
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($token, $userId, $createdAt, $expiresAt)`,
  ).run({
    token: session.token,
    userId: session.userId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  })
}

// 解析会话并做滑动续期：剩余不足 7 天时延长到 now + ttl（调用方传 ttl）
export function resolveSession(
  db: DatabaseSync,
  token: string,
  now: number,
  ttlMs: number,
): { userId: string } | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE token = $token').get({ token }) as
    | SessionRow
    | undefined
  if (!row) return undefined
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token = $token').run({ token })
    return undefined
  }
  if (row.expires_at < now + 7 * 24 * 3600 * 1000) {
    db.prepare('UPDATE sessions SET expires_at = $expiresAt WHERE token = $token').run({
      expiresAt: now + ttlMs,
      token,
    })
  }
  return { userId: row.user_id }
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = $token').run({ token })
}

export function deleteExpiredSessions(db: DatabaseSync, now: number): number {
  const r = db.prepare('DELETE FROM sessions WHERE expires_at <= $now').run({ now })
  return Number(r.changes)
}
