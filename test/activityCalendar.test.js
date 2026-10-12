import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_CATEGORIES, CALENDAR_ENDING_WINDOW_MS, addCalendarDays, calendarTimeBounds, filterCalendarItems, nextCalendarBoundary, calendarFilterQuery, calendarFilters, calendarForm, calendarPayload, calendarRangeLabel, calendarStatuses, groupCalendarItems, isCalendarDate, millisecondsUntilServerMidnight, normalizeCalendarItem, normalizeCalendarItems, serverToday, summarizeCalendarDay, validateCalendarForm } from '../src/data/activityCalendar.js'
import { FEATURE_FLAGS, FEATURE_KEYS } from '../src/config/features.js'
import { isRouteAccessAllowed, needsAdminAccess } from '../src/utils/routeAccess.js'
import { routes } from '../src/router/routes.js'

const item = (patch = {}) => ({ id: 'evt-a', game: '如鸢', title: ' 活动 ', category: 'ACTIVITY', source_type: 'MANUAL', start_date: '2026-10-03', end_date: '2026-10-10', ...patch })

test('公共招募UP名单兼容旧接口、去空去重，只接收已投影的snake_case字段', () => {
  const pool = item({ source_type: 'RECRUITMENT_POOL', category: 'RECRUITMENT', source_ref: 'pool-a' })
  for (const names of [undefined, null, '甲', {}, []]) {
    assert.deepEqual(normalizeCalendarItem({ ...pool, up_agent_names: names }).up_agent_names, [])
  }
  const normalized = normalizeCalendarItem({ ...pool, up_agent_names: [' 甲 ', '乙', '', ' ', null, 42, '甲'], source_up_agent_names: ['候选'], upAgentNames: ['错误别名'] })
  assert.deepEqual(normalized.up_agent_names, ['甲', '乙'])
  assert.equal(normalized.title, '活动')
  assert.equal(normalized.source_ref, 'pool-a')
  assert.equal(normalized.start_date, pool.start_date)
  assert.equal(normalized.end_date, pool.end_date)
  assert.deepEqual(normalizeCalendarItem({ ...pool, source_up_agent_names: ['候选'] }).up_agent_names, [])
  assert.deepEqual(normalizeCalendarItem(item({ up_agent_names: ['甲'] })).up_agent_names, [])
  assert.deepEqual(normalizeCalendarItem({ ...pool, category: 'SHOP', up_agent_names: ['甲'] }).up_agent_names, [])
  assert.equal(normalizeCalendarItem({ ...pool, source_type: 'PRIVATE_ITEM', up_agent_names: ['甲'] }), null)
})

test('某日摘要：同日开始结束各计一次，严格跨日进行中，total按活动id去重', () => {
  const today = '2026-10-03'
  const sameDay = item({ end_date: today })
  assert.deepEqual(summarizeCalendarDay([sameDay, { ...sameDay }], today), { starts: 1, ends: 1, ongoing: 0, total: 1 })
  const ongoing = item({ id: 'ongoing', start_date: '2026-10-02' })
  assert.deepEqual(summarizeCalendarDay([ongoing], today), { starts: 0, ends: 0, ongoing: 1, total: 1 })
  assert.deepEqual(summarizeCalendarDay([
    sameDay, ongoing, { ...ongoing }, item({ id: 'starts' }),
    item({ id: 'ends', start_date: '2026-10-01', end_date: today }),
    item({ id: 'future', start_date: '2026-10-04' }),
    item({ id: 'past', start_date: '2026-10-01', end_date: '2026-10-02' }),
  ], today), { starts: 2, ends: 2, ongoing: 1, total: 4 })
  assert.deepEqual(summarizeCalendarDay([], today), { starts: 0, ends: 0, ongoing: 0, total: 0 })
})

test('服务器日期不受用户时区影响，跨 UTC 午夜、年末与闰日正确', () => {
  assert.equal(serverToday(new Date('2026-10-02T15:59:59Z')), '2026-10-02')
  assert.equal(serverToday(new Date('2026-10-02T16:00:00Z')), '2026-10-03')
  assert.equal(serverToday(new Date('2026-12-31T20:00:00-05:00')), '2027-01-01')
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addCalendarDays('2026-10-03', 90), '2027-01-01')
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(millisecondsUntilServerMidnight(new Date('2026-10-02T15:59:59Z')), 1000)
  assert.equal(millisecondsUntilServerMidnight(new Date('2026-12-31T16:00:00Z')), 86400000)
})

