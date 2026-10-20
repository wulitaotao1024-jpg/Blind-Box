import { useCallback, useEffect, useState } from 'react'
import EndCard from './screens/EndCard'
import Landing from './screens/Landing'
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

// 首页动线状态机（PRD 6.3）：landing → story → endcard → reveal → wall
type Screen = 'landing' | 'story' | 'endcard' | 'reveal' | 'wall'

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

  // F1 开盒：MVP 本地抽盒（概率/保底与服务端同语义，见 logic/boxReducer.ts）
  const openBox = useCallback(() => {
    if (drawsLeft <= 0) {
      setScreen('wall')
      return
    }
    const { result, next } = draw(persisted.box, Math.random, IPS)
    const { set, isNew } = collect(new Set(persisted.collected), result.ipId)
    update({
      ...persisted,
      box: next,
      collected: [...set],
      dailyDrawUsed: true, // 优先消耗登录补给
    })
    track('open_box', { source: persisted.shareDrawUsed ? 'share' : 'login' })
    track('box_result', { ip: result.ipId, rarity: result.rarity, duplicate: !isNew })
    setLast({ ...result, isNew })
    setScreen('reveal')
  }, [drawsLeft, persisted, update])

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
          onOpen={openBox}
          onReplay={() => setScreen('landing')}
        />
      )}

      {screen === 'reveal' && last && lastIp && (
        <Reveal
          ip={lastIp}
          isNew={last.isNew}
          drawsLeft={drawsLeft}
          onContinue={() => setScreen('wall')}
          onDrawAgain={openBox}
        />
      )}

      {screen === 'wall' && (
        <Wall
          collected={new Set(persisted.collected)}
          drawsLeft={drawsLeft}
          shareCopied={shareCopied}
          onDraw={openBox}
          onShare={share}
          onReplay={() => setScreen('landing')}
        />
      )}
    </div>
  )
}
