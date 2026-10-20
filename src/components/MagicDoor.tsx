import { useState } from 'react'
import { track } from '../logic/track'

/**
 * P1 首页「整屏魔法之门」：
 * 深色魔法双开大门居中矗立（圆拱顶部完整露出，两侧是粉紫黄昏渐变），
 * 门后藏着皮克斯风的第六大道街景——建筑沿道路两侧依次排开、由近到远变小，挂竖排霓虹灯牌。
 * 点击 → 双扇门 3D 推开 → 街道亮起并向纵深推进 → 暖光收束 → 转场进故事。
 */

// 道路两边的小店：底边贴着路面边缘，由近（bottom:0）到远递减，内缘几乎贴住道路边线
interface Shop {
  side: 'left' | 'right'
  inset: string // 距屏幕该侧的距离
  bottom: string
  w: string
  h: string
  fs: string
  sign: string
  neon: string
  flicker?: boolean
}
const SHOPS_L: Shop[] = [
  { side: 'left', inset: '0%', bottom: '0%', w: '13%', h: '42%', fs: 'clamp(14px, 1.8vw, 22px)', sign: '第六大道餐馆', neon: '#ff6fae', flicker: true },
  { side: 'left', inset: '8.5%', bottom: '12%', w: '10%', h: '27%', fs: 'clamp(10px, 1.3vw, 15px)', sign: '美容美发', neon: '#5ad1ff' },
  { side: 'left', inset: '17%', bottom: '24%', w: '8%', h: '21%', fs: 'clamp(8px, 1vw, 12px)', sign: '盒子商店', neon: '#ffd76a' },
  { side: 'left', inset: '25.5%', bottom: '34%', w: '6%', h: '15%', fs: 'clamp(7px, 0.8vw, 10px)', sign: '洗衣店', neon: '#ff9e6d' },
]
const SHOPS_R: Shop[] = [
  { side: 'right', inset: '0%', bottom: '0%', w: '13%', h: '42%', fs: 'clamp(14px, 1.8vw, 22px)', sign: '老皮面馆', neon: '#7be495' },
  { side: 'right', inset: '8.5%', bottom: '12%', w: '10%', h: '27%', fs: 'clamp(10px, 1.3vw, 15px)', sign: '唱片行', neon: '#b388ff' },
  { side: 'right', inset: '17%', bottom: '24%', w: '8%', h: '21%', fs: 'clamp(8px, 1vw, 12px)', sign: '甜品屋', neon: '#ff9e6d' },
  { side: 'right', inset: '25.5%', bottom: '34%', w: '6%', h: '15%', fs: 'clamp(7px, 0.8vw, 10px)', sign: '便利店', neon: '#5ad1ff' },
]

function Building({ shop, z }: { shop: Shop; z: number }) {
  return (
    <span
      className={`street__b street__b--${shop.side}${shop.flicker ? ' street__b--flicker' : ''}`}
      style={{
        [shop.side]: shop.inset,
        bottom: shop.bottom,
        width: shop.w,
        height: shop.h,
        fontSize: shop.fs,
        zIndex: z,
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
      {/* 门后世界：皮克斯风第六大道（黄昏 + 道路两侧小店霓虹 + 纵深马路）。关门时隐藏 */}
      <div className="street" aria-hidden="true">
        <span className="street__sky" />
        <span className="street__glow" />
        <span className="street__road" />
        <span className="street__line" />
        {SHOPS_L.map((s, i) => (
          <Building key={`l-${s.sign}`} shop={s} z={9 - i} />
        ))}
        {SHOPS_R.map((s, i) => (
          <Building key={`r-${s.sign}`} shop={s} z={9 - i} />
        ))}
        <span className="street__lamps">
          <i /><i /><i /><i /><i /><i />
        </span>
      </div>

      {/* 双扇大门：居中矗立，底部落地、顶部留空让圆拱完整露出 */}
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
