import { useState } from 'react'
import IpPortrait from '../components/IpPortrait'
import ModelViewer3D from '../components/ModelViewer3D'
import MysteryBox from '../components/MysteryBox'
import RarityBadge from '../components/RarityBadge'
import type { IpDef } from '../logic/types'

// P2 开盒揭示屏：开盒动画（1.5-2s CSS）→ IP 揭示卡（F3 字段全集 + F8 3D 入口）
export default function Reveal({
  ip,
  isNew,
  drawsLeft,
  onContinue,
  onDrawAgain,
}: {
  ip: IpDef
  isNew: boolean
  drawsLeft: number
  onContinue: () => void
  onDrawAgain: () => void
}) {
  const [viewing3d, setViewing3d] = useState(false)

  return (
    <div className="reveal">
      <div className="reveal__flash" />
      <MysteryBox className="reveal__box-open" />

      <article className="reveal__card">
        <div className="reveal__top">
          <span className="reveal__num">№ {ip.id}</span>
          <RarityBadge rarity={ip.rarity} />
        </div>

        <div className="reveal__portrait">
          <IpPortrait ip={ip} tag={ip.status === 'pending' ? '素材制作中' : undefined} />
        </div>

        <h2 className="reveal__name">
          {ip.name}
          <span className="reveal__en">{ip.en}</span>
        </h2>
        <p className="reveal__tagline">{ip.tagline}</p>

        <div className="reveal__note">
          <p className="reveal__note-label">主理人手记</p>
          {ip.note}
        </div>

        {!isNew && (
          <p className="reveal__dup">这只有了，但没亏：MVP 先返还 1 发，碎片合成 V1.1 上线。</p>
        )}
      </article>

      <div className="reveal__actions">
        <button className="btn btn--gold" onClick={onContinue}>收入图鉴墙 ›</button>
        <div className="reveal__row">
          <button className="btn btn--ghost" onClick={() => setViewing3d(true)}>3D 鉴赏</button>
          {drawsLeft > 0 ? (
            <button className="btn btn--ghost" onClick={onDrawAgain}>再来一发（剩 {drawsLeft}）</button>
          ) : (
            <button className="btn btn--ghost" disabled>明日再来</button>
          )}
        </div>
      </div>

      {viewing3d && <ModelViewer3D ip={ip} onClose={() => setViewing3d(false)} />}
    </div>
  )
}
