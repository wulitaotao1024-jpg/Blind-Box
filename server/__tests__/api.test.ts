import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiHandler } from '../api'
import { openDatabase } from '../db'
import { todayStr } from '../../src/logic/dates'
import type { IpDef } from '../../src/logic/types'

// —— 测试基建：临时库 + 临时端口 + 手工 cookie jar ——

const fakeGhost: IpDef = {
  id: 'T02',
  num: 902,
  name: '假想幽灵',
  en: 'FAKE-G',
  rarity: 'ghost',
  tagline: '测试用',
  note: '',
  status: 'ready',
}

const fakeHeat: IpDef = {
  id: 'T01',
  num: 901,
  name: '假想狠货',
  en: 'FAKE-H',
  rarity: 'heat',
  tagline: '测试用',
  note: '',
  status: 'ready',
}

const ghostPool: IpDef[] = [
  {
    id: '000',
    num: 0,
    name: '老皮·幼年',
    en: 'LIL PI',
    rarity: 'guide',
    tagline: '测试用',
    note: '',
    status: 'ready',
  },
  {
    id: '001',
    num: 1,
    name: '阿涛',
    en: 'TAO',
    rarity: 'limited',
    tagline: '测试用',
    note: '',
    status: 'ready',
  },
  fakeHeat,
  fakeGhost,
]

interface StartedApi {
  baseUrl: string
  close: () => Promise<void>
}

let database: DatabaseSync
let dir: string
let api: StartedApi

// 关闭当前实例再开新的（限流桶/数据库均随实例重置），避免 afterEach 只关最后一个
async function restartApi(
  options: { pool?: IpDef[]; rateLimit?: { limit: number; windowMs: number } } = {},
): Promise<void> {
  await api.close()
  api = await startApi(options)
}

async function startApi(options: {
  pool?: IpDef[]
  rateLimit?: { limit: number; windowMs: number }
} = {}): Promise<StartedApi> {
  dir = mkdtempSync(join(tmpdir(), 'blindgap-api-'))
  database = openDatabase(join(dir, 'test.db'))
  const server = createServer(createApiHandler({ db: database, ...options }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          database.close()
          rmSync(dir, { recursive: true, force: true })
          resolve()
        })
      }),
  }
}

type CallResult = { status: number; json: any; setCookie: string | null }

class Client {
  cookie = ''

  async call(
    path: string,
    opts: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {},
  ): Promise<CallResult> {
    const headers: Record<string, string> = { ...opts.headers }
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (this.cookie) headers.cookie = this.cookie
    const res = await fetch(api!.baseUrl + path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    })
    const setCookies = res.headers.getSetCookie?.() ?? []
    const setCookie = setCookies[0] ?? res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    return { status: res.status, json: await res.json().catch(() => null), setCookie }
  }

  async register(username: string, password = '12345678'): Promise<CallResult> {
    return this.call('/api/auth/register', { method: 'POST', body: { username, password } })
  }

  async login(username: string, password = '12345678'): Promise<CallResult> {
    return this.call('/api/auth/login', { method: 'POST', body: { username, password } })
  }

  async draw(): Promise<CallResult> {
    return this.call('/api/draw', { method: 'POST' })
  }
}

const CRED = { username: 'taotao', password: 'blindgap2026' }

beforeEach(async () => {
  api = await startApi({ rateLimit: { limit: 1000, windowMs: 60_000 } })
})

afterEach(async () => {
  await api.close()
})

