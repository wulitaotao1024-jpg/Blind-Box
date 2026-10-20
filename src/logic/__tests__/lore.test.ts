import { describe, expect, it } from 'vitest'
import { IPS } from '../../data/ips'
import { LORE } from '../../data/lore'

// 资产守卫：lore 引用的 mp3 必须真实存在于 public/audio（vite 原生 glob，无需 node 类型）
// 注意：vitest 下须用根相对模式，'../../' 相对模式匹配不到 public 目录
const AUDIO_FILES = import.meta.glob('/public/audio/*.mp3')
const hasAudioFile = (rel: string) => Object.keys(AUDIO_FILES).some((k) => k.endsWith(`/${rel}`))

const SHENSHOU = IPS.filter((p) => p.num >= 9 && p.num <= 20)

describe('F9 山海经手札 lore 数据', () => {
  it('神兽系列 12 只全部配了 lore', () => {
    expect(SHENSHOU).toHaveLength(12)
    for (const ip of SHENSHOU) {
      expect(LORE[ip.id], `缺少 ${ip.id} ${ip.name}`).toBeDefined()
    }
  })

  it('每条 lore 的 source / quote / story 均非空', () => {
    for (const ip of SHENSHOU) {
      const l = LORE[ip.id]
      expect(l.source.trim().length, `${ip.id} source`).toBeGreaterThan(0)
      expect(l.quote.trim().length, `${ip.id} quote`).toBeGreaterThan(0)
      expect(l.story.trim().length, `${ip.id} story`).toBeGreaterThan(0)
    }
  })

  it('source 必须带书名号（标明典籍）', () => {
    for (const ip of SHENSHOU) {
      expect(LORE[ip.id].source, `${ip.id} source 缺书名号`).toMatch(/《.+》/)
    }
  })

  it('quote 为典籍原文：长度适中（20–200 字）', () => {
    for (const ip of SHENSHOU) {
      const len = LORE[ip.id].quote.replace(/\s/g, '').length
      expect(len, `${ip.id} quote 长度异常`).toBeGreaterThanOrEqual(20)
      expect(len, `${ip.id} quote 长度异常`).toBeLessThanOrEqual(200)
    }
  })

  it('非《山海经》出场的异兽，source 必须如实写明具体典籍（不许含糊）', () => {
    for (const ip of SHENSHOU) {
      const l = LORE[ip.id]
      if (!l.source.includes('山海经')) {
        expect(l.source, `${ip.id} 出处必须写明具体典籍名`).toMatch(/《[^《》]{2,}》/)
      }
    }
  })

  it('LORE 不存在多余键（key 必须对应真实 IP 编号）', () => {
    const known = new Set(IPS.map((p) => p.id))
    for (const key of Object.keys(LORE)) {
      expect(known.has(key), `LORE 存在未知 key: ${key}`).toBe(true)
    }
  })

  it('audio 引用的 mp3 必须真实存在于 public/audio', () => {
    for (const ip of SHENSHOU) {
      const rel = LORE[ip.id].audio
      if (!rel) {
        throw new Error(`${ip.id} 缺少 audio 配音字段`)
      }
      expect(rel, `${ip.id} audio 必须以 audio/ 开头`).toMatch(/^audio\/[\w-]+\.mp3$/)
      expect(hasAudioFile(rel), `${ip.id} audio 指向的文件不存在: public/${rel}`).toBe(true)
    }
  })
})
