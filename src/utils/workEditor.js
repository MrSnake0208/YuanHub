const SLOT_ACTIONS = new Set(['attack', 'ultimate', 'defense', 'sp'])
const SLOT_CONDITIONS = new Set(['operator_alive', 'operator_present', 'operator_copied'])
const SIMPLE_ACTIONS = new Set(['pause', 'interaction', 'restart'])
const SIMPLE_CONDITIONS = new Set(['party_survives', 'crit'])
const COMPARISONS = new Set(['<', '<=', '=', '>=', '>'])

export const WORK_ACTION_TYPES = Object.freeze([
  ['attack', '普攻'], ['ultimate', '大招'], ['defense', '防御'], ['sp', 'SP / 圈'],
  ['wait', '等待'], ['pause', '暂停'], ['switch_target', '切换目标'],
  ['auto_battle', '自动战斗'], ['interaction', '关卡互动'],
  ['operator_action', '切换形态'], ['check', '条件检查'], ['restart', '立即重开']
])

export const WORK_CONDITION_TYPES = Object.freeze([
  ['party_survives', '全员存活'], ['operator_alive', '槽位存活'],
  ['operator_present', '槽位仍在场'], ['operator_copied', '鹦鹉复制'],
  ['dragon_qi', '龙气'], ['star_count', '星数量'], ['crit', '暴击']
])

export function createWorkAction(type = 'attack') {
  if (SLOT_ACTIONS.has(type)) return { slot: 1, type }
  if (type === 'wait') return { type, duration_ms: 1000 }
  if (SIMPLE_ACTIONS.has(type)) return { type }
  if (type === 'switch_target') return { type, direction: 'right', count: 1 }
  if (type === 'auto_battle') return { type, enabled: true }
  if (type === 'operator_action') return { type, slot: 1, action: 'switch_form' }
  if (type === 'check') return { type, condition: { type: 'party_survives' }, on_fail: 'restart' }
  return { type }
}

export function createWorkCondition(type = 'party_survives') {
  if (SIMPLE_CONDITIONS.has(type)) return { type }
  if (SLOT_CONDITIONS.has(type)) return { type, slot: 1 }
  if (type === 'dragon_qi') return { type, slot: 1, operator: '>=', value: 1 }
  if (type === 'star_count') return { type, color: 'orange', operator: '>=', value: 1 }
  return { type }
}

export function createEmptyWorkDocument() {
  return {
    format: 'yuanhub-work',
    version: 1,
    game: '如鸢',
    stage_name: '',
    doc: { title: '', details: '' },
    operators: [null, null, null, null, null],
    exec: {
      delays_ms: { attack: 3000, ultimate: 5000, defense: 3000, sp: 5000 },
      extensions: { maayuan: { rec_target_offset: ['', '', '', ''], lantai_nav: '' }, yuanassist: {} }
    },
    rounds: [{ round: 1, remark: '', actions: [createWorkAction()] }]
  }
}

function pick(value, snake, camel) {
  return value && (value[snake] !== undefined ? value[snake] : value[camel])
}

export function hydrateWorkDocument(value) {
  const source = value && typeof value === 'object' ? value : {}
  const exec = source.exec && typeof source.exec === 'object' ? source.exec : {}
  const delays = pick(exec, 'delays_ms', 'delaysMs') || {}
  const extensions = exec.extensions || {}
  const maayuan = extensions.maayuan || {}
  const yuanassist = extensions.yuanassist || {}
  return {
    format: source.format || 'yuanhub-work',
    version: Number(source.version) || 1,
    game: source.game || '如鸢',
    level_id: pick(source, 'level_id', 'levelId') || '',
    stage_name: pick(source, 'stage_name', 'stageName') || '',
    doc: { title: source.doc?.title || '', details: source.doc?.details || '' },
    operators: Array.from({ length: 5 }, function (_, index) { return source.operators?.[index] ?? null }),
    exec: {
      delays_ms: {
        attack: delays.attack ?? '', ultimate: delays.ultimate ?? '',
        defense: delays.defense ?? '', sp: delays.sp ?? ''
      },
      extensions: {
        maayuan: {
          level_type: pick(maayuan, 'level_type', 'levelType') || '',
          recognition_name: pick(maayuan, 'recognition_name', 'recognitionName') || '',
          rec_target_offset: pick(maayuan, 'rec_target_offset', 'recTargetOffset') || ['', '', '', ''],
          difficulty: maayuan.difficulty || '', cave_type: pick(maayuan, 'cave_type', 'caveType') || '',
          lantai_nav: pick(maayuan, 'lantai_nav', 'lantaiNav') ?? ''
        },
        yuanassist: { enemy_turn_wait_ms: pick(yuanassist, 'enemy_turn_wait_ms', 'enemyTurnWaitMs') ?? '' }
      }
    },
    rounds: (Array.isArray(source.rounds) ? source.rounds : []).map(function (round) {
      return {
        round: round.round,
        remark: round.remark || '',
        actions: (Array.isArray(round.actions) ? round.actions : []).map(function (action) {
          const copy = structuredClone(action)
          if (copy.durationMs !== undefined && copy.duration_ms === undefined) copy.duration_ms = copy.durationMs
          if (copy.onFail !== undefined && copy.on_fail === undefined) copy.on_fail = copy.onFail
          delete copy.durationMs
          delete copy.onFail
          return copy
        })
      }
    })
  }
}

