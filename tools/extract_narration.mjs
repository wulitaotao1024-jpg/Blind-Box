// 从 TS 数据源提取「听故事」朗读文本，输出 JSON 供 gen_audio.py 使用
// 文本拼接顺序必须与前端 buildNarrationText 保持一致：
//   名称 → 出处 → 原文 → 白话故事 →（如有）考据备注
// 用法：node tools/extract_narration.mjs   （在 blindgap-web/ 下执行）
import { buildSync } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = (n) => root + n

// esbuild 把 TS bundle 成可 import 的临时 mjs，取完即删
// 注意：每个入口必须用独立临时文件名，否则 ESM 按 URL 缓存会拿到上一个模块
async function load(entry, exportName, tag) {
  const out = tmp(`.tmp-extract-${tag}.mjs`)
  buildSync({
    entryPoints: [root + entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
  })
  const mod = await import(pathToFileURL(out).href)
  rmSync(out, { force: true })
  return mod[exportName]
}

const LORE = await load('src/data/lore.ts', 'LORE', 'lore')
const IPS = await load('src/data/ips.ts', 'IPS', 'ips')
const names = Object.fromEntries(IPS.map((i) => [i.id, i.name]))

const out = {}
for (const [id, lore] of Object.entries(LORE)) {
  const name = names[id] ?? id
  const parts = [name, `出处：${lore.source}。`, `原文：${lore.quote}`, `白话：${lore.story}`]
  if (lore.sourceNote && lore.sourceNote.trim()) parts.push(`考据备注：${lore.sourceNote}`)
  out[id] = { name, text: parts.join(' ').replace(/\s+/g, ' ').trim() }
}

writeFileSync(tmp('.tmp-narration.json'), JSON.stringify(out, null, 2))
console.log(`extracted ${Object.keys(out).length} entries -> .tmp-narration.json`)
