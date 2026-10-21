# 盒隙账号系统 + 服务端图鉴 设计文档

> 日期：2026-10-20 ｜ 版本：v0.3.0 ｜ 状态：已拍板（用户选路线 B：Lighthouse 自建，账号密码）
> 上游依据：PRD V1.1（F1 抽盒/保底服务端计数、F4 分享补给、登录方案选型）

## 1. 背景与目标

现状：纯前端 SPA，抽盒与图鉴全在浏览器 localStorage（`blindgap:v1`）——换设备/清缓存即丢失，且计数可被篡改。

目标：
1. 右上角增加「登录」入口，登录页与全站皮克斯黄昏风格一致；
2. 账号密码注册/登录（用户名 + 密码，自建，立即可上线）；
3. 每用户的抽盒状态与图鉴**服务端持久化、一一对应**，下次登录自动加载；
4. 存量 localStorage 数据在首次登录时合并上传，不丢卡；
5. 微信扫码登录列为后续迭代（需 ICP 备案域名 + 微信开放平台网站应用，当前裸 IP 不可行）。

## 2. 路线决策（已拍板）

| 方案 | 结论 |
|---|---|
| 手机号验证码 | 自建需短信商企业资质 + 成本 + 防轰炸，暂不做 |
| 微信扫码 | 需备案域名，当前裸 IP 不可行，后续迭代 |
| **账号密码（自建）** | **采用**：零第三方资质，当前 IP 部署可直接上线 |

部署形态：后端与前端同机同源——Node 后端监听 `127.0.0.1:8787`，nginx `location /api/` 反代。同源 = cookie 无需 CORS、SameSite=Lax 即可用。

## 3. 后端设计（server/，零 npm 依赖，纯 Node 内置模块）

### 3.1 技术选型

- **运行时**：Node v22.23.3（服务器已装），入口 `node --experimental-sqlite dist-server/index.js`；
- **数据库**：`node:sqlite`（DatabaseSync，WAL 模式），库文件 `/opt/blindbox/data/api.db`（仓库外，gitignore）；
- **HTTP**：`node:http` 原生；路由/JSON/cookie 手写（体量小，零依赖）；
- **构建**：`vite build --ssr server/index.ts --outDir dist-server` 打单包（沿用现有工具链，node 内置模块自动 external）；
- **密码**：`node:crypto` scrypt（N=16384,r=8,p=1,keylen=64）+ 每用户随机盐 + `timingSafeEqual`；
- **会话**：32 字节随机 token → httpOnly + SameSite=Lax cookie（`bg_session`），服务端 sessions 表，30 天滑动有效期。

### 3.2 数据模型（SQLite）

```sql
users(id TEXT PK, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
      pass_salt TEXT NOT NULL, created_at INTEGER NOT NULL, last_login_at INTEGER)
box_state(user_id TEXT PK, drawn_count INT, pity_small INT, pity_big INT, pity_hard INT,
          first_draw_done INT)                          -- 与前端 BoxState 同语义
cards(user_id TEXT, ip_id TEXT, count INT, first_at INT, PRIMARY KEY(user_id, ip_id))
supply(user_id TEXT PK, last_login_date TEXT, daily_draw_used INT, share_draw_used INT)
sessions(token TEXT PK, user_id TEXT, created_at INT, expires_at INT)
```

抽卡计数（保底）入库 = PRD「服务端计数跨设备不清零」落地。

### 3.3 API 契约

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | `{username, password}` → 建号 + 发会话；成功返回 `{user}` |
| POST | `/api/auth/login` | `{username, password}` → 发会话；失败统一「用户名或密码错误」（防枚举） |
| POST | `/api/auth/logout` | 删会话 + 清 cookie |
| GET | `/api/me` | 未登录 401；已登录返回 `{user, box, cards, supply, drawsLeft}` |
| POST | `/api/draw` | 服务端抽卡（`crypto.randomInt` + boxReducer 同语义），扣补给、写卡，返回 `{result, isNew, box, drawsLeft}` |
| POST | `/api/share` | 标记今日分享补给已用，返回 `{drawsLeft}` |
| POST | `/api/migrate` | 一次性合并存量 localStorage 数据（仅当服务端无状态时生效，幂等） |

