/**
 * CSS 手绘「五彩多巴胺礼物盒」（会呼吸的开启按钮）。
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
      <div className="mystery-box__glow" />
    </div>
  )
}
