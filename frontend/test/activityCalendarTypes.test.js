import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calendarDisplay, validateCalendarClassification } from '../src/data/activityCalendarTypes.js'
import { EVENT_TYPE_COLORS, eventTypeColor, eventTypeStyle } from '../src/data/eventTypeColors.js'
import { normalizeRecruitmentPoolType, recruitmentCoverStyle } from '../src/data/recruitmentPoolTypes.js'
import { calendarForm, calendarPayload, normalizeCalendarItem, summarizeCalendarDay, validateCalendarForm } from '../src/data/activityCalendar.js'
import { suggestionPayload } from '../src/data/activityCalendarSuggestions.js'

const event = patch => ({ id: 'sample', game: '如鸢', category: 'ACTIVITY', title: '限定星图家具地宫', start_date: '2026-10-09', end_date: '2026-10-15', ...patch })

test('新版八个手工分类与明确旧映射，不推断待归类类型', () => {
  const cases = [
    ['ACTIVITY', 'LARGE_EVENT', 'ACTIVITY', '活动/周年', 'rouge'],
    ['ACTIVITY', 'UNDERGROUND', 'ACTIVITY', '地宫/鸢会', 'purple'],
    ['ACTIVITY', 'SIGN_IN', 'ACTIVITY', '签到/查岗', 'blue'],
    ['ACTIVITY', 'SEASONAL_STAR_CHART', 'PERMANENT', '当季星图', 'orange'],
    ['ACTIVITY', 'WHITE_PIGEON', 'PERMANENT', '白鸽', 'blue'],
    ['ACTIVITY', 'AGENT_TRAINING', 'PERMANENT', '密探特训', 'rouge'],
    ['ACTIVITY', 'TRIAL_CAVE', 'PERMANENT', '历练/洞窟', 'yellow'],
    ['ACTIVITY', 'FURNITURE_TRIAL', 'PERMANENT', '历练/洞窟', 'yellow'],
    ['ACTIVITY', 'MYSTERIOUS_CAVE', 'PERMANENT', '历练/洞窟', 'yellow'],
    ['OTHER', 'OTHER', 'OTHER', '其他', 'gray'],
  ]
  for (const [category, subtype, group, label, color] of cases) {
    const display = calendarDisplay(event({ category, subtype }))
    assert.deepEqual([display.group, display.label, display.color], [group, label, color])
    assert.deepEqual(validateCalendarClassification({ category, subtype }), {})
  }
  assert.equal(calendarDisplay(event({ subtype: 'FURNITURE', subtype_detail: 'MYSTERIOUS_CAVE' })).path, '常驻 · 历练/洞窟')
  assert.equal(calendarDisplay(event({ category: 'LOGIN' })).path, '活动 · 签到/查岗')
  for (const [category, subtype] of [
    ['ACTIVITY', 'MEDIUM_EVENT'], ['ACTIVITY', 'TAISHAN_FU'], ['ACTIVITY', 'FURNITURE'],
    ['ACTIVITY', 'FIRST_MEETING_ROULETTE'], ['SHOP', 'RECRUITMENT_SHOP'], ['SHOP', 'ACTIVITY_SHOP'],
    ['OTHER', 'MAINTENANCE'], ['OTHER', 'STAR_POOL'],
  ]) {
    const item = event({ category, subtype })
    assert.equal(calendarDisplay(item).group, 'UNCLASSIFIED')
    assert.match(calendarDisplay(item).path, /待归类/)
    assert.match(calendarDisplay(item).original, new RegExp(subtype))
    assert.deepEqual(validateCalendarClassification(item), {})
  }
})

test('未知分类保留条目和原编码；不依据标题猜测星图', () => {
  for (const category of ['ACTIVITY', 'MAINTENANCE', 'SHOP', 'OTHER']) {
    const item = normalizeCalendarItem(event({ category }))
    assert.equal(item.category, category)
    assert.equal(item.subtype, null)
    assert.equal(calendarDisplay(item).group, 'UNCLASSIFIED')
  }
  for (const subtype of ['toString', 'FUTURE_TYPE', 'STAR_POOL']) {
    const item = normalizeCalendarItem(event({ subtype }))
    assert.ok(item)
    assert.equal(calendarDisplay(item).color, 'neutral')
    assert.equal(calendarDisplay(item).group, 'UNCLASSIFIED')
  }
  assert.equal(calendarDisplay(event({ category: 'OTHER', title: '当季星图' })).group, 'UNCLASSIFIED')
  assert.ok(validateCalendarClassification({ category: 'OTHER', subtype: 'FURNITURE' }).subtype)
  assert.ok(validateCalendarClassification({ category: 'ACTIVITY', subtype_detail: 'MYSTERIOUS_CAVE' }).subtype_detail)
  assert.ok(validateCalendarClassification({ category: 'ACTIVITY', subtype: 'FURNITURE', subtype_detail: 'unknown' }).subtype_detail)
  assert.ok(validateCalendarClassification({ category: 'SHOP', subtype: 'SHOP' }).subtype)
})

