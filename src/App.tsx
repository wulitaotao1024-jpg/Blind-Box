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
import { loadState, resetGameState, saveState, todayStr } from './logic/storage'
import type { Persisted } from './logic/storage'
import { track } from './logic/track'
import type { DrawResult } from './logic/types'
import { api, ApiError } from './lib/apiClient'
import type { CardDto, MeDto } from './lib/apiClient'

// 首页动线状态机（PRD 6.3）：landing → story → endcard → (opening →) reveal → wall
// 新增 auth：登录/注册屏（游客可浏览，抽盒/再抽需登录）
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
  const [drawError, setDrawError] = useState<string | null>(null)

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
      const next = { ...p, lastLoginDate: today, dailyDrawUsed: false, shareDrawUsed: false }
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
    : (persisted.dailyDrawUsed ? 0 : 1) + (persisted.shareDrawUsed ? 0 : 1)

  const update = useCallback((next: Persisted) => {
    setPersisted(next)
    saveState(next)
  }, [])

  // F1 抽盒（服务端）：POST /api/draw → 更新 me（box/cards/drawsLeft）→ 进揭晓屏
  const performDraw = useCallback(async () => {
    setDrawError(null)
    try {
      const resp = await api.draw()
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
      setLast({ ...resp.result, isNew: resp.isNew })
      track('open_box', { source: 'server' })
      track('box_result', { ip: resp.result.ipId, rarity: resp.result.rarity, duplicate: !resp.isNew })
      setScreen('reveal')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 会话失效：退回登录
        setMe(null)
        setScreen('auth')
        return
      }
      setDrawError('抽盒失败了，请稍后再试')
    }
  }, [])

  // 首抽入口（EndCard 开盒按钮）：未登录 → 进 auth；已登录 → 直接抽（EndCard 自带开盒演出）
  const firstDraw = useCallback(() => {
    if (!isAuthed) {
      setScreen('auth')
      return
    }
    void performDraw()
  }, [isAuthed, performDraw])

  // 再抽入口（Reveal 再来一发 / Wall 开盒）：未登录 → 进 auth；已登录 → 演出后抽
  const redraw = useCallback(() => {
    if (!isAuthed) {
      setScreen('auth')
      return
    }
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    setScreen('opening')
  }, [isAuthed, drawsLeft])

  // F4 分享：复制链接（MVP 通用分享）+ 标记今日分享补给。登录态走服务端，游客态走本地
  const share = useCallback(async () => {
    track('share_click', { channel: 'clipboard' })
    const url = window.location.href
    if (navigator.share) {
      navigator
        .share({ title: '盒隙 BLINDGAP', text: '主理人开了个盒隙，我刚开出狠货。来拼我的同款宇宙 👉', url })
        .catch(() => undefined)
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => undefined)
    }
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
    if (isAuthed) {
      try {
        const resp = await api.share()
        setMe((prev) =>
          prev ? { ...prev, drawsLeft: resp.drawsLeft, supply: { ...prev.supply, shareDrawUsed: true } } : prev,
        )
      } catch {
        /* 分享补给标记失败不阻断体验 */
      }
    } else if (!persisted.shareDrawUsed) {
      update({ ...persisted, shareDrawUsed: true })
    }
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
      setScreen('wall')
    },
    [],
  )

  const handleLogout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* 忽略：本地直接清态 */
    }
    setMe(null)
    setScreen('landing')
  }, [])

  const lastIp = last ? IPS.find((p) => p.id === last.ipId) ?? IPS[0] : null

  // 登录入口浮层：除登录屏与全屏故事屏外，固定右上角
  const showEntry = screen !== 'auth' && screen !== 'story'

  return (
    <div className="stage">
      {showEntry && (
        <AuthEntry user={user} onLogin={() => setScreen('auth')} onLogout={() => void handleLogout()} />
      )}

      {screen === 'landing' && <Landing onStart={() => setScreen('story')} />}

      {screen === 'story' && <Story onEnd={() => setScreen('endcard')} />}

      {screen === 'endcard' && (
        <EndCard
          drawsLeft={drawsLeft}
          locked={!isAuthed}
          onOpen={firstDraw}
          onWall={() => setScreen('wall')}
          onReplay={() => setScreen('landing')}
        />
      )}

      {/* 再抽一次 / 图鉴墙开盒：先播开盒演出，放完再抽 */}
      {screen === 'opening' && <Opening onDone={() => void performDraw()} />}

      {screen === 'reveal' && last && lastIp && (
        <Reveal
          ip={lastIp}
          isNew={last.isNew}
          drawsLeft={drawsLeft}
          onContinue={() => setScreen('wall')}
          onDrawAgain={redraw}
        />
      )}

      {screen === 'wall' && (
        <Wall
          collected={collected}
          drawsLeft={drawsLeft}
          shareCopied={shareCopied}
          locked={!isAuthed}
          onDraw={redraw}
          onShare={() => void share()}
          onReplay={() => setScreen('landing')}
        />
      )}

      {screen === 'auth' && <Auth onSkip={() => setScreen('landing')} onAuthed={handleAuthed} />}

      {drawError && <div className="toast toast--error" onClick={() => setDrawError(null)}>{drawError}</div>}
    </div>
  )
}
