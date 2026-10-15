import { useEffect, useRef, useState } from 'react'
import { track } from '../logic/track'
import MysteryBox from '../components/MysteryBox'

/**
 * P1 故事屏：21s《暗潮》无缝融入页面（PRD 6.3）。
 * - 全屏 object-fit:cover，无任何播放器 UI，不加任何字幕（视频原片即最终）
 * - 右上角跳过（3s 后淡入）；弱网/自动播放被拦截时兜底直出开盒
 */
export default function Story({ onEnd }: { onEnd: (skipped: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showSkip, setShowSkip] = useState(false)
  const [mutedHint, setMutedHint] = useState(false)
  const [failed, setFailed] = useState(false)
  const endedRef = useRef(false)

  useEffect(() => {
    track('video_start', {})
    const t = setTimeout(() => setShowSkip(true), 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // 用户点击「点亮开启」后进入本屏，处于用户手势链路内，直接开声播放
    video.muted = false
    video.play().catch(() => {
      // 自动播放策略兜底：静音起播 + 提示轻触开声
      video.muted = true
      setMutedHint(true)
      video.play().catch(() => setFailed(true))
    })
  }, [])

  const finish = (skipped: boolean) => {
    if (endedRef.current) return
    endedRef.current = true
    track(skipped ? 'video_skip' : 'video_complete', {})
    onEnd(skipped)
  }

  if (failed) {
    // 弱网兜底：静态封面 + 开盒按钮直出，流程不中断
    return (
      <div className="story">
        <div className="story__fallback">
          <MysteryBox hint="故事加载失败" />
          <p className="story__fallback-title">暗潮 · 21s</p>
          <button className="btn btn--gold" onClick={() => finish(true)}>直接开盒</button>
        </div>
      </div>
    )
  }

  return (
    <div className="story">
      <video
        ref={videoRef}
        className="story__video"
        src="/assets/anchao.mp4"
        playsInline
        preload="auto"
        onEnded={() => finish(false)}
        onError={() => setFailed(true)}
      />
      {showSkip && (
        <button className="story__skip" onClick={() => finish(true)}>跳过 ›</button>
      )}
      {mutedHint && (
        <button
          className="story__unmute"
          onClick={() => {
            const v = videoRef.current
            if (v) {
              v.muted = false
              v.play().catch(() => undefined)
              setMutedHint(false)
            }
          }}
        >
          🔇 轻触开启声音
        </button>
      )}
    </div>
  )
}
