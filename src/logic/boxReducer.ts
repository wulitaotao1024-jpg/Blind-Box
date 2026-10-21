import { PITY, RARITY_RATE } from './types'
import type { BoxState, DrawResult, IpDef, Rarity } from './types'

export const createBoxState = (): BoxState => ({
  drawnCount: 0,
  pitySmall: 0,
  pityBig: 0,
  pityHard: 0,
  firstDrawDone: false,
})

// 普通分层：幽灵 2% → 狠货 10% → 限定 33% → 路面 55%（PRD 8.2 公示概率）
export function rollRarity(rng: number): Rarity {
  if (rng < RARITY_RATE.ghost) return 'ghost'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat) return 'heat'
  if (rng < RARITY_RATE.ghost + RARITY_RATE.heat + RARITY_RATE.limited) return 'limited'
  return 'street'
}

// 强制档位下的条件抽样：
// 「限定及以上」= 限定/狠货/幽灵按 33:10:2 归一化；「狠货及以上」= 狠货/幽灵按 10:2
function rollForced(rng: number, tier: 'limited+' | 'heat+'): Rarity {
  if (tier === 'limited+') {
    const total = RARITY_RATE.limited + RARITY_RATE.heat + RARITY_RATE.ghost
    const g = RARITY_RATE.ghost / total
    const h = RARITY_RATE.heat / total
    if (rng < g) return 'ghost'
    if (rng < g + h) return 'heat'
    return 'limited'
  }
  const total = RARITY_RATE.heat + RARITY_RATE.ghost
  if (rng < RARITY_RATE.ghost / total) return 'ghost'
  return 'heat'
}

// 档位空缺重映射：当前池无该稀有度在售 IP 时（如邻里系列未上、太子形态未上）
// street→limited、ghost→heat；仍无则任意 ready 兜底。上线后重映射自动失效。
const RARITY_FALLBACK: Partial<Record<Rarity, Rarity>> = {
  street: 'limited',
  ghost: 'heat',
}

function pickByRarity(pool: IpDef[], rarity: Rarity, rng: number): IpDef {
  const ready = pool.filter((p) => p.status === 'ready')
  const chain: Rarity[] = [rarity, ...(RARITY_FALLBACK[rarity] ? [RARITY_FALLBACK[rarity]!] : [])]
  for (const r of chain) {
    const candidates = ready.filter((p) => p.rarity === r)
    if (candidates.length > 0) return candidates[Math.floor(rng * candidates.length) % candidates.length]
  }
  return ready[Math.floor(rng * ready.length) % ready.length]
}

const hasReadyRarity = (pool: IpDef[], rarity: Rarity) =>
  pool.some((p) => p.status === 'ready' && p.rarity === rarity)

/**
 * 计数推进：抽到「某稀有度」后的状态更新（以实际入手的稀有度为准）。
 * 单独抽出供「明牌六选一」复用 —— 玩家自选的那只同样按实际稀有度走保底清零。
 */
export function nextStateAfter(state: BoxState, actual: Rarity): BoxState {
  return {
    drawnCount: state.drawnCount + 1,
    pitySmall: actual === 'street' ? state.pitySmall + 1 : 0,
    pityBig: actual === 'heat' || actual === 'ghost' ? 0 : state.pityBig + 1,
    pityHard: actual === 'ghost' ? 0 : state.pityHard + 1,
    firstDrawDone: true,
  }
}

/**
 * 抽盒纯函数：给入当前状态 + RNG + IP 池，返回结果与新状态。
 * 保底优先级：幽灵硬保底 > 大保底(狠货+) > 小保底(限定+)。
 * 注意：幽灵硬保底仅在幽灵 IP 在售时强制兑现；未在售时计数照常累积，
 * 幽灵 IP 上线后的第一次开盒立即触发（不对未上线期间过度补偿）。
 * 服务端实现时应保持同一语义（PRD F1）。
 */
export function draw(
  state: BoxState,
  rng: () => number,
  pool: IpDef[],
): { result: DrawResult; next: BoxState } {
  // —— 首抽：必得引导款 000（PRD F6）——
  if (!state.firstDrawDone) {
    const guide = pool.find((p) => p.rarity === 'guide' && p.status === 'ready') ?? pool[0]
    return {
      result: { ipId: guide.id, rarity: guide.rarity, forcedBy: 'guide' },
      next: {
        ...state,
        drawnCount: state.drawnCount + 1,
        pitySmall: state.pitySmall + 1,
        pityBig: state.pityBig + 1,
        pityHard: state.pityHard + 1,
        firstDrawDone: true,
      },
    }
  }

  // —— 保底判定 ——
  let rarity: Rarity
  let forcedBy: DrawResult['forcedBy'] = 'none'

  if (state.pityHard >= PITY.hard - 1 && hasReadyRarity(pool, 'ghost')) {
    rarity = 'ghost'
    forcedBy = 'hard'
  } else if (state.pityBig >= PITY.big) {
    rarity = rollForced(rng(), 'heat+')
    forcedBy = 'big'
  } else if (state.pitySmall >= PITY.small) {
    rarity = rollForced(rng(), 'limited+')
    forcedBy = 'small'
  } else {
    rarity = rollRarity(rng())
  }

  const ip = pickByRarity(pool, rarity, rng())

  // —— 计数更新：以实际入手的 IP 稀有度为准清零对应保底 ——
  const actual = ip.rarity
  return { result: { ipId: ip.id, rarity: actual, forcedBy }, next: nextStateAfter(state, actual) }
}
