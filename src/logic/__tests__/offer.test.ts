import { describe, expect, it } from 'vitest'
import { buildOffer, isOfferExhausted, rollOfferRarity } from '../offer'
import { createBoxState, nextStateAfter } from '../boxReducer'
import { OFFER_SIZE, RARITY_RATE } from '../types'
import type { IpDef, Rarity } from '../types'

// 合成池：每个档位 3 只，方便断言「整批同档」「只给在售」
const POOL: IpDef[] = [
  { id: '000', num: 0, name: '引导', en: 'G', rarity: 'guide', tagline: '', note: '', status: 'ready' },
  ...(['street', 'street', 'street', 'limited', 'limited', 'limited', 'heat', 'heat', 'heat', 'ghost', 'ghost', 'ghost'] as Rarity[]).map(
    (r, i) =>
      ({
        id: `1${i}0`,
        num: 100 + i,
        name: `角色${i}`,
        en: `C${i}`,
        rarity: r,
        tagline: '',
        note: '',
        status: 'ready',
      }) as IpDef,
  ),
  // 未上架的不应进批次
  { id: '999', num: 999, name: '未上架', en: 'X', rarity: 'street', tagline: '', note: '', status: 'pending' },
]

const pool = POOL
const tierOf = (ids: string[]) => ids.map((id) => pool.find((p) => p.id === id)!.rarity)

// 确定性 rng：给一串 [0,1) 序列循环取用
const seqRng = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}
const fixed = (v: number) => () => v

describe('赌盒 buildOffer（内容不可见，只定系列）', () => {
  it('常规批：6 个盒子，全部是在售角色，未上架的 999 永不出现', () => {
    const box = { ...createBoxState(), firstDrawDone: true }
    const ids = buildOffer(box, pool, seqRng([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6]))
    expect(ids).toHaveLength(OFFER_SIZE)
    expect(ids).not.toContain('999')
    expect(ids.every((id) => pool.find((p) => p.id === id)?.status === 'ready')).toBe(true)
  })

  it('首抽：整批 6 个都是引导款（挑哪只都是老皮）', () => {
    const ids = buildOffer(createBoxState(), pool, fixed(0.5))
    expect(ids).toHaveLength(OFFER_SIZE)
    expect(ids.every((id) => id === '000')).toBe(true)
  })

  it('小保底到期：整批都是限定及以上（赌哪只都兑现保底）', () => {
    const box = { ...createBoxState(), firstDrawDone: true, pitySmall: 10 }
    const ids = buildOffer(box, pool, fixed(0.99)) // 0.99 本该滚到路面款
    const tiers = tierOf(ids)
    expect(tiers.every((r) => r === 'limited' || r === 'heat' || r === 'ghost')).toBe(true)
  })

  it('大保底到期：整批都是狠货及以上', () => {
    const box = { ...createBoxState(), firstDrawDone: true, pityBig: 40 }
    const tiers = tierOf(buildOffer(box, pool, fixed(0.99)))
    expect(tiers.every((r) => r === 'heat' || r === 'ghost')).toBe(true)
  })

  it('幽灵硬保底：整批都是幽灵', () => {
    const box = { ...createBoxState(), firstDrawDone: true, pityHard: 89 }
    const tiers = tierOf(buildOffer(box, pool, fixed(0.99)))
    expect(tiers.every((r) => r === 'ghost')).toBe(true)
  })

  it('池子里没有幽灵时，硬保底不会崩：照样给满 6 个盒子且不含幽灵', () => {
    const noGhost = pool.filter((p) => p.rarity !== 'ghost')
    const box = { ...createBoxState(), firstDrawDone: true, pityHard: 89 }
    const ids = buildOffer(box, noGhost, fixed(0.9))
    expect(ids).toHaveLength(OFFER_SIZE)
    expect(tierOf(ids).every((r) => r !== 'ghost')).toBe(true)
  })

  it('池子见底（只剩 2 只）也能凑满 6 个盒子，允许重样', () => {
    const tiny = pool.filter((p) => p.id === '000' || p.rarity === 'street').slice(0, 2)
    const box = { ...createBoxState(), firstDrawDone: true }
    expect(buildOffer(box, tiny, fixed(0.7))).toHaveLength(OFFER_SIZE)
  })

  it('档位概率与公示同源（幽灵 2% 起跳）', () => {
    expect(rollOfferRarity(0.001)).toBe('ghost')
    expect(rollOfferRarity(RARITY_RATE.ghost + 0.01)).toBe('heat')
    expect(rollOfferRarity(RARITY_RATE.ghost + RARITY_RATE.heat + 0.01)).toBe('limited')
    expect(rollOfferRarity(0.99)).toBe('street')
  })

  it('拆完 6 个即视为这一批用尽', () => {
    expect(isOfferExhausted(6, 2)).toBe(false)
    expect(isOfferExhausted(6, 6)).toBe(true)
  })
})

describe('赌中之后的保底推进（复用同一套计数）', () => {
  it('抽到路面款：小保底继续累计；抽到幽灵：硬保底清零', () => {
    const base = { ...createBoxState(), firstDrawDone: true }
    const street = nextStateAfter(base, 'street')
    expect(street.pitySmall).toBe(1)
    expect(street.pityHard).toBe(1)

    const ghost = nextStateAfter({ ...base, pityHard: 80 }, 'ghost')
    expect(ghost.pityHard).toBe(0)
    expect(ghost.pityBig).toBe(0)
    expect(ghost.pitySmall).toBe(0)
  })
})
