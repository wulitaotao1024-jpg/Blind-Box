import { describe, expect, it } from 'vitest'
import { buildNarrationText } from '../narration'
import type { Lore } from '../types'

const lore: Lore = {
  source: '《山海经·大荒东经》',
  quote: '其上有兽，状如牛，苍身而无角，一足，出入水则必风雨。',
  story: '夔只有一只脚，踏步就起雷，如今在气象台管预报。',
}

describe('buildNarrationText 听故事朗读文本', () => {
  it('按「名称 → 出处 → 原文 → 白话」顺序拼接', () => {
    const text = buildNarrationText('夔·气象台播报员', lore)
    const iName = text.indexOf('夔·气象台播报员')
    const iSrc = text.indexOf('《山海经·大荒东经》')
    const iQuote = text.indexOf('状如牛')
    const iStory = text.indexOf('气象台管预报')
    expect(iName).toBeLessThan(iSrc)
    expect(iSrc).toBeLessThan(iQuote)
    expect(iQuote).toBeLessThan(iStory)
  })

  it('包含原文全文与白话故事全文（不截断）', () => {
    const text = buildNarrationText('夔', lore)
    expect(text).toContain(lore.quote)
    expect(text).toContain(lore.story)
  })

  it('有 sourceNote 时追加考据备注', () => {
    const withNote: Lore = { ...lore, source: '《礼记·礼运》', sourceNote: '麒麟属四灵，不在山海经名录。' }
    const text = buildNarrationText('麒麟', withNote)
    expect(text).toContain('考据备注')
    expect(text).toContain('不在山海经名录')
  })

  it('无 sourceNote 时不出现备注字样', () => {
    const text = buildNarrationText('夔', lore)
    expect(text).not.toContain('考据备注')
  })

  it('纯文本输出：不含换行/制表符，便于 TTS 朗读', () => {
    const text = buildNarrationText('夔', lore)
    expect(text).not.toMatch(/[\n\t]/)
  })
})
