import type { IpDef } from '../logic/types'

// IP 阵容数据源（PRD 8.1 图鉴编号总表 + 8.3 展示卡文案，已拍板）
// 素材契约：public/ip/{id}.png 立绘、public/ip/{id}.glb 3D 模型，放入即生效
export const IPS: IpDef[] = [
  {
    id: '000',
    num: 0,
    name: '老皮·幼年',
    en: 'LIL PI',
    rarity: 'guide',
    tagline: '蓝卫衣、风车和毛线球，是他的全部家当',
    note: '画他的时候，是这个系列开的第一笔。他是我捡回来的猫——所以第一件衣服必须是卫衣，得穿暖点。风车是阿涛送的，毛线球是小吴织的。你看，他早就被这个家养着了。',
    quote: '第一发给你看个宝贝——就是我。',
    status: 'ready',
  },
  {
    id: '001',
    num: 1,
    name: '阿涛',
    en: 'TAO',
    rarity: 'limited',
    tagline: '后厨之王，前台之枪；话少，下手全是狠活',
    note: '阿涛的脸我改过十几版。他是那种站在汤锅前不说话、整条街却都安心的男人。腰上那条链扣是他全身唯一的花哨——男人总得给自己留一点态度。',
    status: 'ready',
  },
  {
    id: '002',
    num: 2,
    name: '小吴',
    en: 'WU',
    rarity: 'limited',
    tagline: '收银一把好手，嘴硬心软，全街的账都在她脑子里',
    note: '小吴的卫衣必须歪着戴——她这个人就这样，看着漫不经心，其实什么都记着。包上那串星星是她自己缝的，便宜，但她宝贝得很。',
    status: 'ready',
  },
  {
    id: '003',
    num: 3,
    name: '老皮·街区形态',
    en: 'STREET PI',
    rarity: 'limited',
    tagline: '白天在第六大道晃，晚上守着餐馆的灯',
    note: '素材制作中，敬请期待。',
    status: 'pending',
  },
  {
    id: '004',
    num: 4,
    name: '老皮·太子形态',
    en: 'PRINCE PI',
    rarity: 'ghost',
    tagline: '太子是别人给的身份',
    note: '素材制作中，敬请期待。',
    status: 'pending',
  },
  {
    id: '005',
    num: 5,
    name: '皮爷爷',
    en: 'GRAMPS',
    rarity: 'heat',
    tagline: '手杖上的红宝石一亮，全城安静',
    note: '爷爷是我画得最爽的一个。马甲上那枚"皮"字徽章就是皮家家徽——注意，家徽不是图案，是一个字。这个家族把"皮"当姓氏、当招牌、当命。单片眼镜是最后加的，加上之后，他从老头变成了老狐狸。',
    status: 'ready',
  },
  {
    id: '006',
    num: 6,
    name: '阿勺',
    en: 'SPOON',
    rarity: 'heat',
    tagline: '一把锅铲走天下，憨笑背后藏着旧部的秘密',
    note: '围裙口袋里插着勺子和刀——这是他的安全感。腕上那串木珠是旧部信物，故事线里它是钥匙。选小熊猫而不是大熊猫，就因为一个"小"字：看着小，才藏得住事。',
    status: 'ready',
  },
  {
    id: '007',
    num: 7,
    name: '顺风',
    en: 'SCOOP',
    rarity: 'limited',
    tagline: '大耳朵听见全城风声，相机从不撒谎',
    note: '耳廓狐当记者是天选：耳朵大，风声就来得多。嘴里那支笔是他的招牌动作——这家伙永远在赶稿。设定上，大决战那天，整条街只有他的相机记下了真相。',
    status: 'ready',
  },
  {
    id: '008',
    num: 8,
    name: '小羊宝宝',
    en: 'LAMB',
    rarity: 'heat',
    tagline: '老皮"家"的具体化身',
    note: '素材制作中，敬请期待。',
    status: 'pending',
  },
]

// 当期在售池（仅 ready 的 IP 可被抽出；端盒也按 ready 池判定）
export const readyPool = (ips: IpDef[]): IpDef[] => ips.filter((p) => p.status === 'ready')

// 稀有度展示配置（颜色接 tokens.css）
export const RARITY_META: Record<IpDef['rarity'], { label: string; en: string }> = {
  guide: { label: '引导款', en: 'GUIDE' },
  street: { label: '路面款', en: 'STREET' },
  limited: { label: '限定', en: 'LIMITED' },
  heat: { label: '狠货', en: 'HEAT' },
  ghost: { label: '幽灵款', en: 'GHOST' },
}
