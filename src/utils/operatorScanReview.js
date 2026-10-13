import { operatorHuaji, operatorHuajiLabel, operatorHuajiMax } from './operatorHuaji.js'
import { isMovieOperator } from './operatorForms.js'
import { getMaxEliteForLevel, OPERATOR_LEVEL_MAX, OPERATOR_ELITE_MAX } from './operatorGrowthRules.js'
import { OPERATOR_ODDITY_KEYS, normalizeOperatorOdditySchema, operatorOddityCurrentError } from './operatorCombatStats.js'
import { DISC_LOADOUT_LIMIT, DISC_SELECTION_LIMIT, discNameOf } from './operatorDiscLoadouts.js'

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const labels = { level: '等级', elite: '修为', huaji: '化极与觉醒', star_level: '化极', basic: '等级与修为', oddities: '奇闻属性', disc_loadouts: '命盘', equipment: '已装备星石', equipped_star_stones: '已装备星石', combat_stats: '战斗观测', match: '密探身份' }
function reviewHuaji(entry, catalog) {
  const legacy = entry?.star_level ?? entry?.starLevel
  if (typeof entry?.huaji?.owned === 'boolean' || (typeof legacy === 'number' && Number.isInteger(legacy) && legacy >= 0)) return operatorHuaji({ ...catalog, ...entry })
  return { owned: null, stage: null, awakened: null }
}

export function operatorReviewIssues(review) {
  return [...(review?.blocking_errors || review?.blockingErrors || []), ...(review?.warnings || [])]
}

export function operatorReviewField(issue) {
  const path = issue?.field || issue?.field_path || issue?.fieldPath || ''
  const oddity = path.match(/combat_stats\.oddities\.(attack|hp|special)/)
  if (oddity) return 'oddity-' + oddity[1]
  if (/star_level|huaji/.test(path)) return 'huaji'
  if (/disc_loadouts/.test(path)) return 'disc_loadouts'
  if (path === 'level' || path === 'elite') return path
  return ''
}