test('normalize保留snake_case来源事实，拒绝非法项、危险链接，不伪造时间', () => {
  const normalized = normalizeCalendarItem(item({ source_url: 'javascript:alert(1)', start_time: '09:00' }))
  assert.equal(normalized.title, '活动')
  assert.equal(normalized.source_url, '')
  assert.equal(normalized.start_time, null)
  assert.equal(normalized.end_time, null)
  assert.equal(normalized.time_zone, 'Asia/Shanghai')
  const recruitment = normalizeCalendarItem(item({ id: 'recruitment:pool-a', source_type: 'RECRUITMENT_POOL', source_ref: 'pool-a', category: 'RECRUITMENT', start_time: '09:00', end_time: '12:00', source_url: 'https://example.com/notice' }))
  assert.equal(recruitment.source_ref, 'pool-a')
  assert.equal(recruitment.start_time, '09:00')
  assert.match(calendarRangeLabel(recruitment), /09:00.*12:00/)
  assert.equal(normalizeCalendarItems([null, item({ game: 'unknown' }), item({ start_date: '2026-02-30' }), item({ end_date: '2026-10-01' }), recruitment]).length, 1)
})

test('今日开始/结束可同时出现，进行中、未来、历史有明确文字', () => {
  assert.deepEqual(calendarStatuses(item(), '2026-10-03'), ['今日开始'])
  assert.deepEqual(calendarStatuses(item(), '2026-10-10'), ['今日结束'])
  assert.deepEqual(calendarStatuses(item({ end_date: '2026-10-03' }), '2026-10-03'), ['今日结束', '今日开始'])
  assert.deepEqual(calendarStatuses(item(), '2026-10-04'), ['进行中'])
  assert.deepEqual(calendarStatuses(item(), '2026-10-02'), ['即将开始'])
  assert.deepEqual(calendarStatuses(item(), '2026-10-11'), ['已结束'])
})

test('分组排除历史、跨日只出现一次，结束提醒优先、未来7天边界正确', () => {
  const values = [item({ id: 'ongoing', start_date: '2026-09-01' }), item({ id: 'end', start_date: '2026-09-01', end_date: '2026-10-03' }), item({ id: 'start' }), item({ id: 'week', start_date: '2026-10-10' }), item({ id: 'later', start_date: '2026-10-11', end_date: '2026-10-12' }), item({ id: 'past', end_date: '2026-10-02' })]
  const sections = groupCalendarItems(values, '2026-10-03')
  assert.deepEqual(sections[0].groups[0].items.map(v => v.id), ['end', 'start', 'ongoing'])
  assert.equal(sections[1].groups[0].date, '2026-10-10')
  assert.equal(sections[2].groups[0].date, '2026-10-11')
  assert.equal(sections.flatMap(s => s.groups.flatMap(g => g.items)).length, 5)
  assert.deepEqual(groupCalendarItems([], '2026-10-03').map(s => s.groups), [[], [], []])
})

test('URL filters白名单、重复参数与清空处理保留无关query', () => {
  assert.deepEqual(calendarFilters({}), { game: '', category: '', exclude_recruitment: false, status: '' })
  assert.deepEqual(calendarFilters({ game: ['如鸢', '代号鸢'], category: ['SHOP'] }), { game: '如鸢', category: 'SHOP', exclude_recruitment: false, status: '' })
  assert.deepEqual(calendarFilters({ game: 'invalid', category: 'toString' }), { game: '', category: '', exclude_recruitment: false, status: '' })
  assert.deepEqual(calendarFilterQuery({ game: '如鸢', category: 'SHOP', ref: 'shared' }, { game: '' }), { category: 'SHOP', ref: 'shared' })
})

