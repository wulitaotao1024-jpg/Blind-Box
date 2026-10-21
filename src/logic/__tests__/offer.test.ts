import { describe, expect, it } from 'vitest'
import { buildOffer, isOfferExhausted, rollOfferRarity } from '../offer'
import { createBoxState, nextStateAfter } from '../boxReducer'
import { OFFER_SIZE, RARITY_RATE } from '../types'
import type { IpDef, Rarity } from '../types'

// 合成池：每个档位都够 6 只，方便断言「6 只互不重复」「保底档位必现」
const pool: IpDef[] = [
  { id: '000', num: 0, name: '引导', en: 'G', rarity: 'guide', tagline: '', note: '', status: 'ready' },
  ...(['street', 'street', 'limited', 'limited', 'heat', 'heat', 'ghost', 'ghost'] as Rarity[]).map(
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

// 确定性 rng：给一串 [0,1) 序列循环取用
const seqRng = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('明牌六选一 buildOffer', () => {
  it('每批 6 只且互不重复', () => {
    const box = { ...createBoxState(), firstDrawDone: true }
    const ids = buildOffer(box, pool, seqRng([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6]))
    expect(ids).toHaveLength(OFFER_SIZE)
    expect(new Set(ids).size).toBe(OFFER_SIZE)
  })

  it('只给在售（ready）角色，未上架的 999 永不出现', () => {
    const box = { ...createBoxState(), firstDrawDone: true }
    const ids = buildOffer(box, pool, seqRng([0.05, 0.99, 0.44, 0.2, 0.6, 0.8, 0.1, 0.3]))
    expect(ids).not.toContain('999')
  })

  it('首抽批次必含引导款 000（客户端据此锁定其余，保住首抽必得）', () => {
    const ids = buildOffer(createBoxState(), pool, seqRng([0.5, 0.6, 0.7, 0.8, 0.9, 0.1]))
    expect(ids).toContain('000')
  })

  it('小保底到期：这一批至少有一张限定及以上', () => {
    const box = { ...createBoxState(), firstDrawDone: true, pitySmall: 10 }
    const ids = buildOffer(box, pool, seqRng([0.99, 0.98, 0.97, 0.96, 0.95, 0.94]))
    // 0.99 → street 档；但保底要求必须补一张 limited+
    const tiers = ids.map((id) => pool.find((p) => p.id === id)!.rarity)
    expect(tiers.some((r) => r === 'limited' || r === 'heat' || r === 'ghost')).toBe(true)
  })

  it('档位概率与公示同源（幽灵 2% 起跳）', () => {
    expect(rollOfferRarity(0.001)).toBe('ghost')
    expect(rollOfferRarity(RARITY_RATE.ghost + 0.01)).toBe('heat')
    expect(rollOfferRarity(RARITY_RATE.ghost + RARITY_RATE.heat + 0.01)).toBe('limited')
    expect(rollOfferRarity(0.99)).toBe('street')
  })

  it('拆完 6 只即视为这一批用尽', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(isOfferExhausted(ids, ['a', 'b'])).toBe(false)
    expect(isOfferExhausted(ids, ids)).toBe(true)
  })
})

describe('明牌自选后的保底推进（六选一复用同一套计数）', () => {
  it('自选到路面款：小保底继续累计；自选到幽灵：硬保底清零', () => {
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
