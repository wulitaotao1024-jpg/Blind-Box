import { useState } from 'react'
import type { IpDef } from '../logic/types'

/**
 * IP 立绘组件（资产契约）：
 * 依次尝试 /ip/{id}.png → /ip/{id}.jpg；都不存在时优雅降级为稀有度风格化占位卡。
 * 素材到位后无需改代码，放入 public/ip/ 即点亮（png / jpg 均支持，优先 png）。
 */
const EXTS = ['png', 'jpg'] as const

export default function IpPortrait({ ip, tag }: { ip: IpDef; tag?: string }) {
  const [extIdx, setExtIdx] = useState(0)

  if (extIdx >= EXTS.length) {
    return (
      <div className="portrait" aria-label={`${ip.name} 立绘待补充`}>
        <div className="portrait__empty">
          <span className="portrait__empty-num">{ip.id}</span>
          <span className="portrait__empty-tag">{tag ?? '素材待补充'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="portrait">
      <img
        className="portrait__img"
        src={`/ip/${ip.id}.${EXTS[extIdx]}`}
        alt={`${ip.name} ${ip.en}`}
        loading="lazy"
        onError={() => setExtIdx((i) => i + 1)}
      />
    </div>
  )
}
