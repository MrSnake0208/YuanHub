// The local OCR envelope is NOT the compact HTTP protocol. Only business fields
// leave the browser; every positional item stays a separate inventory instance.
const LIMIT = 2147483647
const qualityNames = { 橙: 'orange', 紫: 'purple', 蓝: 'blue', 绿: 'green', 白: 'white' }
const maxLevel = { orange: 60, purple: 60, blue: 50, green: 40, white: 30 }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = value => Number.isInteger(value) && value >= 0 && value <= LIMIT
function invalid(detail) { throw new Error(detail + '；请重新导出完整识别结果，现有背包未修改。') }
function exact(value, keys) {
  if (!object(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) invalid('JSON 字段或格式无效')
}
function validateCompact(doc) {
  exact(doc, ['format', 'version', 'scan_id', 'complete', 'counts', 'inventory', 'experience', ...(Object.hasOwn(doc, 'bag') ? ['bag'] : [])])
  if (doc.format !== 'maayuan-star-inventory' || doc.version !== 1 || doc.complete !== true ||
    typeof doc.scan_id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(doc.scan_id)) invalid('需要有效批次编号及完整扫描标记')
  exact(doc.counts, ['main', 'support'])
  exact(doc.experience, ['orange', 'purple', 'white'])
  if (!Array.isArray(doc.inventory) || doc.inventory.length > 1000 ||
    !Object.values(doc.experience).every(value => value === null || count(value))) invalid('星石或经验数量无效')
  for (const item of doc.inventory) {
    exact(item, ['kind', 'name', 'quality', 'level'])
    if (!['main', 'support'].includes(item.kind) || typeof item.name !== 'string' || !item.name.trim() ||
      !Object.hasOwn(maxLevel, item.quality) || !Number.isInteger(item.level) || item.level < 1 || item.level > maxLevel[item.quality]) invalid('星石类别、品质或等级无效')
  }
  for (const kind of ['main', 'support']) {
    if (!count(doc.counts[kind]) || doc.counts[kind] !== doc.inventory.filter(item => item.kind === kind).length) invalid('分区数量与实例不一致')
  }
  if (Object.hasOwn(doc, 'bag')) {
    exact(doc.bag, ['current_count', 'capacity'])
    if (doc.bag.current_count !== doc.inventory.length || (doc.bag.capacity !== null &&
      (!count(doc.bag.capacity) || doc.bag.capacity <= 0 || doc.bag.capacity < doc.inventory.length))) invalid('背包数量或容量无效')
  }
  return doc
}
export function starImportKind(value) {
  if (!object(value)) invalid('JSON 根节点必须为对象')
  // Distinct discriminators prevent raw OCR and backup schemas being confused.
  if (Object.hasOwn(value, 'sections') || value.mode === 'local-shadow') return 'local-ocr'
  if (Object.hasOwn(value, 'format') || Object.hasOwn(value, 'scan_id')) return 'compact'
  return 'backup' // The actual vendored backup parser remains authoritative.
}
export async function normalizeMaaYuanInventory(value) {
  const kind = starImportKind(value)
  if (kind === 'compact') return { document: validateCompact(value), source_format: kind }
  if (kind !== 'local-ocr' || value.schemaVersion !== 2 || value.mode !== 'local-shadow' || value.complete !== true) invalid('缺少受支持的完整本地扫描标记')
  exact(value, ['schemaVersion', 'mode', 'complete', 'sections', 'experience', ...(Object.hasOwn(value, 'bag') ? ['bag'] : [])])
  exact(value.sections, ['main', 'support'])
  const inventory = [], counts = {}
  if (!object(value.sections)) invalid('缺少主辅星分区')
  for (const section of ['main', 'support']) {
    const group = value.sections[section]
    if (!object(group) || group.complete !== true || !Array.isArray(group.items) || !count(group.count) || group.count !== group.items.length) invalid('主辅星分区未完整扫描或数量不一致')
    counts[section] = group.count
    for (const item of group.items) {
      if (!object(item) || item.section !== section) invalid('星石分区不一致')
      inventory.push({ kind: section, name: item.name, quality: qualityNames[item.quality] || item.quality, level: item.level })
    }
  }
  const exp = value.experience
  // MaaYuan sets both experience flags to false when a count is unknown.
  const experienceComplete = ![exp?.orangeCount, exp?.purpleCount, exp?.whiteCount].includes(null)
  if (!object(exp) || exp.complete !== experienceComplete || exp.structured !== experienceComplete) invalid('缺少完整且已结构化的三种经验星曜识别结果')
  const document = { format: 'maayuan-star-inventory', version: 1, scan_id: '00000000-0000-0000-0000-000000000000', complete: true,
    counts, inventory, experience: { orange: exp.orangeCount, purple: exp.purpleCount, white: exp.whiteCount } }
  if (Object.hasOwn(value, 'bag')) {
    const bag = value.bag
    if (!object(bag) || typeof bag.complete !== 'boolean') invalid('背包完整性字段无效')
    if (bag.complete && (!count(bag.currentCount) || bag.currentCount !== inventory.length || !count(bag.capacity) || bag.capacity <= 0 || bag.capacity < inventory.length)) invalid('背包数量或容量与扫描结果不一致')
    // Exactly the compact_inventory rule: unconfirmed capacity remains unknown.
    document.bag = { current_count: inventory.length, capacity: bag.complete ? bag.capacity : null }
  }
  validateCompact(document)
  // Raw exports contain no upload UUID. Stable, business-only content identity;
  // the server also checks automatic-sync receipts before rebuilding this raw data.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(document))))
  digest[6] = (digest[6] & 15) | 128
  digest[8] = (digest[8] & 63) | 128
  const hex = Array.from(digest.slice(0, 16), n => n.toString(16).padStart(2, '0')).join('')
  document.scan_id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
  return { document, source_format: 'local-ocr' }
}
