import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarAnchorDate, calendarDates, calendarDeadline, calendarRequestRange, calendarView, calendarViewQuery, monthCalendarDays, monthGridRange, shiftCalendarMonth, timelineItemPosition, timelineLanes, timelineRange } from '../src/data/activityCalendar.js'

const today = '2026-10-03'
const item = (patch = {}) => ({ id: 'a', start_date: '2026-09-30', end_date: '2026-10-04', ...patch })

test('视图按URL、本地偏好、首次宽度优先级解析，拒绝原型属性与重复参数后项', () => {
  assert.equal(calendarView({ view: 'month' }, 'agenda', true), 'month')
  assert.equal(calendarView({ view: ['timeline', 'month'] }, 'agenda'), 'timeline')
  assert.equal(calendarView({ view: 'toString' }, 'month'), 'month')
  assert.equal(calendarView({}, 'constructor', true), 'timeline')
  assert.equal(calendarView({ view: 'invalid' }, '', false), 'agenda')
})

test('合法锚点与无效日期安全退化到服务器今天', () => {
  assert.equal(calendarAnchorDate({ date: ['2028-02-29', '2026-01-01'] }, today), '2028-02-29')
  for (const date of ['2026-02-29', '2026-13-01', '2026-10-3', '0000-01-01', undefined]) assert.equal(calendarAnchorDate({ date }, today), today)
})

test('view/date patch保留筛选和无关参数；今天和无效日期清理', () => {
  const query = { game: '如鸢', category: 'SHOP', ref: 'shared', view: 'agenda', date: '2026-10-05' }
  assert.deepEqual(calendarViewQuery(query, { view: 'month' }, today), { ...query, view: 'month' })
  assert.deepEqual(calendarViewQuery(query, { date: today }, today), { game: '如鸢', category: 'SHOP', ref: 'shared', view: 'agenda' })
  assert.equal(calendarViewQuery(query, { date: '2026-02-30', view: 'invalid' }, today).date, undefined)
  assert.equal(query.date, '2026-10-05')
})

test('三视图请求范围独立；日程固定90天；时间轴35天且跨年', () => {
  assert.deepEqual(calendarRequestRange('agenda', '2026-01-01', today), { from: today, to: '2027-01-01' })
  assert.deepEqual(timelineRange('2027-01-01'), { from: '2026-12-25', to: '2027-01-28' })
  assert.deepEqual(calendarRequestRange('timeline', '2027-01-01', today), timelineRange('2027-01-01'))
  assert.equal(calendarDates(timelineRange(today)).length, 35)
  assert.deepEqual(calendarRequestRange('month', today, today), monthGridRange(today))
})

test('月历周一开头，5/6周覆盖相邻月，闰年和年末', () => {
  assert.deepEqual(monthGridRange('2026-10-03'), { from: '2026-09-28', to: '2026-11-01' })
  assert.deepEqual(monthGridRange('2026-08-12'), { from: '2026-07-27', to: '2026-09-06' })
  assert.equal(calendarDates(monthGridRange('2021-02-01')).length, 35)
  assert.ok(calendarDates(monthGridRange('2028-02-29')).includes('2028-02-29'))
  assert.deepEqual(monthGridRange('2026-12-31'), { from: '2026-11-30', to: '2027-01-03' })
})

test('月导航保留日号且钳制月末，不受浏览器时区影响', () => {
  assert.equal(shiftCalendarMonth('2026-01-31', 1), '2026-02-28')
  assert.equal(shiftCalendarMonth('2028-03-31', -1), '2028-02-29')
  assert.equal(shiftCalendarMonth('2026-12-03', 1), '2027-01-03')
})

