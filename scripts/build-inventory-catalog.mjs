// 生成 src/data/inventory/catalog.js（库存全量清单）
// 数据源（上游一图流识别数据，位于 yituliu 根目录）：
//   - items.json          58 项物品 → ITEM_CATALOG
//   - operators (12).json 121 位密探 → AGENT_CATALOG
//
// 用法（在 YuanHub 根目录执行）：
//   node scripts/build-inventory-catalog.mjs
//   node scripts/build-inventory-catalog.mjs <items.json> <operators.json>
//
// 生成后请核对脚本输出的统计数字，再提交生成文件。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const itemsPath = process.argv[2] || path.join(repoRoot, '..', 'items.json')
const operatorsPath = process.argv[3] || path.join(repoRoot, '..', 'operators (12).json')

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

// 转义单引号（目录内容均为中文/拼音，防御性处理）
function sq(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const itemsDoc = readJson(itemsPath)
const operatorsDoc = readJson(operatorsPath)

if (!Array.isArray(itemsDoc.items) || !Array.isArray(operatorsDoc.OPERATORS)) {
  throw new Error('数据源结构不符：需要 items.json 的 items[] 与 operators.json 的 OPERATORS[]')
}

// 子职名映射（PROFESSIONS.sub：pojun→破军 等）
const subProfName = {}
for (const p of operatorsDoc.PROFESSIONS || []) {
  for (const s of p.sub || []) subProfName[s.id] = s.name
}

const items = itemsDoc.items.map((i) => ({
  id: i.id,
  name: i.name,
  category: i.category || '未分类'
}))

// 物品分类按 items.json 出现顺序
const categories = []
for (const i of items) {
  if (!categories.includes(i.category)) categories.push(i.category)
}

const agents = operatorsDoc.OPERATORS.map((o) => ({
  id: o.id,
  name: o.name,
  rarity: o.rarity,
  prof: o.prof,
  subProf: (o.subProf && subProfName[o.subProf]) || o.subProf || ''
}))

const agentProfs = []
for (const a of agents) {
  if (!agentProfs.includes(a.prof)) agentProfs.push(a.prof)
}

const date = new Date().toISOString().slice(0, 10)

const L = []
L.push('// ============================================================')
L.push('// 库存对象目录（全量清单）')
L.push('// 由 scripts/build-inventory-catalog.mjs 自动生成 —— 请勿手改本文件，')
L.push('// 数据更新时改上游 JSON 后重跑生成脚本。')
L.push('// 数据源（上游一图流识别数据）：')
L.push(`//   items.json（${items.length} 项物品）→ ITEM_CATALOG`)
L.push(`//   operators (12).json（${agents.length} 位密探）→ AGENT_CATALOG`)
L.push('// 跨平台主键 = (entity_type, id)；展示名称以本目录为准。')
L.push('// ============================================================')
L.push('')
L.push(`export const CATALOG_VERSION = '${date}'`)
L.push('')
L.push('// 物品分类（按 items.json 出现顺序）')
L.push(`export const ITEM_CATEGORIES = ${JSON.stringify(categories)}`)
L.push('')
L.push('// 密探属性（按 operators.json 出现顺序）')
L.push(`export const AGENT_PROFS = ${JSON.stringify(agentProfs)}`)
L.push('')
L.push('export const ITEM_CATALOG = [')
for (const i of items) {
  L.push(`  { id: '${sq(i.id)}', name: '${sq(i.name)}', category: '${sq(i.category)}' },`)
}
L.push(']')
L.push('')
L.push('export const AGENT_CATALOG = [')
for (const a of agents) {
  L.push(`  { id: '${sq(a.id)}', name: '${sq(a.name)}', rarity: ${a.rarity}, prof: '${sq(a.prof)}', subProf: '${sq(a.subProf)}' },`)
}
L.push(']')
L.push('')

const outPath = path.join(repoRoot, 'src', 'data', 'inventory', 'catalog.js')
mkdirSync(path.dirname(outPath), { recursive: true })
writeFileSync(outPath, L.join('\n'), 'utf8')
console.log('written:', outPath)
console.log('items:', items.length, '| agents:', agents.length)
console.log('categories:', categories.join(' / '))
console.log('profs:', agentProfs.join(' / '))
