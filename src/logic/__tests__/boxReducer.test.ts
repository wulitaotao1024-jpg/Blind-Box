import { describe, expect, it } from 'vitest'
import { createBoxState, draw, rollRarity } from '../boxReducer'
import { IPS, readyPool } from '../../data/ips'
import type { IpDef } from '../types'

/** 确定性 RNG：恒定值 */
const always = (v: number) => () => v

// 合成池：真实 ready 池 + 假想的路面款/幽灵款（用于验证保底机制本身，
// 因为当前真实池 003/004/008 pending、邻里未上，street/ghost 档位为空）
const fakeStreet: IpDef = {
  id: 'T01', num: 901, name: '假想邻里', en: 'FAKE', rarity: 'street',
  tagline: '测试用', note: '', status: 'ready',
}
const fakeGhost: IpDef = {
  id: 'T02', num: 902, name: '假想幽灵', en: 'FAKE-G', rarity: 'ghost',
  tagline: '测试用', note: '', status: 'ready',
}
const fullPool: IpDef[] = [...readyPool(IPS), fakeStreet, fakeGhost]

describe('抽盒经济 boxReducer', () => {
  it('首抽不再强制引导款：走正常随机，仍从 ready 池抽取且 firstDrawDone 置位', () => {
    const s0 = createBoxState()
    const { result, next } = draw(s0, always(0.9), fullPool)
    expect(fullPool.some((p) => p.id === result.ipId)).toBe(true)
    expect(next.firstDrawDone).toBe(true)
    expect(next.drawnCount).toBe(1)
  })

  it('普通概率分层（公示概率）：rng<0.02→幽灵, <0.12→狠货, <0.45→限定, 否则→路面', () => {
    const cases: Array<[number, string]> = [
      [0.01, 'ghost'],
      [0.019, 'ghost'],
      [0.05, 'heat'],
      [0.119, 'heat'],
      [0.2, 'limited'],
      [0.449, 'limited'],
      [0.5, 'street'],
      [0.99, 'street'],
    ]
    for (const [rng, rarity] of cases) {
      expect(rollRarity(rng)).toBe(rarity)
    }
  })

  it('空档位重映射：池无路面/幽灵在售时，路面→限定、幽灵→狠货，且只出 ready IP', () => {
    // 神兽系列已补齐路面款，故用「剔除路面+幽灵」的合成池专门验证重映射逻辑本身
    const noTierPool = readyPool(IPS).filter((p) => p.rarity !== 'street' && p.rarity !== 'ghost')
    const base = { ...createBoxState(), firstDrawDone: true }
    // rng=0.5 → 概率层rollRarity=street → 池空 → 重映射 limited
    const r1 = draw({ ...base }, always(0.5), noTierPool)
    expect(r1.result.rarity).toBe('limited')
    // rng=0.01 → rollRarity=ghost → 池空 → 重映射 heat
    const r2 = draw({ ...base }, always(0.01), noTierPool)
    expect(r2.result.rarity).toBe('heat')
  })

  it('只从 ready 池抽取（pending 的 003/004/008 不可抽出）', () => {
    const pool = readyPool(IPS)
    expect(pool.every((p) => p.status === 'ready')).toBe(true)
    const poolIds = pool.map((p) => p.id)
    let s = { ...createBoxState(), firstDrawDone: true }
    for (let i = 0; i < 30; i++) {
      const r = draw(s, Math.random, IPS)
      s = r.next
      expect(pool.some((p) => p.id === r.result.ipId)).toBe(true)
      expect(poolIds).toContain(r.result.ipId)
    }
  })

  it('小保底：连续 10 抽未出限定及以上，第 11 抽必出限定及以上并清零计数', () => {
    let s = { ...createBoxState(), firstDrawDone: true }
    for (let i = 0; i < 10; i++) {
      const r = draw(s, always(0.9), fullPool) // rng=0.9 → street
      s = r.next
      expect(r.result.rarity).toBe('street')
    }
    expect(s.pitySmall).toBe(10)
    expect(s.pityBig).toBe(10)
    const r = draw(s, always(0.9), fullPool)
    expect(r.result.forcedBy).toBe('small')
    expect(['limited', 'heat', 'ghost']).toContain(r.result.rarity)
    expect(r.next.pitySmall).toBe(0)
  })

  it('大保底：连续 40 抽未出狠货及以上，第 41 抽必出狠货及以上', () => {
    let s = { ...createBoxState(), firstDrawDone: true }
    for (let i = 0; i < 40; i++) s = draw(s, always(0.9), fullPool).next
    const r = draw(s, always(0.9), fullPool)
    expect(r.result.forcedBy).toBe('big')
    expect(['heat', 'ghost']).toContain(r.result.rarity)
    expect(r.next.pityBig).toBe(0)
    expect(r.next.pitySmall).toBe(0)
  })

  it('幽灵硬保底：独立计数，第 90 抽必出幽灵（幽灵在售时）', () => {
    let s = { ...createBoxState(), firstDrawDone: true }
    for (let i = 0; i < 89; i++) s = draw(s, always(0.9), fullPool).next
    const r = draw(s, always(0.9), fullPool)
    expect(r.result.rarity).toBe('ghost')
    expect(r.result.forcedBy).toBe('hard')
    expect(r.next.pityHard).toBe(0)
  })

  it('幽灵未在售时硬保底不强制：照常抽数且计数累积不清零（004 上线后立即兑现）', () => {
    let s = { ...createBoxState(), firstDrawDone: true }
    for (let i = 0; i < 89; i++) s = draw(s, always(0.9), IPS).next
    const r = draw(s, always(0.9), IPS)
    expect(r.result.rarity).not.toBe('ghost')
    expect(r.result.forcedBy).not.toBe('hard')
    expect(r.next.pityHard).toBe(90)
  })

  it('抽中即清零对应保底：限定清小保底、狠货清大保底、幽灵清硬保底', () => {
    let s = { ...createBoxState(), firstDrawDone: true }
    s = draw(s, always(0.3), fullPool).next // limited
    expect(s.pitySmall).toBe(0)
    expect(s.pityBig).toBe(1)
    s = draw(s, always(0.05), fullPool).next // heat
    expect(s.pityBig).toBe(0)
    s = draw(s, always(0.01), fullPool).next // ghost（合成池幽灵在售）
    expect(s.pityHard).toBe(0)
    expect(s.pitySmall).toBe(0)
  })
})
