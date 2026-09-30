import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResourceBalance, resourceRangeDates, resourceDayNumber, resourceCalendarValue, DRAW_RESOURCES } from '../src/data/inventory/resourceBalance.js'
const record = (id, day, type, entries, scope) => ({ record_id: id, entity_type: 'item', effective_at: `2026-08-${day}T12:00:00+08:00`, record_type: type, snapshot_scope: scope, entries })
const coin = count => ({ id: 'baijinbi', count })
const build = records => buildResourceBalance(records, '2026-08-01', '2026-08-31')
test('含茱萸按两个独立库存基线折算，兑换茱萸不会凭空增加等价值', () => {
  const rows = [record('a', '01', 'stock_snapshot', [coin(100), { id: 'zhuyu', count: 2 }], 'listed'),
    record('b', '02', 'reward_delta', [{ id: 'zhuyu', count: 1 }]),
    record('c', '03', 'stock_snapshot', [coin(150), { id: 'zhuyu', count: 2 }], 'listed')]
  const equivalent = buildResourceBalance(rows, '2026-08-01', '2026-08-31', true)[0]
  assert.deepEqual(equivalent.points.map(p => [p.stock, p.delta]), [[200, null], [250, 50], [250, 0]])
  assert.deepEqual(equivalent.latest.components, { baijinbi: 150, zhuyu: 2 })
  assert.equal(equivalent.net, 50)
  assert.equal(build(rows)[0].latest.stock, 150)
})
test('茱萸仅有奖励不能当库存零值，必须等盘点；完整快照缺项才是观测为零', () => {
  const rows = [record('a', '01', 'stock_snapshot', [coin(100)], 'listed'),
    record('b', '02', 'reward_delta', [{ id: 'zhuyu', count: 2 }]),
    record('c', '03', 'stock_snapshot', [{ id: 'zhuyu', count: 0 }], 'listed')]
  const first = buildResourceBalance(rows.slice(0, 2), '2026-08-01', '2026-08-31', true)[0]
  assert.equal(first.latest, null)
  assert.equal(first.missingDays, 1)
  const complete = buildResourceBalance(rows, '2026-08-01', '2026-08-31', true)[0]
  assert.deepEqual(complete.points.map(p => [p.day, p.stock]), [['2026-08-03', 100]])
  assert.equal(buildResourceBalance([record('d', '01', 'stock_snapshot', [coin(100)], 'full')], '2026-08-01', '2026-08-31', true)[0].latest.stock, 100)
})
test('draw resource colors keep the report legend mapping stable', () => {
  assert.deepEqual(DRAW_RESOURCES.map(resource => [resource.id, resource.color]), [
    ['baijinbi', '#719eaf'],
    ['fuchuan', '#785454'],
    ['tianjifuchuan', '#d5a064']
  ])
})
test('requires a snapshot, preserves missing days, and calculates cross-day net changes', () => {
  const rows = [record('a', '01', 'reward_delta', [coin(50)]), record('b', '03', 'stock_snapshot', [coin(100)], 'listed'), record('c', '05', 'reward_delta', [coin(20)]), record('d', '09', 'stock_snapshot', [coin(80)], 'listed')]
  const result = build(rows.reverse())[0]
  assert.deepEqual(result.points.map(p => [p.day, p.stock, p.delta]), [['2026-08-03', 100, null], ['2026-08-05', 120, 20], ['2026-08-09', 80, -40]])
  assert.equal(result.net, -20)
  assert.equal(build(rows)[1].latest, null)
})
test('full snapshots clear omitted resources, listed snapshots preserve them, zero is observed', () => {
  const result = build([record('a', '01', 'stock_snapshot', [coin(100)], 'full'), record('b', '02', 'stock_snapshot', [{ id: 'fuchuan', count: 5 }], 'listed'), record('c', '03', 'stock_snapshot', [], 'full')])
  assert.deepEqual(result[0].points.map(p => p.stock), [100, 0])
  assert.deepEqual(result[1].points.map(p => p.stock), [0, 5, 0])
})
test('same-time reward precedes snapshot, daily point uses final stock, duplicate records counted once', () => {
  const reward = record('b', '02', 'reward_delta', [coin(20)])
  const result = build([record('c', '02', 'stock_snapshot', [coin(90)], 'listed'), reward, record('a', '01', 'stock_snapshot', [coin(100)], 'listed'), reward])[0]
  assert.equal(result.latest.stock, 90)
  assert.equal(result.net, -10)
})
test('does not turn reward-only records or out-of-range snapshots into inventory', () => {
  const result = build([record('a', '01', 'reward_delta', [coin(30)]), { ...record('b', '01', 'stock_snapshot', [coin(100)], 'full'), effective_at: '2026-07-31T12:00:00+08:00' }])
  assert.equal(result[0].latest, null)
  assert.equal(result[0].net, null)
})

test('selected ranges span months, years and leap days without extra dates', () => {
  assert.deepEqual(resourceRangeDates('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  assert.deepEqual(resourceRangeDates('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01'])
  assert.deepEqual(resourceRangeDates('2026-08-01', '2026-08-01'), ['2026-08-01'])
  assert.deepEqual(resourceRangeDates('2026-08-02', '2026-08-01'), [])
  assert.equal(resourceDayNumber('2027-01-02') - resourceDayNumber('2026-12-31'), 2)
})
test('calendar preserves last known stock without inventing daily changes or future baselines', () => {
  const points = [{ day: '2026-08-02', stock: 0, delta: null }, { day: '2026-08-05', stock: 20, delta: 20 }]
  assert.deepEqual(resourceCalendarValue(points, '2026-08-01'), { stock: null, delta: null, recordedDay: null })
  assert.deepEqual(resourceCalendarValue(points, '2026-08-02'), { stock: 0, delta: null, recordedDay: '2026-08-02' })
  assert.deepEqual(resourceCalendarValue(points, '2026-08-04'), { stock: 0, delta: null, recordedDay: '2026-08-02' })
  assert.deepEqual(resourceCalendarValue(points, '2026-08-05'), { stock: 20, delta: 20, recordedDay: '2026-08-05' })
  assert.deepEqual(resourceCalendarValue(points, '2026-08-06'), { stock: 20, delta: null, recordedDay: '2026-08-05' })
})
