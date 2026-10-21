import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

// 认证原语：scrypt 加盐散列 + 恒定时间比较 + 随机令牌。
// 密码不明文落库、不写日志；登录失败统一提示，配合假哈希均衡响应时间（防用户名枚举）。

const KEYLEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const

export const SESSION_COOKIE = 'bg_session'
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000 // 30 天滑动有效期

// 用户名规范：2-20 位，字母/数字/下划线或中文；统一转小写后入库与查询（避免大小写重复账号）
export const USERNAME_RE = /^[a-z0-9_\u4e00-\u9fa5]{2,20}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 64

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS)
  return { hash: hash.toString('hex'), salt: salt.toString('hex') }
}

export function verifyPassword(password: string, saltHex: string, hashHex: string): boolean {
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(password, salt, expected.length, SCRYPT_OPTS)
  return timingSafeEqual(actual, expected)
}

// 用户不存在时也对一份固定假哈希验一次：让「无此用户」与「密码错误」耗时接近
const DUMMY_SALT = '0'.repeat(32)
const DUMMY_HASH = '1'.repeat(128)

export function verifyPasswordUniform(
  password: string,
  user: { pass_salt: string; pass_hash: string } | undefined,
): boolean {
  if (!user) {
    verifyPassword(password, DUMMY_SALT, DUMMY_HASH)
    return false
  }
  return verifyPassword(password, user.pass_salt, user.pass_hash)
}

export function newToken(): string {
  return randomBytes(32).toString('hex')
}

export function newUserId(): string {
  return randomUUID()
}

export function validateUsername(username: unknown): string | null {
  if (typeof username !== 'string') return null
  const norm = normalizeUsername(username)
  return USERNAME_RE.test(norm) ? norm : null
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return null
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return null
  return password
}
