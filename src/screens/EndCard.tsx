import { useState } from 'react'
import MysteryBox from '../components/MysteryBox'
import { END_CARD_LINE } from '../data/subtitles'

// 礼花碎片：多巴胺配色 + 各自的方向/旋转/延迟（内联 CSS 变量驱动 keyframes）
const CONFETTI = [
  { color: '#ff6fae', dx: -150, dy: -190, rot: 220, delay: 0 },
  { color: '#b388ff', dx: -110, dy: -240, rot: 300, delay: 0.04 },
  { color: '#5ad1ff', dx: -60, dy: -270, rot: 180, delay: 0.08 },
  { color: '#7be495', dx: 30, dy: -260, rot: 420, delay: 0.02 },
  { color: '#ffd76a', dx: 90, dy: -230, rot: 260, delay: 0.06 },
  { color: '#ff9e6d', dx: 150, dy: -180, rot: 340, delay: 0 },
  { color: '#fff3c4', dx: -180, dy: -120, rot: 200, delay: 0.1 },
  { color: '#ff6fae', dx: 180, dy: -110, rot: 380, delay: 0.05 },
  { color: '#b388ff', dx: -20, dy: -290, rot: 460, delay: 0.12 },
  { color: '#5ad1ff', dx: 120, dy: -280, rot: 240, delay: 0.08 },
  { color: '#ffd76a', dx: -130, dy: -260, rot: 320, delay: 0.03 },
  { color: '#7be495', dx: 60, dy: -200, rot: 400, delay: 0.14 },
  { color: '#ff9e6d', dx: -90, dy: -150, rot: 280, delay: 0.09 },
  { color: '#fff3c4', dx: 160, dy: -250, rot: 360, delay: 0.11 },
  { color: '#ff6fae', dx: 0, dy: -300, rot: 500, delay: 0.07 },
  { color: '#b388ff', dx: -170, dy: -210, rot: 220, delay: 0.13 },
]

// 末帧 EndCard：盒子「咔哒」落下，盒子本身就是开盒按钮（PRD 6.3 原则4）
// 点击开盒 → 加速抖动 → 盒盖弹飞 + 礼花 + 盒内光束 + 闪光 → 无缝进揭晓屏
export default function EndCard({
  drawsLeft,
  onOpen,
  onReplay,
}: {
  drawsLeft: number
  onOpen: () => void
  onReplay: () => void
}) {
  const [opening, setOpening] = useState(false)
  const [flash, setFlash] = useState(false)

  const open = () => {
    if (opening) return
    setOpening(true)
    // 0.5s 盒盖弹开（抖动最高潮）→ 0.56s 闪光 → 0.98s 礼花尾声时切进揭晓屏
    window.setTimeout(() => setFlash(true), 560)
    window.setTimeout(onOpen, 980)
  }

  return (
    <div className="endcard">
      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>
      <div className="endcard__drop">
        <button onClick={open} aria-label="开盒" disabled={opening}>
          <MysteryBox className="endcard__box" opening={opening} />
        </button>
        {opening && (
          <div className="endcard__confetti" aria-hidden="true">
            {CONFETTI.map((c, i) => (
              <i
                key={i}
                style={{
                  background: c.color,
                  ['--dx' as string]: `${c.dx}px`,
                  ['--dy' as string]: `${c.dy}px`,
                  ['--rot' as string]: `${c.rot}deg`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <p className="endcard__line">{END_CARD_LINE}</p>
      <div className="endcard__actions">
        <button className="btn btn--gold" onClick={open} disabled={opening}>开 盒</button>
        <span className="endcard__draws">
          {drawsLeft > 0 ? `今日补给 ${drawsLeft} 发可用` : '今日补给已用完 · 分享或明天再来'}
        </span>
        <button className="btn btn--dim" onClick={onReplay}>‹ 再看一遍故事</button>
      </div>
      {flash && <div className="endcard__pop-flash" />}
    </div>
  )
}
