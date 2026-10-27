// 两种呈现消费相同的只读记录与父页格式化函数。
export const recordsViewProps = {
  recordsList: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  fmtTime: { type: Function, required: true },
  entrySummary: { type: Function, required: true },
  iconSrc: { type: Function, required: true },
  stockEffectLabel: { type: Function, required: true },
  staminaCostOf: { type: Function, required: true },
}

export function recordTypeLabel(type) {
  if (type === 'reward_delta') return '实时奖励'
  if (type === 'consumption_delta') return '升级消耗'
  if (type === 'resource_delta') return '资源使用 / 兑换'
  if (type === 'stock_snapshot') return '库存更新'
  return type ? `未知类型（${type}）` : '未知类型'
}

export function entityTypeLabel(type) {
  if (type === 'agent') return '心纸'
  if (type === 'item') return '道具'
  return type ? `未知对象（${type}）` : '未知对象'
}
