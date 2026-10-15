import MysteryBox from '../components/MysteryBox'
import { FOOTER_LINE, HOME_TITLE } from '../data/subtitles'

// P1 首页氛围屏：标题 + 会呼吸的盒子（盒子即「开启」按钮，是场景的一部分）
export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <header className="brand">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>

      <div>
        <h1 className="landing__title">{HOME_TITLE}</h1>
        <p className="landing__sub">第六大道 · IP 收藏宇宙</p>
        <p className="landing__street">故事先行 ｜ 收集即守护 ｜ 每日补给</p>
      </div>

      <div className="landing__box-zone">
        <button onClick={onStart} aria-label="点亮盒子，进入故事">
          <MysteryBox className="landing__box" hint="点亮开启" />
        </button>
        <span className="landing__footer">{FOOTER_LINE}</span>
      </div>
    </div>
  )
}
