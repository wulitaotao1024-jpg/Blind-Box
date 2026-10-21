import IpPortrait from '../components/IpPortrait'
import RarityBadge from '../components/RarityBadge'
import { IPS } from '../data/ips'
import type { OfferDto } from '../lib/apiClient'

// 明牌六选一：一次摊 6 只「看得见是谁」的盒子，玩家自己挑一只拆。
// - 不满意 → 换一批（每天 2 次；一旦拆过，这一批就锁死，不能整批换掉）
// - 拆过的那只保持「盒子已打开」的样子，灰掉、盖戳、不可再点（回来看得见自己拆过哪只）
// - 首抽：只有引导款 №000 可拆，其余五只锁住并写明原因（保住 F6 首抽必得）
export default function Offer({
  offer,
  drawsLeft,
  rerolling,
  onPick,
  onReroll,
  onBack,
}: {
  offer: OfferDto
  drawsLeft: number
  rerolling?: boolean
  onPick: (ipId: string) => void
  onReroll: () => void
  onBack: () => void
}) {
  const opened = new Set(offer.opened)
  const noDraw = drawsLeft <= 0

  // 换一批：没拆过 + 还有额度才能换
  const rerollLabel = opened.size
    ? '已拆过 · 这一批不能换'
    : offer.rerollsLeft > 0
      ? `换一批（剩 ${offer.rerollsLeft} 次）`
      : '换一批次数已用完'
  const canReroll = opened.size === 0 && offer.rerollsLeft > 0 && !noDraw

  return (
    <div className="offer">
      <header className="brand brand--corner">
        <span className="brand__zh">盒隙</span>
        <span className="brand__en">BLINDGAP</span>
      </header>

      <div className="offer__inner">
        <h1 className="offer__title">这一批 · 六只明牌</h1>
        <p className="offer__sub">
          {noDraw
            ? '今日补给已用完 · 分享 +1 发或明天再来'
            : offer.firstDrawOnly
              ? '第一只先领走老皮（新手必得）· 其余五只下一发再挑'
              : '里面是谁都摊给你看了 · 挑一只带走'}
        </p>

        <div className="offer__grid">
          {offer.ids.map((id) => {
            const ip = IPS.find((p) => p.id === id)
            if (!ip) return null
            const isOpened = opened.has(id)
            const lockedByFirst = offer.firstDrawOnly && ip.rarity !== 'guide'
            const disabled = isOpened || lockedByFirst || noDraw
            const cls = [
              'offer__card',
              isOpened ? 'is-opened' : '',
              lockedByFirst ? 'is-locked' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={id}
                className={cls}
                onClick={() => onPick(id)}
                disabled={disabled}
                title={
                  isOpened
                    ? `${ip.name} · 已经拆过了`
                    : lockedByFirst
                      ? '首抽先领走老皮，下一发就能自由挑'
                      : noDraw
                        ? '今日补给已用完'
                        : `拆 ${ip.name}`
                }
                aria-label={`${ip.name} №${ip.id}${isOpened ? '（已拆）' : ''}`}
              >
                {/* 盒盖：未拆时压在顶边，拆过之后掀开 —— 一眼看出哪只已经开过 */}
                <span className="offer__lid" aria-hidden="true">
                  <i className="offer__lid-txt">{isOpened ? '已拆' : '未拆'}</i>
                </span>
                <IpPortrait ip={ip} />
                <span className="offer__badge">
                  <RarityBadge rarity={ip.rarity} />
                </span>
                <span className="offer__info">
                  <span className="offer__name">{ip.name}</span>
                  <span className="offer__no">№{ip.id}</span>
                </span>
                {isOpened && <span className="offer__stamp">已拆 ✦</span>}
              </button>
            )
          })}
        </div>

        <div className="offer__actions">
          <button className="btn btn--dim" onClick={onBack}>
            ‹ 返回
          </button>
          <button
            className="btn btn--ghost"
            onClick={onReroll}
            disabled={!canReroll || rerolling}
            title={canReroll ? '整批换成另外 6 只，每天 2 次' : undefined}
          >
            {rerolling ? '换一批中…' : rerollLabel}
          </button>
        </div>
        <p className="offer__draws">
          今日补给 {Math.max(0, drawsLeft)} 发 · 每发从这 6 只里挑 1 只
        </p>
      </div>
    </div>
  )
}
