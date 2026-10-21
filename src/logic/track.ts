// 埋点 stub（PRD 第十章事件表）：MVP 打点先入内存队列 + console，
// 接入真实上报（如神策/GA）时替换 report 函数即可，事件名与参数保持不变。
export type TrackEvent =
  | 'door_open'
  | 'video_start'
  | 'video_complete'
  | 'video_skip'
  | 'open_box'
  | 'box_result'
  | 'share_click'
  | 'share_callback'
  | 'collection_view'
  | 'collection_all_open'
  | 'ip_3d_open'
  | 'ip_3d_rotate'
  | 'ip_3d_zoom'

export interface TrackPayload {
  [key: string]: string | number | boolean | undefined
}

const queue: Array<{ event: TrackEvent; params: TrackPayload; ts: number }> = []

export function getTrackQueue() {
  return queue
}

export function track(event: TrackEvent, params: TrackPayload = {}): void {
  queue.push({ event, params, ts: Date.now() })
  // 上报 stub：开发期可见
  console.info(`[track] ${event}`, params)
}
