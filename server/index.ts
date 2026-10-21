import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApiHandler } from './api'
import * as db from './db'

// 入口：node --experimental-sqlite dist-server/index.js
// 配置走环境变量（systemd Environment= 注入）：
//   BLINDGAP_DB          库文件路径（默认 /opt/blindbox/data/api.db）
//   BLINDGAP_API_HOST    监听地址（默认 127.0.0.1，仅本机，由 nginx 反代对外）
//   BLINDGAP_API_PORT    监听端口（默认 8787）
const DB_PATH = process.env.BLINDGAP_DB ?? '/opt/blindbox/data/api.db'
const HOST = process.env.BLINDGAP_API_HOST ?? '127.0.0.1'
const PORT = Number(process.env.BLINDGAP_API_PORT ?? 8787)

mkdirSync(dirname(DB_PATH), { recursive: true })
const database = db.openDatabase(DB_PATH)
db.deleteExpiredSessions(database, Date.now())

const server = createServer(createApiHandler({ db: database }))

server.listen(PORT, HOST, () => {
  console.log(`[blindgap-api] listening on http://${HOST}:${PORT}  db=${DB_PATH}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => database.close())
    // 兜底：1 秒后强制退出（systemd 不会无限等待）
    setTimeout(() => process.exit(0), 1000).unref()
  })
}
