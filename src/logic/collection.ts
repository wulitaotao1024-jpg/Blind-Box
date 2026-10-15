import type { IpDef } from './types'

// 图鉴墙逻辑（PRD F2）：图鉴墙 = 第六大道街区花名册
export function collect(set: ReadonlySet<string>, id: string): { set: Set<string>; isNew: boolean } {
  if (set.has(id)) return { set: new Set(set), isNew: false }
  const next = new Set(set)
  next.add(id)
  return { set: next, isNew: true }
}

export function progress(collected: ReadonlySet<string>, pool: IpDef[]): { collected: number; total: number } {
  return { collected: collected.size, total: pool.length }
}

// 端盒判定：集齐当期全部在售（ready）IP；pending IP 不阻塞端盒
export function isComplete(collected: ReadonlySet<string>, pool: IpDef[]): boolean {
  return pool.filter((p) => p.status === 'ready').every((p) => collected.has(p.id))
}
