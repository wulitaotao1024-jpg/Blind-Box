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

// 兜底声线挑选（仅在没有预渲染配音时使用）：
// 优先「浑厚男声」——微软在线语音（Yunxi/Yunjian/Yunyang/Yunfeng/Yunye/Kangkang）
// 或系统里名字带 male/男的声线，让兜底 TTS 也尽量接近纪录片解说感；
// 找不到再按普通话 → 任意中文兜底
const DEEP_MALE = /yunxi|yunjian|yunyang|yunfeng|yunye|kangkang|male|男|低沉|浑厚/i

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const zh = voices.filter((v) => /^zh/i.test(v.lang))
  return (
    zh.find((v) => DEEP_MALE.test(v.name)) ??
    zh.find((v) => /zh[-_]CN/i.test(v.lang)) ??
    zh[0] ??
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
