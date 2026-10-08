import { expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import RecruitmentPractice from '../src/pages/recruitment/RecruitmentPractice.vue'
import PoolEditor from '../src/pages/recruitment/PoolEditor.vue'
import { recruitmentFixture } from '../test-support/recruitment.js'
import * as api from '../src/api/recruitment.js'
vi.mock('../src/api/recruitment.js', () => ({ recruitmentCommand: vi.fn(), getRecruitmentArchive: vi.fn() }))
const body = () => new DOMWrapper(document.body)
const button = text => body().findAll('button').find(item => item.text() === text)
const target = () => body().get('.guide-hint').attributes('data-guide-for')
it.each(['record', 'progress'])('隔离%s练习走同一实际控件，只显示示例，不写API/store/localStorage', async branch => {
  vi.clearAllMocks(); const before = { local: { ...localStorage }, session: { ...sessionStorage } }
  const wrapper = mount(RecruitmentPractice, { attachTo: document.body })
  expect(body().find('.pool-editor').exists()).toBe(false)
  await body().get('.pool-card').trigger('click'); await flushPromises(); expect(target()).toBe('result')
  await button(branch === 'record' ? '抽到了绝密' : '还没出绝密').trigger('click')
  if (branch === 'record') {
    await body().get('.quick-up-button').trigger('click'); expect(target()).toBe('pulls')
    await body().get('.pull-count-field input').setValue('20'); await body().get('.pull-count-field input').trigger('blur')
  }
  expect(target()).toBe('progress')
  await body().get('.remaining-field input').setValue('33'); await body().get('.remaining-field input').trigger('blur')
  expect(target()).toBe(branch === 'record' ? 'save-record' : 'save-progress')
  await button('查看练习结果').trigger('click'); await flushPromises()
  expect(body().get('.save-result').text()).toContain('练习结果 · 仅示例')
  expect(body().findAll('.gacha-record')).toHaveLength(branch === 'record' ? 1 : 0)
  expect(body().get('.progress-number strong').text()).toBe('7')
  expect(body().find('.save-result.is-confirmed').exists()).toBe(false)
  expect(body().text()).not.toContain('服务端已读回核对')
  expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  expect({ local: { ...localStorage }, session: { ...sessionStorage } }).toEqual(before)
  await body().get('.close-button').trigger('click'); expect(wrapper.emitted('close')).toHaveLength(1)
})
it('退出练习教程保留练习输入，重新挂载恢复空示例', async () => {
  let wrapper = mount(RecruitmentPractice, { attachTo: document.body }); await body().get('.pool-card').trigger('click'); await button('抽到了绝密').trigger('click'); await body().get('.quick-up-button').trigger('click')
  await body().get('.pull-count-field input').setValue('20')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(body().get('.pull-count-field input').element.value).toBe('20'); expect(body().find('.guide-hint').exists()).toBe(false)
  wrapper.unmount(); wrapper = mount(RecruitmentPractice, { attachTo: document.body }); await body().get('.pool-card').trigger('click'); expect(target()).toBe('result'); expect(body().findAll('.gacha-record')).toHaveLength(0)
})
it('从真实编辑窗口进入练习时两个弹窗有独立标题，退出练习保留真实草稿', async () => {
  const real = mount(PoolEditor, { attachTo: document.body, props: { open: true, pool: recruitmentFixture().pools[0], records: [], recordsRevision: 0, canRecord: true, agents: [{ id: 'a', name: '甲' }] } })
  await real.getComponent(PoolEditor).vm.$nextTick()
  await body().get('.add-record').trigger('click'); await body().get('.agent-choice').trigger('click'); await body().get('.pull-count-field input').setValue('12')
  const practice = mount(RecruitmentPractice, { attachTo: document.body }); await body().get('.pool-card').trigger('click'); await flushPromises()
  const dialogs = body().findAll('.pool-editor')
  expect(dialogs).toHaveLength(2)
  const labels = dialogs.map(dialog => dialog.attributes('aria-labelledby'))
  expect(new Set(labels).size).toBe(2)
  expect(document.getElementById(labels[1]).textContent).toContain('练习示例卡池')
  expect(new Set(Array.from(document.querySelectorAll('[id]')).map(e => e.id)).size).toBe(document.querySelectorAll('[id]').length)
  await dialogs[1].get('.close-button').trigger('click'); expect(practice.emitted('close')).toHaveLength(1); practice.unmount(); await flushPromises()
  expect(dialogs[0].get('.pull-count-field input').element.value).toBe('12')
  expect(real.emitted('save')).toBeUndefined(); expect(real.emitted('close')).toBeUndefined()
})
it('直接按保存时失焦不在松开鼠标前移动提示，一次真实点击就提交示例', async () => {
  vi.useFakeTimers()
  mount(RecruitmentPractice, { attachTo: document.body })
  await body().get('.pool-card').trigger('click'); await button('抽到了绝密').trigger('click'); await body().get('.quick-up-button').trigger('click')
  await body().get('.pull-count-field input').setValue('20'); await body().get('.pull-count-field input').trigger('blur')
  await body().get('.remaining-field input').setValue('33')
  expect(target()).toBe('progress')
  await button('查看练习结果').trigger('pointerdown')
  await body().get('.remaining-field input').trigger('blur')
  expect(target()).toBe('progress')
  window.dispatchEvent(new Event('pointerup'))
  await button('查看练习结果').trigger('click'); await vi.advanceTimersByTimeAsync(0); await flushPromises()
  expect(target()).toBe('practice-result'); expect(body().get('.save-result').text()).toContain('仅示例')
})
