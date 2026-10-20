import MagicDoor from '../components/MagicDoor'
import { HOME_TITLE } from '../data/subtitles'

// 逐字坠落入场（参考视频特效）：每个字带伪随机角度从上方翻滚落下、落定轻微回弹，
// 按 index 依次延迟，形成从左到右的波浪；\n 分行渲染。
function CascadeTitle({ text }: { text: string }) {
  let i = 0
  return (
    <span aria-hidden="true">
      {text.split('\n').map((line, li) => (
        <span key={li} className="landing__title-line">
          {[...line].map((ch, ci) => {
            const idx = i++
            const rot = ((idx * 47) % 23) - 11 // -11° ~ +11°，确定性伪随机
            return (
              <span
                key={ci}
                className="char"
                style={{ ['--i' as string]: idx, ['--rot' as string]: `${rot}deg` }}
              >
                {ch}
              </span>
            )
          })}
        </span>
      ))}
    </span>
  )
}

// 门上/场景里的闪烁小星星：确定性伪随机散布（大小/位置/闪烁节奏各异），纯装饰不挡点击
// y 分布要求：沿 12%~68% 均匀铺开，让紫色夜空区（上部）也有约 5-6 颗，中下部不再挤成一坨
function LandingStars({ count = 16 }: { count?: number }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    x: 6 + ((i * 149) % 88), // 6% ~ 94%（149 与 88 互质；紫区星星左右各半，不偏一侧）
    y: 12 + ((i * 53) % 58), // 12% ~ 68%，步长 53 与 58 互质 → 16 颗几乎不重复
    size: 8 + ((i * 29) % 9), // 8 ~ 16px
    delay: ((i * 41) % 22) / 10, // 0 ~ 2.1s 交错
    dur: 1.9 + ((i * 17) % 12) / 10, // 1.9 ~ 3.0s
  }))
  return (
    <div className="landing__stars" aria-hidden="true">
      {stars.map((s, i) => (
        <span
          key={i}
          className="landing__star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            fontSize: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  )
}

// P1 首页：整屏魔法之门即背景，文字悬浮其上；无滚动，logo 固定左上角
export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <MagicDoor onOpen={onStart} />

      <LandingStars />

      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>

      <div className="landing__head">
        <h1 className="landing__title" aria-label={HOME_TITLE}>
          <CascadeTitle text={HOME_TITLE} />
        </h1>
        {/* 三段式副标题：左「第六大道」/ 中「·」/ 右「IP 收藏宇宙」。
            中点用 grid 钉在正中=门缝位置，门缝只过小圆点、不过 IP（见 .landing__sub CSS） */}
        <p className="landing__sub">
          <span className="landing__sub-l">第六大道</span>
          <span className="landing__sub-m">·</span>
          <span className="landing__sub-r">IP 收藏宇宙</span>
        </p>
      </div>
    </div>
  )
}
