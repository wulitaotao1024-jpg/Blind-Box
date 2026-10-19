import type { Lore } from './types'

// F9 听故事：把山海经手札拼成适合 TTS 朗读的纯文本
// 朗读顺序：名称 → 出处 → 原文 → 白话故事 →（如有）考据备注
export function buildNarrationText(name: string, lore: Lore): string {
  const parts: string[] = [name]
  parts.push(`出处：${lore.source}。`)
  parts.push(`原文：${lore.quote}`)
  parts.push(`白话：${lore.story}`)
  if (lore.sourceNote && lore.sourceNote.trim()) {
    parts.push(`考据备注：${lore.sourceNote}`)
  }
  // 换行会让部分 TTS 引擎误判为分句停顿，统一压成空格
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// 浏览器是否具备语音合成能力（Electron 桌宠端同样可用）
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
