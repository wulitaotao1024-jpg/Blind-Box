import { useState } from 'react'
import IpPortrait from '../components/IpPortrait'
import LorePanel from '../components/LorePanel'
import ModelViewer3D from '../components/ModelViewer3D'
import RarityBadge from '../components/RarityBadge'
import type { IpDef } from '../logic/types'

// P2 开盒揭示屏：闪光 → 顶部缎带蝴蝶结（替代整只礼盒，省纵向空间）→ IP 揭示卡（F3 字段全集 + F8 3D 入口）
// 布局：整屏不滚；缎带与底部按钮固定，卡片区吃满剩余高度，内容在卡片内部滚
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
      {/* 已开盒情境：蝴蝶结 + 两段短丝带尾 + 星光（纯 CSS，紧凑不占空间；与礼物盒蝴蝶结同源） */}
      <div className="reveal__ribbon" aria-hidden="true">
        <span className="reveal__ribbon-tail reveal__ribbon-tail--l" />
        <span className="reveal__ribbon-tail reveal__ribbon-tail--r" />
        <span className="reveal__ribbon-bow">
          <i className="reveal__ribbon-loop reveal__ribbon-loop--l" />
          <i className="reveal__ribbon-loop reveal__ribbon-loop--r" />
          <i className="reveal__ribbon-knot" />
        </span>
        <span className="reveal__sparkle reveal__sparkle--1">✦</span>
        <span className="reveal__sparkle reveal__sparkle--2">✦</span>
        <span className="reveal__sparkle reveal__sparkle--3">✦</span>
      </div>

      {/* 卡面区：吃掉盒子与按钮之外的全部高度，卡在里面居中且自己滚 */}
      <div className="reveal__body">
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

          <LorePanel ip={ip} />

          <div className="reveal__note">
            <p className="reveal__note-label">主理人手记</p>
            {ip.note}
          </div>

          {!isNew && (
            <p className="reveal__dup">这只有了，但没亏：MVP 先返还 1 发，碎片合成 V1.1 上线。</p>
          )}
        </article>
      </div>

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
