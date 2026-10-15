import { createElement, useEffect, useRef, useState } from 'react'
import { track } from '../logic/track'
import type { IpDef } from '../logic/types'
import IpPortrait from './IpPortrait'

// model-viewer 按需注册（Web Component，基于 three.js）——只在打开查看器时加载
let libPromise: Promise<unknown> | null = null
function ensureModelViewer(): Promise<unknown> {
  if (!libPromise) libPromise = import('@google/model-viewer')
  return libPromise
}

/**
 * F8 3D 鉴赏查看器（PRD V1.1）：
 * - 资产契约：/ip/{id}.glb 存在即启用 model-viewer（拖动旋转/滚轮与双指缩放/自动旋转）
 * - .glb 缺失或加载失败 → 降级为高清立绘 + 提示（图生 3D 占位流程就绪后即替换）
 * - 埋点：ip_3d_open / ip_3d_rotate / ip_3d_zoom
 */
export default function ModelViewer3D({ ip, onClose }: { ip: IpDef; onClose: () => void }) {
  const [glbOk, setGlbOk] = useState<boolean | null>(null) // null=检测中
  const [libReady, setLibReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const rotTracked = useRef(false)
  const zoomTracked = useRef(false)
  const mvRef = useRef<HTMLElement | null>(null)

  // 探测 .glb 是否存在 + 按需加载库
  useEffect(() => {
    track('ip_3d_open', { ip: ip.id, entry: 'viewer' })
    let alive = true
    ensureModelViewer()
      .then(() => alive && setLibReady(true))
      .catch(() => alive && setFailed(true))
    fetch(`/ip/${ip.id}.glb`, { method: 'HEAD' })
      .then((r) => alive && setGlbOk(r.ok))
      .catch(() => alive && setGlbOk(false))
    return () => {
      alive = false
    }
  }, [ip.id])

  // 事件绑定：camera-change → rotate；wheel/touch → zoom（首次触发即打点）
  useEffect(() => {
    const mv = mvRef.current
    if (!mv || !glbOk || !libReady) return
    const onCamera = () => {
      if (!rotTracked.current) {
        rotTracked.current = true
        track('ip_3d_rotate', { ip: ip.id })
      }
    }
    const onZoomish = () => {
      if (!zoomTracked.current) {
        zoomTracked.current = true
        track('ip_3d_zoom', { ip: ip.id })
      }
    }
    const onErr = () => setFailed(true)
    mv.addEventListener('camera-change', onCamera)
    mv.addEventListener('error', onErr)
    mv.addEventListener('wheel', onZoomish, { passive: true })
    mv.addEventListener('touchmove', onZoomish, { passive: true })
    return () => {
      mv.removeEventListener('camera-change', onCamera)
      mv.removeEventListener('error', onErr)
      mv.removeEventListener('wheel', onZoomish)
      mv.removeEventListener('touchmove', onZoomish)
    }
  }, [glbOk, libReady, ip.id])

  const useModel = glbOk === true && libReady && !failed

  return (
    <div className="viewer" role="dialog" aria-label={`${ip.name} 3D 鉴赏`}>
      <div className="viewer__head">
        <span className="viewer__title">
          {ip.name} · 3D 鉴赏
        </span>
        <button className="viewer__close" onClick={onClose}>关闭 ✕</button>
      </div>

      <div className="viewer__canvas">
        {useModel ? (
          createElement('model-viewer', {
            ref: (el: HTMLElement | null) => { mvRef.current = el },
            src: `/ip/${ip.id}.glb`,
            alt: ip.name,
            'camera-controls': true,
            'auto-rotate': true,
            'rotation-per-second': '18deg',
            'shadow-intensity': '1',
            exposure: '1.05',
          })
        ) : (
          <div className="viewer__fallback">
            <IpPortrait ip={ip} tag="3D 模型待补充" />
          </div>
        )}
      </div>

      <p className="viewer__tip">
        {useModel
          ? '拖动旋转 · 滚轮/双指缩放 · 双击复位'
          : '3D 模型（.glb）待补充 —— 立绘先行展示；模型到位后此处自动启用旋转与放大'}
      </p>
    </div>
  )
}
