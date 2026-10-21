import { GUIDE_CHANCE, OFFER_SIZE, PITY, RARITY_RATE } from './types'
import type { BoxState, IpDef, Rarity } from './types'

/**
 * 赌盒六选一（F1 交互）：每次开盒前先摊 8 个**封着、看不见内容**的盒子。
 * 盒子不贴任何系列标签 —— 玩家看不到里面是什么、属于哪个档位，纯凭手气赌一只。
 *
 * 设计要点：
 * - 内容不可见，所以「8 只互不重复」不再是必须；档位够多时仍尽量不重样
 * - 档位走公示掉率（路面 55% / 限定 33% / 狠货 10% / 幽灵 2%）
 * - 引导款（老皮 000）被移出首抽强制：现在以约 1% 概率作为「偶发彩蛋」随机掉落，
 *   既满足「首抽不必是老皮」，也保证图鉴里的 000 仍可集齐
 * - 保底到期时**整批 8 只都是该档位** —— 内容不可见的前提下，只有整批同档
 *   才能保证「无论玩家赌哪一只都兑现保底」，否则保底会被玩家的选择绕开
 */

// 按公示掉率滚档位（guide 不进池，只在首抽出现）
export function rollOfferRarity(rng: number): Rarity {
  if (rng < RARITY_RATE.ghost) return 'ghost'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat) return 'heat'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat + RARITY_RATE.limited) return 'limited'
  return 'street'
}

// 保底到期 → 整批都要是该档位（档位空缺时向上兼容：ghost 不可售则 heat，heat 不可售则 limited）
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

/** Fisher–Yates（用外部注入的 rng，前后端可复现） */
function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 整批 6 只都填成同一档位（池子不够就允许重样 —— 反正看不见内容） */
function fillTier(ready: IpDef[], rarity: Rarity, rng: () => number): string[] | null {
  const cands = ready.filter((p) => p.rarity === rarity)
  if (cands.length === 0) return null
  const bag = shuffle(cands, rng)
  return Array.from({ length: OFFER_SIZE }, (_, i) => bag[i % bag.length].id)
}

/** 生成一批 8 个盒子里的 IP 编号（纯函数，前后端共用同一语义；只对服务端可见） */
export function buildOffer(box: BoxState, pool: IpDef[], rng: () => number): string[] {
  const ready = pool.filter((p) => p.status === 'ready')
  const guide = ready.find((p) => p.rarity === 'guide')

  // 保底到期：整批都是该档位，玩家赌哪只都兑现
  const tier = requiredTier(box, pool)
  if (tier) {
    for (const r of TIER_CHAIN[tier]) {
      const ids = fillTier(ready, r, rng)
      if (ids) return shuffle(ids, rng)
    }
  }

  // 常规批：逐个名额按公示掉率滚档位；同档优先给不同的角色（不重复更好看，重样也无所谓）。
  // 引导款（老皮）作为偶发彩蛋：约 GUIDE_CHANCE 概率直接落一只，保证仍可集齐但绝不强制首抽。
  const out: string[] = []
  const used = new Set<string>()
  const pickSlot = (): string | null => {
    if (guide && !used.has(guide.id) && rng() < GUIDE_CHANCE) {
      used.add(guide.id)
      return guide.id
    }
    const rarity = rollOfferRarity(rng())
    const cands = ready.filter((p) => p.rarity === rarity)
    if (cands.length === 0) return null
    const fresh = cands.filter((p) => !used.has(p.id))
    const bag = fresh.length > 0 ? fresh : cands
    const pick = bag[Math.floor(rng() * bag.length) % bag.length]
    used.add(pick.id)
    return pick.id
  }

  // 该档位没货时 pickSlot 会回 null，重试即可（下一个名额重新滚一次档位）
  let guard = 0
  while (out.length < OFFER_SIZE && guard++ < OFFER_SIZE * 16) {
    const id = pickSlot()
    if (id) out.push(id)
  }
  // 兜底：池子偏门时补任意在售角色，保证一定凑满 8 个盒子
  while (out.length < OFFER_SIZE && ready.length > 0) {
    const pick = ready[Math.floor(rng() * ready.length) % ready.length]
    out.push(pick.id)
  }

  return shuffle(out, rng)
}

/** 这一批是否已经拆完（盒子总数 / 已拆数） */
export const isOfferExhausted = (total: number, openedCount: number): boolean =>
  openedCount >= total
