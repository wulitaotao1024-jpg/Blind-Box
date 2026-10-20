import MysteryBox from '../components/MysteryBox'
import { END_CARD_LINE } from '../data/subtitles'

// 末帧 EndCard：盒子「咔哒」落下，盒子本身就是开盒按钮（PRD 6.3 原则4）
export default function EndCard({
  drawsLeft,
  onOpen,
  onReplay,
}: {
  drawsLeft: number
  onOpen: () => void
  onReplay: () => void
}) {
  return (
    <div className="endcard">
      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>
      <div className="endcard__drop">
        <button onClick={onOpen} aria-label="开盒">
          <MysteryBox className="endcard__box" />
        </button>
      </div>
      <p className="endcard__line">{END_CARD_LINE}</p>
      <div className="endcard__actions">
        <button className="btn btn--gold" onClick={onOpen}>开 盒</button>
        <span className="endcard__draws">
          {drawsLeft > 0 ? `今日补给 ${drawsLeft} 发可用` : '今日补给已用完 · 分享或明天再来'}
        </span>
        <button className="btn btn--dim" onClick={onReplay}>‹ 再看一遍故事</button>
      </div>
    </div>
  )
}
