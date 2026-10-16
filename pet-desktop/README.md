# 盒隙桌宠 · 桌面版（Electron 悬浮球）

把抽到的 IP 变成**系统级悬浮球**：透明无边框置顶窗、可长按拖到屏幕任意位置、拖动顺滑（主进程轮询光标，60fps）、单击展开角色面板、双击触发互动台词。

同一份代码也支持构建成 **Web / PWA**（移动端），渲染层会自动判断运行在 Electron 还是浏览器，走两套 UI：

- Electron → 悬浮球（`ball`）/ 角色面板（`panel`）两态
- 浏览器 → 全屏 PWA 桌宠

## 快速开始

```bash
npm install            # 首次会下载 Electron 二进制
npm run electron:dev   # 开发：自动起 vite(5189) + Electron，弹桌面悬浮球
```

生产与打包：

```bash
npm run build:electron && npm run electron   # 本地生产模式运行
npm run dist:mac                             # 打包 mac dmg/zip → release/
npm run dist:win                             # 打包 win nsis/zip
npm run build                                # 构建 Web/PWA（部署用）
```

## 交互

| 操作 | 行为 |
| --- | --- |
| 拖动球 | 顺滑跟手，停在松手位置（不吸附边缘）；可拖到屏幕任意位置，含贴边 |
| 单击球 | 展开角色面板（0.26s 防抖区分双击） |
| 双击球 | 撒欢动画 + 按顺序轮播该角色的互动台词 |
| 右键球 | 展开角色面板 |
| 菜单栏小盒子图标 | 单击显示/隐藏；菜单里可直接切换 6 个角色、退出 |

## 实现要点

- **点击穿透**：`electron/main.cjs` 每 80ms 轮询光标位置，只有落在宠物本体（112×112，圆心 `cx=220 / cy=height-144`，半径 62）上时才 `setIgnoreMouseEvents(false)`，其余透明区域点击直接穿透到桌面/其他应用，不挡任何操作。拖拽期间强制接收事件，避免拖到一半断流。
- **气泡不被裁**：窗口外的内容 macOS 不渲染，所以球窗口开到 440×300（宠物贴底 88px，上方留给气泡、下方留给翻转）。宠物贴近屏幕边缘时气泡自动横向滑动（`--tail-shift` 反向补偿尾巴），上方空间不足时翻到宠物下方。
- **窗口可溢出**：只约束「宠物本体」的屏幕坐标，不约束窗口边界——所以宠物能贴到屏幕最边缘。
- **托盘图标**：512 原图缩到 18px 单色模板图，跟微信/WorkBuddy 菜单栏图标一致（深浅色自适应）。

## 目录

```
electron/main.cjs        主进程：透明置顶窗 / 拖拽 / 穿透 / 托盘 / IPC
electron/preload.cjs     暴露 window.electronAPI
src/App.tsx              双分支渲染（Electron 球·面板 / Web PWA）
src/data/characters.ts   6 个角色与台词
src/styles/app.css       球、气泡、面板样式
tools/remove_bg.py       批量把 public/ip/*.jpg 抠成透明 PNG（rembg/u2net）
public/ip/*.png          抠好透明背景的立绘
```

> `public/ip/*.jpg` 是原始立绘，`*.png` 是抠图后的透明版（桌宠实际使用 png）。新增角色时把原图放进 `public/ip/` 后跑一次 `python tools/remove_bg.py` 即可。