import { LORE } from '../data/lore'
import { buildNarrationText } from '../logic/narration'
import { useNarrator } from '../hooks/useNarrator'
import { useStoryPlayer } from '../hooks/useStoryPlayer'
import type { IpDef } from '../logic/types'

// F9 山海经手札：出处 + 原文 + 白话故事 + 听故事
// 音频优先播放预渲染配音（edge-tts 神经语音·低沉解说，默认且唯一声线），
// 无预渲染文件时回退浏览器 speechSynthesis（useNarrator）
export default function LorePanel({ ip }: { ip: IpDef }) {
  const lore = ip.lore ?? LORE[ip.id]
  const player = useStoryPlayer({ deep: lore?.audio })
  const narrator = useNarrator()

  if (!lore) return null

  const text = buildNarrationText(ip.name, lore)

  return (
    <section className="lore" aria-label="山海经手札">
      <div className="lore__head">
        <p className="lore__label">山海经手札</p>
        <span className="lore__source">{lore.source}</span>
      </div>

      <blockquote className="lore__quote">{lore.quote}</blockquote>
      <p className="lore__story">{lore.story}</p>

      {lore.sourceNote && <p className="lore__note">考据备注：{lore.sourceNote}</p>}

      {player.supported ? (
        <div className="lore__audio">
          {player.playing && !player.paused ? (
            <button className="btn btn--ghost lore__btn" onClick={player.pause}>
              暂停
            </button>
          ) : player.playing && player.paused ? (
            <button className="btn btn--ghost lore__btn" onClick={player.resume}>
              继续
            </button>
          ) : (
            <button className="btn btn--gold lore__btn" onClick={player.play}>
              听故事
            </button>
          )}
          {player.playing && (
            <button className="btn btn--ghost lore__btn" onClick={player.stop}>
              停止
            </button>
          )}
          <span className="lore__audio-hint">
            {player.playing ? player.timeLabel || '播放中…' : '点击听这段山海经故事'}
          </span>
          {player.playing && (
            <div className="lore__progress" role="progressbar" aria-valuenow={Math.round(player.progress * 100)}>
              <i style={{ width: `${Math.round(player.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ) : narrator.supported ? (
        <div className="lore__audio">
          {narrator.speaking && !narrator.paused ? (
            <button className="btn btn--ghost lore__btn" onClick={narrator.pause}>
              暂停
            </button>
          ) : narrator.speaking && narrator.paused ? (
            <button className="btn btn--ghost lore__btn" onClick={narrator.resume}>
              继续
            </button>
          ) : (
            <button
              className="btn btn--gold lore__btn"
              onClick={() => narrator.speak(text, { rate: 0.92, pitch: 0.9 })}
            >
              听故事
            </button>
          )}
          {narrator.speaking && (
            <button className="btn btn--ghost lore__btn" onClick={narrator.stop}>
              停止
            </button>
          )}
          <span className="lore__audio-hint">
            {narrator.speaking ? '朗读中…' : '点击听主理人讲这段故事'}
          </span>
        </div>
      ) : (
        <p className="lore__audio-hint">当前浏览器不支持语音朗读</p>
      )}
    </section>
  )
}
