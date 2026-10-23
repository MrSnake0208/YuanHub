export const DRAW_TICKETS = [
  { id: 'fuchuan', name: '符传' },
  { id: 'tianjifuchuan', name: '天机符传' }
]
const MAX = 2147483647

export function drawResourceChanges({ action, ticketId, quantity, channel }) {
  if (!DRAW_TICKETS.some(ticket => ticket.id === ticketId)) throw new Error('请选择符传类型')
  if (!/^[1-9]\d*$/.test(String(quantity)) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) > MAX) throw new Error('数量须为有效正整数')
  const count = Number(quantity)
  if (action === 'gain') {
    if (!channel.trim() || channel.length > 64 || channel.includes('派遣')) throw new Error('请填写有效的奖励来源')
    return [{ id: ticketId, count }]
  }
  if (action === 'use' && channel === 'use') return [{ id: ticketId, count: -count }]
  if (action !== 'exchange' || !['standard', 'monthly-shop'].includes(channel)) throw new Error('请选择有效的操作与渠道')
  if (channel === 'monthly-shop' && (ticketId !== 'fuchuan' || count % 10 !== 0)) throw new Error('月卡商店每份兑换10张普通符传')
  const cost = channel === 'monthly-shop' ? count / 10 * 1600 : count * 200
  if (cost > MAX) throw new Error('兑换花费超过支持上限')
  return [{ id: 'baijinbi', count: -cost }, { id: ticketId, count }]
}

export function drawResourcePreview(draft, balances) {
  return drawResourceChanges(draft).map(change => {
    const balance = balances?.[change.id]
    const name = change.id === 'baijinbi' ? '白金币' : DRAW_TICKETS.find(ticket => ticket.id === change.id).name
    if (!Number.isInteger(balance) || balance < 0) throw new Error(`请先盘点${name}库存`)
    const after = balance + change.count
    if (after < 0) throw new Error(`${name}库存不足`)
    if (after > MAX) throw new Error(`${name}库存超过支持上限`)
    return { ...change, name, before: balance, after }
  })
}

export function resourceEntrySummary(entries, recordType) {
  return (entries || []).map(entry => {
    const sign = recordType === 'resource_delta' ? (entry.count < 0 ? '−' : '+')
      : recordType === 'reward_delta' ? '+' : recordType === 'consumption_delta' ? '−' : '='
    return (entry.name || entry.id) + sign + (recordType === 'resource_delta' ? Math.abs(entry.count) : entry.count)
  }).join('、')
}