抽卡随机数用 `crypto.randomInt`，保底/掉率逻辑直接复用 `src/logic/boxReducer.ts`（前后端同源，Vite SSR 打包进后端）。

### 3.4 安全基线

- 用户名：2-20 位，`[a-zA-Z0-9_]` 或中文；唯一（DB UNIQUE）；
- 密码：8-64 位；scrypt 加盐散列；不明文落库落日志；
- 登录/注册限流：同 IP 10 分钟 10 次（内存桶，超限 429）；
- 全参数化 SQL；错误信息不泄露用户是否存在；
- **已知限制（MVP 接受）**：站点为 HTTP 裸 IP（无证书可行方案），密码传输存在中间人风险；后续上域名 + HTTPS 后开启 cookie `Secure` 属性。

## 4. 前端改造

### 4.1 新屏幕：Auth（登录/注册）

- 位置：`src/screens/Auth.tsx`，状态机新增 `auth`；
- 风格：与揭晓屏同源黄昏渐变 + 毛玻璃面板 + 暖金按钮（复用现有 CSS 变量）；
- 结构：登录/注册双 tab + 用户名 + 密码 + 提交 + 错误提示 + 「登录后跨设备保存图鉴」价值文案；右上角「跳过」回首页。

### 4.2 登录入口

- 首页右上角（与左上 logo 药丸对称）：未登录显示「登录」玻璃药丸；已登录显示用户名药丸 + 「退出」；
- 组件 `src/components/AuthEntry.tsx`。

### 4.3 状态机改造（App.tsx）

- 启动：`GET /api/me` 恢复会话 → 有则加载 `box/cards/supply`；
- `performDraw` 改为 `POST /api/draw`（异步，成功再进 reveal）；
- 未登录点击开盒/再抽 → 进 `auth` 屏（游客可浏览首页/故事/图鉴墙，图鉴墙全锁 + 登录 CTA）；
- `share` 改为 `POST /api/share` + 本地剪贴板；
- F5 每日重置逻辑移交服务端 supply 表；
- 首登录成功后：读一次 localStorage 旧数据 → `POST /api/migrate` → 清本地键；
- `soundOn` 保留 localStorage（设备偏好，不属账号数据）。

## 5. 部署

- systemd 单元 `blindgap-api.service`（Restart=always，开机自启）；
- nginx `blindbox.conf` 增加 `location /api/` → `proxy_pass http://127.0.0.1:8787`；
- `redeploy.sh` 扩展：构建前端 + 构建 server 包 → 原子换 dist → `systemctl restart blindgap-api` → reload nginx；部署前 `cp data/api.db data/api.db.bak-$(date +%F)`；
- 数据目录 `/opt/blindbox/data/`（仓库外持久化）。

## 6. 测试计划（TDD）

服务器（vitest，node 环境，临时库）：
1. 密码散列/校验（正确/错误/篡改）；
2. register → 登录 → /api/me 全链路 + 未登录 401；
3. 抽卡：首抽必得 000、保底计数、幽灵硬保底、补给扣减、卡 count 累加；
4. migrate：存量合并且幂等（二次迁移不重复计数）；
5. 限流：超限 429；
6. 前端：既有 26 个单测不回退；新增 api client 的 fetch mock 测试。

验收（线上）：注册→抽卡→刷新→换「设备」（清 localStorage）登录→卡与计数还在。

## 7. 里程碑

M1 设计文档（本文）→ M2 后端 + 单测 → M3 前端登录/入口/状态机 → M4 构建 + 本地联调 → M5 部署上线 + 线上验收 → tag v0.3.0。