test('手工校验拒绝招募、倒置日期、单边时间、同日倒置时间、危险URL', () => {
  const form = calendarForm({ item: item(), enabled: true, version: 0 })
  assert.deepEqual(validateCalendarForm(form), {})
  assert.ok(validateCalendarForm({ ...form, category: 'RECRUITMENT' }).category)
  assert.ok(validateCalendarForm({ ...form, end_date: '2026-10-01' }).end_date)
  assert.ok(validateCalendarForm({ ...form, precise: true, start_time: '09:00' }).end_time)
  assert.ok(validateCalendarForm({ ...form, precise: true, start_time: '12:00', end_time: '09:00', end_date: form.start_date }).end_time)
  assert.ok(validateCalendarForm({ ...form, source_url: 'data:text/html,hello' }).source_url)
  assert.ok(validateCalendarForm({ ...form, version: null }).version)
  const withUrl = { ...form, source_url: 'https://例子.测试/a b' }
  assert.deepEqual(validateCalendarForm(withUrl), {})
  assert.equal(calendarPayload(withUrl).source_url, 'https://xn--fsqu00a.xn--0zwm56d/a%20b')
  assert.ok(validateCalendarForm({ ...form, source_url: 'https://example.com/' + '鸢'.repeat(300) }).source_url)
})

test('完整替换payload带expected_version=0，创建不带版本，关闭时间会清空', () => {
  const form = calendarForm({ item: item({ start_time: '09:00', end_time: '10:00', description: '说明' }), version: 0, enabled: false, source_note: '备注' })
  const body = calendarPayload({ ...form, precise: false, description: '' })
  assert.equal(body.expected_version, 0)
  assert.equal(body.enabled, false)
  assert.equal(body.start_time, null)
  assert.equal(body.end_time, null)
  assert.equal(body.description, null)
  assert.equal(body.source_note, '备注')
  assert.equal(body.id, undefined)
  assert.equal(body.version, undefined)
  assert.equal(Object.hasOwn(calendarPayload(calendarForm()), 'expected_version'), false)
})

test('日历统一内测准入、管理仍保留独立写权限', () => {
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.ACTIVITY_CALENDAR], true)
  const publicRoute = routes.find(route => route.path === '/calendar')
  const adminRoute = routes.find(route => route.path === '/calendar/admin')
  for (const route of [publicRoute, adminRoute]) { assert.equal(route.meta.feature, FEATURE_KEYS.ACTIVITY_CALENDAR); assert.equal(typeof route.component, 'function') }
  assert.equal(publicRoute.meta.requiresAuth, true)
  assert.equal(publicRoute.meta.requiresAdmin, undefined)
  assert.equal(publicRoute.meta.requiresBeta, true)
  assert.equal(adminRoute.meta.requiresAuth, true)
  assert.equal(adminRoute.meta.requiredPermission, 'activity_calendar:write')
  assert.equal(needsAdminAccess(publicRoute.meta), false)
  assert.equal(isRouteAccessAllowed(publicRoute.meta, null), true)
  assert.equal(isRouteAccessAllowed(publicRoute.meta, { permissions: [] }, "读取失败"), true)
  assert.equal(isRouteAccessAllowed(publicRoute.meta, { permissions: ["beta:manage"] }), true)
  assert.equal(needsAdminAccess(adminRoute.meta), true)
  assert.equal(isRouteAccessAllowed(adminRoute.meta, null), false)
  assert.equal(isRouteAccessAllowed(adminRoute.meta, { permissions: ['recruitment_catalog:write'] }), false)
  assert.equal(isRouteAccessAllowed(adminRoute.meta, { permissions: ['activity_calendar:write'] }), true)
})


test('不含招募保留所有其它类型；默认完整、仅招募和游戏组合', () => {
  const values = Object.keys(CALENDAR_CATEGORIES).flatMap(category => ['如鸢', '代号鸢'].map(game => item({ id: `${game}-${category}`, category, game })))
  assert.equal(filterCalendarItems(values, calendarFilters()).length, 12)
  assert.deepEqual([...new Set(filterCalendarItems(values, calendarFilters({ exclude_recruitment: '1' })).map(v => v.category))], ['ACTIVITY', 'LOGIN', 'SHOP', 'MAINTENANCE', 'OTHER'])
  assert.equal(filterCalendarItems(values, calendarFilters({ category: 'RECRUITMENT' })).length, 2)
  const selected = filterCalendarItems(values, calendarFilters({ game: '如鸢', exclude_recruitment: '1' }))
  assert.equal(selected.length, 5)
  assert.ok(selected.every(v => v.game === '如鸢' && v.category !== 'RECRUITMENT'))
})

