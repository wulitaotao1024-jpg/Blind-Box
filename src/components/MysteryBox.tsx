/**
 * CSS 手绘盲盒（会呼吸的开启按钮）。
 * 视频末帧的「盒子落下」用同一造型，形成视觉闭环。
 */
export default function MysteryBox({ hint, className = '' }: { hint?: string; className?: string }) {
  return (
    <div className={`mystery-box ${className}`.trim()} aria-hidden={false}>
      {hint && <span className="mystery-box__hint">{hint}</span>}
      <div className="mystery-box__lid" />
      <div className="mystery-box__body">
        <span className="mystery-box__sheen" />
        <span className="mystery-box__tape" />
        <span className="mystery-box__seal">盒</span>
      </div>
      <div className="mystery-box__glow" />
    </div>
  )
}
