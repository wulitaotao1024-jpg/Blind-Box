const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  screen: () => ipcRenderer.invoke('screen'),
  getBounds: () => ipcRenderer.invoke('getBounds'),
  setBounds: (b) => ipcRenderer.invoke('setBounds', b),
  animateTo: (x, y, ms) => ipcRenderer.invoke('animateTo', x, y, ms),
  setState: (s) => ipcRenderer.invoke('setState', s),
  quit: () => ipcRenderer.invoke('quit'),
  hide: () => ipcRenderer.invoke('hide'),
  show: () => ipcRenderer.invoke('show'),
  // 顺滑拖拽：渲染层只报告开始/结束，移动由主进程完成
  dragStart: () => ipcRenderer.send('dragStart'),
  dragEnd: () => ipcRenderer.send('dragEnd'),
  // 主进程判定为「单击」时回调（260ms 防抖后展开面板）
  onBallClick: (cb) => {
    const h = () => cb()
    ipcRenderer.on('ball-click', h)
    return () => ipcRenderer.removeListener('ball-click', h)
  },
  // 主进程判定为「双击」时回调（撒欢）
  onBallDbl: (cb) => {
    const h = () => cb()
    ipcRenderer.on('ball-dblclick', h)
    return () => ipcRenderer.removeListener('ball-dblclick', h)
  },
  // 托盘菜单切换角色
  onSwitchChar: (cb) => {
    const h = (_e, idx) => cb(idx)
    ipcRenderer.on('switch-char', h)
    return () => ipcRenderer.removeListener('switch-char', h)
  },
})