test('活动条使用闭区间，单日/跨窗/两端截断/完全不可见', () => {
  const range = { from: '2026-10-01', to: '2026-10-07' }
  assert.deepEqual(timelineItemPosition(item({ start_date: '2026-10-01', end_date: '2026-10-01' }), range), { column: 1, span: 1, clippedStart: false, clippedEnd: false })
  assert.deepEqual(timelineItemPosition(item(), range), { column: 1, span: 4, clippedStart: true, clippedEnd: false })
  assert.deepEqual(timelineItemPosition(item({ start_date: '2026-10-06', end_date: '2026-10-10' }), range), { column: 6, span: 2, clippedStart: false, clippedEnd: true })
  assert.deepEqual(timelineItemPosition(item({ end_date: '2026-10-10' }), range), { column: 1, span: 7, clippedStart: true, clippedEnd: true })
  assert.equal(timelineItemPosition(item({ start_date: '2026-10-08', end_date: '2026-10-09' }), range), null)
  assert.equal(timelineItemPosition(item({ end_date: '2026-09-30' }), range), null)
})

test('月格按闭区间统计跨月活动，边界与去重，空日期不伪造活动', () => {
  const days = monthCalendarDays([item(), item(), item({ id: 'b', start_date: today, end_date: today })], today)
  assert.equal(days.length, 35)
  assert.equal(days[0].inMonth, false)
  assert.equal(days.find(day => day.date === '2026-09-30').items.length, 1)
  assert.equal(days.find(day => day.date === today).items.length, 2)
  assert.equal(days.find(day => day.date === '2026-10-04').items.length, 1)
  assert.equal(days.find(day => day.date === '2026-10-05').items.length, 0)
  assert.equal(monthCalendarDays([], '2026-08-01').length, 42)
})

test('时间轴重叠分轨，同日边界不合并，相邻活动复用轨道且保留所有可见项', () => {
  const range = { from: '2026-10-01', to: '2026-10-07' }
  const values = [
    item({ id: 'later', start_date: '2026-10-05', end_date: '2026-10-07' }),
    item({ id: 'first', start_date: '2026-10-01', end_date: '2026-10-03' }),
    item({ id: 'boundary', start_date: '2026-10-03', end_date: '2026-10-04' }),
    item({ id: 'point', start_date: '2026-10-03', end_date: '2026-10-03' }),
    item({ id: 'outside', start_date: '2026-11-01', end_date: '2026-11-02' }),
  ]
  const lanes = timelineLanes(values, range)
  assert.equal(lanes.length, 3)
  assert.deepEqual(lanes[0].map(entry => entry.item.id), ['first', 'later'])
  assert.deepEqual(lanes.flat().map(entry => entry.item.id).sort(), ['boundary', 'first', 'later', 'point'])
  for (const lane of lanes) for (let i = 1; i < lane.length; i++) {
    assert.ok(lane[i - 1].position.column + lane[i - 1].position.span <= lane[i].position.column)
  }
  assert.deepEqual(timelineLanes(values.slice().reverse(), range), lanes)
  assert.deepEqual(timelineLanes([], range), [])
  assert.equal(values[0].id, 'later')
})

test('跨窗长活动与单日活动分轨，裁切后仍不覆盖或丢失', () => {
  const range = { from: '2026-10-01', to: '2026-10-07' }
  const lanes = timelineLanes([
    item({ id: 'long', start_date: '2026-09-01', end_date: '2026-11-30' }),
    item({ id: 'single', start_date: '2026-10-01', end_date: '2026-10-01' }),
    item({ id: 'next', start_date: '2026-10-02', end_date: '2026-10-02' }),
  ], range)
  assert.deepEqual(lanes.map(lane => lane.map(entry => entry.item.id)), [['long'], ['single', 'next']])
  assert.equal(lanes[0][0].position.span, 7)
})

test('截止提示以服务器日期计算今天/明天/剩余天数与未来开始', () => {
  assert.equal(calendarDeadline(item({ end_date: today }), today), '今天结束')
  assert.equal(calendarDeadline(item(), today), '明天结束')
  assert.equal(calendarDeadline(item({ end_date: '2026-10-06' }), today), '还有 3 天')
  assert.equal(calendarDeadline(item({ start_date: '2026-10-05', end_date: '2026-10-06' }), today), '2 天后开始')
  assert.equal(calendarDeadline(item({ end_date: '2026-10-02' }), today), '')
})
