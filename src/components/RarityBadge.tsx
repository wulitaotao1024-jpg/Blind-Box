import { RARITY_META } from '../data/ips'
import type { IpDef } from '../logic/types'

export default function RarityBadge({ rarity, num }: { rarity: IpDef['rarity']; num?: string }) {
  const meta = RARITY_META[rarity]
  return (
    <span className={`badge badge--${rarity}`}>
      {meta.label}
      <span className="badge__en">{meta.en}</span>
      {num && <span className="badge__num">№{num}</span>}
    </span>
  )
}
