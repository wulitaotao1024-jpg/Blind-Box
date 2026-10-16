import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { CHARACTERS } from './data/characters'

const STORE = 'blindgap-pet:v1'
const PET_SIZE = 150
const PANEL_W = 340
const PANEL_H = 470

const api: any = typeof window !== 'undefined' ? (window as any).electronAPI : null
const isElectron = !!api

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
  const [speech, setSpeech] = useState<{ text: string; key: number } | null>(null)
  const [waving, setWaving] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showHint, setShowHint] = useState(true)
  const [uiVisible, setUiVisible] = useState(true)

  // Electron 专属：球 / 面板 两态 + 窗口几何
  const [mode, setMode] = useState<'panel' | 'ball'>('panel')
  const screenRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const winRef = useRef({ x: 0, y: 0, w: PANEL_W, h: PANEL_H })
  // 台词气泡位置补偿：宠物贴近屏幕边缘时横向滑动 / 空间不足时翻到宠物下方，保证文字完整不被裁
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [bubbleShift, setBubbleShift] = useState(0)
  const [bubbleBelow, setBubbleBelow] = useState(false)

  const char = CHARACTERS[charIdx]
  const speechTimer = useRef<number | undefined>(undefined)
  // 双击互动台词按顺序轮播：老皮第一次双击→第一句，第二次→第二句，之后循环
  const lineCursor = useRef(0)
  useEffect(() => {
    lineCursor.current = 0 // 换角色后从头开始
  }, [charIdx])
  const nextLine = useCallback(() => {
    const lines = char.lines
    if (!lines || lines.length === 0) return '嘿！我是你的专属桌宠～'
    const text = lines[lineCursor.current % lines.length]
    lineCursor.current = (lineCursor.current + 1) % lines.length
    return text
  }, [char])

  // ---------- 持久化读取 ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE)
      if (raw) {
        const d = JSON.parse(raw)
        if (typeof d.charIdx === 'number') setCharIdx(d.charIdx)
        if (!isElectron && d.mode) setMode(d.mode)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // ---------- 持久化写入 ----------
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ charIdx, mode }))
    } catch {
      /* ignore */
    }
  }, [charIdx, mode])

  // ---------- Electron 初始化 ----------
  useEffect(() => {
    if (!isElectron) return
    // 关键：透明窗里 body 默认黑底会透出来（球四角的"黑边"就是它），必须透明
    document.body.style.background = 'transparent'
    ;(async () => {
      const sc = await api.screen()
      screenRef.current = sc
      const b = await api.getBounds()
      winRef.current = { x: b.x, y: b.y, w: b.width, h: b.height }
      const stored = JSON.parse(localStorage.getItem(STORE) || '{}')
      if (typeof stored.charIdx === 'number' && stored.mode === 'ball') {
        const nb: any = await api.setState('ball')
        winRef.current = nb
        setMode('ball')
      } else {
        // 首次：面板居中
        const cx = sc.x + Math.max(0, (sc.width - PANEL_W) / 2)
        const cy = sc.y + Math.max(0, (sc.height - PANEL_H) / 2)
        api.setBounds({ x: cx, y: cy, w: PANEL_W, h: PANEL_H })
        winRef.current = { x: cx, y: cy, w: PANEL_W, h: PANEL_H }
        setMode('panel')
      }
    })()
  }, [])

  // ---------- PWA 安装提示（仅 Web） ----------
  useEffect(() => {
    if (isElectron) return
    const h = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  // ---------- 窗口缩放夹回（仅 Web） ----------
  useEffect(() => {
    if (isElectron) return
    const onResize = () => {
      setPos((p) => ({
        x: clamp(p.x, 0, window.innerWidth - PET_SIZE),
        y: clamp(p.y, 0, window.innerHeight - PET_SIZE),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ---------- 闲置行为：随机说话 or 招手 ----------
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

  // ---------- 首次提示自动消失（仅 Web） ----------
  useEffect(() => {
    if (isElectron) return
    const t = window.setTimeout(() => setShowHint(false), 6000)
    return () => window.clearTimeout(t)
  }, [])

  // ---------- 纯净模式：8 秒无操作隐藏顶栏（仅 Web） ----------
  const uiTimer = useRef<number | undefined>(undefined)
  const wakeUi = useCallback(() => {
    if (isElectron) return
    setUiVisible(true)
    window.clearTimeout(uiTimer.current)
    uiTimer.current = window.setTimeout(() => setUiVisible(false), 8000)
  }, [])
  useEffect(() => {
    if (isElectron) return
    wakeUi()
    return () => window.clearTimeout(uiTimer.current)
  }, [wakeUi])

  const speak = useCallback(() => {
    const lines = char.lines
    setSpeech({ text: lines[Math.floor(Math.random() * lines.length)], key: Date.now() })
    window.clearTimeout(speechTimer.current)
    speechTimer.current = window.setTimeout(() => setSpeech(null), 3800)
  }, [char])

  // ================= Web（PWA）拖拽 =================
  const webDrag = useRef({ active: false, px: 0, py: 0, x: 0, y: 0, moved: 0 })
  const onPointerDown = (e: React.PointerEvent) => {
    if (isElectron) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    webDrag.current = { active: true, px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: 0 }
    setShowHint(false)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (isElectron || !webDrag.current.active) return
    const dx = e.clientX - webDrag.current.px
    const dy = e.clientY - webDrag.current.py
    webDrag.current.moved = Math.max(webDrag.current.moved, Math.hypot(dx, dy))
    const nx = clamp(webDrag.current.x + dx, 0, window.innerWidth - PET_SIZE)
    const ny = clamp(webDrag.current.y + dy, 0, window.innerHeight - PET_SIZE)
    setPos({ x: nx, y: ny })
  }
  const onPointerUp = () => {
    if (isElectron || !webDrag.current.active) return
    webDrag.current.active = false
    if (webDrag.current.moved < 6) speak()
  }

  // ================= Electron 球拖拽（主进程接管，渲染层只报开始/结束） =================
  const onBallDown = (e: React.PointerEvent) => {
    if (!isElectron) return
    if (e.button === 0) {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      api.dragStart()
      setShowHint(false)
    }
  }
  const onBallUp = (e: React.PointerEvent) => {
    if (!isElectron || e.button !== 0) return
    api.dragEnd()
  }

  const expand = async () => {
    if (!isElectron) return
    const b: any = await api.setState('panel')
    winRef.current = b
    setMode('panel')
  }
  const collapse = async (idx?: number) => {
    if (!isElectron) return
    if (typeof idx === 'number') {
      setCharIdx(idx)
      setSpeech({ text: `${CHARACTERS[idx].name} 报到！`, key: Date.now() })
      window.setTimeout(() => setSpeech(null), 2600)
    }
    const b: any = await api.setState('ball')
    winRef.current = b
    setMode('ball')
  }

  // ---------- 主进程事件：单击展开面板 / 双击撒欢 / 托盘切换角色 ----------
  useEffect(() => {
    if (!isElectron) return
    const offClick = api.onBallClick(() => {
      expand()
    })
    const offDbl = api.onBallDbl(() => {
      celebrate()
    })
    const offChar = api.onSwitchChar((idx: number) => {
      setCharIdx(idx)
      setSpeech({ text: `${CHARACTERS[idx].name} 报到！`, key: Date.now() })
      window.setTimeout(() => setSpeech(null), 2600)
    })
    return () => {
      offClick()
      offDbl()
      offChar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const celebrate = () => {
    setCelebrating(true)
    setSpeech({ text: nextLine(), key: Date.now() })
    window.setTimeout(() => setCelebrating(false), 1600)
    window.setTimeout(() => setSpeech(null), 3800)
  }

  // ---------- 台词气泡避让：贴边时横向滑动 / 上方没空间时翻到宠物下方 ----------
  useLayoutEffect(() => {
    if (!isElectron || mode !== 'ball' || !speech) return
    let alive = true
    const measure = (times: number) => {
      const el = bubbleRef.current
      if (!el || !alive) return
      const bw = el.offsetWidth
      const bh = el.offsetHeight
      if (bw === 0 && times > 0) {
        window.requestAnimationFrame(() => measure(times - 1))
        return
      }
      api
        .getBounds()
        .then((b: any) => {
          if (!alive) return
          const sc = screenRef.current
          const pad = 8
          // ---- 纵向：优先在宠物上方，上方装不下则翻到下方 ----
          const aboveTop = b.y + (b.height - 208 - bh)
          const aboveBottom = b.y + (b.height - 208)
          const belowTop = b.y + (b.height - 40 - bh)
          const belowBottom = b.y + (b.height - 40)
          const aboveFits =
            aboveTop >= sc.y + pad && aboveBottom <= sc.y + sc.height - pad
          const belowFits =
            belowTop >= sc.y + pad && belowBottom <= sc.y + sc.height - pad
          setBubbleBelow(!aboveFits && belowFits)
          // ---- 横向：气泡整体夹在屏幕内，偏移量反向补给尾巴指针 ----
          const half = bw / 2
          const center = b.x + b.width / 2
          const lo = sc.x + pad + half
          const hi = sc.x + sc.width - pad - half
          let shift = 0
          if (lo < hi) shift = clamp(center, lo, hi) - center
          setBubbleShift(clamp(shift, -110, 110))
        })
        .catch(() => {
          /* ignore */
        })
    }
    measure(3)
    return () => {
      alive = false
    }
  }, [speech, mode])

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

  // ================= 渲染 =================
  if (isElectron) {
    return (
      <div className="pet-app electron">
        {mode === 'ball' ? (
          <div className="ball-view">
            {speech && (
              <div
                className={'ball-bubble' + (bubbleBelow ? ' below' : '')}
                key={speech.key}
                ref={bubbleRef}
                style={
                  {
                    transform: `translateX(calc(-50% + ${bubbleShift}px))`,
                    '--tail-shift': `${-bubbleShift}px`,
                  } as React.CSSProperties
                }
              >
                {speech.text}
              </div>
            )}
            <div
              className={'ball' + (waving ? ' waving' : '') + (celebrating ? ' celebrating' : '')}
              style={{ backgroundImage: `url(${char.file})` }}
              onPointerDown={onBallDown}
              onPointerUp={onBallUp}
              onContextMenu={(e) => {
                e.preventDefault()
                expand()
              }}
              title={`${char.name}（拖动移动 · 单击展开 · 双击撒欢）`}
            />
            {showHint && <div className="ball-hint">拖我到任意位置 · 单击展开 · 双击撒欢</div>}
          </div>
        ) : (
          <div className="panel-view">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">盒隙桌宠</span>
                <button className="panel-close" onClick={() => collapse()} title="收起为悬浮球">
                  收起
                </button>
              </div>
              <div className="panel-preview" style={{ backgroundImage: `url(${char.file})` }}>
                <span className="panel-name">
                  {char.name} · {char.tag}
                </span>
              </div>
              <div className="panel-grid">
                {CHARACTERS.map((c, i) => (
                  <button
                    key={c.id}
                    className={'grid-item' + (i === charIdx ? ' on' : '')}
                    onClick={() => collapse(i)}
                    title={c.name}
                  >
                    <img src={c.file} alt={c.name} draggable={false} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
              {speech && (
                <div className="panel-speech" key={speech.key}>
                  {speech.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- Web（PWA）全屏形态 ----------
  return (
    <div className={'pet-app' + (uiVisible ? '' : ' ui-hidden')} onPointerDown={wakeUi}>
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

      <div className="pet-slot" style={{ left: pos.x, top: pos.y, width: PET_SIZE, height: PET_SIZE }}>
        <span className="pet-shadow" />
        <div
          className={
            'pet-art' +
            (webDrag.current.active ? ' dragging' : '') +
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
