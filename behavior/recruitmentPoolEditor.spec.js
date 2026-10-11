// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
import { afterAll, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PoolEditor from '../src/pages/recruitment/PoolEditor.vue'
import { recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'

const render = props => mount(PoolEditor, { attachTo: document.body, props: { open: true, pool: recruitmentFixture().pools[0], recordsRevision: 3, records: [{ ...recruitmentEvent('old', 17), agent_snapshot: { agent_id: 'a', name: '甲' } }], canRecord: true, catalog: recruitmentCatalog().pools, agents: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], ...props }, global: { stubs: { Teleport: true } } })
const button = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text)

async function register(wrapper, agent, span) {
  const quick = wrapper.find('.quick-up-button[data-agent-id="' + agent + '"]')
  if (quick.exists()) await quick.trigger('click')
  else {
    await wrapper.get('.add-record').trigger('click')
    await wrapper.get('.agent-choice[data-agent-id="' + agent + '"]').trigger('click')
  }
  await wrapper.get('.pull-count-field input').setValue(span)
  await wrapper.get('.composer-actions .primary').trigger('click')
}

it('默认展示头像和彩色抽数条，单条录入后生成记录条；重复密探、未知间隔和稳定ID', async () => {
  const wrapper = render()
  expect(wrapper.find('.entry-composer').exists()).toBe(false)
  expect(button(wrapper, '进度条视图').attributes('aria-pressed')).toBe('true')
  expect(button(wrapper, '密探视图').attributes('aria-pressed')).toBe('false')
  expect(wrapper.get('.gacha-record .pull-result b').text()).toBe('17')
  expect(wrapper.get('.gacha-record .record-bar').classes()).toContain('bar-low')
  expect(wrapper.get('.gacha-record .record-bar').attributes('style')).toContain('42.5%')
  await register(wrapper, 'a', '')
  expect(wrapper.find('.pull-count-field').exists()).toBe(false)
  expect(wrapper.findAll('.gacha-record')).toHaveLength(2)
  expect(wrapper.findAll('.gacha-record')[0].get('.record-bar').classes()).toContain('bar-unknown')
  await wrapper.get('form').trigger('submit')
  const first = wrapper.emitted('save')[0][0]
  expect(first).toMatchObject({ operation: 'pool_records_save', revision: 3, data: { entries: [{ agent_id: 'a', pull_span: null }], remaining_pulls: 40, deleted_event_ids: [] } })
  expect(first.data.entries).toHaveLength(1)
  expect(first.data.entries[0].event_id).not.toBe('old')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[1][0]).toEqual(first)
})

it('密探视图按头像排列并在左下角显示单条抽数，切换视图不改变记录且头像仍可进入编辑', async () => {
  const wrapper = render({ records: [
    { ...recruitmentEvent('known', 17), agent_snapshot: { agent_id: 'a', name: '甲' } },
    { ...recruitmentEvent('unknown', null), agent_snapshot: { agent_id: 'b', name: '乙' } }
  ] })
  await button(wrapper, '密探视图').trigger('click')
  expect(button(wrapper, '密探视图').attributes('aria-pressed')).toBe('true')
  expect(wrapper.find('.record-feed').exists()).toBe(false)
  expect(wrapper.findAll('.agent-record-card')).toHaveLength(2)
  expect(wrapper.findAll('.agent-pull-badge').map(item => item.text()).sort()).toEqual(['17抽', '未知'])
  expect(wrapper.findAll('.agent-record-name').map(item => item.text()).sort()).toEqual(['乙', '甲'])
  const known = wrapper.findAll('.agent-record-card').find(item => item.text().includes('17抽'))
  await known.get('.agent-record-detail').trigger('click')
  expect(wrapper.get('.pull-count-field input').element.value).toBe('17')
  await button(wrapper, '取消').trigger('click')
  await button(wrapper, '进度条视图').trigger('click')
  expect(wrapper.findAll('.gacha-record')).toHaveLength(2)
  expect(wrapper.find('.record-feed .delete-record').exists()).toBe(false)
})

