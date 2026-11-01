import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarAnchorDate, calendarDates, calendarDeadline, calendarRequestRange, calendarView, calendarViewQuery, monthCalendarDays, monthCalendarWeeks, monthGridRange, shiftCalendarMonth, timelineItemPosition, timelineLanes, timelineRange } from '../src/data/activityCalendar.js'
import { denseMonthItems } from '../test-support/calendarMonthFixtures.js'
import { calendarUpAgentDisplay } from '../src/data/activityCalendarTypes.js'

const today = '2026-10-03'
const item = (patch = {}) => ({ id: 'a', start_date: '2026-09-30', end_date: '2026-10-04', ...patch })

test('UP摘要按两名/首名保序显示余量，完整可访问名称不截断', () => {
  const pool = { source_type: 'RECRUITMENT_POOL', category: 'RECRUITMENT', up_agent_names: ['甲', '乙', '丙'] }
  assert.deepEqual(calendarUpAgentDisplay(pool), { full: 'UP 密探：甲、乙、丙', summary: '甲 / 乙 +1', narrow: '甲 +2' })
  assert.deepEqual(pool.up_agent_names, ['甲', '乙', '丙'])
  for (const patch of [{ up_agent_names: [] }, { up_agent_names: undefined }, { source_type: 'MANUAL' }, { source_type: 'PRIVATE_ITEM' }, { category: 'SHOP' }]) {
    assert.equal(calendarUpAgentDisplay({ ...pool, ...patch }), null)
  }
})

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

test('周条复用闭区间，跨年/跨月/开放结束保留延续信息，不修改输入', () => {
  for (const date of ['2021-02-01', '2026-08-31', '2026-12-31', '2028-02-29', '2026-04-30']) {
    const values = [item({ id: 'long', start_date: '2020-12-01', end_date: null })]
    const before = structuredClone(values)
    const weeks = monthCalendarWeeks(values, date)
    assert.equal(weeks.length, monthCalendarDays([], date).length / 7)
    for (const week of weeks) {
      assert.equal(new Date(week.from + 'T00:00:00Z').getUTCDay(), 1)
      assert.equal(week.segments.length, 1)
      assert.deepEqual(week.segments[0].position, { column: 1, span: 7, clippedStart: true, clippedEnd: true })
      assert.ok(week.days.every(day => day.items.length === 1 && day.hiddenCount === 0))
    }
    assert.deepEqual(values, before)
  }
})

test('密集周有限层数、逐日隐藏ID计数准确、重排和重复不影响布局', () => {
  const values = denseMonthItems()
  for (const maxRows of [3, 4]) {
    const weeks = monthCalendarWeeks([...values, values[0]], '2026-10-15', maxRows)
    assert.deepEqual(weeks, monthCalendarWeeks(values.slice().reverse(), '2026-10-15', maxRows))
    const selected = weeks.flatMap(week => week.days).find(day => day.date === '2026-10-15')
    assert.equal(selected.items.length, 12)
    assert.equal(selected.hiddenCount, 12 - maxRows)
    for (const week of weeks) {
      assert.ok(week.rowCount <= maxRows)
      assert.equal(new Set(week.segments.map(entry => entry.item.id)).size, week.segments.length)
      for (const row of Array.from({ length: maxRows }, (_, index) => index)) {
        const entries = week.segments.filter(entry => entry.row === row).sort((a, b) => a.position.column - b.position.column)
        for (let i = 1; i < entries.length; i++) assert.ok(entries[i - 1].position.column + entries[i - 1].position.span <= entries[i].position.column)
      }
      week.days.forEach((day, index) => {
        const visible = week.segments.filter(entry => entry.position.column <= index + 1 && entry.position.column + entry.position.span > index + 1)
        assert.equal(day.items.length, day.hiddenCount + visible.length)
      })
    }
    for (let i = 1; i < weeks.length; i++) {
      for (const entry of weeks[i].segments) {
        const previous = weeks[i - 1].segments.find(other => other.item.id === entry.item.id)
        if (previous && weeks[i - 1].rowCount === weeks[i].rowCount) assert.equal(entry.row, previous.row)
      }
    }
  }
})

test('空周不留空轨，单日与同日边界不能共轨，结束后压缩空轨', () => {
  assert.ok(monthCalendarWeeks([], today).every(week => week.rowCount === 0 && week.segments.length === 0 && week.days.every(day => day.hiddenCount === 0)))
  const weeks = monthCalendarWeeks([
    item({ id: 'short', start_date: '2026-09-28', end_date: '2026-10-01' }),
    item({ id: 'point', start_date: '2026-10-01', end_date: '2026-10-01' }),
    item({ id: 'later', start_date: '2026-10-01', end_date: '2026-10-12' }),
  ], today)
  assert.equal(weeks[0].rowCount, 3)
  assert.equal(weeks[0].segments.find(entry => entry.item.id === 'point').position.span, 1)
  assert.equal(weeks[1].rowCount, 1)
  assert.equal(weeks[1].segments[0].row, 0)
})

test('重复ID首项与当天清单一致，后续副本不制造额外跨度', () => {
  const first = item({ start_date: today, end_date: today })
  const duplicate = { ...first, title: '重复副本', end_date: '2026-10-31' }
  const weeks = monthCalendarWeeks([first, duplicate], today)
  assert.equal(weeks.flatMap(week => week.segments).length, 1)
  assert.equal(weeks[0].segments[0].position.span, 1)
  assert.equal(weeks[0].days.find(day => day.date === today).items[0], first)
})
