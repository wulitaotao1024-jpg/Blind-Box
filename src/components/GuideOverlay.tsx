import { useState } from 'react'
import { IPS } from '../data/ips'
import IpPortrait from './IpPortrait'

// F6 新手引导（幼年老皮亲导，PRD 文案，可跳过）
const STEPS = [
  '哟，新来的？我是老皮，这条街以后归我罩——目前是半个街区。',
  '这个盒子里，装着整条街的住户。每收录一个，街区就找回一个家人。',
  '第一发算我的。开。', // 引导首抽必得 000（由 boxReducer 首抽逻辑保证）
  '看，墙上有光了。这是花名册，空格子是还没回家的住户。',
  '明天再来，补给我给你留门；多带个兄弟来，多一发。这个宇宙，慢慢拼，我守着。',
]

export default function GuideOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const lilPi = IPS[0]
  const last = step === STEPS.length - 1

  return (
    <div className="guide" role="dialog" aria-label="新手引导">
      <div className="guide__panel">
        <div className="guide__avatar">
          <IpPortrait ip={lilPi} tag="LIL PI" />
        </div>
        <p className="guide__text">{STEPS[step]}</p>
        <p className="guide__step">老皮 · {step + 1} / {STEPS.length}</p>
        <div className="guide__actions">
          <button className="btn btn--ghost" onClick={onDone}>跳过</button>
          <button className="btn btn--gold" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? '开始开盒' : '下一句'}
          </button>
        </div>
      </div>
    </div>
  )
}
