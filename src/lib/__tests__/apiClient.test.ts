import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from '../apiClient'

// 用 mock fetch 验证前端 API 客户端：请求构造（路径/方法/凭据/请求体）与错误映射
function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const EMPTY_BOX = {
  drawnCount: 0,
  pitySmall: 0,
  pityBig: 0,
  pityHard: 0,
  firstDrawDone: false,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient', () => {
  it('login 发送凭据并返回 user', async () => {
    const fetchMock = mockFetchOnce(200, { user: { id: 'u1', username: 'tom' } })
    const res = await api.login('tom', '12345678')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    )
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(sent).toEqual({ username: 'tom', password: '12345678' })
    expect(res.user.username).toBe('tom')
  })

  it('register 返回 user（201）', async () => {
    const fetchMock = mockFetchOnce(201, { user: { id: 'u2', username: 'jerry' } })
    const res = await api.register('jerry', '12345678')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }))
    expect(res.user.id).toBe('u2')
  })

  it('me 返回全量会话状态', async () => {
    const me = {
      user: { id: 'u1', username: 'tom' },
      box: EMPTY_BOX,
      cards: [],
      supply: { lastLoginDate: '', dailyDrawUsed: false, shareDrawUsed: false },
      drawsLeft: 2,
    }
    mockFetchOnce(200, me)
    const r = await api.me()
    expect(r.drawsLeft).toBe(2)
    expect(r.box.firstDrawDone).toBe(false)
  })

  it('draw 返回 result/isNew/box/drawsLeft', async () => {
    mockFetchOnce(200, {
      result: { ipId: '000', rarity: 'guide', forcedBy: 'guide' },
      isNew: true,
      box: { ...EMPTY_BOX, drawnCount: 1, firstDrawDone: true },
      drawsLeft: 1,
    })
    const r = await api.draw()
    expect(r.result.ipId).toBe('000')
    expect(r.isNew).toBe(true)
    expect(r.box.drawnCount).toBe(1)
  })

  it('offer 取一批 6 只；reroll 随请求体发出', async () => {
    const fetchMock = mockFetchOnce(200, {
      offerId: 'o1',
      boxes: [
        { rarity: 'street', opened: false },
        { rarity: 'street', opened: false },
        { rarity: 'limited', opened: false },
        { rarity: 'heat', opened: false },
        { rarity: 'street', opened: false },
        { rarity: 'guide', opened: false },
      ],
      rerollsLeft: 2,
      firstDrawOnly: true,
    })
    const r = await api.offer()
    expect(fetchMock).toHaveBeenCalledWith('/api/offer', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({})
    expect(r.boxes).toHaveLength(6)
    // 内容不可见：DTO 里不能出现 ipId（只有已拆的盒子才会带）
    expect(r.boxes.every((b) => b.ipId === undefined)).toBe(true)
    expect(r.firstDrawOnly).toBe(true)

    const rerollMock = mockFetchOnce(200, {
      offerId: 'o2',
      boxes: Array.from({ length: 6 }, () => ({ rarity: 'street', opened: false })),
      rerollsLeft: 1,
      firstDrawOnly: true,
    })
    const r2 = await api.offer({ reroll: true })
    expect(JSON.parse((rerollMock.mock.calls[0][1] as { body: string }).body)).toEqual({ reroll: true })
    expect(r2.rerollsLeft).toBe(1)
  })

  it('draw 带 pick 时把 offerId/pickIndex 发给服务端，并回收最新一批状态', async () => {
    const fetchMock = mockFetchOnce(200, {
      result: { ipId: '001', rarity: 'limited', forcedBy: 'pick' },
      isNew: true,
      box: { ...EMPTY_BOX, drawnCount: 1, firstDrawDone: true },
      drawsLeft: 0,
      offer: {
        offerId: 'o1',
        boxes: [{ rarity: 'street', opened: true, ipId: '001' }, { rarity: 'limited', opened: false }],
        rerollsLeft: 2,
        firstDrawOnly: false,
      },
    })
    const r = await api.draw({ offerId: 'o1', pickIndex: 0 })
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      offerId: 'o1',
      pickIndex: 0,
    })
    expect(r.result.forcedBy).toBe('pick')
    expect(r.offer?.boxes[0].opened).toBe(true)
    expect(r.offer?.boxes[0].ipId).toBe('001')
  })

  it('share 返回 drawsLeft', async () => {
    mockFetchOnce(200, { drawsLeft: 1 })
    const r = await api.share()
    expect(r.drawsLeft).toBe(1)
  })

  it('logout 返回 ok', async () => {
    mockFetchOnce(200, { ok: true })
    const r = await api.logout()
    expect(r.ok).toBe(true)
  })

  it('migrate 发送存量并接收幂等结果', async () => {
    const fetchMock = mockFetchOnce(200, {
      migrated: true,
      box: { ...EMPTY_BOX, drawnCount: 5, firstDrawDone: true },
      cards: [{ ipId: '001', count: 1, firstAt: 1 }],
      supply: { lastLoginDate: '2026-10-21', dailyDrawUsed: false, shareDrawUsed: false },
      drawsLeft: 2,
    })
    const r = await api.migrate({
      box: { drawnCount: 5, firstDrawDone: true },
      collected: ['001'],
      supply: { lastLoginDate: '2026-10-21' },
    })
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(sent.collected).toEqual(['001'])
    expect(sent.box.drawnCount).toBe(5)
    expect(r.migrated).toBe(true)
  })

  it('非 2xx 抛出 ApiError（携带服务端 message）', async () => {
    mockFetchOnce(401, { error: '未登录' })
    const err = await api.me().then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, message: '未登录' })
  })

  it('注册重名返回 409（USERNAME_TAKEN）', async () => {
    mockFetchOnce(409, { error: '用户名已被注册，去登录试试', code: 'USERNAME_TAKEN' })
    const err = await api.register('tom', '12345678').then(
      () => null,
      (e) => e,
    )
    expect(err).toMatchObject({ status: 409, message: '用户名已被注册，去登录试试', code: 'USERNAME_TAKEN' })
  })

  it('登录未注册账号返回 401（NO_USER）', async () => {
    mockFetchOnce(401, { error: '该账号尚未注册，请先注册', code: 'NO_USER' })
    const err = await api.login('ghost', '12345678').then(
      () => null,
      (e) => e,
    )
    expect(err).toMatchObject({ status: 401, code: 'NO_USER', message: '该账号尚未注册，请先注册' })
  })

  it('登录密码错误返回 401（BAD_CREDENTIAL）', async () => {
    mockFetchOnce(401, { error: '登录失败，密码不正确', code: 'BAD_CREDENTIAL' })
    const err = await api.login('tom', 'wrong').then(
      () => null,
      (e) => e,
    )
    expect(err).toMatchObject({ status: 401, code: 'BAD_CREDENTIAL' })
  })

  it('限流返回 429', async () => {
    mockFetchOnce(429, { error: '操作太频繁' })
    await expect(api.login('x', '12345678')).rejects.toMatchObject({ status: 429 })
  })

  it('响应体非 JSON 时回退默认错误信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad')
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.me()).rejects.toMatchObject({ status: 500 })
  })
})
