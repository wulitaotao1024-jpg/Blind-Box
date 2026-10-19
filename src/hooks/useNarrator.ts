import { useCallback, useEffect, useRef, useState } from 'react'
import { speechSupported } from '../logic/narration'

// F9 听故事：Web Speech API 朗读（MVP 零成本方案）
// 正式版可整体替换为云端 TTS（预留 lore.audio 字段），组件层接口不变
export interface Narrator {
  supported: boolean
  speaking: boolean
  paused: boolean
  speak: (text: string, opts?: { rate?: number; pitch?: number }) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

// 优先挑中文女声/普通话声线，找不到则用系统默认
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  return (
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /female|婉|女/i.test(v.name)) ??
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    null
  )
}

export function useNarrator(): Narrator {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [supported] = useState(() => speechSupported())
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    utterRef.current = null
    setSpeaking(false)
    setPaused(false)
  }, [supported])

  // 组件卸载/切角时自动停止，避免朗读串角
  useEffect(() => stop, [stop])

  const speak = useCallback(
    (text: string, opts?: { rate?: number; pitch?: number }) => {
      if (!supported || !text.trim()) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.rate = opts?.rate ?? 1
      u.pitch = opts?.pitch ?? 1
      const v = pickVoice()
      if (v) u.voice = v
      u.onstart = () => {
        setSpeaking(true)
        setPaused(false)
      }
      u.onend = () => {
        setSpeaking(false)
        setPaused(false)
      }
      u.onerror = () => {
        setSpeaking(false)
        setPaused(false)
      }
      utterRef.current = u
      window.speechSynthesis.speak(u)
    },
    [supported],
  )

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setPaused(true)
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setPaused(false)
  }, [supported])

  return { supported, speaking, paused, speak, pause, resume, stop }
}