export function operatorReviewFieldLabel(path) {
  const oddity = String(path).match(/oddities\.(attack|hp|special)/)
  if (oddity) return { attack: '攻击奇闻', hp: '生命奇闻', special: '第三项奇闻' }[oddity[1]]
  const key = String(path).split(/[.[]/)[0]
  return labels[key] || '其他采集字段'
}

export function operatorReviewIssueText(issue) {
  const message = issue?.message || ''
  if (issue?.code === 'invalid_combat_stats') {
    if (/catalog limit/.test(message)) return '奇闻数值超过公共图鉴上限，请对照游戏修改。'
    if (/one decimal/.test(message)) return '第三项奇闻最多填写一位小数。'
    if (/integer/.test(message)) return '攻击和生命奇闻必须填写整数。'
    if (/non-negative/.test(message)) return '奇闻数值不能为负数。'
  }
  return ({
    invalid_star_level: '化极数值不在该密探的允许范围内，请重新选择星级和节点。',
    invalid_huaji: '化极或拥有状态不合法，请按游戏中的实际状态重新选择。',
    legacy_huaji_requires_review: '历史星级无法确定，请核对游戏后确认；不会自动拉满。',
    huaji_conflict: '化极与已确认的觉醒记录矛盾，请重新读回并核对。',
    awakening_not_supported: '该密探暂不支持确认已觉醒，请核对化极状态。',
    invalid_disc_loadout: '采集的命盘不在该密探图鉴中，请取消非法命盘并重新选择。',
    invalid_oddities: '奇闻采集不完整，请分别核对三项；未确认的项不会保存。',
    newer_current_requires_review: '采集时间早于当前修正，请比较现值后决定本次修改。',
    operator_state_stale: '档案已被其他操作更新，请重新读回、预览后再确认。',
    revision_conflict: '档案版本已变化，请重新读回、预览后再确认。',
    idempotency_conflict: '此修正记录已被用于不同内容，请修改后重新预览。',
    duplicate_record: '这份修正已提交过，本次没有重复写入。',
    invalid_game: '密探不属于当前游戏，请切换正确的游戏账号核对。',
    account_game_mismatch: '采集记录与目标账号的游戏不一致，请核对账号。',
    unknown_operator: '图鉴未找到该密探，请更新图鉴或重新采集。',
    shared_growth_conflict: '本体与特殊形态的等级或修为不一致，请重新核对共享养成。',
  })[issue?.code] || message || '服务端未提供文字原因；原始错误码保留在技术详情中。'
}

export function operatorReviewSource(review) {
  const records = review?.document?.records || []
  const record = records.find(item => item.record_id === review.record_id && item.entries?.some(entry => entry.operator_id === review.operator_id))
    || (records.length === 1 ? records[0] : null)
  const entry = record?.entries?.find(item => item.operator_id === review.operator_id)
  if (!entry) throw new Error('待复核文档缺少对应密探')
  return { record, entry }
}

export function operatorReviewRows(review, catalog) {
  const { entry } = operatorReviewSource(review)
  const status = entry.section_status || {}
  const issues = operatorReviewIssues(review)
  const allPending = review.status === 'rejected' || (entry.match && entry.match.status !== 'ready') ||
    issues.some(issue => issue.code === 'newer_current_requires_review')
  const uncertain = !Object.keys(status).length && review.status === 'review'
  const pending = section => status[section] === 'unavailable' || status[section] === 'review' || allPending ||
    (section === 'huaji' && issues.some(issue => issue.code === 'legacy_huaji_requires_review')) || uncertain
  const rows = []
  function add(id, section, label, value, kind = 'number', extra = {}) {
    rows.push({ id, section, label, collected: clone(value), value: clone(value) ?? '', kind,
      pending: pending(section), supported: true, included: false, ...extra })
  }
  for (const key of ['level', 'elite']) {
    if (key in entry || status.basic === 'review' || status.basic === 'unavailable') add(key, 'basic', labels[key], entry[key], 'number', { max: key === 'level' ? OPERATOR_LEVEL_MAX : OPERATOR_ELITE_MAX })
  }
  if ('huaji' in entry || 'star_level' in entry || ['review', 'unavailable'].includes(status.huaji)) {
    const facts = reviewHuaji(entry, catalog)
    add('huaji', 'huaji', labels.huaji, facts, 'huaji')
  }
  if ('disc_loadouts' in entry || ['review', 'unavailable'].includes(status.disc_loadouts)) add('disc_loadouts', 'disc_loadouts', labels.disc_loadouts, entry.disc_loadouts, 'discs')
  const schema = normalizeOperatorOdditySchema(catalog?.odditySchema || catalog?.oddity_schema)
  if (entry.combat_stats?.oddities || ['review', 'unavailable'].includes(status.oddities)) {
    for (const key of OPERATOR_ODDITY_KEYS) {
      add('oddity-' + key, 'oddities', key === 'special' ? schema[key].name : (key === 'attack' ? '攻击奇闻' : '生命奇闻'), entry.combat_stats?.oddities?.[key]?.current, 'number', { key, max: schema[key].max })
    }
  }
  for (const section of ['equipment', 'combat_stats']) {
    const present = section === 'equipment' ? 'equipped_star_stones' in entry : Object.keys(entry.combat_stats || {}).some(key => key !== 'oddities')
    if ((present || section in status) && pending(section)) add(section, section, labels[section], section === 'equipment' ? entry.equipped_star_stones : entry.combat_stats, 'unsupported', { supported: false })
  }
  // Old receipts cannot identify saved partitions; every field still needs explicit confirmation.
  if (issues.some(issue => !operatorReviewField(issue) && !['duplicate_record', 'legacy_huaji_requires_review', 'newer_current_requires_review', 'catalog_oddity_name_missing', 'catalog_name_mismatch'].includes(issue.code))) {
    add('other', 'other', '其他待核信息（见原因）', null, 'unsupported', { supported: false, pending: true })
  }
  return rows.sort((left, right) => Number(right.pending) - Number(left.pending))
}

export function operatorReviewCurrentValue(row, raw, catalog) {
  if (!raw) return null
  if (row.id === 'huaji') return reviewHuaji(raw, catalog)
  if (row.id === 'disc_loadouts') return raw.disc_loadouts ?? raw.discLoadouts ?? null
  if (row.id === 'equipment') return raw.star_stones ?? raw.starStones ?? null
  if (row.id === 'combat_stats') return raw.combat_stats ?? raw.combatStats ?? null
  if (row.key) return (raw.combat_stats || raw.combatStats)?.oddities?.[row.key]?.current ?? null
  return raw[row.id] ?? null
}

export function operatorReviewValueLabel(value, id, catalog) {
  if (value == null || value === '') return '未知'
  if (id === 'huaji') {
    if (typeof value.owned !== 'boolean') return '未知'
    return operatorHuajiLabel({ ...catalog, huaji: value })
  }
  if (id === 'disc_loadouts') return value.length ? value.map((item, index) => '组合' + (index + 1) + '：' + ((item.discs || []).map(discNameOf).join('、') || '未配置')).join('；') : '未配置命盘'
  if (id === 'equipment') return value.length ? value.map(item => (item.name || '星石') + ' ' + (item.level ?? '未知') + '级').join('、') : '未装备'
  if (id === 'combat_stats') return '观测攻击 ' + (value.observed_attack ?? value.observedAttack ?? '未知') + '，观测生命 ' + (value.observed_hp ?? value.observedHp ?? '未知')
  return String(value)
}

export function operatorReviewRowError(row, rows, catalog, current) {
  if (!row.included || !row.pending || !row.supported) return ''
  const value = row.kind === 'huaji' ? operatorReviewHuajiValue(row, current, catalog) : row.value
  if (row.kind === 'huaji') {
    if (typeof value?.owned !== 'boolean') return '请先确认是否拥有'
    if (![true, false, null].includes(value.awakened)) return '请选择觉醒状态'
    if (!value.owned && (value.stage !== 0 || value.awakened === true)) return '未拥有时不能设置化极或已觉醒'
    if (value.owned && (value.stage == null || !Number.isInteger(value.stage) || value.stage < 1 || value.stage > operatorHuajiMax(catalog))) return '请选择合法星级；未知阶段请先在游戏中核对'
    if (isMovieOperator(catalog) && ![0, 1, 7, 13, 19, 25].includes(value.stage)) return '特殊形态只能选择整星'
    if ((isMovieOperator(catalog) || Number(catalog?.rarity) === 3) && value.awakened === true) return '该密探暂不支持确认已觉醒'
    return ''
  }
  if (row.kind === 'discs') {
    if (!Array.isArray(value) || value.length > DISC_LOADOUT_LIMIT) return '最多保留两组命盘，请核对原始记录'
    const names = (catalog?.discs || []).map(discNameOf)
    if (value.some(item => !item.id || !item.name?.trim() || item.name.length > 64 || !Array.isArray(item.discs) || item.discs.length > DISC_SELECTION_LIMIT || new Set(item.discs.map(discNameOf)).size !== item.discs.length || item.discs.some(disc => !names.includes(discNameOf(disc))))) return '请填写组合名，并从图鉴选择每组最多三个命盘'
    return ''
  }
  if (row.key) return operatorOddityCurrentError(row.key, value, row.max)
  if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > row.max) return '请填写 0–' + row.max + ' 的整数'
  if (row.id === 'elite') {
    const level = rows.find(item => item.id === 'level' && item.included)?.value ?? current?.level
    if (level != null && value > getMaxEliteForLevel(level)) return '修为超过当前等级允许的上限 ' + getMaxEliteForLevel(level)
  }
  return ''
}

