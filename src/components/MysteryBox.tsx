/**
 * CSS 手绘「皮克斯风礼物盒」（会呼吸的开启按钮）。
 * 配色与首页「第六大道黄昏街景」同源：珊瑚粉盒身 + 金橘盒盖 + 奶油丝带 + 星点闪光。
 * 视频末帧的「盒子落下」用同一造型，形成视觉闭环。
 */
export default function MysteryBox({ hint, className = '' }: { hint?: string; className?: string }) {
  return (
    <div className={`mystery-box ${className}`.trim()} aria-hidden={false}>
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
      <span className="mystery-box__spark mystery-box__spark--1" />
      <span className="mystery-box__spark mystery-box__spark--2" />
      <span className="mystery-box__spark mystery-box__spark--3" />
      <span className="mystery-box__spark mystery-box__spark--4" />
      <div className="mystery-box__glow" />
    </div>
  )
}
