/**
 * 复制文本到剪贴板。
 * 站点目前跑在 http（IP:8080）下，navigator.clipboard 属于安全上下文 API，
 * 在非 https 环境直接不可用——因此必须保留 execCommand 兜底，否则点了「复制链接」其实什么都没复制。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 权限被拒或非安全上下文：落到下面的兜底 */
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-2000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length) // iOS 需要显式选区
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
