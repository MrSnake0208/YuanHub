import { operatorHuaji } from './operatorHuaji.js'

function numericSortValue(entry, mode) {
  const raw = mode === 'star' ? operatorHuaji(entry).stage : entry[mode]
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  if (typeof raw === 'string' && !raw.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

// 仅比较四种显式排序；默认模式仍由页面的 compareCurrentEntries 处理。
export function compareOperatorEntries(a, b, mode, direction = 'desc') {
  if (!['rarity', 'level', 'elite', 'star'].includes(mode)) throw new RangeError('不支持的密探排序字段')
  if (!['asc', 'desc'].includes(direction)) throw new RangeError('不支持的密探排序方向')

  const aValue = numericSortValue(a, mode)
  const bValue = numericSortValue(b, mode)
  if (aValue == null && bValue != null) return 1
  if (aValue != null && bValue == null) return -1
  if (aValue != null && bValue != null && aValue !== bValue) {
    return direction === 'asc' ? aValue - bValue : bValue - aValue
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
