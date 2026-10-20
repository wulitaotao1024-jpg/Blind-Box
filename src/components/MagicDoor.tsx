import { useState } from 'react'
import { track } from '../logic/track'

/**
 * P1 首页「整屏魔法之门」：
 * 整个背景就是一扇顶天立地的双开大门，门后藏着皮克斯风的第六大道街景。
 * 点击 → 双扇门 3D 推开 → 街道由暗转亮并向纵深推进（近→远的视觉）→ 暖光收束 → 转场进故事。
 * 门即背景，文字层由 Landing 叠在上方。
 */
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
      {/* 门后世界：皮克斯风第六大道（黄昏 + 两侧楼宇向远处收拢） */}
      <div className="street" aria-hidden="true">
        <span className="street__sky" />
        <span className="street__glow" />
        <span className="street__row street__row--l" />
        <span className="street__row street__row--r" />
        <span className="street__road" />
        <span className="street__line" />
        <span className="street__lamps">
          <i /><i /><i /><i /><i /><i />
        </span>
      </div>

      {/* 双扇大门：铺满整个背景 */}
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

      {/* 提示语（底部居中，不再与任何文案重叠） */}
      <span className="doors__hint">轻触 · 推门</span>
    </div>
  )
}
