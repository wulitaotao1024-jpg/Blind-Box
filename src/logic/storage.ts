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

export function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
