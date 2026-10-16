const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron')
const path = require('path')

const isDev = process.argv.includes('--dev')

// 两态窗口尺寸：球（收起）/ 面板（展开）
// 球窗口 440×300：宠物本体 112×112 贴底(88px)居中，上方留 100px 给台词气泡、
// 下方留 40px 供气泡「翻转到下方」使用；窗口透明区域全部点击穿透。
// 窗口允许整体溢出屏幕外（这样宠物能拖到屏幕任意位置，包括贴边），
// 约束的是「宠物本体的屏幕坐标」而不是窗口边界。
const SIZE = {
  ball: { w: 440, h: 300 },
  panel: { w: 340, h: 470 },
}
// 宠物本体命中区域（渲染层 coordinates 与之一致：padding-bottom 88 + 112/2）
const BALL_R = 62
const PET_CENTER_FROM_BOTTOM = 144 // = 88(底距) + 112/2
const PET_CENTER_FROM_LEFT = 220 // = 440/2
const EDGE_MARGIN = 6 // 宠物允许贴边的最小余量

// 与渲染层 characters.ts 顺序保持一致（托盘菜单切换角色用）
const TRAY_CHARS = ['老皮·幼年', '阿涛', '小吴', '皮爷爷', '阿勺·大厨', '顺风·记者']

let win = null
let tray = null
let drag = null // { offX, offY, sx, sy, maxDist, timer }
let winState = 'panel' // 'ball' | 'panel'：hover-watch 按状态决定命中区域

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// 主屏可用工作区（不含菜单栏/Dock）
function workArea() {
  const sa = screen.getPrimaryDisplay().workArea
  return { x: sa.x, y: sa.y, width: sa.width, height: sa.height }
}

function createWindow() {
  win = new BrowserWindow({
    width: SIZE.panel.w,
    height: SIZE.panel.h,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) win.loadURL('http://localhost:5189')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))

  // 点「关闭」不退出，仅隐藏，托盘保活
  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      win.hide()
    }
  })
}

// 缓动移动窗口（松手吸附用）
function animateWindow(tx, ty, ms = 220) {
  if (!win) return
  const b = win.getBounds()
  const sx = b.x
  const sy = b.y
  const w = b.width
  const h = b.height
  const t0 = Date.now()
  const step = () => {
    if (!win) return
    const t = Math.min(1, (Date.now() - t0) / ms)
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
    win.setBounds({
      x: Math.round(sx + (tx - sx) * e),
      y: Math.round(sy + (ty - sy) * e),
      width: w,
      height: h,
    })
    if (t < 1) setTimeout(step, 16)
  }
  step()
}

// ---------- 托盘：菜单栏小图标（微信同款尺寸） ----------
function buildTray() {
  const iconPath = path.join(__dirname, '../dist/icons/icon-512.png')
  let img = null
  try {
    img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      // 关键：缩到菜单栏尺寸（18pt），并转单色模板图 → 深浅色菜单栏都自适应
      img = img.resize({ width: 18, height: 18, quality: 'best' })
      img.setTemplateImage(true)
    } else {
      img = null
    }
  } catch (e) {
    img = null
  }
  tray = new Tray(img || nativeImage.createEmpty())
  tray.setToolTip('盒隙桌宠')

  const toggle = () => {
    if (!win) return
    if (win.isVisible()) win.hide()
    else {
      win.show()
      win.focus()
    }
  }
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: toggle },
    { type: 'separator' },
    ...TRAY_CHARS.map((name, i) => ({
      label: `角色：${name}`,
      click: () => {
        if (!win) return
        win.show()
        win.focus()
        win.webContents.send('switch-char', i)
      },
    })),
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuiting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
}

