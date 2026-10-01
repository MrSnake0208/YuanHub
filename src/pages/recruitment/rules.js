export const MAX_PULLS = 1_000_000_000
export const MAX_EVENT_PULLS = 40
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

export function operatorCatalogEntries(data) {
  if (!Array.isArray(data?.operators)) throw new Error('公共密探图鉴响应无效，请刷新重试')
  return data.operators.map(operator => ({
    ...operator,
    avatar: operator.avatar || operator.avatar_url || ''
  }))
}
export function recruitmentPoolCatalog(pool, catalog) {
  const snapshot = pool?.mapped_snapshot || pool?.snapshot
  return catalog.find(item => item.pool_id === snapshot?.catalog_pool_id)
}
export function poolAgentOptions(pool, catalog, operators) {
  const directory = recruitmentPoolCatalog(pool, catalog)
  const snapshot = pool?.mapped_snapshot || pool?.snapshot
  const slots = directory?.up_agents || snapshot?.up_agents || []
  const upOperators = new Set(slots.filter(slot => slot.active !== false).map(slot => slot.operator_id).filter(Boolean))
  return slots.filter(slot => slot.active !== false).map(slot => {
    const operator = operators.find(item => item.id === slot.operator_id)
    return { ...operator, id: slot.id, operator_id: slot.operator_id, name: operator?.name || slot.name, placeholder: !slot.operator_id, poolSlot: true }
  }).concat(operators.filter(operator => !upOperators.has(operator.id)))
}
export function resolveRecruitmentAgent(event, pool, catalog, operators) {
  const snapshot = event.agent_snapshot
  const directory = recruitmentPoolCatalog(pool, catalog)
  const slot = (directory?.up_agents || pool?.snapshot?.up_agents || []).find(item => item.id === snapshot.agent_id)
  const operator = operators.find(item => item.id === (slot?.operator_id || snapshot.operator_id || snapshot.agent_id))
  return { ...snapshot, ...operator, id: snapshot.agent_id, operator_id: slot?.operator_id || snapshot.operator_id || operator?.id || null, name: operator?.name || slot?.name || snapshot.name, placeholder: !!slot && !slot.operator_id }
}

export function integer(value, label, { positive = false, nullable = false } = {}) {
  if ((typeof value === 'string' && !value.trim()) || value == null) {
    if (nullable) return null
    throw new Error('请填写' + label)
  }
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(label + '须为整数')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < (positive ? 1 : 0) || number > MAX_PULLS) throw new Error(label + '须为' + (positive ? '正' : '非负') + '整数，最多十亿')
  return number
}
export function progressFromRemaining(value) {
  const remaining = integer(value, '剩余次数')
  if (remaining < 1 || remaining > 40) throw new Error('剩余次数须为 1–40')
  return 40 - remaining
}
export function blankEntry() { return { agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: '', note: '' } }
export function entryInput(entry) {
  if (!entry.agent_id) throw new Error('请选择绝密密探')
  const pullSpan = integer(entry.pull_span, '出货抽数', { positive: true, nullable: true })
  if (pullSpan != null && pullSpan > MAX_EVENT_PULLS) throw new Error('出货抽数须为 1–40')
  return { ...(entry.event_id ? { event_id: entry.event_id } : {}), agent_id: entry.agent_id, pull_span: pullSpan, up_status: entry.up_status || 'unknown', acquired_date: entry.acquired_date || null, note: entry.note || null }
}
// Positions are visible within the window; its first result has no known preceding absolute.
export function fromWindowPositions(entries, windowLength, previousKnown, precedingPulls) {
  const length = integer(windowLength, '记录窗口抽数', { positive: true })
  if (length > 120) throw new Error('记录窗口最多 120 抽')
  const prior = previousKnown ? integer(precedingPulls, '窗口前已抽次数') : null
  let last = 0
  const converted = entries.map((entry, index) => {
    const position = integer(entry.position, '窗口内位置', { positive: true })
    if (position <= last || position > length) throw new Error('位置须按从旧到新递增，且不超出窗口')
    const span = index === 0 ? (prior == null ? null : prior + position) : position - last
    last = position
    return { ...entryInput({ ...entry, pull_span: span }), pull_span: span }
  })
  return { entries: converted, tail_progress: length - last }
}
export function csvCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
export function recruitmentCsv({ accountId, accountName, game, baseline, pools, events, batches }) {
  const rows = [['类型', '账号ID', '账号名称', '游戏', '稳定ID', '卡池', '密探', '记录抽数', '计入已知累计抽数', '当前进度', 'UP', '获得日期', '备注', '来源', '批次ID', '已删除', '录入时间', '修改时间', '导入时间']]
  const prefix = type => [type, accountId, accountName, game]
  rows.push([...prefix('baseline'), 'baseline', '', '', baseline, baseline, '', '', '', '', '', '', '', '', '', ''])
  for (const pool of pools) rows.push([...prefix('pool_state'), pool.pool_id, pool.mapped_snapshot?.name || pool.snapshot.name, '', '', pool.progress, pool.progress, '', '', '', '', '', '', '', '', ''])
  const poolSnapshots = new Map(pools.map(pool => [pool.pool_id, pool.mapped_snapshot || pool.snapshot]))
  for (const batch of batches) rows.push([...prefix('batch'), batch.batch_id, poolSnapshots.get(batch.pool_id)?.name || batch.pool_id, '', batch.total_pull_count, batch.deleted_at ? 0 : batch.total_pull_count, '', '', '', '', '', batch.batch_id, batch.deleted_at, batch.created_at, '', batch.imported_at])
  for (const event of events) {
    const agentName = poolSnapshots.get(event.pool_id)?.up_agents?.find(slot => slot.id === event.agent_snapshot.agent_id)?.name || event.agent_snapshot.name
    rows.push([...prefix('event'), event.event_id, event.pool_snapshot.name, agentName, event.pull_span, event.deleted_at || event.batch_id ? 0 : event.pull_span, '', event.up_status, event.acquired_date, event.note, event.source, event.batch_id, event.deleted_at, event.created_at, event.updated_at, event.imported_at])
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
export function downloadFile(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