describe('注册/登录/登出 全链路', () => {
  it('注册即发会话，me 返回默认状态（1 发登录补给、空图鉴）', async () => {
    const c = new Client()
    const r = await c.register(CRED.username, CRED.password)
    expect(r.status).toBe(201)
    expect(r.json.user.username).toBe('taotao')
    expect(r.json.user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.setCookie).toContain('bg_session=')
    expect(r.setCookie).toContain('HttpOnly')
    expect(r.setCookie).toContain('SameSite=Lax')

    const me = await c.call('/api/me')
    expect(me.status).toBe(200)
    expect(me.json.user.username).toBe('taotao')
    expect(me.json.drawsLeft).toBe(1) // 初始只有登录补给；分享补给要点「复制链接」才 +1
    expect(me.json.box).toEqual({
      drawnCount: 0,
      pitySmall: 0,
      pityBig: 0,
      pityHard: 0,
      firstDrawDone: false,
    })
    expect(me.json.cards).toEqual([])
    expect(me.json.supply).toEqual({
      lastLoginDate: todayStr(),
      dailyDrawUsed: false,
      shareDrawUsed: false,
      drawsBonus: 0,
    })
  })

  it('重名注册 409（USERNAME_TAKEN）；用户名统一小写后判重（Tao 与 tao 同号）', async () => {
    const a = new Client()
    expect((await a.register('taotao')).status).toBe(201)
    const b = new Client()
    const dup = await b.register('TAOTAO')
    expect(dup.status).toBe(409)
    expect(dup.json.code).toBe('USERNAME_TAKEN')
  })

  it('登录：正确密码发会话；错误密码与不存在用户分别返回 BAD_CREDENTIAL / NO_USER', async () => {
    const a = new Client()
    await a.register(CRED.username, CRED.password)

    const wrong = new Client()
    const r1 = await wrong.login(CRED.username, 'wrong-password')
    expect(r1.status).toBe(401)
    expect(r1.json.code).toBe('BAD_CREDENTIAL')
    expect(r1.json.error).toBe('登录失败，密码不正确')

    const nobody = new Client()
    const r2 = await nobody.login('no-such-user', '12345678')
    expect(r2.status).toBe(401)
    expect(r2.json.code).toBe('NO_USER')
    expect(r2.json.error).toBe('该账号尚未注册，请先注册')

    const ok = new Client()
    const r3 = await ok.login(CRED.username, CRED.password)
    expect(r3.status).toBe(200)
    expect(r3.json.user.username).toBe('taotao')
    expect((await ok.call('/api/me')).json.user.username).toBe('taotao')
  })

  it('登出后会话失效、cookie 被清除', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    const out = await c.call('/api/auth/logout', { method: 'POST' })
    expect(out.status).toBe(200)
    expect(out.setCookie).toContain('Max-Age=0')
    expect((await c.call('/api/me')).status).toBe(401)
  })

  it('参数校验：短用户名/短密码 400，非法 JSON 400，空体 400', async () => {
    const c = new Client()
    expect((await c.register('a')).status).toBe(400)
    expect((await c.register('okname', '1234567')).status).toBe(400)
    const bad = await c.call('/api/auth/register', { method: 'POST', raw: 'not-json' })
    expect(bad.status).toBe(400)
    const empty = await c.call('/api/auth/register', { method: 'POST' })
    expect(empty.status).toBe(400)
  })
})

describe('未登录访问控制', () => {
  it('me/draw/share/migrate 一律 401', async () => {
    const c = new Client()
    expect((await c.call('/api/me')).status).toBe(401)
    expect((await c.call('/api/draw', { method: 'POST' })).status).toBe(401)
    expect((await c.call('/api/share', { method: 'POST' })).status).toBe(401)
    expect((await c.call('/api/migrate', { method: 'POST', body: {} })).status).toBe(401)
  })

  it('游客带伪造 cookie 也拿不到数据', async () => {
    const c = new Client()
    c.cookie = 'bg_session=deadbeef'
    expect((await c.call('/api/me')).status).toBe(401)
  })
})

