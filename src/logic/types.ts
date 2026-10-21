// 抽盒平台核心类型定义（依据 PRD 第七章 F1 / 第八章）
export type Rarity = 'guide' | 'street' | 'limited' | 'heat' | 'ghost'

export interface IpDef {
  id: string // 三位数编号，如 '000'
  num: number
  name: string // 中文名
  en: string // 英文 tag
  rarity: Rarity
  tagline: string // 一句话设定（≤20字）
  note: string // 主理人手记（2-3句）
  quote?: string // 开盒台词
  status: 'ready' | 'pending' // 素材是否已上线（pending=素材待补充）
  lore?: Lore // 山海经手札（F9）：仅神兽系列配置
}

// 山海经手札（F9「抽盒即读经」）：典籍出处 + 原文 + 白话故事
export interface Lore {
  source: string // 典籍出处，如《山海经·南山经》
  sourceNote?: string // 出处说明；非《山海经》名录的异兽必填
  quote: string // 典籍原文摘录（不可篡改）
  story: string // 白话故事（第六大道世界观）
  audio?: string // 预渲染配音（edge-tts 神经语音·低沉解说声线，默认且唯一），public/ 相对路径
}

// 保底/抽盒状态：服务端持久化模型（MVP 用 localStorage 模拟）
export interface BoxState {
  drawnCount: number // 累计开盒数（幽灵硬保底独立计数）
  pitySmall: number // 连续未出「限定及以上」的抽数
  pityBig: number // 连续未出「狠货及以上」的抽数
  pityHard: number // 距上次幽灵的抽数（硬保底，独立计数）
  firstDrawDone: boolean // 首抽（引导款）是否完成
}

export interface DrawResult {
  ipId: string
  rarity: Rarity
  // 'pick' = 玩家从当批 6 个明牌里自己选的那一只（F1「六选一」交互）
  forcedBy: 'guide' | 'none' | 'small' | 'big' | 'hard' | 'pick'
}

// 每批盲盒盒子数量与「换一批」上限（F1 交互）
export const OFFER_SIZE = 8
// 换一批上限：每批限 2 次（一批最多看 3 组）。想调松/调紧只改这一个常量（服务端同步生效）。
export const OFFER_REROLL_LIMIT = 2

// 引导款（老皮·幼年 000）不在公示四档概率内，作为「偶发彩蛋」掉落：
// 每盒约 1% 概率直接是老皮。这样「首抽不必是老皮」的同时，老皮仍可被抽到、图鉴可集齐。
// 必须严格 < 0.01 —— 单测用 always(0.01) 触发 ghost 重映射，不能误伤。
export const GUIDE_CHANCE = 0.01

// 保底数值（PRD F1 参考值，已拍板）
export const PITY = {
  small: 10, // 连续 N 抽未出限定及以上 → 第 N+1 抽必出
  big: 40, // 连续 M 抽未出狠货及以上 → 第 M+1 抽必出
  hard: 90, // 每 K 抽必出 1 个幽灵（独立计数）
} as const

// 建议掉率（PRD 8.2）
export const RARITY_RATE = {
  ghost: 0.02,
  heat: 0.1,
  limited: 0.33,
  street: 0.55,
} as const