it('公共目录无头像时按真实密探ID回退本地密探图，进入录入态会标记底部区域', async () => {
  const wrapper = render({ records: [], agents: [{ id: 'char_001_yangxiu', name: '杨修', rarity: 5, games: ['代号鸢'] }] })
  await flushPromises()
  await wrapper.get('.add-record').trigger('click')
  const choice = wrapper.get('.agent-choice[data-agent-id="char_001_yangxiu"]')
  expect(choice.get('img').attributes('src')).toContain('/assets/operator-portraits/char_001_yangxiu.webp')
  await choice.trigger('click')
  expect(wrapper.get('footer').classes()).toContain('is-entry-active')
  expect(wrapper.get('.selected-agent-summary').text()).toContain('杨修')
  expect(wrapper.get('.selected-agent-summary img').attributes('src')).toContain('/assets/operator-portraits/char_001_yangxiu.webp')
  expect(document.activeElement).toBe(wrapper.get('.pull-count-field input').element)
})

it('点击记录只展开紧凑抽数编辑，取消不改变记录；完成编辑后再统一保存', async () => {
  const wrapper = render()
  await wrapper.get('.gacha-record .record-detail').trigger('click')
  expect(wrapper.find('.agent-picker').exists()).toBe(false)
  expect(wrapper.get('.pull-count-field input').element.value).toBe('17')
  await wrapper.get('.pull-count-field input').setValue('20')
  await button(wrapper, '取消').trigger('click')
  expect(wrapper.get('.gacha-record .pull-result b').text()).toBe('17')
  await wrapper.get('.gacha-record .record-detail').trigger('click')
  await wrapper.get('.pull-count-field input').setValue('31')
  await wrapper.get('.composer-actions .primary').trigger('click')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.get('.gacha-record .record-bar').classes()).toContain('bar-high')
  expect(wrapper.emitted('save')[0][0].data.entries[0]).toMatchObject({ event_id: 'old', pull_span: 31 })
})

it.each(['record', 'maintain'])('%s教程和普通模式使用同一新增直存/历史草稿保存机制', async topic => {
  const normal = render(), guided = render()
  guided.vm.startGuide(topic, false)
  await flushPromises()
  for (const wrapper of [normal, guided]) {
    if (topic === 'record') {
      await wrapper.get('.add-record').trigger('click')
      await wrapper.get('.agent-choice[data-agent-id="a"]').trigger('click')
    } else await wrapper.get('.record-detail').trigger('click')
    expect(wrapper.get('.composer-actions .primary').text()).toBe(topic === 'record' ? '保存这笔' : '完成')
    await wrapper.get('.pull-count-field input').setValue('20')
    await wrapper.get('.composer-actions .primary').trigger('click')
    if (topic === 'maintain') {
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(wrapper.text()).toContain('待保存')
      await wrapper.get('form').trigger('submit')
    } else expect(wrapper.emitted('save')).toHaveLength(1)
  }
  const ordinary = normal.emitted('save')[0][0], tutorial = guided.emitted('save')[0][0]
  expect(tutorial.operation).toBe(ordinary.operation)
  expect(tutorial.revision).toBe(ordinary.revision)
  expect(tutorial.data).toEqual({ ...ordinary.data, entries: ordinary.data.entries.map(entry => ({ ...entry, event_id: tutorial.data.entries[0].event_id })) })
  expect(tutorial.guide).toBeUndefined()
})

it('严格出货正整数与保底1–40，未知进度留空；忙碌不关闭/提交', async () => {
  const wrapper = render({ pool: { ...recruitmentFixture().pools[0], progress: null } })
  await button(wrapper, '还没出绝密').trigger('click')
  expect(wrapper.get('.remaining-field input').element.value).toBe('')
  for (const value of ['', '0', '41', '1.5']) {
    await wrapper.get('.remaining-field input').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
  }
  expect(wrapper.emitted('save')).toBeUndefined()
  expect(wrapper.get('[role=alert]').exists()).toBe(true)
  await wrapper.get('.remaining-field input').setValue('1')
  await wrapper.get('.gacha-record .record-detail').trigger('click')
  await wrapper.get('.pull-count-field input').setValue('1.5')
  await wrapper.get('.composer-actions .primary').trigger('click')
  expect(wrapper.find('.entry-composer').exists()).toBe(true)
  expect(wrapper.emitted('save')).toBeUndefined()
  await wrapper.get('.pull-count-field input').setValue('20')
  await wrapper.get('.composer-actions .primary').trigger('click')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')).toHaveLength(1)
  await wrapper.setProps({ busy: true })
  await wrapper.get('.modal-mask').trigger('click')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(wrapper.emitted('save')).toHaveLength(1)
})

