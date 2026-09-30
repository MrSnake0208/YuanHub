import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EntryEditor from '../src/pages/recruitment/EntryEditor.vue'
import { dateInZone } from '../src/utils/businessDay.js'

function render(props = {}) {
  return mount(EntryEditor, { attachTo: document.body, props: { open: true, currentPoolId: 'pool-a', pools: [{ pool_id: 'pool-a', snapshot: { name: '卡池', up_status: 'unknown', up_agent_ids: [] }, progress: 21 }], agents: [{ id: 'agent-a', name: '绝密甲' }], ...props }, global: { stubs: { Teleport: true } } })
}
const select = (wrapper, label) => wrapper.findAll('label').find(item => item.text().startsWith(label)).get('select')
const input = (wrapper, label) => wrapper.findAll('label').find(item => item.text().startsWith(label)).get('input')

it('current多条出货消耗旧进度，显式未知tail为null，历史模式可拆基准且不发送tail', async () => {
  const wrapper = render(); await wrapper.get('fieldset select').setValue('agent-a'); await input(wrapper, '这次出货抽数').setValue('27'); await input(wrapper, '最后一个绝密后').setValue('')
  await wrapper.get('form').trigger('submit'); expect(wrapper.emitted('save')[0][0]).toMatchObject({ operation: 'event_create', data: { mode: 'current', entries: [{ pull_span: 27 }], tail_progress: null } })
  await select(wrapper, '记录方式').setValue('historical'); await wrapper.get('input[type=checkbox]').setValue(true); await wrapper.get('form').trigger('submit')
  const historical = wrapper.emitted('save').at(-1)[0]; expect(historical.data.extract_from_baseline).toBe(true); expect(historical.data).not.toHaveProperty('tail_progress')
})
it('120窗口首条间隔未知，后续31/17；按已知120总量计一次，稳定结果ID重试不变', async () => {
  const wrapper = render({ initialMode: 'historical' }); await select(wrapper, '抽数资料').setValue('window'); await wrapper.get('fieldset select').setValue('agent-a'); await input(wrapper, '窗口内位置').setValue('17')
  const add = wrapper.findAll('button').find(button => button.text() === '再加一位绝密')
  await add.trigger('click'); await flushPromises(); const rows = wrapper.findAll('fieldset'); await rows[1].get('select').setValue('agent-a'); await rows[1].get('input[type=number]').setValue('48')
  await wrapper.findAll('.check input').at(-1).setValue(true); await wrapper.get('form').trigger('submit')
  const first = wrapper.emitted('save').at(-1)[0]; expect(first.operation).toBe('batch_create'); expect(first.data.total_pull_count).toBe(120); expect(first.data.entries.map(entry => entry.pull_span)).toEqual([null, 31]); expect(first.data.entries.every(entry => entry.event_id)).toBe(true)
  await wrapper.get('form').trigger('submit'); expect(wrapper.emitted('save').at(-1)[0]).toEqual(first)
})
it('120批次不能把窗口外抽数塞进窗口总量，错误聚焦且不提交', async () => {
  const wrapper = render({ initialMode: 'historical' }); await select(wrapper, '抽数资料').setValue('window'); await wrapper.get('fieldset select').setValue('agent-a'); await input(wrapper, '窗口内位置').setValue('17')
  await wrapper.findAll('.check input')[1].setValue(true); await input(wrapper, '窗口前已抽次数').setValue('9'); await wrapper.findAll('.check input').at(-1).setValue(true); await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.emitted('save')).toBeUndefined(); expect(wrapper.get('[role=alert]').text()).toContain('含有窗口外抽数'); expect(document.activeElement).toBe(wrapper.get('[role=alert]').element)
})
it('current不能猜未知旧进度；编辑历史只替换一条且保留其ID/批次归属', async () => {
  const wrapper = render({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池' }, progress: null }] }); await wrapper.get('fieldset select').setValue('agent-a'); await input(wrapper, '这次出货抽数').setValue('17'); await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.emitted('save')).toBeUndefined(); expect(wrapper.text()).toContain('先校正卡池进度')
  wrapper.unmount()
  const edit = render({ event: { event_id: 'stable', pool_id: 'pool-a', agent_snapshot: { agent_id: 'agent-a' }, pull_span: 31, up_status: 'unknown', batch_id: 'known-total' } }); await input(edit, '这次出货抽数').setValue('18'); await edit.get('form').trigger('submit')
  expect(edit.emitted('save')[0][0]).toMatchObject({ operation: 'event_update', data: { event_id: 'stable', entry: { agent_id: 'agent-a', pull_span: 18 } } }); expect(edit.emitted('save')[0][0].data).not.toHaveProperty('pool_id')
})
it('仅已核对fixed UP配置自动判断；选择/部分/未知保持unknown，手填选择保留', async () => {
  const wrapper = render({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'selection', up_agent_ids: ['agent-a'] }, progress: 0 }] }); await wrapper.get('fieldset select').setValue('agent-a'); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown')
  await wrapper.setProps({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: ['agent-a'] }, progress: 0 }] }); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('up')
  await select(wrapper, 'UP 状态').setValue('unknown'); await wrapper.setProps({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: [] }, progress: 0 }] }); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown')
})

it('verified池未对应的临时密探保持unknown，对应之后才自动判断', async () => {
  const wrapper = render({ agents: [{ id: 'tmp_a', name: '临时绝密', temporary: true }], pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: ['agent-a'] }, progress: 0 }] })
  await wrapper.get('fieldset select').setValue('tmp_a'); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown')
  await wrapper.setProps({ agents: [{ id: 'tmp_a', name: '临时绝密', temporary: true, mapped_agent_id: 'agent-a' }], pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: ['agent-a'] }, progress: 0 }] }); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('up')
  for (const up_status of ['partial', 'selection', 'unknown']) { await wrapper.setProps({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status, up_agent_ids: ['agent-a'] }, progress: 0 }] }); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown') }
})

it('current默认客户端本日可清空；切历史只清自动日期，手填历史日期不被改成今日', async () => {
  const wrapper = render(), currentDate = dateInZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  expect(wrapper.get('input[type=date]').element.value).toBe(currentDate)
  await select(wrapper, '记录方式').setValue('historical'); expect(wrapper.get('input[type=date]').element.value).toBe('')
  await wrapper.get('input[type=date]').setValue('2023-04-01'); await select(wrapper, '记录方式').setValue('current'); expect(wrapper.get('input[type=date]').element.value).toBe('2023-04-01')
  await wrapper.get('input[type=date]').setValue(''); await select(wrapper, '记录方式').setValue('historical'); await select(wrapper, '记录方式').setValue('current'); expect(wrapper.get('input[type=date]').element.value).toBe('')
})
it('恢复的verified空/不完整名单不推导非UP', async () => {
  const wrapper = render({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: [] }, progress: 0 }] }); await wrapper.get('fieldset select').setValue('agent-a'); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown')
  await wrapper.setProps({ pools: [{ pool_id: 'pool-a', snapshot: { name: '池', up_status: 'verified', up_agent_ids: ['agent-a'], unmapped_up_agent_names: ['未确认名'] }, progress: 0 }] }); await flushPromises(); expect(select(wrapper, 'UP 状态').element.value).toBe('unknown')
})