function presentNumber(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
}

function compactObject(value) {
  const result = {}
  for (const [key, item] of Object.entries(value || {})) {
    if (item === '' || item === null || item === undefined) continue
    if (Array.isArray(item)) {
      if (item.every(function (entry) { return entry === '' || entry === null || entry === undefined })) continue
      result[key] = item.map(function (entry) { return presentNumber(entry) ? Number(entry) : entry })
    }
    else result[key] = item
  }
  return result
}

export function buildWorkDocument(value) {
  const document = JSON.parse(JSON.stringify(value))
  document.format = 'yuanhub-work'
  document.version = 1
  document.game = String(document.game || '').trim()
  document.stage_name = String(document.stage_name || '').trim()
  document.doc = { title: String(document.doc?.title || '').trim(), details: String(document.doc?.details || '') }
  document.operators = Array.from({ length: 5 }, function (_, index) {
    const operator = document.operators?.[index]
    return operator == null || String(operator).trim() === '' ? null : String(operator).trim()
  })
  if (!String(document.level_id || '').trim()) delete document.level_id
  else document.level_id = String(document.level_id).trim()

  document.rounds = (document.rounds || []).map(function (round) {
    return {
      round: Number(round.round),
      ...(String(round.remark || '').trim() ? { remark: String(round.remark) } : {}),
      actions: (round.actions || []).map(function (action) {
        const next = structuredClone(action)
        if (next.slot !== undefined) next.slot = Number(next.slot)
        if (next.duration_ms !== undefined) next.duration_ms = Number(next.duration_ms)
        if (next.count !== undefined) next.count = Number(next.count)
        if (next.condition?.slot !== undefined && next.condition.slot !== '') next.condition.slot = Number(next.condition.slot)
        if (next.condition?.slot === '') delete next.condition.slot
        if (next.condition?.value !== undefined) next.condition.value = Number(next.condition.value)
        return next
      })
    }
  })

  const delays = compactObject(document.exec?.delays_ms)
  for (const key of Object.keys(delays)) delays[key] = Number(delays[key])
  const maayuan = compactObject(document.exec?.extensions?.maayuan)
  const yuanassist = compactObject(document.exec?.extensions?.yuanassist)
  if (yuanassist.enemy_turn_wait_ms !== undefined) yuanassist.enemy_turn_wait_ms = Number(yuanassist.enemy_turn_wait_ms)
  const extensions = {}
  if (Object.keys(maayuan).length) extensions.maayuan = maayuan
  if (Object.keys(yuanassist).length) extensions.yuanassist = yuanassist
  if (Object.keys(delays).length || Object.keys(extensions).length) {
    document.exec = {}
    if (Object.keys(delays).length) document.exec.delays_ms = delays
    if (Object.keys(extensions).length) document.exec.extensions = extensions
  } else delete document.exec
  return document
}

function integer(value, min, max) {
  return Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
}

