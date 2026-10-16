# 盒隙 BLINDGAP — 官网 + 桌宠（monorepo）

本仓库包含三部分：

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| 根目录 | 盲盒平台 Web（官网首页，兼容移动端） | 部署在云服务器 8080 |
| `pet/` | 盲盒平台 Web 版桌宠（PWA） | 部署在云服务器 8081，手机可「添加到主屏幕」 |
| `pet-desktop/` | **桌面版桌宠（Electron 悬浮球）** | 系统级透明置顶浮窗，可拖到屏幕任意位置 |

---

## 一、盲盒平台 Web（根目录）

依据《IP盲盒平台 PRD V1.1》实现首页核心闭环：
**氛围页 → 21s 无缝视频《暗潮》（无播放器痕迹）→ 末帧盒子即开盒按钮 → IP 揭示卡 → 图鉴墙（第六大道花名册）**

### 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # 逻辑层单测（14 个：概率/保底/图鉴）
npm run build    # 产物在 dist/
```

### 资产契约（放图即生效，零代码改动）

| 路径 | 用途 | 缺失时表现 |
| --- | --- | --- |
| `public/assets/anchao.mp4` | 首页 21s 故事视频 | 静态封面 + 直出开盒按钮（流程不中断） |
| `public/ip/{编号}.png` | IP 立绘（如 `000.png`） | 稀有度风格化占位卡 |
| `public/ip/{编号}.glb` | 3D 鉴赏模型（≤5MB，Draco 压缩） | 3D 按钮自动降级为立绘放大 |

当前可用编号：000/001/002/005/006/007（已有模型）；003/004/008 素材待补充（图中为暗格"入住筹备中"）。

### 结构

- `src/data/ips.ts` — IP 数据源（PRD 8.1/8.3 文案已录入）
- `src/data/subtitles.ts` — 21s 字幕时间轴（视频优化版交付后只需改秒数）
- `src/logic/boxReducer.ts` — 抽盒概率 + 保底（小10/大40/幽灵硬90，与服务端同语义）
- `src/logic/collection.ts` — 图鉴收录/端盒判定
- `src/screens/` — Landing / Story / EndCard / Reveal / Wall 五屏
- `src/components/ModelViewer3D.tsx` — F8 3D 鉴赏（model-viewer 按需加载 + 降级）
- `src/logic/track.ts` — 埋点 stub（事件名按 PRD 第十章）

### 待接后端

抽数/保底计数目前 localStorage 模拟（`src/logic/storage.ts`）；接服务端时替换该适配层即可，`boxReducer` 语义可直接复用为服务端实现参考。

---

## 二、桌面版桌宠（`pet-desktop/`）

Electron 悬浮球：透明无边框置顶、可拖到屏幕任意位置、松手不吸附、单击展开角色面板、双击触发互动台词、菜单栏小图标保活。
详细说明与打包方式见 [`pet-desktop/README.md`](pet-desktop/README.md)。
