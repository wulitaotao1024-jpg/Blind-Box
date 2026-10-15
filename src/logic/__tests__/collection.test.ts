import { describe, expect, it } from 'vitest'
import { collect, isComplete, progress } from '../collection'
import { IPS } from '../../data/ips'

describe('图鉴 collection', () => {
  it('collect 新收录返回 isNew=true 且入集', () => {
    const r = collect(new Set<string>(), '001')
    expect(r.isNew).toBe(true)
    expect(r.set.has('001')).toBe(true)
  })

  it('collect 重复收录返回 isNew=false（MVP：重复不亏）', () => {
    const r = collect(new Set(['001']), '001')
    expect(r.isNew).toBe(false)
    expect(r.set.size).toBe(1)
  })

  it('progress 计算点亮进度', () => {
    const p = progress(new Set(['000', '001']), IPS)
    expect(p.collected).toBe(2)
    expect(p.total).toBe(9)
  })

  it('isComplete 端盒判定：集齐当期全部在售（ready）IP', () => {
    const readyIds = IPS.filter((p) => p.status === 'ready').map((p) => p.id)
    expect(isComplete(new Set(readyIds), IPS)).toBe(true)
    expect(isComplete(new Set(readyIds.slice(1)), IPS)).toBe(false)
  })

  it('pending IP 不计入端盒（003/004/008 素材未上不影响端盒）', () => {
    const readyIds = IPS.filter((p) => p.status === 'ready').map((p) => p.id)
    const withPendingExtra = new Set([...readyIds, '004'])
    expect(isComplete(withPendingExtra, IPS)).toBe(true)
  })
})
