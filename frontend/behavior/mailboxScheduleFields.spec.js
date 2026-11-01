import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import MailboxScheduleFields from '../src/components/inventory/MailboxScheduleFields.vue'

let wrapper
afterEach(() => wrapper?.unmount())
function open(today = '2026-11-01', modelValue = { start_date: '2026-11-02', end_date: '', coins_per_mail: 90 }) {
  wrapper = mount(MailboxScheduleFields, { props: {
    title: '白金币邮件', today, coins: true, coinOptions: [90], modelValue,
    'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value })
  } })
}
const days = () => wrapper.get('input[type=number]')
const claimed = label => wrapper.get(`[aria-label="白金币邮件${label}"]`)
const end = () => wrapper.props('modelValue').end_date
const status = () => wrapper.emitted('status').at(-1)[0]

it('只显示天数和领取选项；285天固定加到今天，领取选择只改变首次日期', async () => {
  open()
  expect(wrapper.find('input[type=date]').exists()).toBe(false)
  expect(wrapper.findAll('input:checked')).toHaveLength(0)
  await days().setValue('285')
  expect(end()).toBe('2027-08-13')
  expect(status().valid).toBe(false)
  await claimed('还没领取').setValue()
  expect(wrapper.props('modelValue')).toEqual({ start_date: '2026-11-01', end_date: '2027-08-13', coins_per_mail: 90 })
  expect(status().valid).toBe(true)
  await claimed('已经领取').setValue()
  expect(wrapper.props('modelValue')).toEqual({ start_date: '2026-11-02', end_date: '2027-08-13', coins_per_mail: 90 })
})
it.each([['2026-12-31', '1', '2027-01-01'], ['2028-02-28', '2', '2028-03-01']])('从%s正确跨年或闰日', async (today, count, expectedEnd) => {
  open(today)
  await days().setValue(count)
  await claimed('还没领取').setValue()
  expect(end()).toBe(expectedEnd)
})
it('拒绝空白、非正整数及超过十年，修正后恢复', async () => {
  open()
  await claimed('还没领取').setValue()
  for (const value of ['', '0', '-1', '1.5', '999999']) {
    await days().setValue(value)
    expect(days().attributes('aria-invalid')).toBe('true')
    expect(status().valid).toBe(false)
    expect(end()).toBe('')
  }
  await days().setValue(days().attributes('max'))
  expect(end()).toBe('2036-11-01')
  expect(status().valid).toBe(true)
})
it('重开显示真实剩余天数，跨日递减到零且不改已保存配置', async () => {
  open('2026-11-01', { start_date: '2026-10-20', end_date: '2026-11-26', coins_per_mail: 90 })
  expect(wrapper.get('.schedule-countdown').text()).toBe('剩余 25 天')
  expect(wrapper.find('input').exists()).toBe(false)
  await wrapper.setProps({ today: '2026-11-02' })
  expect(wrapper.get('.schedule-countdown').text()).toBe('剩余 24 天')
  await wrapper.setProps({ today: '2026-12-01' })
  expect(wrapper.get('.schedule-countdown').text()).toBe('剩余 0 天')
  expect(wrapper.text()).toContain('已停止累计')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
it('修改已存配置时回填天数，但不推断今天领取状态', async () => {
  open('2026-11-01', { start_date: '2026-10-20', end_date: '2026-11-26', coins_per_mail: 90 })
  await wrapper.get('[aria-label="修改白金币邮件月卡天数"]').trigger('click')
  expect(days().element.value).toBe('25')
  expect(wrapper.findAll('input:checked')).toHaveLength(0)
  expect(status()).toMatchObject({ valid: false, dirty: false })
  await claimed('已经领取').setValue()
  expect(status()).toMatchObject({ valid: true, dirty: true })
  expect(end()).toBe('2026-11-26')
})
it('停止后重设清空状态，不沿用今天领取选择', async () => {
  open()
  await days().setValue('25')
  await claimed('已经领取').setValue()
  await wrapper.get('[aria-label="停止白金币邮件自动累计"]').trigger('click')
  expect(wrapper.props('modelValue')).toBeNull()
  expect(status().valid).toBe(true)
  await wrapper.get('[aria-label="白金币邮件设置自动累计"]').trigger('click')
  expect(days().element.value).toBe('')
  expect(wrapper.findAll('input:checked')).toHaveLength(0)
  expect(end()).toBe('')
})
it('闰日十年上限落在二月末', async () => {
  open('2028-02-29')
  await days().setValue(days().attributes('max'))
  expect(end()).toBe('2038-02-28')
})
