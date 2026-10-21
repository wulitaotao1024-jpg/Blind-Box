// 分享文案（复制链接用）：图鉴墙「复制链接 +1发」按钮统一取这里，改文案只改这一处。
// 目标场景：微信/QQ 里粘贴到聊天窗口即可——所以文案自带标题、卖点和链接，不依赖任何平台 SDK。

export const SHARE_TITLE = '盒隙 BLINDGAP ｜ 第六大道的 IP 收藏宇宙'

/**
 * 组装一段可直接粘贴的分享文案。
 * 三行结构：钩子（街区）→ 卖点（名字即归属 / 云端寄存）→ 链接。
 */
export function buildShareText(url: string): string {
  return [
    '推开门，抽一只住进你的街区。',
    '盒隙 BLINDGAP ｜ 名字即归属，抽到的每一只都云端寄存，换设备也不丢。',
    `来拼我的同款宇宙 👉 ${url}`,
  ].join('\n')
}
