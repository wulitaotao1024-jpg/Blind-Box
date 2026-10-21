import { useCallback, useEffect, useMemo, useState } from 'react'
import EndCard from './screens/EndCard'
import Landing from './screens/Landing'
import Opening from './screens/Opening'
import Reveal from './screens/Reveal'
import Story from './screens/Story'
import Wall from './screens/Wall'
import Auth from './screens/Auth'
import AuthEntry from './components/AuthEntry'
import { IPS } from './data/ips'
import { buildShareText } from './data/share'
import { loadState, resetGameState, saveState, todayStr } from './logic/storage'
import type { Persisted } from './logic/storage'
import { track } from './logic/track'
import type { DrawResult } from './logic/types'
import { api, ApiError } from './lib/apiClient'
import type { CardDto, MeDto, OfferDto } from './lib/apiClient'
import { copyText } from './lib/clipboard'

// 首页动线状态机（PRD 6.3）：landing → story → endcard(开盒台：6 个封着的盒子) → opening → reveal → wall
// 末帧本身就是开盒台：一落地就摊 6 个盒子，不再「点一下直接出结果」
type Screen = 'landing' | 'story' | 'endcard' | 'opening' | 'reveal' | 'wall' | 'auth'

interface LastResult extends DrawResult {
  isNew: boolean
}