it('只编辑保底时视口因键盘缩短，滚动真实输入到可见范围并保留焦点，不改业务进度', async () => {
  vi.useFakeTimers()
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('innerHeight', 844)
  const wrapper = render()
  await wrapper.vm.$nextTick()
  await button(wrapper, '还没出绝密').trigger('click')
  const input = wrapper.get('.remaining-field input')
  vi.spyOn(input.element, 'getBoundingClientRect').mockReturnValue(new DOMRectReadOnly(0, 453, 96, 47))
  vi.spyOn(wrapper.get('.progress-actions').element, 'getBoundingClientRect').mockReturnValue(new DOMRectReadOnly(0, 510, 200, 34))
  vi.spyOn(wrapper.get('.editor-header').element, 'getBoundingClientRect').mockReturnValue({ bottom: 100 })
  const scroll = vi.fn(); wrapper.get('.editor-body').element.scrollBy = scroll
  input.element.focus()
  viewport.height = 400; viewport.dispatchEvent(new Event('resize'))
  await vi.advanceTimersByTimeAsync(200)
  expect(scroll).toHaveBeenCalledWith({ top: 168, behavior: 'auto' })
  expect(document.activeElement).toBe(input.element)
  expect(input.element.value).toBe('40')
  expect(wrapper.emitted('save')).toBeUndefined()
  wrapper.unmount()
})

it('Escape取消不写入，重开恢复服务端记录和保底；已确认非UP才显示歪章', async () => {
  const event = { ...recruitmentEvent('old', 31), agent_snapshot: { agent_id: 'a', name: '甲' }, up_status: 'non_up' }
  const wrapper = render({ records: [event], pool: { ...recruitmentFixture().pools[0], progress: 21 } })
  await flushPromises()
  expect(wrapper.get('.non-up-stamp').text()).toBe('歪')
  await button(wrapper, '还没出绝密').trigger('click')
  expect(wrapper.get('.progress-number strong').text()).toBe('21')
  await wrapper.get('.gacha-record .record-detail').trigger('click')
  await button(wrapper, '删除记录').trigger('click')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(wrapper.emitted('save')).toBeUndefined()
  await wrapper.setProps({ open: false })
  await wrapper.setProps({ open: true })
  expect(wrapper.get('.gacha-record .pull-result b').text()).toBe('31')
  await button(wrapper, '还没出绝密').trigger('click')
  expect(wrapper.get('.remaining-field input').element.value).toBe('19')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')).toBeUndefined()
})

it('旧批次日期/备注/UP状态保持，新UP仍提交固定槽身份', async () => {
  const event = { ...recruitmentEvent('old', 17), agent_snapshot: { agent_id: 'a', name: '甲' }, batch_id: 'batch', up_status: 'non_up', acquired_date: '2024-01-01', note: '旧备注' }
  const wrapper = render({ records: [event], catalog: [{ pool_id: 'catalog-a', up_agents: [{ id: 'slot', name: '占位', active: true }] }] })
  await wrapper.get('.gacha-record .record-detail').trigger('click')
  expect(wrapper.text()).toContain('不会改变批次总抽数')
  await wrapper.get('.pull-count-field input').setValue('19')
  await wrapper.get('.composer-actions .primary').trigger('click')
  await register(wrapper, 'slot', '')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0].data.entries).toEqual([
    expect.objectContaining({ event_id: 'old', pull_span: 19, up_status: 'non_up', acquired_date: '2024-01-01', note: '旧备注' }),
    expect.objectContaining({ agent_id: 'slot', pull_span: null, up_status: 'up' })
  ])
})

it('冲突重读看到已登记的新ID时合并同一记录，不生成重复记录条', async () => {
  const wrapper = render()
  await register(wrapper, 'a', '12')
  const entry = wrapper.emitted('save')[0][0].data.entries[0]
  await wrapper.setProps({ recordsRevision: 4, records: [{ ...recruitmentEvent('old', 17), agent_snapshot: { agent_id: 'a', name: '甲' } }, { ...recruitmentEvent(entry.event_id, 12), agent_snapshot: { agent_id: 'a', name: '甲' } }] })
  expect(wrapper.findAll('.gacha-record')).toHaveLength(2)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')).toHaveLength(1)
})
