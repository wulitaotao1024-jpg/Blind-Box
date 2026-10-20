import { useState } from 'react'
import { track } from '../logic/track'

/**
 * P1 首页「整屏魔法之门」：
 * 深色魔法双开大门居中矗立（两侧留出暗色墙面），门后藏着皮克斯风的第六大道街景。
 * 点击 → 双扇门 3D 推开 → 街道由暗转亮并向纵深推进（近→远的视觉）→ 暖光收束 → 转场进故事。
 * 门即背景，文字层由 Landing 叠在上方。
 */

// 街道两侧的皮克斯风小店（由近到远，width/height/bottom/字号递减制造纵深）
interface Shop {
  side: 'left' | 'right'
  offset: string
  bottom: string
  w: string
  h: string
  fs: string
  sign: string
  neon: string
  flicker: boolean
}
const SHOPS_L: Shop[] = [
  { side: 'left' as const, offset: '0%', bottom: '0%', w: '17%', h: '54%', fs: '17px', sign: '第六大道餐馆', neon: '#ff6fae', flicker: true },
  { side: 'left' as const, offset: '18%', bottom: '9%', w: '12%', h: '38%', fs: '13px', sign: '美容美发', neon: '#5ad1ff', flicker: false },
  { side: 'left' as const, offset: '31%', bottom: '17%', w: '9%', h: '26%', fs: '10px', sign: '盒子商店', neon: '#ffd76a', flicker: false },
]
const SHOPS_R: Shop[] = [
  { side: 'right' as const, offset: '0%', bottom: '0%', w: '17%', h: '54%', fs: '17px', sign: '老皮面馆', neon: '#7be495', flicker: false },
  { side: 'right' as const, offset: '18%', bottom: '9%', w: '12%', h: '38%', fs: '13px', sign: '唱片行', neon: '#b388ff', flicker: false },
  { side: 'right' as const, offset: '31%', bottom: '17%', w: '9%', h: '26%', fs: '10px', sign: '便利店', neon: '#ff9e6d', flicker: false },
]

function Building({ shop }: { shop: Shop }) {
  return (
    <span
      className={`street__b${shop.flicker ? ' street__b--flicker' : ''}`}
      style={{
        [shop.side]: shop.offset,
        bottom: shop.bottom,
        width: shop.w,
        height: shop.h,
        fontSize: shop.fs,
      }}
    >
      <span
        className="street__sign"
        style={{ color: shop.neon, textShadow: `0 0 6px ${shop.neon}, 0 0 16px ${shop.neon}, 0 0 30px ${shop.neon}` }}
      >
        {shop.sign}
      </span>
    </span>
  )
}

export default function MagicDoor({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false)

  const push = () => {
    if (open) return
    setOpen(true)
    track('door_open', {})
    // 门开 1.5s → 街道亮起并推进 2s → 暖光收束，2.7s 时切进故事屏
    setTimeout(onOpen, 2700)
  }

  return (
    <div className={`doors${open ? ' doors--open' : ''}`}>
      {/* 门后世界：皮克斯风第六大道（黄昏 + 两侧小店霓虹 + 纵深马路） */}
      <div className="street" aria-hidden="true">
        <span className="street__sky" />
        <span className="street__glow" />
        <span className="street__road" />
        <span className="street__line" />
        {SHOPS_L.map((s) => (
          <Building key={`l-${s.sign}`} shop={s} />
        ))}
        {SHOPS_R.map((s) => (
          <Building key={`r-${s.sign}`} shop={s} />
        ))}
        <span className="street__lamps">
          <i /><i /><i /><i /><i /><i />
        </span>
      </div>

      {/* 双扇大门：居中矗立，两侧留出暗墙 */}
      <button
        className="doors__leaf doors__leaf--l"
        onClick={push}
        aria-label="推开大门，进入故事"
      >
        <span className="doors__panel doors__panel--t" />
        <span className="doors__panel doors__panel--b" />
        <span className="doors__knob" />
      </button>
      <button
        className="doors__leaf doors__leaf--r"
        onClick={push}
        aria-label="推开大门，进入故事"
      >
        <span className="doors__panel doors__panel--t" />
        <span className="doors__panel doors__panel--b" />
        <span className="doors__knob" />
      </button>

      {/* 中缝光：常亮呼吸，透出「门后有世界」 */}
      <span className="doors__seam" />

      {/* 暖光收束罩：街道推进到眼前时轻拢，无缝切进视频 */}
      <span className="doors__veil" />

      {/* 提示语（底部居中） */}
      <span className="doors__hint">轻触 · 推门</span>
    </div>
  )
}