// 服务端抽卡后合并卡：首得 append，重复 count+1
function mergeCard(cards: CardDto[], ipId: string, isNew: boolean): CardDto[] {
  if (isNew) return [...cards, { ipId, count: 1, firstAt: Date.now() }]
  return cards.map((c) => (c.ipId === ipId ? { ...c, count: c.count + 1 } : c))
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [me, setMe] = useState<MeDto | null>(null) // 登录态全量数据（box/cards/supply/drawsLeft）
  const [persisted, setPersisted] = useState<Persisted>(() => loadState())
  const [last, setLast] = useState<LastResult | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // 登录来源屏：记录是从哪里点开的登录，登录成功后回跳该屏（而非统一进图鉴墙）
  const [authReturn, setAuthReturn] = useState<Screen>('landing')
  // 开盒台：当批 6 个封着的盒子 / 换批中 / 正在取盒 / 玩家赌的是第几个
  const [offer, setOffer] = useState<OfferDto | null>(null)
  const [rerolling, setRerolling] = useState(false)
  const [offerLoading, setOfferLoading] = useState(false)
  const [pendingPick, setPendingPick] = useState<number | null>(null)

  const isAuthed = me !== null
  const user = me?.user ?? null

  // 启动：恢复会话（同源 cookie 自动随行；未登录静默走游客态）
  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((m) => {
        if (!cancelled) setMe(m)
      })
      .catch(() => {
        /* 未登录：游客态，无需处理 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // F5 每日登录：游客态的本地跨天重置（登录态由服务端 supply 表负责）
  useEffect(() => {
    if (isAuthed) return
    const today = todayStr()
    setPersisted((p) => {
      if (p.lastLoginDate === today) return p
      const next = { ...p, lastLoginDate: today, dailyDrawUsed: false, shareDrawUsed: false, drawsBonus: 0 }
      saveState(next)
      return next
    })
  }, [isAuthed])

  // 派生：图鉴收藏集合 & 剩余抽数（登录态取服务端，游客态取本地）
  const collected = useMemo(
    () =>
      isAuthed
        ? new Set(me!.cards.filter((c) => c.count > 0).map((c) => c.ipId))
        : new Set(persisted.collected),
    [isAuthed, me, persisted.collected],
  )
  const drawsLeft = isAuthed
    ? me!.drawsLeft
    : (persisted.dailyDrawUsed ? 0 : 1) + persisted.drawsBonus

  const update = useCallback((next: Persisted) => {
    setPersisted(next)
    saveState(next)
  }, [])

  // 进登录屏并记录来源：登录成功后回跳来源屏（首页/抽盒页/图鉴墙各自停留）
  const goAuth = useCallback((returnTo: Screen) => {
    setAuthReturn(returnTo)
    setScreen('auth')
  }, [])

  // 轻提示（复用分享的 toast 通道）
  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  // 取一批 6 个封着的盒子（服务端只回「系列」，不回内容）
  const loadOffer = useCallback(
    async (opts?: { reroll?: boolean }) => {
      if (opts?.reroll) setRerolling(true)
      else setOfferLoading(true)
      try {
        const o = await api.offer(opts)
        setOffer(o)
        track(opts?.reroll ? 'offer_reroll' : 'offer_view', {
          rerollsLeft: o.rerollsLeft,
          firstDrawOnly: o.firstDrawOnly,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setMe(null)
          setOffer(null)
          goAuth('endcard')
          return
        }
        flash(err instanceof ApiError ? err.message : '取盒失败，请稍后再试')
      } finally {
        setRerolling(false)
        setOfferLoading(false)
      }
    },
    [flash, goAuth],
  )

  // 开盒入口（末帧 / 图鉴墙统一走这里）：进开盒台，有需要就取一批新盒子
  const startDraw = useCallback(() => {
    if (!isAuthed) {
      goAuth('endcard')
      return
    }
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    setScreen('endcard')
  }, [isAuthed, drawsLeft, goAuth])

  // 落到开盒台就保证手里有一批没拆完的盒子（没有 / 拆完了 → 向服务端要新的一批）
  useEffect(() => {
    if (screen !== 'endcard') return
    if (!isAuthed || drawsLeft <= 0) return
    if (offer && !offer.boxes.every((b) => b.opened)) return
    void loadOffer()
  }, [screen, isAuthed, drawsLeft, offer, loadOffer])

  // 赌中第 N 个盒子 → 播开盒演出 → 演完再去服务端拆这一个
  const pickOffer = useCallback(
    (index: number) => {
      if (!isAuthed) {
        goAuth('endcard')
        return
      }
      if (!offer || drawsLeft <= 0) return
      setPendingPick(index)
      track('offer_pick', { index, rarity: offer.boxes[index]?.rarity })
      setScreen('opening')
    },
    [isAuthed, offer, drawsLeft, goAuth],
  )

  const performDraw = useCallback(async () => {
    const idx = pendingPick
    const cur = offer
    if (idx === null || !cur) return
    try {
      const resp = await api.draw({ offerId: cur.offerId, pickIndex: idx })
      setMe((prev) =>
        prev
          ? {
              ...prev,
              box: resp.box,
              drawsLeft: resp.drawsLeft,
              cards: mergeCard(prev.cards, resp.result.ipId, resp.isNew),
            }
          : prev,
      )
      if (resp.offer) setOffer(resp.offer) // 服务端回传这批的最新状态：刚才那个盒子已标记拆过
      setLast({ ...resp.result, isNew: resp.isNew })
      track('open_box', { source: 'server', pickIndex: idx })
      track('box_result', { ip: resp.result.ipId, rarity: resp.result.rarity, duplicate: !resp.isNew })
      setScreen('reveal')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null)
        setOffer(null)
        goAuth('endcard')
        return
      }
      flash(err instanceof ApiError ? err.message : '开盒失败了，请稍后再试')
      setScreen('endcard') // 失败回开盒台重挑，不把玩家甩进图鉴墙
    } finally {
      setPendingPick(null)
    }
  }, [offer, pendingPick, flash, goAuth])

  // 揭晓页「再赌一个」：还有次数就回开盒台（拆过的那只保持打开、不能再点）
  const backToOffer = useCallback(() => {
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    setScreen('endcard')
  }, [drawsLeft])

  // F4 分享：复制「推广文案 + 链接」到剪贴板（微信里粘贴即可，不依赖任何平台 SDK），
  // 点击即标记今日分享补给 +1 发。登录态走服务端，游客态走本地
  const share = useCallback(async () => {
    track('share_click', { channel: 'copy-link' })
    const url = window.location.origin + '/'
    const copied = await copyText(buildShareText(url))
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2400)

    let gained = false
    if (isAuthed) {
      try {
        const resp = await api.share()
        gained = resp.granted
        setMe((prev) => (prev ? { ...prev, drawsLeft: resp.drawsLeft, supply: resp.supply } : prev))
      } catch {
        /* 分享补给标记失败不阻断体验 */
      }
    } else if (!persisted.shareDrawUsed) {
      update({ ...persisted, shareDrawUsed: true, drawsBonus: persisted.drawsBonus + 1 })
      gained = true
    }
    setToast(
      copied
        ? gained
          ? '已复制 · 补给 +1 发 ✦'
          : '已复制 · 今日补给已领过'
        : gained
          ? '复制失败 · 补给 +1 发已到账'
          : '复制失败 · 请手动复制地址',
    )
    setTimeout(() => setToast(null), 2600)
  }, [isAuthed, persisted, update])

  // 登录/注册成功：落库会话 → 尝试迁移本地存量（幂等）→ 清空本地游戏态 → 回跳来源屏
  const handleAuthed = useCallback(
    async (initialMe: MeDto) => {
      let next = initialMe
      setMe(initialMe)
      const local = loadState()
      const hasLocal =
        local.collected.length > 0 ||
        local.box.drawnCount > 0 ||
        local.dailyDrawUsed ||
        local.shareDrawUsed
      if (hasLocal) {
        try {
          const migrated = await api.migrate({
            box: local.box,
            collected: local.collected,
            supply: {
              lastLoginDate: local.lastLoginDate,
              dailyDrawUsed: local.dailyDrawUsed,
              shareDrawUsed: local.shareDrawUsed,
            },
          })
          next = { ...migrated, user: initialMe.user }
          setMe(next)
        } catch {
          /* 迁移失败不阻断，用户可在图鉴墙重试 */
        }
      }
      resetGameState() // 清空本地游戏态，避免重复迁移（保留 soundOn）

      // 从开盒入口（末帧 / 图鉴墙）被拦下来登录的：登录完直接进开盒台摊盒。
      // 否则会回到刚才那一屏、还是那颗单盒子，看起来像「登录了个寂寞」。
      if (authReturn === 'endcard' || authReturn === 'wall') {
        setScreen(next.drawsLeft > 0 ? 'endcard' : 'wall')
        return
      }
      setScreen(authReturn) // 回跳来源屏（首页等），而非固定进图鉴墙
    },
    [authReturn],
  )

  const handleLogout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* 忽略：本地直接清态 */
    }
    setMe(null)
    setOffer(null)
    setScreen('landing')
  }, [])

  const lastIp = last ? IPS.find((p) => p.id === last.ipId) ?? IPS[0] : null

  // 登录入口浮层：除登录屏与全屏故事屏外，固定右上角
  const showEntry = screen !== 'auth' && screen !== 'story'

  return (
    <div className="stage">
      {showEntry && (
        <AuthEntry user={user} onLogin={() => goAuth(screen)} onLogout={() => void handleLogout()} />
      )}

      {screen === 'landing' && <Landing onStart={() => setScreen('story')} />}

      {screen === 'story' && <Story onEnd={() => setScreen('endcard')} />}

      {/* 开盒台 = 故事末帧：6 个封着的盒子，只看得到系列，自己赌一个；不满意可换一批 */}
      {screen === 'endcard' && (
        <EndCard
          offer={offer}
          loading={offerLoading}
          drawsLeft={drawsLeft}
          locked={!isAuthed}
          rerolling={rerolling}
          onPick={pickOffer}
          onReroll={() => void loadOffer({ reroll: true })}
          onReplay={() => setScreen('landing')}
          onWall={() => setScreen('wall')}
        />
      )}

      {/* 赌中之后：先播开盒演出，放完再带着 pickIndex 去服务端拆这一个 */}
      {screen === 'opening' && <Opening onDone={() => void performDraw()} />}

      {screen === 'reveal' && last && lastIp && (
        <Reveal
          ip={lastIp}
          isNew={last.isNew}
          drawsLeft={drawsLeft}
          onContinue={() => setScreen('wall')}
          onDrawAgain={backToOffer}
          drawAgainLabel={drawsLeft > 0 ? `再赌一个（剩 ${drawsLeft}）` : '明日再来'}
        />
      )}

      {screen === 'wall' && (
        <Wall
          collected={collected}
          drawsLeft={drawsLeft}
          shareCopied={shareCopied}
          locked={!isAuthed}
          onDraw={() => startDraw()}
          onShare={() => void share()}
          onReplay={() => setScreen('landing')}
        />
      )}

      {screen === 'auth' && <Auth onSkip={() => setScreen('landing')} onAuthed={handleAuthed} />}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  )
}