test('权威pool_type规范化：已知组合优先级、别名、常驻和未知；手工项不借标题或池字段误标', () => {
  for (const [value, code, color] of [
    ['限定', 'limited', 'gold'], ['重逢限定', 'limited', 'gold'], [' 傅融地宫 ', 'limited', 'gold'],
    ['复刻限定', 'rerun', 'blue'], ['照影复刻限定', 'zhaoying', 'purple'], ['自选照影复刻限定', 'choice', 'rouge'],
    [' LIMITED ', 'limited', 'gold'], ['rerun', 'rerun', 'blue'], ['zhaoying', 'zhaoying', 'purple'], ['select', 'choice', 'rouge'],
    ['常驻', 'permanent', 'neutral'], ['standard', 'permanent', 'neutral'], [null, 'unknown', 'neutral'],
    ['并非限定', 'unknown', 'neutral'], ['未知照影', 'unknown', 'neutral'], ['常驻限定', 'unknown', 'neutral'], ['toString', 'unknown', 'neutral'],
  ]) {
    assert.equal(normalizeRecruitmentPoolType(value), code)
    const item = normalizeCalendarItem(event({ category: 'RECRUITMENT', source_type: 'RECRUITMENT_POOL', pool_type: value }))
    assert.equal(calendarDisplay(item).color, color)
    assert.equal(recruitmentCoverStyle(value)['--cover-tone'], eventTypeColor(color, 'cover'))
    assert.ok(recruitmentCoverStyle(value)['--cover-tone'].endsWith(`${EVENT_TYPE_COLORS[color].cover})`))
  }
  assert.equal(normalizeCalendarItem(event({ pool_type: '限定' })).pool_type, null)
})

test('表单、建议载荷往返细类；历史category不被静默重写；关联项保持独立计数和日期', () => {
  const item = event({ subtype: 'FURNITURE', subtype_detail: 'MYSTERIOUS_CAVE' })
  const form = calendarForm({ item, version: 0 })
  assert.equal(calendarPayload(form).subtype_detail, 'MYSTERIOUS_CAVE')
  assert.equal(suggestionPayload({ ...form, submission_note: '' }, 'request').subtype, 'FURNITURE')
  const legacy = calendarForm({ item: event({ category: 'LOGIN' }), version: 0 })
  assert.equal(calendarPayload(legacy).category, 'LOGIN')
  assert.equal(calendarPayload(legacy).subtype, null)
  const related = [item, event({ id: 'independent', subtype: 'FURNITURE', end_date: '2026-10-10' })]
  assert.equal(summarizeCalendarDay(related, '2026-10-09').total, 2)
  assert.equal(related[1].end_date, '2026-10-10')
})

test('全部语义token文字在浅底上>=4.5:1，标记>=3:1', () => {
  const luminance = hex => hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((total, v, index) => total + v * [.2126, .7152, .0722][index], 0)
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  for (const [name, token] of Object.entries(EVENT_TYPE_COLORS)) {
    assert.ok(contrast(token.text, token.background) >= 4.5, name)
    assert.ok(contrast(token.mark, token.background) >= 3, name)
    assert.ok(contrast(token.mark, '#FFFDF6') >= 3, name + ' warm white')
  }
})

test('下载JSON v1示例同时保持新家具细目与缺字段旧LOGIN格式可录入', () => {
  const sample = JSON.parse(readFileSync(new URL('../public/examples/activity-calendar-v1.json', import.meta.url), 'utf8'))
  assert.equal(sample.schema_version, 1)
  assert.equal(sample.items[0].subtype_detail, 'MYSTERIOUS_CAVE')
  assert.equal(sample.items[1].category, 'LOGIN')
  assert.equal(Object.hasOwn(sample.items[1], 'subtype'), false)
  for (const item of sample.items) assert.deepEqual(validateCalendarForm(calendarForm({ item })), {})
})

 test('calendar themed colours keep their semantic family and exact light fallback', () => {
  assert.deepEqual(eventTypeStyle('rouge'), {
    '--event-bg': 'var(--theme-danger-bg, #FAEEEB)', '--event-text': 'var(--theme-danger-text, #833F3D)',
    '--event-border': 'var(--theme-danger-line, #D9AAA4)', '--event-mark': 'var(--theme-danger-text, #A6514A)'
  })
  assert.equal(eventTypeColor('gold', 'cover'), 'var(--theme-accent-bg, #F2DFAD)')
  for (const unknown of ['unknown', 'toString', '__proto__', null]) {
    assert.deepEqual(eventTypeStyle(unknown), eventTypeStyle('neutral'))
  }
})
