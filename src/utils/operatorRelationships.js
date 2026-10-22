export const RELATIONSHIP_KINDS = ['trust', 'rumors']
export const RELATIONSHIP_BACKUP_LIMIT = 1024 * 1024
export function relationshipOwner(id, kind, rules) {
  return kind === 'trust' ? rules[id]?.trust_owner_id || id : id
}
export function relationshipValue(id, kind, records, rules) {
  return records[relationshipOwner(id, kind, rules)]?.[kind] ?? null
}
export function parseRelationshipValue(value) {
  if (value === '' || value == null) return null
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('请输入非负整数，留空表示未记录')
  return Number(value)
}
export function relationshipProgress(value, rule) {
  if (value == null) return { status: 'unknown', remaining: null, next: null }
  if (!rule || !rule.complete) return { status: 'missing', remaining: null, next: null }
  if (!Number.isSafeInteger(value) || value < 0 || value > rule.max) return { status: 'invalid', remaining: null, next: null }
  const pending = rule.milestones.filter(item => item.at > value)
  return { status: 'ready', remaining: pending.flatMap(item => item.rewards), next: pending[0] || null }
}
export function relationshipSummary(operators, records, rules) {
  const seen = new Set(), rewards = new Map()
  let recorded = 0, covered = 0, missing = 0, overflow = false
  for (const operator of operators) {
    let hasValue = false, complete = true
    for (const kind of RELATIONSHIP_KINDS) {
      const owner = relationshipOwner(operator.id, kind, rules)
      const value = records[owner]?.[kind] ?? null
      const progress = relationshipProgress(value, rules[owner]?.[kind])
      if (value != null) hasValue = true
      if (progress.status !== 'ready') complete = false
      const key = kind + ':' + owner
      if (seen.has(key)) continue
      seen.add(key)
      if (progress.status !== 'ready') { missing++; continue }
      for (const reward of progress.remaining) {
        const old = rewards.get(reward.item_key)
        const quantity = (old?.quantity || 0) + reward.quantity
        if (!Number.isSafeInteger(quantity)) { overflow = true; continue }
        rewards.set(reward.item_key, { ...reward, quantity })
      }
    }
    if (hasValue) recorded++
    if (complete) covered++
  }
  return { total: operators.length, recorded, covered, missing, overflow, rewards: overflow ? [] : [...rewards.values()] }
}
export function makeRelationshipBackup(game, records) {
  return { format: 'yuanhub-relationships', schema_version: 1, game, entries: Object.entries(records).map(([operator_id, values]) => ({ operator_id, ...values })) }
}
export function readRelationshipBackup(text, game, operators) {
  if (new TextEncoder().encode(text).length > RELATIONSHIP_BACKUP_LIMIT) throw new Error('备份不能超过 1 MiB')
  const document = JSON.parse(text)
  const exact = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))
  if (!exact(document, ['format', 'schema_version', 'game', 'entries']) || document.format !== 'yuanhub-relationships' || document.schema_version !== 1) throw new Error('请选择信赖与传闻备份 v1')
  if (document.game !== game) throw new Error('备份游戏与当前账号不一致')
  if (!Array.isArray(document.entries) || document.entries.length > 1000) throw new Error('备份记录数量无效')
  const seen = new Set(), known = new Set(operators.map(item => item.id)), records = Object.create(null)
  for (const entry of document.entries) {
    if (!exact(entry, ['operator_id', ...RELATIONSHIP_KINDS]) || typeof entry.operator_id !== 'string' || !known.has(entry.operator_id) || seen.has(entry.operator_id)) throw new Error('备份含未知或重复密探，请先核对')
    seen.add(entry.operator_id)
    const values = {}
    for (const kind of RELATIONSHIP_KINDS) {
      if (!Object.hasOwn(entry, kind)) continue
      if (!Number.isSafeInteger(entry[kind]) || entry[kind] < 0) throw new Error('备份进度必须为非负安全整数')
      values[kind] = entry[kind]
    }
    if (!Object.keys(values).length) throw new Error('备份含空记录')
    records[entry.operator_id] = values
  }
  return records
}
export function previewRelationshipImport(incoming, current, rules, overwrite = false) {
  const normalized = Object.create(null), entries = Object.create(null)
  let conflicts = 0, changes = 0
  for (const [id, values] of Object.entries(incoming)) {
    for (const [kind, value] of Object.entries(values)) {
      const owner = relationshipOwner(id, kind, rules), max = rules[owner]?.[kind]?.max
      if (max != null && value > max) throw new Error('备份进度超过已核准上限')
      normalized[owner] ||= {}
      if (Object.hasOwn(normalized[owner], kind) && normalized[owner][kind] !== value) throw new Error('备份中的共享信赖值冲突')
      normalized[owner][kind] = value
    }
  }
  for (const [id, values] of Object.entries(normalized)) for (const [kind, value] of Object.entries(values)) {
    const old = current[id]?.[kind]
    if (old === value) continue
    if (old != null) { conflicts++; if (!overwrite) continue }
    entries[id] ||= {}; entries[id][kind] = value; changes++
  }
  return { entries, conflicts, changes }
}
