import MagicDoor from '../components/MagicDoor'
import { FOOTER_LINE, HOME_TITLE } from '../data/subtitles'

// P1 首页氛围屏：标题（两行）+ 皮克斯风魔法之门（门即「推开盒隙」的开启按钮）
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
      </div>

      <div className="landing__door-zone">
        <MagicDoor onOpen={onStart} />
        <span className="landing__footer">{FOOTER_LINE}</span>
      </div>
    </div>
  )
}
