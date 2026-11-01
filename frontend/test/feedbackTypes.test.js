import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_TYPE_OPTIONS, feedbackPrefill, isFeedbackType, publicTypeLabel } from '../src/utils/feedbackPublic.js'

const categories = [{ key: 'CALENDAR', label: '活动日历' }, { key: 'OPERATOR', label: '密探养成' }]

test('七种类型的选项、显示名和校验使用同一定义', () => {
  assert.deepEqual(PUBLIC_TYPE_OPTIONS.map(({ key, label }) => [key, label]), [
    ['BUG', '问题反馈'], ['EXPERIENCE', '体验优化'], ['FEATURE', '功能建议'],
    ['CONTENT', '内容问题'], ['ACCOUNT', '账号问题'], ['REPORT', '举报'], ['OTHER', '其他']
  ])
  for (const { key, label } of PUBLIC_TYPE_OPTIONS) {
    assert.equal(isFeedbackType(key), true)
    assert.equal(publicTypeLabel(` ${key.toLowerCase()} `), label)
  }
  for (const value of ['FEEDBACK', 'UNKNOWN', '', null]) {
    assert.equal(isFeedbackType(value), false)
    assert.equal(publicTypeLabel(value), '其他')
  }
})

test('日历预填只接受动态目录中的板块并复用同名自定义 key', () => {
  assert.deepEqual(feedbackPrefill({ type: ' experience ', category: ' calendar ', content: '不得复制' }, categories), { type: 'OTHER', category: 'CALENDAR' })
  assert.deepEqual(feedbackPrefill({ category: 'CALENDAR' }, [{ key: 'CUSTOM_CAL', label: '活动日历' }]), { type: 'OTHER', category: 'CUSTOM_CAL' })
  assert.deepEqual(feedbackPrefill({ category: 'CALENDAR' }, [{ key: 'CUSTOM_CAL', label: '活动与招募日程', builtinKey: 'CALENDAR' }]), { type: 'OTHER', category: 'CUSTOM_CAL' })
  assert.equal(feedbackPrefill({ category: 'CALENDAR' }, []).category, '')
  assert.deepEqual(feedbackPrefill({ type: 'UNKNOWN', category: 'UNKNOWN' }, categories), { type: 'OTHER', category: '' })
  assert.deepEqual(feedbackPrefill({ type: ['BUG'], category: ['CALENDAR'] }, categories), { type: 'OTHER', category: '' })
})

test('旧 FEEDBACK 和 type/category/area 链接仅保留板块预填，普通类型固定 OTHER', () => {
  for (const type of ['BUG', 'EXPERIENCE', 'ACCOUNT']) {
    assert.deepEqual(feedbackPrefill({ type: 'FEEDBACK', category: type, area: 'OPERATOR' }, categories), { type: 'OTHER', category: 'OPERATOR' })
    assert.deepEqual(feedbackPrefill({ type, category: type, area: 'CALENDAR' }, categories), { type: 'OTHER', category: 'CALENDAR' })
  }
  assert.deepEqual(feedbackPrefill({ type: 'FEEDBACK', category: 'CALENDAR' }, categories), { type: 'OTHER', category: 'CALENDAR' })
})
