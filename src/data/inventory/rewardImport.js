import { validateInventoryRecord } from './exchange.js'

const MAX_COUNT = 2147483647
const START = '========== MaaYuan 库存记录 =========='
const END = '========== 记录结束 =========='
const MARKER = '#@MaaYInventoryRefV2 '

function requireText(value, label, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${label}不能为空，且不能超过 ${max} 个字符`)
  }
  return value
}

export function validateRewardTime(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/)
  if (!match || !Number.isFinite(Date.parse(value))) throw new TypeError('发生时间无效，必须包含时区')
  const day = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  if (day.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new TypeError('发生日期无效')
  return value
}

export function validateRewardRecord(record, accountId, entities) {
  if (!accountId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(accountId)) throw new TypeError('请先选择有效的子账号')
  if (record.account_id && record.account_id !== accountId) throw new TypeError(`记录属于账号 ${record.account_id}，请切换到对应子账号`)
  requireText(record.record_id, '原始记录 ID')
  if (record.record_type !== 'reward_delta') throw new TypeError('此入口仅补录奖励流水，库存快照请使用数据交换')
  if (!['item', 'agent'].includes(record.entity_type)) throw new TypeError('奖励类型必须为道具或心纸')
  if ('snapshot_scope' in record) throw new TypeError('奖励流水不能包含库存快照范围')
  validateRewardTime(record.effective_at)
  if (record.acquisition_channel !== undefined) requireText(record.acquisition_channel, '获取渠道', 64)
  if (!Array.isArray(record.entries) || !record.entries.length) throw new TypeError('请至少添加一项奖励')
  const seen = new Set()
  for (const entry of record.entries) {
    if (!entry || !entities.some(entity => entity.entity_type === record.entity_type && entity.id === entry.id)) {
      throw new TypeError(`无法识别奖励：${entry?.name || entry?.id || '未选择'}`)
    }
    if (seen.has(entry.id)) throw new TypeError(`奖励重复：${entry.name || entry.id}，请合并数量`)
    seen.add(entry.id)
    if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > MAX_COUNT) throw new TypeError(`${entry.name || entry.id}：数量必须为 1 至 ${MAX_COUNT} 的整数`)
  }
  validateInventoryRecord(record)
  return { ...record, account_id: accountId }
}

export function buildRewardDocument(records, accountId, entities, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 1000) throw new TypeError('每次请选择 1 至 1000 条奖励流水')
  const validated = records.map(record => validateRewardRecord(record, accountId, entities))
  const seen = new Set()
  for (const record of validated) {
    if (seen.has(record.record_id)) throw new TypeError(`同批记录 ID 重复：${record.record_id}，请只选择一条`)
    seen.add(record.record_id)
  }
  return {
    format: 'myshare-inventory-exchange', version: 2, exported_at: exportedAt,
    producer: { platform: 'yuanhub', version: '1' }, records: validated,
  }
}

function parseBlock(block, entities) {
  const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
  const field = (label) => {
    const matches = lines.filter(line => line.startsWith(`${label}：`))
    if (matches.length > 1) throw new TypeError(`${label}出现多次`)
    return matches[0]?.slice(label.length + 1)
  }
  if (!lines.includes(END) || lines.at(-1) !== END) throw new TypeError('记录不完整或结束标记之后包含无法识别的内容')
  const kind = field('类型')
  if (kind === '库存快照') return { skipped: true }
  if (kind !== '奖励增量') throw new TypeError('无法识别记录类型')
  const references = lines.filter(line => line.startsWith(MARKER))
  if (references.length !== 1) throw new TypeError('缺少或重复的原始记录 ID 标记，无法安全去重')
  let reference
  try { reference = JSON.parse(references[0].slice(MARKER.length)) } catch { throw new TypeError('原始记录 ID 标记不是有效 JSON') }
  if (!reference || !Array.isArray(reference.r)) throw new TypeError('原始记录 ID 列表无效')
  const account = field('子账号ID')
  if (account && reference.a && account !== reference.a) throw new TypeError('报告的子账号 ID 与原始标记不一致')
  const staminaText = field('消耗体力')
  if (staminaText !== undefined && !/^\d+$/.test(staminaText)) throw new TypeError('消耗体力必须为非负整数')
  const stamina = staminaText === undefined ? reference.c : Number(staminaText)
  if (staminaText !== undefined && reference.c !== undefined && stamina !== reference.c) throw new TypeError('报告的消耗体力与原始标记不一致')
  if (reference.s !== undefined) throw new TypeError('奖励流水不能包含库存快照范围')
  const groups = []
  let group = null
  for (const line of lines) {
    if (line === '道具：' || line === '密探：') {
      const entityType = line === '道具：' ? 'item' : 'agent'
      if (groups.some(item => item.entity_type === entityType)) throw new TypeError('同一记录的奖励分组重复')
      group = { entity_type: entityType, entries: [] }
      groups.push(group)
    } else if (line.startsWith('以下内容供导入工具使用') || line.startsWith(MARKER) || line === END) {
      group = null
    } else if (group) {
      const match = line.match(/^(.+?)\s+×\s+(\d+)$/)
      if (!match) throw new TypeError(`无法解析奖励行：${line}`)
      const name = match[1].trim()
      const matches = entities.filter(entity => entity.entity_type === group.entity_type && (entity.name === name || entity.id === name))
      if (matches.length !== 1) throw new TypeError(`奖励「${name}」${matches.length ? '存在多个匹配' : '不在当前目录中'}，无法确定 ID`)
      group.entries.push({ id: matches[0].id, name, count: Number(match[2]) })
    }
  }
  if (!groups.length || groups.length !== reference.r.length) throw new TypeError('奖励分组与原始记录 ID 数量不一致')
  return {
    status: field('上报状态') || '未注明上报状态',
    records: groups.map((item, index) => ({
      ...item, record_id: reference.r[index], record_type: 'reward_delta',
      effective_at: field('时间'), acquisition_channel: field('渠道'),
      ...(account || reference.a ? { account_id: account || reference.a } : {}),
      ...(stamina !== undefined ? { stamina_cost: stamina } : {}),
    })),
  }
}

/** Parse without writing: invalid blocks stay visible and cannot be selected. */
export function parseRewardReport(text, accountId, entities) {
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!source) throw new TypeError('请选择报告文件或粘贴报告内容')
  let candidates
  if (source.startsWith('{')) {
    let document
    try { document = JSON.parse(source) } catch { throw new TypeError('JSON 解析失败，请检查报告格式') }
    if (document.format !== 'myshare-inventory-exchange' || document.version !== 2 || !Array.isArray(document.records)) throw new TypeError('仅支持库存交换 v2 JSON 或 MaaYuan TXT 报告')
    if ('user_id' in document) throw new TypeError('交换档案不能携带 user_id')
    candidates = document.records.map(record => () => record?.record_type === 'stock_snapshot'
      ? { skipped: true } : { records: [record], status: 'JSON 未注明上报状态' })
  } else {
    const blocks = source.split(START)
    if (blocks.shift().trim() || !blocks.length) throw new TypeError('未识别到 MaaYuan 库存记录，请选择 DailyRewards TXT 或库存交换 v2 JSON')
    candidates = blocks.map(block => () => parseBlock(block.trim(), entities))
  }
  const rows = []
  let skipped = 0
  const seen = new Set()
  candidates.forEach((read, index) => {
    try {
      const parsed = read()
      if (parsed.skipped) { skipped++; return }
      // A mixed block is validated atomically: never silently import only half a report.
      const records = parsed.records.map(record => validateRewardRecord(record, accountId, entities))
      const localIds = new Set()
      for (const record of records) {
        if (localIds.has(record.record_id)) throw new TypeError('同一记录块内出现重复的原始记录 ID')
        localIds.add(record.record_id)
      }
      for (const record of records) {
        const duplicate = seen.has(record.record_id)
        seen.add(record.record_id)
        rows.push({
          key: `${index}:${record.record_id}`, block: index + 1, record, status: parsed.status,
          selected: !duplicate && parsed.status.includes('上报失败'),
          error: duplicate ? '文件内记录 ID 重复，请保留首次出现的记录' : '',
        })
      }
    } catch (error) {
      rows.push({ key: `error:${index}`, block: index + 1, selected: false, error: error.message })
    }
  })
  return { rows, skipped }
}
