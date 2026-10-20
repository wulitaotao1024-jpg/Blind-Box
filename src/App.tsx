import { useCallback, useEffect, useState } from 'react'
import EndCard from './screens/EndCard'
import Landing from './screens/Landing'
import Opening from './screens/Opening'
import Reveal from './screens/Reveal'
import Story from './screens/Story'
import Wall from './screens/Wall'
import { IPS } from './data/ips'
import { draw } from './logic/boxReducer'
import { collect } from './logic/collection'
import { loadState, saveState, todayStr } from './logic/storage'
import type { Persisted } from './logic/storage'
import { track } from './logic/track'
import type { DrawResult } from './logic/types'

// 首页动线状态机（PRD 6.3）：landing → story → endcard → (opening →) reveal → wall
type Screen = 'landing' | 'story' | 'endcard' | 'opening' | 'reveal' | 'wall'

interface LastResult extends DrawResult {
  isNew: boolean
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [persisted, setPersisted] = useState<Persisted>(() => loadState())
  const [last, setLast] = useState<LastResult | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const update = useCallback((next: Persisted) => {
    setPersisted(next)
    saveState(next)
  }, [])

  // F5 每日登录：跨天重置登录补给（分享补给同样按天重置）
  useEffect(() => {
    const today = todayStr()
    setPersisted((p) => {
      if (p.lastLoginDate === today) return p
      const next = { ...p, lastLoginDate: today, dailyDrawUsed: false, shareDrawUsed: false }
      saveState(next)
      return next
    })
  }, [])

  const drawsLeft = (persisted.dailyDrawUsed ? 0 : 1) + (persisted.shareDrawUsed ? 0 : 1)

  // F1 抽盒（纯逻辑，不含补给校验）：概率/保底与服务端同语义（见 logic/boxReducer.ts）。
  // 由 EndCard（自带开盒演出）或 Opening（再抽一次/图鉴墙开盒演出）在动画放完后调用。
  const performDraw = useCallback(() => {
    const { result, next } = draw(persisted.box, Math.random, IPS)
    const { set, isNew } = collect(new Set(persisted.collected), result.ipId)
    // 补给消耗：优先扣登录补给，登录已用则扣分享补给（每日共 2 发，必须能扣到 0，
    // 否则 drawsLeft 卡在 1 无限抽，或因历史脏数据永远进不了揭晓屏）
    const consumedShare = persisted.dailyDrawUsed
    update({
      ...persisted,
      box: next,
      collected: [...set],
      dailyDrawUsed: true,
      shareDrawUsed: consumedShare ? true : persisted.shareDrawUsed,
    })
    track('open_box', { source: consumedShare ? 'share' : 'login' })
    track('box_result', { ip: result.ipId, rarity: result.rarity, duplicate: !isNew })
    setLast({ ...result, isNew })
    setScreen('reveal')
  }, [persisted, update])

  // 进入开盒演出：补给耗尽直接进图鉴墙，否则先播盒子抖动/弹盖/礼花/闪光，放完再 performDraw
  const startOpening = useCallback(() => {
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    setScreen('opening')
  }, [drawsLeft])

  // F4 分享：复制链接（MVP 通用分享），每日首享 +1 发
  const share = useCallback(() => {
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
    if (!persisted.shareDrawUsed) {
      update({ ...persisted, shareDrawUsed: true })
    }
    setTimeout(() => setShareCopied(false), 2000)
  }, [persisted, update])

  const lastIp = last ? IPS.find((p) => p.id === last.ipId) ?? IPS[0] : null

  return (
    <div className="stage">
      {screen === 'landing' && <Landing onStart={() => setScreen('story')} />}

      {screen === 'story' && <Story onEnd={() => setScreen('endcard')} />}

      {screen === 'endcard' && (
        <EndCard
          drawsLeft={drawsLeft}
          onOpen={performDraw}
          onWall={() => setScreen('wall')}
          onReplay={() => setScreen('landing')}
        />
      )}

      {/* 再抽一次 / 图鉴墙开盒：先播开盒演出，放完再抽 */}
      {screen === 'opening' && <Opening onDone={performDraw} />}

      {screen === 'reveal' && last && lastIp && (
        <Reveal
          ip={lastIp}
          isNew={last.isNew}
          drawsLeft={drawsLeft}
          onContinue={() => setScreen('wall')}
          onDrawAgain={startOpening}
        />
      )}

      {screen === 'wall' && (
        <Wall
          collected={new Set(persisted.collected)}
          drawsLeft={drawsLeft}
          shareCopied={shareCopied}
          onDraw={startOpening}
          onShare={share}
          onReplay={() => setScreen('landing')}
        />
      )}
    </div>
  )
}
