import MagicDoor from '../components/MagicDoor'
import { HOME_TITLE } from '../data/subtitles'

// P1 首页：整屏魔法之门即背景，文字悬浮其上；无滚动，logo 固定左上角
export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <MagicDoor onOpen={onStart} />

      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>

      <div className="landing__head">
        <h1 className="landing__title">{HOME_TITLE}</h1>
        <p className="landing__sub">第六大道 · IP 收藏宇宙</p>
      </div>
    </div>
  )
}
