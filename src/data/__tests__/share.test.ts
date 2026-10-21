import { describe, expect, it } from 'vitest'
import { SHARE_TITLE, buildShareText } from '../share'

// 分享文案是「复制链接 +1发」的唯一入口：文案本身即推广素材，改动需可回滚、可断言
describe('分享文案 buildShareText', () => {
  const url = 'http://124.223.157.124:8080/'
  const text = buildShareText(url)

  it('带上品牌全名，粘贴出去自带品牌识别', () => {
    expect(SHARE_TITLE).toContain('盒隙')
    expect(SHARE_TITLE).toContain('BLINDGAP')
  })

  it('三行结构：钩子 / 卖点 / 链接', () => {
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain(url)
  })

  it('卖点点明「名字即归属」与「云端寄存」，与登录后的核心价值一致', () => {
    expect(text).toContain('名字即归属')
    expect(text).toContain('云端寄存')
  })

  it('链接可替换：换域名不需要改文案模板', () => {
    expect(buildShareText('https://blindgap.cn/')).toContain('https://blindgap.cn/')
  })
})
