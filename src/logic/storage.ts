import type { BoxState } from './types'

// localStorage 适配层：MVP 本地持久化；接后端时替换此文件实现同接口即可
const KEY = 'blindgap:v1'
export interface Persisted {
  box: BoxState
  collected: string[]
  soundOn: boolean
  lastLoginDate: string // YYYY-MM-DD，用于每日登录 +1 抽
  dailyDrawUsed: boolean // 今日登录补给是否已用
  shareDrawUsed: boolean // 今日分享补给是否已用（每日上限1次）
}

const DEFAULTS: Persisted = {
  box: { drawnCount: 0, pitySmall: 0, pityBig: 0, pityHard: 0, firstDrawDone: false },
  collected: [],
  soundOn: true,
  lastLoginDate: '',
  dailyDrawUsed: false,
  shareDrawUsed: false,
}

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveState(state: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 隐私模式等场景静默降级：仅内存态
  }
}

// 登录后清空本地游戏态（box/collected/supply）：数据已迁移到服务端。
// 保留 soundOn 设备偏好，不清空。
export function resetGameState(): void {
  const cur = loadState()
  saveState({ ...DEFAULTS, soundOn: cur.soundOn })
}

// 日期工具移至 dates.ts（无 DOM 依赖，服务端 SSR 共用）；此处保持既有导出不变
export { todayStr } from './dates'