export function operatorReviewHuajiValue(row, current, catalog) {
  const value = { ...row.value }
  const before = reviewHuaji(current, catalog)
  if (value.owned === before.owned) {
    if (value.stage == null && !row.stageEdited && before.stage != null) value.stage = before.stage
    if (value.awakened == null && !row.awakenedEdited && before.awakened != null) value.awakened = before.awakened
  }
  return value
}

export function buildOperatorReviewCorrection(review, rows, recordId, now, catalog, current) {
  const { record } = operatorReviewSource(review)
  const selected = rows.filter(row => row.included && row.pending && row.supported)
  if (!selected.length) return null
  for (const row of selected) {
    const error = operatorReviewRowError(row, rows, catalog, current)
    if (error) throw new Error(row.label + '：' + error)
  }
  const entry = { operator_id: review.operator_id }
  for (const row of selected) {
    if (row.key) {
      entry.combat_stats ||= { oddities: {} }
      entry.combat_stats.oddities[row.key] = { current: Number(row.value) }
    } else entry[row.id] = row.kind === 'number' ? Number(row.value) : row.kind === 'huaji' ? operatorReviewHuajiValue(row, current, catalog) : clone(row.value)
  }
  if (entry.combat_stats) entry.section_status = { oddities: selected.filter(row => row.key).length === 3 ? 'ready' : 'partial' }
  // A manual correction records today's confirmation, while the original scan stays untouched.
  return { ...clone(review.document), version: 4, exported_at: now,
    accounts: clone(review.document.accounts || []).filter(account => account.id === record.account_id), records: [{
    record_id: recordId, account_id: record.account_id, record_type: 'operator_snapshot', game: record.game,
    effective_at: now, snapshot_scope: 'listed', source_kind: 'manual', entries: [entry],
  }] }
}

export function operatorReviewReceiptItem(response, review, document) {
  if (!Array.isArray(response?.items) || response.items.length !== 1) return null
  const item = response.items[0]
  return item.accountId === review.account_id && item.operatorId === review.operator_id &&
    item.recordId === document.records[0].record_id ? item : null
}

export function operatorReviewCanClose(response, review, document, complete) {
  const item = operatorReviewReceiptItem(response, review, document)
  return !!(complete && item && ['accepted', 'unchanged'].includes(item.status) &&
    !item.blockingErrors.length && !item.warnings.some(issue => /requires_review/.test(issue.code))
  )
}

export function operatorReviewDiagnostic(review) {
  const { entry } = operatorReviewSource(review)
  const fields = new Set(['level', 'elite', 'huaji', 'star_level', 'combat_stats', 'disc_loadouts', 'equipped_star_stones', 'match'])
  return JSON.stringify({
    version: review.document.version, status: ['review', 'rejected'].includes(review.status) ? review.status : 'unknown',
    fields: Object.keys(entry).filter(key => fields.has(key)),
    issues: operatorReviewIssues(review).map(issue => ({
      code: /^[a-z_]{1,80}$/.test(issue.code || '') ? issue.code : '[已脱敏]',
      field: operatorReviewField(issue) || '[其他字段]',
    })),
  }, null, 2)
}
