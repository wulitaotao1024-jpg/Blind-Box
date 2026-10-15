// 21s《暗潮》场景字幕时间轴（PRD 三幕分镜文案）。
// 说明：字幕是 DOM 覆盖层（字幕即场景，非播放器字幕条），
// 时间点为建议值——视频后续优化版交付后，只需改这里的秒数即可重新卡点。
export interface SubtitleCue {
  t: number // 出现时刻（秒）
  text: string
}

export const SUBTITLES: SubtitleCue[] = [
  { t: 0.5, text: '故事，从一只猫开始' },
  { t: 3.5, text: '阿涛、小吴，和他们的猫——老皮' },
  { t: 6.5, text: '直到皮家族的人，找上门来' },
  { t: 9.5, text: '他们说，老皮是皮家遗失的太子' },
  { t: 12, text: '他被带走了' },
  { t: 14.5, text: '海外、庄园、爷爷的故事……' },
  { t: 17, text: '归来时，他已站在对面' },
  { t: 18.5, text: '直到那声铃响，叫醒了他' },
  { t: 20, text: '这一次，他选择守护' },
]

export const END_CARD_LINE = '他的故事在你手里，开盒继续。'
export const HOME_TITLE = '进来，拼我的宇宙'
export const FOOTER_LINE = '这宇宙，第一批只给懂的人。'
