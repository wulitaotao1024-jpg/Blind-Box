import { useEffect, useState } from 'react'
import IpPortrait from '../components/IpPortrait'
import ModelViewer3D from '../components/ModelViewer3D'
import RarityBadge from '../components/RarityBadge'
import { IPS } from '../data/ips'
import { FOOTER_LINE } from '../data/subtitles'
import { isComplete, progress } from '../logic/collection'
import { track } from '../logic/track'
import type { IpDef } from '../logic/types'

// P4 图鉴墙（我的盒隙墙）：图鉴墙 = 第六大道花名册（PRD F2）
export default function Wall({
  collected,
  drawsLeft,
  shareCopied,
  onDraw,
  onShare,
  onReplay,
}: {
  collected: ReadonlySet<string>
  drawsLeft: number
  shareCopied: boolean
  onDraw: () => void
  onShare: () => void
  onReplay: () => void
}) {
  const [detail, setDetail] = useState<IpDef | null>(null)
  const [viewing3d, setViewing3d] = useState<IpDef | null>(null)
  const p = progress(collected, IPS)
  const complete = isComplete(collected, IPS)
  const left = p.total - p.collected

  useEffect(() => {
    track('collection_view', { percent: Math.round((p.collected / p.total) * 100) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="wall">
      <header className="wall__head">
        <h1 className="wall__title">我的盒隙墙</h1>
        <span className="brand__en">BLINDGAP</span>
      </header>
      <p className="wall__street">第六大道 · 花名册</p>

      <div className="wall__progress">
        <p className="wall__progress-text">
          已点亮 <b>{p.collected}</b> / {p.total}
          {complete ? ' —— 街区全员归来！' : left > 0 ? `，还差 ${left} 个兄弟就能端盒。` : ''}
        </p>
        {complete && <span className="wall__complete">端盒达成 · 彩蛋入口</span>}
      </div>

      <div className="wall__grid">
        {IPS.map((ip) => {
          const owned = collected.has(ip.id)
          return owned ? (
            <button key={ip.id} className="cell cell--lit" onClick={() => setDetail(ip)}>
              <IpPortrait ip={ip} />
              <span className="cell__meta">
                <span className="cell__name">{ip.name}</span>
                <span className="cell__num">№{ip.id}</span>
              </span>
            </button>
          ) : (
            <div key={ip.id} className="cell cell--dark" aria-label="未收录">
              <span className="cell__q">？？？</span>
              <span className="cell__hint">{ip.status === 'pending' ? '入住筹备中' : '——据说很狠'}</span>
            </div>
          )
        })}
      </div>

      <div className="wall__next-wave">
        <span>街头邻里系列 · №009 起 · 每波 6-10 位</span>
        <span>筹备中…</span>
      </div>

      <div className="wall__actions">
        <button className="btn btn--gold" onClick={onDraw}>
          {drawsLeft > 0 ? `开 盒（${drawsLeft} 发）` : '今日已用完'}
        </button>
        <button className="btn btn--ghost" onClick={onShare}>
          {shareCopied ? '链接已复制 ✓' : '分享 +1发'}
        </button>
        <button className="btn btn--ghost" onClick={onReplay}>重看故事</button>
      </div>

      <p className="wall__odds">
        概率公示：路面款 55% ｜ 限定 33% ｜ 狠货 10% ｜ 幽灵款 2%<br />
        保底：小保底 10 抽必出限定+ ｜ 大保底 40 抽必出狠货+ ｜ 幽灵硬保底 90 抽<br />
        {FOOTER_LINE}
      </p>

      {detail && (
        <div className="detail" role="dialog" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="detail__card">
            <div className="reveal__top">
              <span className="reveal__num">№ {detail.id}</span>
              <RarityBadge rarity={detail.rarity} />
            </div>
            <div className="reveal__portrait">
              <IpPortrait ip={detail} />
            </div>
            <h2 className="reveal__name">
              {detail.name}
              <span className="reveal__en">{detail.en}</span>
            </h2>
            <p className="reveal__tagline">{detail.tagline}</p>
            <div className="reveal__note">
              <p className="reveal__note-label">主理人手记</p>
              {detail.note}
            </div>
            <div className="reveal__row" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={() => setViewing3d(detail)}>3D 鉴赏</button>
              <button className="btn btn--gold" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {viewing3d && <ModelViewer3D ip={viewing3d} onClose={() => setViewing3d(null)} />}
    </div>
  )
}