test('冲突最后操作生效，分享矛盾链接招募优先，非法/重复参数安全回退', () => {
  const query = { game: '如鸢', category: 'RECRUITMENT', view: 'month', date: '2026-10-09', scope: 'mine', pending: '1', ref: 'keep' }
  const excluded = calendarFilterQuery(query, { exclude_recruitment: true })
  assert.deepEqual(excluded, { game: '如鸢', view: 'month', date: '2026-10-09', scope: 'mine', pending: '1', ref: 'keep', exclude_recruitment: '1' })
  assert.deepEqual(calendarFilterQuery(excluded, { category: 'RECRUITMENT' }), query)
  assert.equal(calendarFilters({ category: 'RECRUITMENT', exclude_recruitment: '1' }).exclude_recruitment, false)
  assert.deepEqual(calendarFilters({ exclude_recruitment: ['1', '0'], status: ['ending', 'ongoing'] }), { game: '', category: '', exclude_recruitment: true, status: 'ending' })
  assert.deepEqual(calendarFilters({ game: 'no', category: 'toString', exclude_recruitment: 'true', status: 'toString' }), calendarFilters())
  assert.deepEqual(calendarFilterQuery({ ...excluded, status: 'ending' }, { game: '', category: '', exclude_recruitment: false, status: '' }), { view: 'month', date: '2026-10-09', scope: 'mine', pending: '1', ref: 'keep' })
})

test('服务器精确时间：开始闭区间、结束开区间；仅日期覆盖整个结束日', () => {
  const exact = item({ start_at: '2026-10-03T09:00:00+08:00', end_at: '2026-10-03T12:00:00+08:00' })
  const ongoing = calendarFilters({ status: 'ongoing' })
  const start = Date.parse(exact.start_at), end = Date.parse(exact.end_at)
  assert.equal(filterCalendarItems([exact], ongoing, start - 1).length, 0)
  assert.equal(filterCalendarItems([exact], ongoing, start).length, 1)
  assert.equal(filterCalendarItems([exact], ongoing, end - 1).length, 1)
  assert.equal(filterCalendarItems([exact], ongoing, end).length, 0)
  const dates = item({ end_date: '2026-10-03' })
  assert.deepEqual(calendarTimeBounds(dates), { start: Date.parse('2026-10-02T16:00:00Z'), end: Date.parse('2026-10-03T16:00:00Z') })
  for (const now of ['2026-10-03T00:00:00+08:00', '2026-10-03T23:59:59.999+08:00']) assert.equal(filterCalendarItems([dates], ongoing, Date.parse(now)).length, 1)
  assert.equal(filterCalendarItems([dates], ongoing, Date.parse('2026-10-04T00:00:00+08:00')).length, 0)
})

test('近3天结束必须正在进行，72小时含边界，跨日不依赖浏览器时区', () => {
  const now = Date.parse('2026-10-03T12:00:00+08:00'), ending = calendarFilters({ status: 'ending' })
  const endingAt = offset => item({ start_at: '2026-10-01T00:00:00+08:00', end_at: new Date(now + offset).toISOString() })
  assert.equal(filterCalendarItems([endingAt(CALENDAR_ENDING_WINDOW_MS + 1)], ending, now).length, 0)
  assert.equal(filterCalendarItems([endingAt(CALENDAR_ENDING_WINDOW_MS)], ending, now).length, 1)
  assert.equal(filterCalendarItems([endingAt(1)], ending, now).length, 1)
  assert.equal(filterCalendarItems([endingAt(0)], ending, now).length, 0)
  assert.equal(filterCalendarItems([item({ start_date: '2026-10-04', end_date: '2026-10-04' })], ending, now).length, 0)
  assert.equal(filterCalendarItems([item({ end_date: '2026-10-05' })], ending, now).length, 1)
  assert.equal(filterCalendarItems([item({ end_date: '2026-10-06' })], ending, now).length, 0)
  const exact = endingAt(CALENDAR_ENDING_WINDOW_MS + 1)
  assert.equal(nextCalendarBoundary([exact], now), now + 1)
  assert.equal(nextCalendarBoundary([exact], now + 1), Date.parse(exact.end_at))
  assert.equal(nextCalendarBoundary([], now), Infinity)
})
