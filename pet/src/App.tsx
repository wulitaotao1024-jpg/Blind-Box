import { useEffect, useRef, useState, useCallback } from 'react'
import { CHARACTERS } from './data/characters'

const PET_SIZE = 150
const STORE = 'blindgap-pet:v1'

type Pos = { x: number; y: number }

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  return {
    x: Math.max(0, (window.innerWidth - PET_SIZE) / 2),
    y: Math.max(0, window.innerHeight - PET_SIZE - 48),
  }
}

export default function App() {
  const [charIdx, setCharIdx] = useState(0)
  const [pos, setPos] = useState<Pos>(defaultPos)
  const [dragging, setDragging] = useState(false)
  const [speech, setSpeech] = useState<{ text: string; key: number } | null>(null)
  const [waving, setWaving] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showHint, setShowHint] = useState(true)
  const [uiVisible, setUiVisible] = useState(true)

  const drag = useRef({ active: false, px: 0, py: 0, x: 0, y: 0, moved: 0 })
  const speechTimer = useRef<number | undefined>(undefined)

  const char = CHARACTERS[charIdx]

  // 读取持久化位置 / 角色
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.pos) setPos(d.pos)
        if (typeof d.charIdx === 'number') setCharIdx(d.charIdx)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ pos, charIdx }))
    } catch {
      /* ignore */
    }
  }, [pos, charIdx])

  // PWA 安装提示
  useEffect(() => {
    const h = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  // 窗口缩放时把宠物夹回可视区
  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: clamp(p.x, 0, window.innerWidth - PET_SIZE),
        y: clamp(p.y, 0, window.innerHeight - PET_SIZE),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 闲置行为：随机说话 or 招手
  useEffect(() => {
    let alive = true
    const loop = () => {
      if (!alive) return
      if (Math.random() < 0.5) {
        const lines = char.lines
        setSpeech({ text: lines[Math.floor(Math.random() * lines.length)], key: Date.now() })
        window.clearTimeout(speechTimer.current)
        speechTimer.current = window.setTimeout(() => setSpeech(null), 3800)
      } else {
        setWaving(true)
        window.setTimeout(() => alive && setWaving(false), 1400)
      }
      window.setTimeout(loop, 16000 + Math.random() * 12000)
    }
    const t = window.setTimeout(loop, 6000)
    return () => {
      alive = false
      window.clearTimeout(t)
      window.clearTimeout(speechTimer.current)
    }
  }, [char])

  // 首次提示自动消失
  useEffect(() => {
    const t = window.setTimeout(() => setShowHint(false), 6000)
    return () => window.clearTimeout(t)
  }, [])

  // 纯净模式：8 秒无操作隐藏顶栏/提示，只留宠物悬浮；点屏幕唤回
  const uiTimer = useRef<number | undefined>(undefined)
  const wakeUi = useCallback(() => {
    setUiVisible(true)
    window.clearTimeout(uiTimer.current)
    uiTimer.current = window.setTimeout(() => setUiVisible(false), 8000)
  }, [])
  useEffect(() => {
    wakeUi()
    return () => window.clearTimeout(uiTimer.current)
  }, [wakeUi])

  const speak = useCallback(() => {
    const lines = char.lines
    setSpeech({ text: lines[Math.floor(Math.random() * lines.length)], key: Date.now() })
    window.clearTimeout(speechTimer.current)
    speechTimer.current = window.setTimeout(() => setSpeech(null), 3800)
  }, [char])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { active: true, px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: 0 }
    setDragging(true)
    setShowHint(false)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    drag.current.moved = Math.max(drag.current.moved, Math.hypot(dx, dy))
    const nx = clamp(drag.current.x + dx, 0, window.innerWidth - PET_SIZE)
    const ny = clamp(drag.current.y + dy, 0, window.innerHeight - PET_SIZE)
    setPos({ x: nx, y: ny })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    drag.current.active = false
    setDragging(false)
    if (drag.current.moved < 6) speak() // 视为点击
  }
  const celebrate = () => {
    setCelebrating(true)
    setSpeech({ text: '嘿！我是你的专属桌宠～', key: Date.now() })
    window.setTimeout(() => setCelebrating(false), 1600)
    window.setTimeout(() => setSpeech(null), 3800)
  }
  const switchChar = (i: number) => {
    setCharIdx(i)
    setSpeech({ text: `${CHARACTERS[i].name} 报到！`, key: Date.now() })
    window.setTimeout(() => setSpeech(null), 2600)
  }
  const install = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      const r = await installPrompt.userChoice
      if (r.outcome === 'accepted') setInstallPrompt(null)
    } else {
      alert(
        '此设备无法一键安装（iOS 不支持 / 或因 HTTP 限制）：\n\n【iPhone】点浏览器底部「分享」图标 → 选「添加到主屏幕」\n【安卓/电脑 Chrome】点地址栏右侧「⋯」或「⊕」→ 选「安装应用 / 添加到主屏幕」',
      )
    }
  }

  return (
    <div
      className={'pet-app' + (uiVisible ? '' : ' ui-hidden')}
      onPointerDown={wakeUi}
    >
      <div className="topbar">
        <div className="chars">
          {CHARACTERS.map((c, i) => (
            <button
              key={c.id}
              className={'char-dot' + (i === charIdx ? ' on' : '')}
              onClick={() => switchChar(i)}
              title={c.name}
              aria-label={c.name}
            >
              <img src={c.file} alt={c.name} draggable={false} />
            </button>
          ))}
        </div>
        <button className="install-btn" onClick={install}>
          安装到桌面 / 主屏
        </button>
      </div>

      <div
        className="pet-slot"
        style={{ left: pos.x, top: pos.y, width: PET_SIZE, height: PET_SIZE }}
      >
        <span className="pet-shadow" />
        <div
          className={
            'pet-art' +
            (dragging ? ' dragging' : '') +
            (waving ? ' waving' : '') +
            (celebrating ? ' celebrating' : '')
          }
          style={{ backgroundImage: `url(${char.file})` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={celebrate}
        />
        {speech && (
          <div className="bubble" key={speech.key}>
            {speech.text}
          </div>
        )}
      </div>

      {showHint && <div className="hint">拖我移动 · 点我聊天 · 双击撒欢</div>}
    </div>
  )
}
