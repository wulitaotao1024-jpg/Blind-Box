import { useCallback, useEffect, useRef, useState } from 'react'

// F9 听故事：播放预渲染配音（edge-tts 微软神经语音）
// 唯一声线 = zh-CN-YunjianNeural 低沉浑厚解说（纪录片感，缓慢从容），为默认且唯一声音。
// 预渲染 mp3 由 tools/gen_audio.py 生成，音质远胜浏览器内置 speechSynthesis，
// 且各端（网页/桌宠/移动端）听感一致。无音频文件时由调用方回退到 useNarrator。
export interface StoryPlayer {
  supported: boolean // 是否有可播放的预渲染音频
  playing: boolean
  paused: boolean
  progress: number // 0~1
  timeLabel: string // '00:23 / 01:05'
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function useStoryPlayer(src?: { deep?: string }): StoryPlayer {
  const deepSrc = src?.deep
  const supported = Boolean(deepSrc)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [timeLabel, setTimeLabel] = useState('')

  const detach = useCallback(() => {
    const a = audioRef.current
    if (a) {
      a.onended = null
      a.ontimeupdate = null
      a.onerror = null
      a.onplay = null
      a.onpause = null
      a.pause()
    }
  }, [])

  const stop = useCallback(() => {
    detach()
    audioRef.current = null
    setPlaying(false)
    setPaused(false)
    setProgress(0)
    setTimeLabel('')
  }, [detach])

  // 组件卸载/切换卡片时自动停止，避免朗读串角
  useEffect(() => stop, [stop])

  const playVoice = useCallback(() => {
    if (!deepSrc) return
    detach()
    const a = new Audio(deepSrc)
    audioRef.current = a
    a.onended = () => {
      setPlaying(false)
      setPaused(false)
      setProgress(0)
      setTimeLabel('')
    }
    a.ontimeupdate = () => {
      setProgress(a.duration ? a.currentTime / a.duration : 0)
      setTimeLabel(`${fmt(a.currentTime)} / ${fmt(a.duration)}`)
    }
    a.onerror = () => {
      setPlaying(false)
      setPaused(false)
      setTimeLabel('音频加载失败')
    }
    a.play()
      .then(() => {
        setPlaying(true)
        setPaused(false)
      })
      .catch(() => {
        setPlaying(false)
      })
  }, [deepSrc, detach])

  const play = useCallback(() => playVoice(), [playVoice])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    const a = audioRef.current
    if (!a) {
      playVoice()
      return
    }
    a.play()
      .then(() => setPaused(false))
      .catch(() => setPlaying(false))
  }, [audioRef, playVoice])

  return {
    supported,
    playing,
    paused,
    progress,
    timeLabel,
    play,
    pause,
    resume,
    stop,
  }
}
