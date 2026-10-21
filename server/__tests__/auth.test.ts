import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
  verifyPassword,
  verifyPasswordUniform,
} from '../auth'

describe('密码散列 auth', () => {
  it('同一密码两次散列得到不同盐（随机盐）', () => {
    const a = hashPassword('12345678')
    const b = hashPassword('12345678')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(verifyPassword('12345678', a.salt, a.hash)).toBe(true)
    expect(verifyPassword('12345678', b.salt, b.hash)).toBe(true)
  })

  it('校验：正确密码通过、错误密码拒绝', () => {
    const { hash, salt } = hashPassword('correct-horse')
    expect(verifyPassword('correct-horse', salt, hash)).toBe(true)
    expect(verifyPassword('wrong-horse', salt, hash)).toBe(false)
  })

  it('防篡改：改动散列或盐的任一字节都不能通过', () => {
    const { hash, salt } = hashPassword('blindgap-2026')
    const flipped = (hex: string): string => {
      const last = hex.slice(-1)
      return hex.slice(0, -1) + (last === '0' ? '1' : '0')
    }
    expect(verifyPassword('blindgap-2026', salt, flipped(hash))).toBe(false)
    expect(verifyPassword('blindgap-2026', flipped(salt), hash)).toBe(false)
  })

  it('散列产物为定长 hex（盐 32 位 / 摘要 128 位）', () => {
    const { hash, salt } = hashPassword('x')
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{128}$/)
  })

  it('假哈希均衡：用户不存在时验伪也返回 false（防计时枚举）', () => {
    expect(verifyPasswordUniform('whatever', undefined)).toBe(false)
    const { hash, salt } = hashPassword('real-user')
    expect(verifyPasswordUniform('whatever', { pass_salt: salt, pass_hash: hash })).toBe(false)
    expect(verifyPasswordUniform('real-user', { pass_salt: salt, pass_hash: hash })).toBe(true)
  })
})

describe('用户名/密码规范', () => {
  it('用户名：2-20 位字母数字下划线或中文，统一转小写', () => {
    expect(validateUsername('ab')).toBe('ab')
    expect(validateUsername('tao_2026')).toBe('tao_2026')
    expect(validateUsername('老街猫')).toBe('老街猫')
    expect(validateUsername('  Tao_1 ')).toBe('tao_1')
    expect(validateUsername('a')).toBeNull()
    expect(validateUsername('a'.repeat(21))).toBeNull()
    expect(validateUsername('tao-tao')).toBeNull()
    expect(validateUsername('tao tao')).toBeNull()
    expect(validateUsername(123)).toBeNull()
  })

  it('密码：8-64 位', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN))).not.toBeNull()
    expect(validatePassword('a'.repeat(PASSWORD_MAX))).not.toBeNull()
    expect(validatePassword('a'.repeat(PASSWORD_MIN - 1))).toBeNull()
    expect(validatePassword('a'.repeat(PASSWORD_MAX + 1))).toBeNull()
    expect(validatePassword(undefined)).toBeNull()
  })

  it('normalizeUsername：去首尾空白 + 小写', () => {
    expect(normalizeUsername('  ABC ')).toBe('abc')
    expect(normalizeUsername('老皮')).toBe('老皮')
  })
})
