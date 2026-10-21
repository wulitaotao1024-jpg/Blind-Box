import { useCallback, useEffect, useMemo, useState } from 'react'
import EndCard from './screens/EndCard'
import Landing from './screens/Landing'
import Offer from './screens/Offer'
import Opening from './screens/Opening'
import Reveal from './screens/Reveal'
import Story from './screens/Story'
import Wall from './screens/Wall'
import Auth from './screens/Auth'
import AuthEntry from './components/AuthEntry'
import { IPS } from './data/ips'
import { buildShareText } from './data/share'
import { isOfferExhausted } from './logic/offer'
import { loadState, resetGameState, saveState, todayStr } from './logic/storage'
import type { Persisted } from './logic/storage'
import { track } from './logic/track'
import type { DrawResult } from './logic/types'
import { api, ApiError } from './lib/apiClient'
import type { CardDto, MeDto, OfferDto } from './lib/apiClient'
import { copyText } from './lib/clipboard'

// 首页动线状态机（PRD 6.3）：landing → story → endcard → offer(明牌六选一) → opening → reveal → wall
// offer 屏是新增的「互动抽盒」：不是点一下就出结果，而是先摊 6 只、自己挑一只再开
type Screen = 'landing' | 'story' | 'endcard' | 'offer' | 'opening' | 'reveal' | 'wall' | 'auth'

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
  // 明牌六选一：当批 6 只 / 正在换批 / 从哪个屏进来的（返回时用得上）
  const [offer, setOffer] = useState<OfferDto | null>(null)
  const [rerolling, setRerolling] = useState(false)
  const [offerFrom, setOfferFrom] = useState<Screen>('endcard')
  const [pendingPick, setPendingPick] = useState<string | null>(null)

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

  // 明牌六选一：向服务端要一批 6 只 → 进选盒屏。未登录先去登录（回跳来源屏）
  const loadOffer = useCallback(
    async (from: Screen, opts?: { reroll?: boolean }) => {
      if (opts?.reroll) setRerolling(true)
      try {
        const o = await api.offer(opts)
        setOffer(o)
        setOfferFrom(from)
        track(opts?.reroll ? 'offer_reroll' : 'offer_view', {
          rerollsLeft: o.rerollsLeft,
          firstDrawOnly: o.firstDrawOnly,
        })
        setScreen('offer')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setMe(null)
          setOffer(null)
          goAuth(from)
          return
        }
        flash(err instanceof ApiError ? err.message : '取盒失败，请稍后再试')
        setScreen(from === 'wall' ? 'wall' : 'endcard')
      } finally {
        setRerolling(false)
      }
    },
    [flash, goAuth],
  )

  // 开盒入口（末帧 / 图鉴墙统一走这里）：不再「点一下就出结果」，先摊 6 只让玩家自己挑
  const startDraw = useCallback(
    (from: Screen) => {
      if (!isAuthed) {
        goAuth(from)
        return
      }
      if (drawsLeft <= 0) {
        setScreen('wall')
        return
      }
      void loadOffer(from)
    },
    [isAuthed, drawsLeft, goAuth, loadOffer],
  )

  // 挑中一只 → 播开盒演出 → 演完再真正去服务端抽这只
  const pickOffer = useCallback((ipId: string) => {
    setPendingPick(ipId)
    track('offer_pick', { ip: ipId })
    setScreen('opening')
  }, [])

  const performDraw = useCallback(async () => {
    const ipId = pendingPick
    const cur = offer
    if (!ipId || !cur) return
    try {
      const resp = await api.draw({ offerId: cur.offerId, pickId: ipId })
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
      if (resp.offer) setOffer(resp.offer) // 服务端回传这批的最新状态：刚才那只已标记拆过
      setLast({ ...resp.result, isNew: resp.isNew })
      track('open_box', { source: 'server', pick: ipId })
      track('box_result', { ip: resp.result.ipId, rarity: resp.result.rarity, duplicate: !resp.isNew })
      setScreen('reveal')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null)
        setOffer(null)
        goAuth('endcard')
        return
      }
      flash(err instanceof ApiError ? err.message : '抽盒失败了，请稍后再试')
      setScreen('offer') // 失败回选盒屏重挑，不把玩家甩进图鉴墙
    } finally {
      setPendingPick(null)
    }
  }, [offer, pendingPick, flash, goAuth])

  // 揭晓页「再挑一只」：还有次数就回到刚才那一批（拆过的那只保持打开、不能再点）
  const backToOffer = useCallback(() => {
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    if (offer && !isOfferExhausted(offer.ids, offer.opened)) {
      setScreen('offer')
      return
    }
    void loadOffer(offerFrom)
  }, [drawsLeft, offer, offerFrom, loadOffer])

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

  // 登录/注册成功：落库会话 → 尝试迁移本地存量（幂等）→ 清空本地游戏态 → 进图鉴墙
  const handleAuthed = useCallback(
    async (initialMe: MeDto) => {
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
          setMe({ ...migrated, user: initialMe.user })
        } catch {
          /* 迁移失败不阻断，用户可在图鉴墙重试 */
        }
      }
      resetGameState() // 清空本地游戏态，避免重复迁移（保留 soundOn）
      setScreen(authReturn) // 回跳来源屏（首页/抽盒页/图鉴墙），而非固定进图鉴墙
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

      {screen === 'endcard' && (
        <EndCard
          drawsLeft={drawsLeft}
          locked={!isAuthed}
          onOpen={() => startDraw('endcard')}
          onWall={() => setScreen('wall')}
          onReplay={() => setScreen('landing')}
        />
      )}

      {/* 明牌六选一：摊 6 只，自己挑一只；不满意可换一批（每天 2 次） */}
      {screen === 'offer' && offer && (
        <Offer
          offer={offer}
          drawsLeft={drawsLeft}
          rerolling={rerolling}
          onPick={pickOffer}
          onReroll={() => void loadOffer(offerFrom, { reroll: true })}
          onBack={() => setScreen(offerFrom === 'wall' ? 'wall' : 'endcard')}
        />
      )}

      {/* 挑中之后：先播开盒演出，放完再带着 pickId 去服务端抽这一只 */}
      {screen === 'opening' && <Opening onDone={() => void performDraw()} />}

      {screen === 'reveal' && last && lastIp && (
        <Reveal
          ip={lastIp}
          isNew={last.isNew}
          drawsLeft={drawsLeft}
          onContinue={() => setScreen('wall')}
          onDrawAgain={backToOffer}
          drawAgainLabel={drawsLeft > 0 ? `再挑一只（剩 ${drawsLeft}）` : '明日再来'}
        />
      )}

      {screen === 'wall' && (
        <Wall
          collected={collected}
          drawsLeft={drawsLeft}
          shareCopied={shareCopied}
          locked={!isAuthed}
          onDraw={() => startDraw('wall')}
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
