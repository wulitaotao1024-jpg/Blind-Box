import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 打包给 Electron 时关闭 PWA（service worker 在 file:// 下无意义）
const isElectron = process.env.BUILD_TARGET === 'electron'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    ...(isElectron
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
            manifest: {
              name: '盒隙桌宠',
              short_name: '盒隙宠',
              description: '把抽到的 IP 角色变成常驻桌面 / 手机宠物',
              theme_color: '#05050a',
              background_color: '#05050a',
              display: 'standalone',
              orientation: 'any',
              start_url: '/',
              icons: [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,jpg,svg,webmanifest}'],
            },
          }),
        ]),
  ],
  server: { host: true, port: 5189 },
})
