# 盒隙 BLINDGAP — 首页前端技术设计（v0.1）

日期：2026-10-15 ｜ 依据：《IP盲盒平台PRD V1.1》（已拍板定稿）

## 1. 目标

优先实现 PRD 第六章「首页动线」核心闭环：
**进站氛围 → 点击开启 → 21s 无缝视频（无播放器痕迹）→ 末帧盒子即开盒按钮 → 开盒揭示 IP 卡 → 收入图鉴墙（第二屏）**，
并预埋 F8 3D 鉴赏入口与埋点钩子。

## 2. 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 构建 | Vite 5 + React 18 + TypeScript | 用户指定 React+TS；Vite 快、移动端 H5 首选 |
| 样式 | 原生 CSS + CSS 变量（design tokens） | 潮酷街头风需要全定制视觉，不引重型 UI 库 |
| 3D | Google `@google/model-viewer`（Web Component） | PRD F8 指定；.glb 缺失时自动降级立绘 |
| 状态 | React useState/useReducer + localStorage | MVP 无后端，抽数/图鉴状态本地持久化，接口形状按服务端预留 |
| 路由 | 无（单页状态机） | 首页动线是视图转场不是页面跳转，MVP 不引 router |
| 测试 | Vitest（纯逻辑层：抽数/图鉴 reducer） | TDD 覆盖经济系统逻辑；视觉层用构建+人工验收 |

## 3. 页面状态机

```
landing（氛围+会呼吸的盒子）
  → story（21s视频铺底，字幕即场景，右上角跳过3s淡入）
  → endcard（盒子落下="开盒"按钮 + 「他的故事在你手里，开盒继续」）
  → reveal（开盒动画1.5-2s → IP揭示卡：编号/名称/设定/手记/稀有度/3D鉴赏入口）
  → wall（我的盒隙墙：花名册网格、进度、暗格悬念、端盒入口）
```
任一状态异常（视频加载失败）→ poster 静态封面 + 直出开盒按钮，流程不中断。

## 4. 目录结构

```
blindgap-web/
  public/
    assets/anchao.mp4        # 《暗潮》21s（从 Downloads 复制）
    ip/{id}.png              # 资产契约：立绘，放图即点亮（如 000.png）
    ip/{id}.glb              # 资产契约：3D模型，放入即启用 3D 鉴赏
  src/
    data/ips.ts              # IP 数据源（PRD 8.1/8.3：编号、名称、设定、手记、稀有度、掉率）
    data/subtitles.ts        # 21s 字幕时间轴配置（PRD 分镜文案，可改）
    logic/boxReducer.ts      # 抽盒纯逻辑：概率+保底10/40/90（TDD 重点）
    logic/collection.ts      # 图鉴/进度/端盒判定（TDD）
    logic/storage.ts         # localStorage 适配层
    logic/track.ts           # 埋点 stub（video_start/open_box/box_result/ip_3d_*…）
    screens/Landing.tsx / Story.tsx / EndCard.tsx / Reveal.tsx / Wall.tsx
    components/ModelViewer3D.tsx / RarityBadge.tsx / GuideOverlay.tsx(新手引导)
    App.tsx / tokens.css
```

## 5. 关键实现要点（对应 PRD 6.3 / 11）

- 视频：`<video>` 全屏 `object-fit:cover`，`muted playsinline`，点击开启时 `play()+unmute`（绕过自动播放限制）；`timeupdate` 驱动字幕；`ended` 进 endcard。
- 保底：服务端将来实现，但前端先按同规格实现（小10/大40/幽灵硬90，独立计数），概率公示页脚。
- 占位降级：`ip/{id}.png` 不存在 → 风格化占位卡（稀有度色渐变+编号+"素材待补充"）；`.glb` 不存在 → 3D 按钮降级为立绘放大查看。
- 潮酷视觉：深夜街道底色 + 高饱和稀有度色（路面灰/限定青/狠货橙红/幽灵紫），中文黑体标题+大字排版。
- 响应式：移动优先，断点 320–1920（PRD 非功能需求）。

## 6. 本期不做（下一步排期）

- F7 账号体系（注册+账号密码，需后端）；分享得抽真实回流（先本地 mock 按钮文案）；F2 端盒彩蛋剧情（先入口+称号）；音效文件；真实埋点上报（先 stub）。

## 7. 验收（对照 PRD 12.1 MVP 首页部分）

1. 移动端 Safari/微信打开：氛围页 → 点击 → 有声播放 21s，全程无播放器 UI 感。
2. 末帧盒子可点 → 揭示 IP 卡 → 图鉴墙进度 +1。
3. 无网/视频失败：poster + 开盒按钮兜底，闭环不中断。
4. `npm run build` 通过；boxReducer/collection 单测通过（概率与保底正确性）。
5. 素材契约验证：向 public/ip/ 放入 000.png 后图鉴墙该格点亮。
