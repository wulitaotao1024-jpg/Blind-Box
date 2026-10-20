/**
 * CSS 手绘「皮克斯风礼物盒」（会呼吸的开启按钮）。
 * 配色与首页「第六大道黄昏街景」同源：珊瑚粉盒身 + 金橘盒盖 + 奶油丝带 + 星点闪光。
 * opening=true 时进入开盒演出：加速抖动 → 盒盖/蝴蝶结弹飞 → 盒内光束涌出（礼花由外层负责）。
 */
export default function MysteryBox({
  hint,
  className = '',
  opening = false,
}: {
  hint?: string
  className?: string
  opening?: boolean
}) {
  return (
    <div className={`mystery-box ${className}${opening ? ' mystery-box--opening' : ''}`.trim()} aria-hidden={false}>
      {hint && <span className="mystery-box__hint">{hint}</span>}
      <div className="mystery-box__bow">
        <span className="mystery-box__loop mystery-box__loop--l" />
        <span className="mystery-box__loop mystery-box__loop--r" />
        <span className="mystery-box__knot" />
        <span className="mystery-box__tail mystery-box__tail--l" />
        <span className="mystery-box__tail mystery-box__tail--r" />
      </div>
      <div className="mystery-box__lid" />
      <div className="mystery-box__body">
        <span className="mystery-box__shine" />
        <span className="mystery-box__ribbon mystery-box__ribbon--v" />
        <span className="mystery-box__ribbon mystery-box__ribbon--h" />
      </div>
      {/* 开盒时从盒里涌出的光柱 */}
      <span className="mystery-box__beam" />
      <span className="mystery-box__spark mystery-box__spark--1" />
      <span className="mystery-box__spark mystery-box__spark--2" />
      <span className="mystery-box__spark mystery-box__spark--3" />
      <span className="mystery-box__spark mystery-box__spark--4" />
      <div className="mystery-box__glow" />
    </div>
  )
}
