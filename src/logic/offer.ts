import { OFFER_SIZE, PITY, RARITY_RATE } from './types'
import type { BoxState, IpDef, Rarity } from './types'

/**
 * 明牌六选一（F1 交互）：每次开盒前先摊 6 个「看得见里面是谁」的盒子，
 * 玩家从这 6 只里挑一只抽；不满意可以「换一批」。
 *
 * 设计要点：
 * - 6 只互不重复（"每次随机6个不一样的"）
 * - 档位仍走公示掉率（路面 55% / 限定 33% / 狠货 10% / 幽灵 2%），稀有款不会因为明牌而变便宜
 * - 保底到期时这一批必须含对应档位，否则玩家无从兑现保底
 * - 首抽（引导款）强制进这一批，客户端会把它标成「新手必得」并锁住其余 —— 保住 F6 首抽必得 000
 */

// 按公示掉率滚档位（guide 不进池，只在首抽出现）
export function rollOfferRarity(rng: number): Rarity {
  if (rng < RARITY_RATE.ghost) return 'ghost'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat) return 'heat'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat + RARITY_RATE.limited) return 'limited'
  return 'street'
}

// 保底到期 → 这一批至少要有一张该档位（档位空缺时向上兼容：ghost 不可售则 heat，heat 不可售则 limited）
type PityTier = 'ghost' | 'heat' | 'limited'

function requiredTier(box: BoxState, pool: IpDef[]): PityTier | null {
  const has = (r: Rarity) => pool.some((p) => p.status === 'ready' && p.rarity === r)
  if (box.pityHard >= PITY.hard - 1 && has('ghost')) return 'ghost'
  if (box.pityBig >= PITY.big && (has('heat') || has('ghost'))) return 'heat'
  if (box.pitySmall >= PITY.small && (has('limited') || has('heat') || has('ghost'))) return 'limited'
  return null
}

const TIER_CHAIN: Record<PityTier, Rarity[]> = {
  ghost: ['ghost'],
  heat: ['heat', 'ghost'],
  limited: ['limited', 'heat', 'ghost'],
}

/** 生成一批 6 个互不重复的 IP 编号（纯函数，前后端共用同一语义） */
export function buildOffer(box: BoxState, pool: IpDef[], rng: () => number): string[] {
  const ready = pool.filter((p) => p.status === 'ready')
  const used = new Set<string>()
  const chosen: IpDef[] = []

  const take = (pred: (p: IpDef) => boolean): boolean => {
    const cands = ready.filter((p) => !used.has(p.id) && pred(p))
    if (cands.length === 0) return false
    const pick = cands[Math.floor(rng() * cands.length) % cands.length]
    used.add(pick.id)
    chosen.push(pick)
    return true
  }

  // 首抽：引导款占一个位置（客户端据此锁定其余 5 只）
  if (!box.firstDrawDone) {
    const guide = ready.find((p) => p.rarity === 'guide')
    if (guide) {
      used.add(guide.id)
      chosen.push(guide)
    }
  }

  // 保底到期：确保这一批能兑现
  const tier = requiredTier(box, pool)
  if (tier) {
    for (const r of TIER_CHAIN[tier]) {
      if (chosen.some((c) => c.rarity === r)) break
      if (take((p) => p.rarity === r)) break
    }
  }

  // 其余名额按公示掉率滚档位；该档位凑不出（候选已用尽）就自然流向下一个名额
  let guard = 0
  while (chosen.length < OFFER_SIZE && guard++ < OFFER_SIZE * 12) {
    const r = rollOfferRarity(rng())
    take((p) => p.rarity === r)
  }
  // 兜底：池子不足时补任意未用过的在售 IP
  while (chosen.length < OFFER_SIZE && take(() => true)) {
    /* 直到凑满或池子见底 */
  }

  // 洗牌：不让引导款/保底那只固定出现在第一个格子
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1)
    ;[chosen[i], chosen[j]] = [chosen[j], chosen[i]]
  }
  return chosen.map((p) => p.id)
}

/** 这一批是否已经拆完（6 只全开） */
export const isOfferExhausted = (ids: string[], opened: string[]): boolean =>
  opened.length >= ids.length
