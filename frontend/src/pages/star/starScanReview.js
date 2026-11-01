import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from '../../data/starCatalog.js'

export const SCAN_QUALITIES = { orange: '橙', purple: '紫', blue: '蓝', green: '绿', white: '白' }
export const scanNames = kind => kind === 'main' ? MAIN_STAR_OPTIONS : ASSIST_STAR_OPTIONS
export const matchingStars = (row, inventory) => inventory.filter(old => old.kind === row.kind && old.name === row.name && old.quality === row.quality)

export function scanReviewRows(review) {
  const rows = review.report.entries.map(entry => ({ ...entry, included: true, existing_instance_id: '' }))
  // Only unique, unchanged observations can be paired without choosing between duplicates.
  for (const row of rows) {
    const candidates = matchingStars(row, review.state.inventory)
    const observations = rows.filter(other => other.kind === row.kind && other.name === row.name && other.quality === row.quality)
    if (candidates.length === 1 && observations.length === 1 && candidates[0].level === row.level) row.existing_instance_id = candidates[0].instance_id
  }
  return rows
}

export function scanRemovals(rows, inventory) {
  const kept = new Set(rows.filter(row => row.included).map(row => row.existing_instance_id).filter(Boolean))
  return inventory.filter(old => !kept.has(old.instance_id))
}

export function scanRowProblem(row) {
  if (!row.included) return null
  if (!scanNames(row.kind).includes(row.name)) return { field: 'name', message: '名称未识别，请选择名称。' }
  const limit = { white: 30, green: 40, blue: 50, purple: 60, orange: 60 }[row.quality]
  if (!limit) return { field: 'quality', message: '品质未识别，请选择品质。' }
  if (!Number.isInteger(row.level) || row.level < 1 || row.level > limit) return { field: 'level', message: `请补全有效等级（1–${limit}级）。` }
  return null
}

export function scanApplyBody(review, rows, experience, bag, confirmRemovals) {
  const used = new Set()
  const entries = rows.filter(row => row.included).map(row => {
    const problem = scanRowProblem(row)
    if (problem) throw Object.assign(new Error(`第 ${rows.indexOf(row) + 1} 颗${row.kind === 'main' ? '主星' : '辅星'}${row.name || ''}：${problem.message}`), { observationId: row.observation_id, field: problem.field })
    const id = row.existing_instance_id || null
    if (id && (used.has(id) || !matchingStars(row, review.state.inventory).some(old => old.instance_id === id))) throw new Error('每颗旧星石只能对应一次，且名称和品质必须一致。')
    if (id) used.add(id)
    return { observation_id: row.observation_id, existing_instance_id: id, kind: row.kind, name: row.name, quality: row.quality, level: row.level }
  })
  const counts = values => Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (value == null || value === '') return [key, null]
    if (!Number.isInteger(value) || value < 0 || (key === 'capacity' && value < 1)) throw new Error('数量应为非负整数；背包容量至少为 1。')
    return [key, value]
  }))
  if (scanRemovals(rows, review.state.inventory).length && !confirmRemovals) throw new Error('请核对未对应的旧星石，再确认移除。')
  return { expected_generation: review.state.generation, expected_revision: review.state.revision, expected_loadout_revision: review.loadout_revision,
    entries, experience: counts(experience), bag: counts(bag), confirm_removals: confirmRemovals }
}
