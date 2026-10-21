import IpPortrait from '../components/IpPortrait'
import MysteryBox from '../components/MysteryBox'
import { IPS } from '../data/ips'
import type { OfferDto } from '../lib/apiClient'

// 开盒台（就是故事末帧这一屏）：直接摊 8 个**封着、看不见内容**的盒子。
// 盒子不贴任何系列标签 —— 玩家看不到里面是谁、属于哪个档位，纯凭手气赌一只。
// - 挑一只 → 播开盒演出 → 揭晓
// - 拆过的盒子留在原位：露出真身（立绘）+ 斜倚的盒盖，一眼看出「这个被拆开了」，不可再点
// - 不满意 → 换一批（每天 2 次；一旦拆过，这一批锁死）
export default function EndCard({
  offer,
  loading,
  drawsLeft,
  locked,
  rerolling,
  onPick,
  onReroll,
  onReplay,
  onWall,
}: {
  offer: OfferDto | null
  loading?: boolean
  drawsLeft: number
  locked?: boolean
  rerolling?: boolean
  onPick: (index: number) => void
  onReroll: () => void
  onReplay: () => void
  onWall: () => void
}) {
  const boxes = offer?.boxes ?? []
  const openedCount = boxes.filter((b) => b.opened).length
  const noDraw = drawsLeft <= 0
  const canReroll = !!offer && openedCount === 0 && offer.rerollsLeft > 0 && !noDraw && !locked

  const rerollLabel = openedCount
    ? '已拆过 · 这一批不能换'
    : offer && offer.rerollsLeft > 0
      ? `换一批（剩 ${offer.rerollsLeft} 次）`
      : '换一批次数已用完'

  const primaryLabel = locked ? '登录后开盒 ›' : noDraw ? '进入我的图鉴墙 ›' : null

  return (
    <div className="table">
      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>

      <div className="table__inner">
        <h1 className="table__title">故事在你手里，挑一只带走。</h1>
        <p className="table__sub">
          {locked
            ? '8 个盒子已经封好 · 登录后就能挑一只拆'
            : noDraw
              ? '今日补给已用完 · 分享 +1 发，或明天再来'
              : loading || !offer
                ? '正在封箱…'
                : '只看得到盒子，看不到里面 · 挑一个，赌中了就是你的'}
        </p>

        <div className="table__grid">
          {Array.from({ length: 8 }).map((_, i) => {
            const box = boxes[i]
            const opened = box?.opened ?? false
            const ip = opened && box?.ipId ? IPS.find((p) => p.id === box.ipId) : null
            const dim = !box || locked || noDraw
            const cls = [
              'table__cell',
              opened ? 'is-opened' : '',
              dim && !opened ? 'is-dim' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={i}
                className={cls}
                role="button"
                tabIndex={opened || noDraw ? -1 : 0}
                aria-disabled={opened || dim}
                aria-label={opened ? `已拆开的盒子：${ip?.name ?? ''}` : `第 ${i + 1} 个盒子`}
                onClick={() => {
                  if (!box || opened || noDraw) return
                  onPick(i)
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  if (!box || opened || noDraw) return
                  onPick(i)
                }}
              >
                {opened && ip ? (
                  <div className="table__reveal">
                    <div className="table__reveal-box">
                      <span className="table__reveal-lid" aria-hidden="true" />
                      <div className="table__reveal-portrait">
                        <IpPortrait ip={ip} />
                      </div>
                    </div>
                    <span className="table__reveal-meta">
                      {ip.name}
                      <i>№{ip.id}</i>
                    </span>
                  </div>
                ) : (
                  <span className="table__box" aria-hidden="true">
                    <MysteryBox />
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="table__actions">
          {primaryLabel ? (
            <button className="btn btn--gold" onClick={() => (locked ? onPick(0) : onWall())}>
              {primaryLabel}
            </button>
          ) : (
            <button
              className="btn btn--ghost"
              onClick={onReroll}
              disabled={!canReroll || rerolling}
              title={canReroll ? '整批换成另外 8 个盒子，每天 2 次' : undefined}
            >
              {rerolling ? '换一批中…' : rerollLabel}
            </button>
          )}
          <button className="btn btn--dim" onClick={onReplay}>‹ 再看一遍故事</button>
        </div>
        <p className="table__draws">
          今日补给 {Math.max(0, drawsLeft)} 发 · 每发从这 8 个盒子里赌 1 个
        </p>
      </div>
    </div>
  )
}
