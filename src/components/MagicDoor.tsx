import { useState } from 'react'
import { track } from '../logic/track'

/**
 * P1 首页「整屏魔法之门」：
 * 深色魔法双开大门居中矗立（椭圆拱顶完整露出，两侧是粉紫黄昏渐变），
 * 门后是皮克斯风的第六大道街景大图（AI 生成，建筑沿道路两侧、霓虹灯牌）。
 * 点击 → 双扇门 3D 推开 → 街道图由暗转亮并向纵深推进 → 暖光收束 → 转场进故事。
 */

export default function MagicDoor({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false)

  const push = () => {
    if (open) return
    setOpen(true)
    track('door_open', {})
    // 快转门 1.05s → 光团 1.1s 前散尽 → 街景 0.8s 起显影并停留约 2.4s（缓慢推进）→ 3.4s 暖光收束，4s 时切进故事屏
    setTimeout(onOpen, 4000)
  }

  return (
    <div className={`doors${open ? ' doors--open' : ''}`}>
      {/* 门后世界：皮克斯风第六大道街景（关门时隐藏）。推门完成前只透光，街景稍后才显影 */}
      <div className="street" aria-hidden="true">
        <img className="street__img" src="/img/street-dusk.jpg" alt="" draggable={false} />
      </div>

      {/* 门缝光：门扇转动时从中间缝隙一点点涌出、渐渐变宽变亮的暖光（街景显影前唯一的可见内容） */}
      <span className="doors__light" />

      {/* 双扇大门：居中矗立，底部落地、顶部留空让椭圆拱顶完整露出 */}
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