describe('抽盒 /api/draw（服务端抽卡 + 保底计数）', () => {
  it('首抽必得 000 引导款；登录补给扣完即 409，分享 +1 后可继续抽', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)

    const first = await c.draw()
    expect(first.status).toBe(200)
    expect(first.json.result).toEqual({ ipId: '000', rarity: 'guide', forcedBy: 'guide' })
    expect(first.json.isNew).toBe(true)
    expect(first.json.box.firstDrawDone).toBe(true)
    expect(first.json.box.drawnCount).toBe(1)
    expect(first.json.drawsLeft).toBe(0) // 今日仅 1 发登录补给；分享补给需点分享才到账

    const blocked = await c.draw()
    expect(blocked.status).toBe(409)
    expect(blocked.json.error).toContain('补给已用完')

    // 分享 +1：真加一发（余额），而不是把某个标记置为已用
    const shared = await c.call('/api/share', { method: 'POST' })
    expect(shared.json.granted).toBe(true)
    expect(shared.json.drawsLeft).toBe(1)

    const second = await c.draw()
    expect(second.status).toBe(200)
    expect(second.json.isNew).toBe(true)
    expect(second.json.result.ipId).not.toBe('000') // 非首抽不会再出引导款
    expect(second.json.drawsLeft).toBe(0)

    const third = await c.draw()
    expect(third.status).toBe(409)

    const me = await c.call('/api/me')
    expect(me.json.box.drawnCount).toBe(2)
    expect(me.json.cards).toHaveLength(2)
    expect(me.json.cards.map((x: any) => x.ipId).sort()).toEqual(
      ['000', second.json.result.ipId].sort(),
    )
    expect(me.json.cards.every((x: any) => x.count === 1)).toBe(true)
    expect(me.json.drawsLeft).toBe(0)
    expect(me.json.supply.dailyDrawUsed).toBe(true)
    expect(me.json.supply.shareDrawUsed).toBe(true)
    expect(me.json.supply.drawsBonus).toBe(0) // 分享领的那发已被第二抽用掉
  })

  it('跨天自动恢复补给（服务端 F5 重置）', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    await c.draw()
    expect((await c.draw()).status).toBe(409)

    // 直接把库内 supply 改到昨天，模拟用户第二天再来
    database.prepare('UPDATE supply SET last_login_date = $d').run({
      d: '2020-01-01',
    })
    const me = await c.call('/api/me')
    expect(me.json.drawsLeft).toBe(1) // 新的一天：登录补给恢复，分享补给需重新分享
    expect(me.json.supply.dailyDrawUsed).toBe(false)
    expect(me.json.supply.drawsBonus).toBe(0)
  })
})

describe('分享补给 /api/share', () => {
  it('分享真 +1 发（不占次数），当日仅一次', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)

    // 1 发登录补给 + 分享 +1 = 2 发
    const s1 = await c.call('/api/share', { method: 'POST' })
    expect(s1.status).toBe(200)
    expect(s1.json.granted).toBe(true)
    expect(s1.json.drawsLeft).toBe(2)
    expect(s1.json.supply.shareDrawUsed).toBe(true)
    expect(s1.json.supply.drawsBonus).toBe(1)

    expect((await c.draw()).json.drawsLeft).toBe(1) // 扣登录补给，分享余额还在
    expect((await c.draw()).json.drawsLeft).toBe(0) // 再扣分享余额
    expect((await c.draw()).status).toBe(409)

    // 重复分享不再加发
    const s2 = await c.call('/api/share', { method: 'POST' })
    expect(s2.json.granted).toBe(false)
    expect(s2.json.drawsLeft).toBe(0)
  })
})

