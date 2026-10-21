import { useEffect, useState } from 'react'
import IpPortrait from '../components/IpPortrait'
import LorePanel from '../components/LorePanel'
import RarityBadge from '../components/RarityBadge'
import { IPS } from '../data/ips'
import { FOOTER_LINE } from '../data/subtitles'
import { isComplete, progress } from '../logic/collection'
import { track } from '../logic/track'
import type { IpDef } from '../logic/types'

// P4 图鉴墙（我的盒隙墙）：图鉴墙 = 第六大道花名册（PRD F2）
export default function Wall({
  collected,
  drawsLeft,
  shareCopied,
  locked,
  onDraw,
  onShare,
  onReplay,
}: {
  collected: ReadonlySet<string>
  drawsLeft: number
  shareCopied: boolean
  locked?: boolean
  onDraw: () => void
  onShare: () => void
  onReplay: () => void
}) {
  const [detail, setDetail] = useState<IpDef | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const p = progress(collected, IPS)

  // 把已抽到角色推送到桌面宠（本地通道，仅开发/内网；生产走云端）
  const syncToPet = async () => {
    const ids = Array.from(collected)
    const ips = ids
      .map((id) => IPS.find((x) => x.id === id))
      .filter(Boolean)
      .map((ip) => ({ id: (ip as IpDef).id, name: (ip as IpDef).name, en: (ip as IpDef).en, rarity: (ip as IpDef).rarity, tagline: (ip as IpDef).tagline }))
    try {
      const res = await fetch('http://127.0.0.1:9876/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collected: ids, ips }),
      })
      const data = await res.json().catch(() => ({} as any))
      setSyncMsg(data?.ok ? `已推送 ${ids.length} 位到桌宠 ✓` : '推送失败')
    } catch {
      setSyncMsg('桌宠未运行，请先启动桌宠')
    }
    window.setTimeout(() => setSyncMsg(null), 2600)
  }
  const complete = isComplete(collected, IPS)
  const left = p.total - p.collected

  useEffect(() => {
    track('collection_view', { percent: Math.round((p.collected / p.total) * 100) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="wall">
      <div className="wall__inner">
        {/* 第一行：logo 独占一行、贴最左 */}
        <header className="wall__head">
          <span className="brand brand--pill">
            <span className="brand__zh">盒隙</span>
            <span className="brand__en">BLINDGAP</span>
          </span>
          {/* 第二行：标题在左，册名紧跟其后，进度靠右，同一行 */}
          <div className="wall__headline">
            <h1 className="wall__title">我的盒隙墙</h1>
            <p className="wall__street">第六大道 · 花名册</p>
            <div className="wall__progress">
              <p className="wall__progress-text">
                已点亮 <b>{p.collected}</b> / {p.total}
                {complete ? ' —— 街区全员归来！' : left > 0 ? `，还差 ${left} 个兄弟就能端盒。` : ''}
              </p>
              {complete && <span className="wall__complete">端盒达成 · 彩蛋入口</span>}
            </div>
          </div>
        </header>

        <div className="wall__grid">
          {IPS.map((ip) => {
            const owned = collected.has(ip.id)
            return owned ? (
              <button key={ip.id} className="cell cell--lit" onClick={() => setDetail(ip)}>
                <IpPortrait ip={ip} />
                <span className="cell__meta">
                  <span className="cell__name">{ip.name}</span>
                  <span className="cell__num">№{ip.id}</span>
                </span>
              </button>
            ) : (
              <div key={ip.id} className="cell cell--dark" aria-label="未收录">
                <span className="cell__q">？？？</span>
                <span className="cell__hint">{ip.status === 'pending' ? '入住筹备中' : '——据说很狠'}</span>
              </div>
            )
          })}
        </div>

        <div className="wall__next-wave">
          <span>神兽系列 · №009–020 · 12 位已上线</span>
          <span>集齐即端盒</span>
        </div>

        <div className="wall__actions">
          {locked && (
            <p className="wall__login-cta">登录后，你抽到的每一只都会云端保存、跨设备同步 ✦</p>
          )}
          <button
            className="btn btn--gold"
            onClick={onDraw}
            disabled={!locked && drawsLeft <= 0}
            title={!locked && drawsLeft <= 0 ? '今日补给已用完，分享 +1 发或明天再来' : undefined}
          >
            {locked ? '登录开盒' : drawsLeft > 0 ? `开 盒（${drawsLeft} 发）` : '今日已用完'}
          </button>
          <button className="btn btn--ghost" onClick={onShare} title="复制一段推广文案 + 站点链接，粘贴给朋友即可，同时补给 +1 发">
            {shareCopied ? '已复制 ✓' : '复制链接 +1发'}
          </button>
          <button className="btn btn--ghost" onClick={onReplay}>重看故事</button>
          <button className="btn btn--ghost" onClick={syncToPet} title="把已抽到角色推送到桌面宠">
            同步到桌宠
          </button>
        </div>

        {syncMsg && <p className="wall__sync-msg">{syncMsg}</p>}

        <p className="wall__odds">
          概率公示：路面款 55% ｜ 限定 33% ｜ 狠货 10% ｜ 幽灵款 2%<br />
          保底：小保底 10 抽必出限定+ ｜ 大保底 40 抽必出狠货+ ｜ 幽灵硬保底 90 抽<br />
          {FOOTER_LINE}
        </p>
      </div>

      {detail && (
        <div className="detail" role="dialog" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          {/* 复用揭晓屏的 reveal__card，保证与开盒揭晓卡完全同一张卡 */}
          <article className="reveal__card detail__card">
            <div className="reveal__top">
              <span className="reveal__num">№ {detail.id}</span>
              <RarityBadge rarity={detail.rarity} />
            </div>
            <div className="reveal__portrait">
              <IpPortrait ip={detail} />
            </div>
            <h2 className="reveal__name">
              {detail.name}
              <span className="reveal__en">{detail.en}</span>
            </h2>
            <p className="reveal__tagline">{detail.tagline}</p>
            <LorePanel ip={detail} />
            <div className="reveal__note">
              <p className="reveal__note-label">主理人手记</p>
              {detail.note}
            </div>
          </article>
          <div className="reveal__row detail__actions">
            <button className="btn btn--gold" onClick={() => setDetail(null)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