// ---------- IPC ----------
ipcMain.handle('screen', () => workArea())
ipcMain.handle('getBounds', () => (win ? win.getBounds() : { x: 0, y: 0, width: 0, height: 0 }))
ipcMain.handle('setBounds', (_e, b) => { if (win) win.setBounds(b) })
ipcMain.handle('animateTo', (_e, x, y, ms) => animateWindow(x, y, ms || 220))
ipcMain.handle('setState', (_e, state) => {
  if (!win) return { x: 0, y: 0, w: 0, h: 0 }
  const s = SIZE[state] || SIZE.panel
  const prev = winState
  winState = SIZE[state] ? state : 'panel'
  if (winState !== 'ball') setMouseIgnore(false)
  const b = win.getBounds()
  const sa = workArea()
  // 锚点 = 宠物（或面板）中心，切换形态时不跳位
  const anchor =
    prev === 'ball'
      ? { x: b.x + PET_CENTER_FROM_LEFT, y: b.y + b.height - PET_CENTER_FROM_BOTTOM }
      : { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  win.setSize(s.w, s.h)
  let x, y
  if (winState === 'ball') {
    // 球态：窗口可溢出屏幕，只约束宠物本体的屏幕坐标
    const loX = sa.x + EDGE_MARGIN - PET_CENTER_FROM_LEFT
    const hiX = sa.x + sa.width - EDGE_MARGIN - PET_CENTER_FROM_LEFT
    const loY = sa.y + EDGE_MARGIN - (s.h - PET_CENTER_FROM_BOTTOM)
    const hiY = sa.y + sa.height - EDGE_MARGIN - (s.h - PET_CENTER_FROM_BOTTOM)
    x = clamp(anchor.x - PET_CENTER_FROM_LEFT, Math.min(loX, hiX), Math.max(loX, hiX))
    y = clamp(anchor.y - (s.h - PET_CENTER_FROM_BOTTOM), Math.min(loY, hiY), Math.max(loY, hiY))
  } else {
    // 面板态：整窗完整可见
    x = clamp(anchor.x - s.w / 2, sa.x, Math.max(sa.x, sa.x + sa.width - s.w))
    y = clamp(anchor.y - s.h / 2, sa.y, Math.max(sa.y, sa.y + sa.height - s.h))
  }
  win.setPosition(x, y)
  return { x, y, w: s.w, h: s.h }
})
ipcMain.handle('quit', () => { app.isQuiting = true; app.quit() })
ipcMain.handle('hide', () => win && win.hide())
ipcMain.handle('show', () => { if (win) { win.show(); win.focus(); setMouseIgnore(false) } })

// ---------- 透明区域点击穿透 ----------
// 球态窗口 440 宽但只有底部中间的宠物本体（112×112）可交互：
// 悬停在宠物上才接收鼠标，其余透明区域 setIgnoreMouseEvents 让点击穿到桌面/其他应用。
// 注意：Electron 的 BrowserWindow 只有 setIgnoreMouseEvents()，没有 isIgnoredMouseEvents()，
// 所以「当前是否穿透」由本文件自行记录（mouseIgnored），只在状态变化时才调用。
let mouseIgnored = false
function setMouseIgnore(ignore) {
  if (!win || win.isDestroyed()) return
  if (ignore === mouseIgnored) return
  mouseIgnored = ignore
  try {
    win.setIgnoreMouseEvents(ignore, { forward: true })
  } catch (e) {
    /* 窗口销毁瞬间可能抛错，忽略 */
  }
}
let hoverTimer = null
function startHoverWatch() {
  hoverTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return
    try {
      // 拖拽中：整窗必须接收鼠标，否则会中途丢掉 pointer 事件导致拖拽断流
      if (drag) {
        setMouseIgnore(false)
        return
      }
      if (winState !== 'ball') {
        // 面板态：整窗可交互
        setMouseIgnore(false)
        return
      }
      // 球态：只有宠物本体（112×112 贴底居中）接收鼠标，其余全透明区域点击穿透
      const b = win.getBounds()
      const p = screen.getCursorScreenPoint()
      const cx = b.x + b.width / 2
      const cy = b.y + b.height - PET_CENTER_FROM_BOTTOM
      const overPet = Math.hypot(p.x - cx, p.y - cy) <= BALL_R
      setMouseIgnore(!overPet)
    } catch (e) {
      /* 单次轮询异常不拖垮主进程 */
    }
  }, 80)
}

// ---------- 顺滑拖拽：主进程轮询光标直接移窗（不走渲染层逐帧 IPC） ----------
ipcMain.on('dragStart', () => {
  if (!win || drag) return
  const p = screen.getCursorScreenPoint()
  const b = win.getBounds()
  drag = { offX: p.x - b.x, offY: p.y - b.y, sx: p.x, sy: p.y, maxDist: 0, timer: null }
  drag.timer = setInterval(() => {
    if (!drag || !win) return
    const p = screen.getCursorScreenPoint()
    drag.maxDist = Math.max(drag.maxDist, Math.hypot(p.x - drag.sx, p.y - drag.sy))
    const sa = workArea()
    const size = win.getBounds()
    // 约束「宠物本体」在屏幕内：由此反推窗口左上角允许范围（窗口可以溢出屏幕）
    const minX = sa.x + EDGE_MARGIN - PET_CENTER_FROM_LEFT
    const maxX = sa.x + sa.width - EDGE_MARGIN - PET_CENTER_FROM_LEFT
    const minY = sa.y + EDGE_MARGIN - (size.height - PET_CENTER_FROM_BOTTOM)
    const maxY = sa.y + sa.height - EDGE_MARGIN - (size.height - PET_CENTER_FROM_BOTTOM)
    const nx = clamp(p.x - drag.offX, Math.min(minX, maxX), Math.max(minX, maxX))
    const ny = clamp(p.y - drag.offY, Math.min(minY, maxY), Math.max(minY, maxY))
    win.setPosition(nx, ny)
  }, 15)
})
// ---------- 拖拽结束：区分 拖动 / 单击 / 双击 ----------
// 单击不再立即展开，等 260ms：若期间来了第二次点击则判为双击（撒欢）
let clickTimer = null
ipcMain.on('dragEnd', () => {
  const wasClick = drag && drag.maxDist < 6
  if (drag) {
    clearInterval(drag.timer)
    drag = null
  }
  if (!win) return
  if (!wasClick) return // 拖动：停在松手位置，不吸附任何边缘

  if (clickTimer) {
    // 260ms 内的第二次点击 → 双击
    clearTimeout(clickTimer)
    clickTimer = null
    win.webContents.send('ball-dblclick')
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null
      if (win) win.webContents.send('ball-click')
    }, 260)
  }
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock && app.dock.hide()
  createWindow()
  buildTray()
  startHoverWatch()
})

app.on('window-all-closed', () => {
  // 保持托盘常驻，不退出
})