describe('存量迁移 /api/migrate', () => {
  it('空账号：合并本地数据（卡/保底/当日补给标记）', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)

    const r = await c.call('/api/migrate', {
      method: 'POST',
      body: {
        box: { drawnCount: 5, pitySmall: 3, pityBig: 7, pityHard: 12, firstDrawDone: true },
        collected: ['001', '005', '008', '999'], // 999 不在阵容，应被过滤
        supply: { lastLoginDate: todayStr(), dailyDrawUsed: true, shareDrawUsed: false },
      },
    })
    expect(r.status).toBe(200)
    expect(r.json.migrated).toBe(true)
    expect(r.json.box.drawnCount).toBe(5)
    expect(r.json.box.pityHard).toBe(12)
    expect(r.json.cards.map((x: any) => x.ipId).sort()).toEqual(['001', '005', '008'])
    expect(r.json.drawsLeft).toBe(0) // 当日登录补给已用的标记被保留 → 需分享才能再抽

    const me = await c.call('/api/me')
    expect(me.json.box.pitySmall).toBe(3)
    expect(me.json.cards).toHaveLength(3)
    // 迁移后分享一次即可继续抽（分享 +1 真到账）
    await c.call('/api/share', { method: 'POST' })
    expect((await c.draw()).json.drawsLeft).toBe(0)
  })

  it('幂等：服务端已有状态时二次迁移不覆盖、不重复计数', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    await c.call('/api/migrate', {
      method: 'POST',
      body: { box: { drawnCount: 5, firstDrawDone: true }, collected: ['001'] },
    })
    await c.draw() // 服务端产生新状态
    // 快照：这一抽是随机的，可能正好抽到 005 —— 与「二次迁移有没有写入」无关，先记下来做增量比对
    const before = (await c.call('/api/me')).json.cards.map((x: any) => x.ipId) as string[]

    const again = await c.call('/api/migrate', {
      method: 'POST',
      body: { box: { drawnCount: 99, firstDrawDone: true }, collected: ['002', '005'] },
    })
    expect(again.json.migrated).toBe(false)
    expect(again.json.box.drawnCount).toBe(6) // 5 + 迁移后那一抽；不被 99 覆盖
    const ids = again.json.cards.map((x: any) => x.ipId) as string[]
    const added = ids.filter((id) => !before.includes(id))
    expect(added).toEqual([]) // 二次迁移一张都没写进去
    expect(ids).toContain('001') // 首次迁移的卡仍在（count 是否 +1 取决于随机抽卡，不断言）
  })

  it('非当日的旧补给标记不迁移（跨天视为满补给）', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    const r = await c.call('/api/migrate', {
      method: 'POST',
      body: {
        box: { drawnCount: 3, firstDrawDone: true },
        collected: ['001'],
        supply: { lastLoginDate: '2020-01-01', dailyDrawUsed: true, shareDrawUsed: true },
      },
    })
    expect(r.json.drawsLeft).toBe(1) // 跨天视为满补给：只剩今日登录那 1 发
    expect(r.json.supply.lastLoginDate).toBe(todayStr())
  })
})

describe('保底机制（注入合成池：幽灵在售）', () => {
  it('幽灵硬保底：pityHard=89 时下一抽必出幽灵', async () => {
    await restartApi({ pool: ghostPool })
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    await c.call('/api/migrate', {
      method: 'POST',
      body: { box: { drawnCount: 100, pityHard: 89, firstDrawDone: true }, collected: [] },
    })
    const r = await c.draw()
    expect(r.json.result.rarity).toBe('ghost')
    expect(r.json.result.forcedBy).toBe('hard')
    expect(r.json.result.ipId).toBe('T02')
    expect(r.json.box.pityHard).toBe(0) // 抽中即清零
  })

  it('小保底：pitySmall=10 时下一抽必出限定及以上', async () => {
    await restartApi({ pool: ghostPool })
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    await c.call('/api/migrate', {
      method: 'POST',
      body: { box: { drawnCount: 20, pitySmall: 10, pityBig: 5, firstDrawDone: true }, collected: [] },
    })
    const r = await c.draw()
    expect(r.json.result.forcedBy).toBe('small')
    expect(['limited', 'heat', 'ghost']).toContain(r.json.result.rarity)
    expect(r.json.box.pitySmall).toBe(0)
  })
})

describe('限流与路由', () => {
  it('登录/注册超限（同 IP 10 次/10 分钟）返回 429', async () => {
    await restartApi() // 默认 10 次 / 10 分钟
    const c = new Client()
    for (let i = 0; i < 10; i++) {
      const r = await c.login('no-such-user', '12345678')
      expect(r.status).toBe(401)
    }
    const blocked = await c.login('no-such-user', '12345678')
    expect(blocked.status).toBe(429)
    expect(blocked.json.error).toContain('频繁')
  })

  it('未知 /api 路由 404；非 /api 路径 404；方法不匹配 404', async () => {
    const c = new Client()
    expect((await c.call('/api/nope')).status).toBe(404)
    expect((await c.call('/')).status).toBe(404)
    expect((await c.call('/api/me', { method: 'POST' })).status).toBe(404)
  })
})

