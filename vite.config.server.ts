import { defineConfig } from 'vite'

// 后端单包专用配置：与前端构建分离。
// - publicDir: false —— 不把 public/（51MB IP 素材）拷进 dist-server，部署只传 30KB 的 index.js
// - 入口 server/index.ts（node:sqlite 已在 db.ts 内用 createRequire 运行时加载，无需 external 插件）
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
  },
})
