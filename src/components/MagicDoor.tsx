import { useState } from 'react'
import { track } from '../logic/track'

/**
 * P1 首页「魔法之门」：皮克斯风双开大门（呼应标题「推开盒隙」）。
 * 点击 → 双扇门 3D 推开 → 门后暖光束涌入 → 白金闪光 → 转场进 21s 故事。
 * 门本身就是按钮，光缝常亮呼吸，暗示「可以推」。
 */
export default function MagicDoor({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false)

  const push = () => {
    if (open) return
    setOpen(true)
    track('door_open', {})
    // 门开 1.15s + 光束涌入 0.45s + 闪光收尾，1.9s 时切进故事屏
    setTimeout(onOpen, 1900)
  }

  return (
    <button
      className={`door${open ? ' door--open' : ''}`}
      onClick={push}
      aria-label="推开大门，进入故事"
    >
      {/* 门后世界：暖光，开门时涌出 */}
      <span className="door__beyond" />
      {/* 门框（拱顶）+ 双扇门 */}
      <span className="door__frame">
        <span className="door__leaf door__leaf--l">
          <span className="door__panel door__panel--t" />
          <span className="door__panel door__panel--b" />
          <span className="door__knob" />
        </span>
        <span className="door__leaf door__leaf--r">
          <span className="door__panel door__panel--t" />
          <span className="door__panel door__panel--b" />
          <span className="door__knob" />
        </span>
        {/* 中缝光：常亮呼吸，开门后熄灭 */}
        <span className="door__seam" />
        {/* 门楣灯：门楣上的小暖灯 */}
        <span className="door__lamp" />
      </span>
      {/* 光束：开门后从门内涌向观众 */}
      <span className="door__beam" />
      {/* 提示语 */}
      <span className="door__hint">轻触 · 推门</span>
      {/* 全屏闪光：转场收尾 */}
      <span className="door__flash" />
    </button>
  )
}
