import { useState } from 'react'
import IpPortrait from '../components/IpPortrait'
import MysteryBox from '../components/MysteryBox'
import { IPS, RARITY_META } from '../data/ips'
import type { OfferDto } from '../lib/apiClient'
import type { Rarity } from '../logic/types'

// 开盒台（就是故事末帧这一屏）：直接摊 6 个**封着、看不见内容**的盒子。
// 每个盒子只公开一个「系列」，玩家自己赌哪一只是心头好 —— 不是明牌。
// - 悬停盒子（手机上点系列名）→ 预览这个系列里可能出现谁，但永远不知道是哪一只
// - 挑一只 → 播开盒演出 → 揭晓
// - 拆过的盒子留在原位：掀盖 + 亮出真身 + 盖「已拆」戳，不可再点
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
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)

  const boxes = offer?.boxes ?? []
  const openedCount = boxes.filter((b) => b.opened).length
  const noDraw = drawsLeft <= 0
  const canReroll = !!offer && openedCount === 0 && offer.rerollsLeft > 0 && !noDraw && !locked

  // 预览条跟着「悬停 / 钉住」走；没选中时给一句提示，高度固定不跳动
  const peekIdx = pinned ?? hover
  const peekRarity: Rarity | null = peekIdx !== null ? boxes[peekIdx]?.rarity ?? null : null
  const peekPool = peekRarity
    ? IPS.filter((p) => p.rarity === peekRarity && p.status === 'ready')
    : []
  const peekOpened = peekIdx !== null ? boxes[peekIdx]?.opened : false

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
        <h1 className="table__title">故事在你手里，赌一只带走。</h1>
        <p className="table__sub">
          {locked
            ? '六个盒子已经封好 · 登录后就能挑一只拆'
            : noDraw
              ? '今日补给已用完 · 分享 +1 发，或明天再来'
              : loading || !offer
                ? '正在封箱…'
                : offer.firstDrawOnly
                  ? '第一只 · 随便挑一个，里面都是老皮（新手必得）'
                  : '只看得到系列，看不到是谁 · 挑一个，赌中了就是你的'}
        </p>

        <div className="table__grid" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: 6 }).map((_, i) => {
            const box = boxes[i]
            const rarity = box?.rarity
            const opened = box?.opened ?? false
            const ip = opened && box?.ipId ? IPS.find((p) => p.id === box.ipId) : null
            const dim = !box || locked || noDraw
            const cls = [
              'table__cell',
              opened ? 'is-opened' : '',
              dim && !opened ? 'is-dim' : '',
              peekIdx === i ? 'is-peek' : '',
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
                aria-label={opened ? '已拆开的盒子' : `第 ${i + 1} 个盒子`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
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
                  <>
                    <IpPortrait ip={ip} />
                    <span className="table__stamp">已拆 ✦</span>
                  </>
                ) : (
                  <>
                    <span className="table__lid" aria-hidden="true">
                      <i>封着</i>
                    </span>
                    <span className="table__box" aria-hidden="true">
                      <MysteryBox />
                    </span>
                  </>
                )}

                {/* 系列：唯一公开的线索。手机上点它看这一系列可能出谁（点盒子=直接拆） */}
                {rarity && (
                  <button
                    type="button"
                    className={`table__series table__series--${rarity}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPinned((cur) => (cur === i ? null : i))
                    }}
                    onMouseEnter={() => setHover(i)}
                  >
                    {RARITY_META[rarity].label}
                    <em>{RARITY_META[rarity].en}</em>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* 系列预览条：固定高度，悬停/钉住时换成这一系列的可能名单 */}
        <div className={`peek${peekRarity ? ' is-on' : ''}`}>
          {peekRarity ? (
            <>
              <p className="peek__title">
                {RARITY_META[peekRarity].label} <em>{RARITY_META[peekRarity].en}</em>
                <span>
                  {peekOpened
                    ? '这一盒拆出来是 ↓'
                    : `可能出这 ${peekPool.length} 只 · 但不知道是哪一只`}
                </span>
              </p>
              <div className="peek__row">
                {peekPool.map((p) => (
                  <figure key={p.id} className="peek__item">
                    <span className="peek__thumb">
                      <IpPortrait ip={p} tag={RARITY_META[p.rarity].label} />
                    </span>
                    <figcaption>
                      {p.name}
                      <i>№{p.id}</i>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          ) : (
            <p className="peek__hint">
              <span>悬停盒子</span>（手机上点盒子的系列名）看看系列里可能藏着谁
            </p>
          )}
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
              title={canReroll ? '整批换成另外 6 个盒子，每天 2 次' : undefined}
            >
              {rerolling ? '换一批中…' : rerollLabel}
            </button>
          )}
          <button className="btn btn--dim" onClick={onReplay}>‹ 再看一遍故事</button>
        </div>
        <p className="table__draws">
          今日补给 {Math.max(0, drawsLeft)} 发 · 每发从这 6 个盒子里赌 1 个
        </p>
      </div>
    </div>
  )
}