describe('赌盒六选一 /api/offer + 指定拆 /api/draw', () => {
  it('取一批 6 个盒子：只公开系列，不泄露内容', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)

    const o1 = await c.call('/api/offer', { method: 'POST', body: {} })
    expect(o1.status).toBe(200)
    expect(o1.json.boxes).toHaveLength(6)
    // 没拆的盒子不能带 ipId —— 这是「赌盒」的核心：前端拿不到答案
    expect(o1.json.boxes.every((b: { ipId?: string }) => b.ipId === undefined)).toBe(true)
    expect(o1.json.boxes.every((b: { rarity: string }) => typeof b.rarity === 'string')).toBe(true)
    expect(o1.json.boxes.every((b: { opened: boolean }) => b.opened === false)).toBe(true)
    expect(o1.json.firstDrawOnly).toBe(true)
    // 首抽整批都是引导款
    expect(o1.json.boxes.every((b: { rarity: string }) => b.rarity === 'guide')).toBe(true)
    expect(o1.json.rerollsLeft).toBe(2)

    const o2 = await c.call('/api/offer', { method: 'POST', body: { reroll: true } })
    expect(o2.status).toBe(200)
    expect(o2.json.rerollsLeft).toBe(1)

    const o3 = await c.call('/api/offer', { method: 'POST', body: { reroll: true } })
    expect(o3.json.rerollsLeft).toBe(0)

    const o4 = await c.call('/api/offer', { method: 'POST', body: { reroll: true } })
    expect(o4.status).toBe(409)
    expect(o4.json.code).toBe('NO_REROLL')
  })

  it('首抽：随便挑哪个盒子，拆出来都是引导款 000', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    const offer = (await c.call('/api/offer', { method: 'POST', body: {} })).json

    const ok = await c.call('/api/draw', { method: 'POST', body: { offerId: offer.offerId, pickIndex: 4 } })
    expect(ok.status).toBe(200)
    expect(ok.json.result.ipId).toBe('000')
    expect(ok.json.result.forcedBy).toBe('pick')
    // 拆开后那个盒子才亮出真身
    expect(ok.json.offer.boxes[4].opened).toBe(true)
    expect(ok.json.offer.boxes[4].ipId).toBe('000')
    // 其余盒子依旧不可见
    expect(ok.json.offer.boxes.filter((b: { ipId?: string }) => b.ipId === undefined)).toHaveLength(5)
    // 也不能白拿 6 张 000：剩下几个已经换回常规批（常规批永远不会是引导款）
    expect(
      ok.json.offer.boxes
        .filter((b: { opened: boolean }) => !b.opened)
        .every((b: { rarity: string }) => b.rarity !== 'guide'),
    ).toBe(true)
  })

  it('越界 / 已拆 / 批次失效 都有明确错误码', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    const o1 = (await c.call('/api/offer', { method: 'POST', body: {} })).json

    const out = await c.call('/api/draw', { method: 'POST', body: { offerId: o1.offerId, pickIndex: 9 } })
    expect(out.status).toBe(400)
    expect(out.json.code).toBe('PICK_NOT_IN_OFFER')

    const stale = await c.call('/api/draw', { method: 'POST', body: { offerId: 'nope', pickIndex: 0 } })
    expect(stale.status).toBe(400)
    expect(stale.json.code).toBe('OFFER_STALE')

    await c.call('/api/draw', { method: 'POST', body: { offerId: o1.offerId, pickIndex: 0 } })
    await c.call('/api/share', { method: 'POST' }) // 补给 +1，才有第二抽

    const twice = await c.call('/api/draw', { method: 'POST', body: { offerId: o1.offerId, pickIndex: 0 } })
    expect(twice.status).toBe(409)
    expect(twice.json.code).toBe('PICK_ALREADY_OPENED')

    // 拆过别的盒子仍可继续（同一批）
    const other = await c.call('/api/draw', { method: 'POST', body: { offerId: o1.offerId, pickIndex: 1 } })
    expect(other.status).toBe(200)
    expect(other.json.offer.boxes[0].opened).toBe(true)
    expect(other.json.offer.boxes[1].opened).toBe(true)
  })

  it('拆过之后不能再整批换掉', async () => {
    const c = new Client()
    await c.register(CRED.username, CRED.password)
    const offer = (await c.call('/api/offer', { method: 'POST', body: {} })).json
    await c.call('/api/draw', { method: 'POST', body: { offerId: offer.offerId, pickIndex: 0 } })

    const reroll = await c.call('/api/offer', { method: 'POST', body: { reroll: true } })
    expect(reroll.status).toBe(409)
    expect(reroll.json.code).toBe('OFFER_OPENED')
  })
})
