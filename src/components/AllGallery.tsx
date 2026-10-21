import { useEffect } from 'react'
import IpPortrait from './IpPortrait'
import { IPS } from '../data/ips'
import { progress } from '../logic/collection'

/**
 * 全部图鉴（总览弹窗）：一整季 21 只摊开看，只看图、点不开详情。
 * 已收录 / 未收录都给到完整立绘（本弹窗只做「看全季」），差别只在角标与描边：
 * 已收录描金边，未收录挂「未收录」小签 —— 图能全看，详情进不去。
 */
export default function AllGallery({
  collected,
  onClose,
}: {
  collected: ReadonlySet<string>
  onClose: () => void
}) {
  const p = progress(collected, IPS)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="gallery"
      role="dialog"
      aria-modal="true"
      aria-label="全部图鉴"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="gallery__panel">
        <header className="gallery__head">
          <div className="gallery__titles">
            <h2 className="gallery__title">全部图鉴</h2>
            <p className="gallery__sub">
              第六大道 · 全季 {p.total} 位 ｜ 已点亮 {p.collected} 位
            </p>
          </div>
          <button className="gallery__close" onClick={onClose} aria-label="关闭全部图鉴">
            ✕
          </button>
        </header>

        <div className="gallery__grid">
          {IPS.map((ip) => {
            const owned = collected.has(ip.id)
            return (
              <figure
                key={ip.id}
                className={`gallery__cell${owned ? ' gallery__cell--owned' : ' gallery__cell--locked'}`}
                aria-label={owned ? `${ip.name} 已收录` : `${ip.name} 未收录`}
              >
                <IpPortrait ip={ip} tag={owned ? undefined : '未收录'} />
                {owned && <span className="gallery__hit">已点亮</span>}
                <figcaption className="gallery__num">№{ip.id}</figcaption>
              </figure>
            )
          })}
        </div>

        <p className="gallery__foot">只看图 · 想看详情回墙上点已点亮的那只</p>
      </div>
    </div>
  )
}