export function validateWorkDocument(document, levels = []) {
  const issues = []
  const issue = function (path, message) { issues.push({ path, message }) }
  if (document.format !== 'yuanhub-work') issue('$.format', '必须是 yuanhub-work')
  if (document.version !== 1) issue('$.version', '仅支持版本 1')
  if (!['代号鸢', '如鸢'].includes(document.game)) issue('$.game', '请选择有效游戏')
  if (!String(document.stage_name || '').trim() || String(document.stage_name).length > 256) issue('$.stage_name', '关卡名称必填且不能超过 256 字')
  if (!String(document.doc?.title || '').trim() || String(document.doc?.title).length > 256) issue('$.doc.title', '标题必填且不能超过 256 字')
  if (String(document.doc?.details || '').length > 20000) issue('$.doc.details', '说明不能超过 20000 字')
  if (!Array.isArray(document.operators) || document.operators.length !== 5) issue('$.operators', '阵容必须恰好包含五个槽位')
  else document.operators.forEach(function (operator, index) {
    if (operator !== null && (!String(operator).trim() || String(operator).length > 128)) issue('$.operators[' + index + ']', '密探名称必须为 1 到 128 字')
  })
  if (document.level_id) {
    const level = levels.find(function (item) { return item.id === document.level_id })
    if (!level || level.game !== document.game) issue('$.level_id', '关卡必须存在且属于当前游戏')
  }
  const rounds = Array.isArray(document.rounds) ? document.rounds : []
  if (!rounds.length || rounds.length > 50) issue('$.rounds', '至少需要一个回合，最多 50 个')
  const seen = new Set()
  let actionCount = 0
  rounds.forEach(function (round, roundIndex) {
    const path = '$.rounds[' + roundIndex + ']'
    if (!integer(round.round, 1, 50)) issue(path + '.round', '回合必须是 1 到 50 的整数')
    else if (seen.has(Number(round.round))) issue(path + '.round', '回合编号不能重复')
    else seen.add(Number(round.round))
    if (String(round.remark || '').length > 2000) issue(path + '.remark', '备注不能超过 2000 字')
    if (!Array.isArray(round.actions) || !round.actions.length) issue(path + '.actions', '每个回合至少需要一个动作')
    if (Array.isArray(round.actions) && round.actions.length > 500) issue(path + '.actions', '单回合动作不能超过 500 个')
    actionCount += Array.isArray(round.actions) ? round.actions.length : 0
    ;(round.actions || []).forEach(function (action, actionIndex) {
      validateAction(action, path + '.actions[' + actionIndex + ']', issue, document)
    })
  })
  if (actionCount > 5000) issue('$.rounds', '文档动作总数不能超过 5000 个')
  for (const [key, value] of Object.entries(document.exec?.delays_ms || {})) {
    if (!integer(value, 0, 600000)) issue('$.exec.delays_ms.' + key, '延迟必须是 0 到 600000 的整数')
  }
  const wait = document.exec?.extensions?.yuanassist?.enemy_turn_wait_ms
  if (wait !== undefined && !integer(wait, 0, 600000)) issue('$.exec.extensions.yuanassist.enemy_turn_wait_ms', '敌方回合等待必须是 0 到 600000 的整数')
  const offset = document.exec?.extensions?.maayuan?.rec_target_offset
  if (offset !== undefined && (!Array.isArray(offset) || offset.length !== 4 || offset.some(function (value) { return !Number.isInteger(Number(value)) }))) {
    issue('$.exec.extensions.maayuan.rec_target_offset', '识别偏移必须包含四个整数')
  }
  return issues
}

function validateAction(action, path, issue, document) {
  if (!action || typeof action !== 'object') return issue(path, '动作格式无效')
  if (SLOT_ACTIONS.has(action.type) && !integer(action.slot, 1, 5)) issue(path + '.slot', '槽位必须是 1 到 5')
  else if (action.type === 'wait' && !integer(action.duration_ms, 1, 600000)) issue(path + '.duration_ms', '等待必须是 1 到 600000 毫秒')
  else if (action.type === 'switch_target') {
    if (!['left', 'right'].includes(action.direction)) issue(path + '.direction', '请选择切换方向')
    if (action.count !== undefined && !integer(action.count, 1, 100)) issue(path + '.count', '切换次数必须是 1 到 100')
  } else if (action.type === 'auto_battle' && typeof action.enabled !== 'boolean') issue(path + '.enabled', '自动战斗必须选择开或关')
  else if (action.type === 'operator_action') {
    if (!integer(action.slot, 1, 5)) issue(path + '.slot', '槽位必须是 1 到 5')
    else if (!String(document.operators?.[Number(action.slot) - 1] || '').trim()) issue(path + '.slot', '切换形态引用的槽位不能为空')
    if (action.action !== 'switch_form') issue(path + '.action', '专属动作必须是 switch_form')
  }
  else if (action.type === 'check') {
    validateCondition(action.condition, path + '.condition', issue)
    if (!['restart', 'stop', 'pause'].includes(action.on_fail)) issue(path + '.on_fail', '失败处理无效')
  }
  else if (!WORK_ACTION_TYPES.some(function (option) { return option[0] === action.type })) issue(path + '.type', '未知动作类型')
}

function validateCondition(condition, path, issue) {
  if (!condition || typeof condition !== 'object') return issue(path, '检查条件无效')
  if (SLOT_CONDITIONS.has(condition.type) && !integer(condition.slot, 1, 5)) issue(path + '.slot', '槽位必须是 1 到 5')
  else if (condition.type === 'dragon_qi') {
    if (condition.slot !== undefined && !integer(condition.slot, 1, 5)) issue(path + '.slot', '槽位必须是 1 到 5')
    if (!COMPARISONS.has(condition.operator)) issue(path + '.operator', '比较符无效')
    if (!integer(condition.value, 0, 999)) issue(path + '.value', '龙气必须是 0 到 999 的整数')
  } else if (condition.type === 'star_count') {
    if (!['orange', 'purple', 'blue'].includes(condition.color)) issue(path + '.color', '星颜色无效')
    if (!COMPARISONS.has(condition.operator)) issue(path + '.operator', '比较符无效')
    if (!integer(condition.value, 0, 99)) issue(path + '.value', '星数量必须是 0 到 99 的整数')
  } else if (!SIMPLE_CONDITIONS.has(condition.type) && !SLOT_CONDITIONS.has(condition.type)) issue(path + '.type', '未知条件类型')
}
