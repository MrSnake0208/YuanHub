import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import BattleImages from '../src/pages/tools/battle-images.vue'
import BattleImageExport from '../src/components/work/BattleImageExport.vue'
import BattleImageSheet from '../src/components/work/BattleImageSheet.vue'
import { createBattleDraft, buildBattleImageModel } from '../src/utils/battleImages.js'
import { renderBattleImage } from '../src/utils/battleImageCapture.js'
import { dialog } from '../src/utils/dialog.js'

const hooks = vi.hoisted(() => ({ leave: null }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: fn => { hooks.leave = fn } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/utils/battleImageCapture.js', () => ({ renderBattleImage: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => `blob:test-${URL.createObjectURL.mock.calls.length}`)
  URL.revokeObjectURL = vi.fn()
  renderBattleImage.mockResolvedValue(new Blob(['png']))
  dialog.confirm.mockResolvedValue(true)
})
const page = () => mount(BattleImages, { global: { stubs: { IslandSidebar: true, SiteFooter: true } } })
const button = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text)
const draftWithActions = () => {
  const draft = reactive(createBattleDraft())
  draft.operators[0].name = '杨修'
  draft.rounds[0].actions = [{ slot: 0, type: 'attack', target: 2 }]
  return draft
}

it('从配队到操作录入再到两种出图，无需作业或账号；离开时保护输入', async () => {
  const wrapper = page()
  expect(hooks.leave()).toBe(true)
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修')
  await wrapper.get('[aria-label="1号位生命"]').setValue('0')
  await button(wrapper, '生成配队图').trigger('click'); await flushPromises()
  expect(wrapper.get('.battle-image-results').text()).toContain('上阵密探')
  expect(renderBattleImage).toHaveBeenCalledTimes(1)
  await button(wrapper, '操作记录').trigger('click')
  await wrapper.get('[aria-label="1号位普攻"]').trigger('click')
  await wrapper.get('[aria-label="目标：左二"]').trigger('click')
  expect(wrapper.get('[aria-label="目标：左二"]').attributes('aria-pressed')).toBe('true')
  await wrapper.get('[aria-label="1号位大招"]').trigger('click')
  await wrapper.get('[aria-label="本回合备注"]').setValue('先打左二')
  await button(wrapper, '生成操作图').trigger('click'); await flushPromises()
  expect(wrapper.get('.battle-image-results').text()).toContain('第1—1回合')
  const snapshot = renderBattleImage.mock.calls.at(-1)[0]
  expect(snapshot.textContent).toContain('先打左二')
  expect(snapshot.textContent).toContain('1A')
  expect(snapshot.textContent).toContain('2↑')
  dialog.confirm.mockResolvedValueOnce(false)
  expect(await hooks.leave()).toBe(false)
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2')
})

it('操作可修改、重排、撤回；删除回合取消后不丢记录', async () => {
  const wrapper = page()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修')
  await button(wrapper, '操作记录').trigger('click')
  await wrapper.get('[aria-label="1号位普攻"]').trigger('click')
  await wrapper.get('[aria-label="1号位大招"]').trigger('click')
  await wrapper.get('[aria-label="上移第2步"]').trigger('click')
  expect(wrapper.get('[aria-label="第1步动作"]').element.value).toBe('ultimate')
  await button(wrapper, '撤回最后一步').trigger('click')
  expect(wrapper.findAll('.battle-action-list li')).toHaveLength(1)
  await button(wrapper, '新增回合').trigger('click')
  await wrapper.get('[aria-label="1号位防御"]').trigger('click')
  dialog.confirm.mockResolvedValueOnce(false)
  await button(wrapper, '删除本回合').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="当前回合"]').findAll('option')).toHaveLength(2)
  await button(wrapper, '删除本回合').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="当前回合"]').findAll('option')).toHaveLength(1)
  expect(wrapper.get('[aria-label="第1步动作"]').element.value).toBe('ultimate')
})

it('更换密探需要确认，确认后清空旧练度，取消不改名', async () => {
  const wrapper = page()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修')
  await wrapper.get('[aria-label="1号位生命"]').setValue('1000')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="1号位密探"]').setValue('贾诩'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位密探"]').element.value).toBe('杨修')
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('1000')
  await wrapper.get('[aria-label="1号位密探"]').setValue('贾诩'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('')
})

it('输入变化或取消后，旧异步出图不能重新出现', async () => {
  let finish
  renderBattleImage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const draft = draftWithActions()
  const wrapper = mount(BattleImageExport, { props: { draft, kind: 'actions' } })
  await button(wrapper, '生成操作图').trigger('click'); await flushPromises()
  draft.title = '新标题'
  await flushPromises()
  finish(new Blob(['old'])); await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(wrapper.find('.battle-image-results').exists()).toBe(false)
  expect(button(wrapper, '生成操作图').attributes('disabled')).toBeUndefined()
})

it('过长操作图自动拆分并保留全部回合，失败可重试', async () => {
  const draft = draftWithActions()
  draft.rounds = Array.from({ length: 6 }, () => ({ actions: [{ slot: 0, type: 'attack', target: 2 }], remark: '' }))
  renderBattleImage.mockRejectedValueOnce(Object.assign(new Error('too tall'), { code: 'IMAGE_TOO_TALL' }))
  const wrapper = mount(BattleImageExport, { props: { draft, kind: 'actions' } })
  await button(wrapper, '生成操作图').trigger('click'); await flushPromises()
  expect(wrapper.findAll('figcaption').map(item => item.text())).toEqual([
    '操作记录 · 第1—3回合保存第 1 张 PNG', '操作记录 · 第4—5回合保存第 2 张 PNG', '操作记录 · 第6—6回合保存第 3 张 PNG',
  ])
  renderBattleImage.mockRejectedValueOnce(new Error('图片加载失败'))
  await button(wrapper, '生成操作图').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('图片加载失败')
  expect(draft.rounds).toHaveLength(6)
  await button(wrapper, '生成操作图').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('分享图以文字渲染用户内容，五槽位与明确的零均保留', () => {
  const draft = draftWithActions()
  draft.title = '<img src=x onerror=alert(1)>'
  draft.operators[0].hp = '0'
  draft.operators[0].forbiddenDiscs = '<script>坏内容</script>'
  const wrapper = mount(BattleImageSheet, { props: { model: buildBattleImageModel(draft), kind: 'team' } })
  expect(wrapper.get('h1').text()).toBe(draft.title)
  expect(wrapper.find('h1 img').exists()).toBe(false)
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.findAll('thead th')).toHaveLength(6)
  expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('0')
  expect(wrapper.findAll('tbody tr')[0].findAll('td')[1].text()).toBe('—')
})

it('切换立绘槽位仅编辑对应密探，练度即时反映到预览，不必先生成 PNG', async () => {
  const wrapper = page()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修')
  await wrapper.get('[aria-label="1号位生命"]').setValue('12345')
  expect(wrapper.get('.battle-preview-paper').text()).toContain('12345')
  await wrapper.get('[aria-label="编辑2号位"]').trigger('click')
  expect(wrapper.get('[aria-label="编辑2号位"]').attributes('aria-pressed')).toBe('true')
  await wrapper.get('[aria-label="2号位密探"]').setValue('贾诩')
  await wrapper.get('[aria-label="2号位攻击"]').setValue('6789')
  await wrapper.get('[aria-label="编辑1号位"]').trigger('click')
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('.battle-preview-paper').text()).toContain('6789')
  expect(wrapper.findAll('.battle-slot-art img')).toHaveLength(2)
  expect(renderBattleImage).not.toHaveBeenCalled()
})

it('编辑第六回合时预览跟随到第二段，仍可前后查看并放大', async () => {
  const wrapper = page()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修')
  await button(wrapper, '操作记录').trigger('click')
  for (let index = 0; index < 5; index++) await button(wrapper, '新增回合').trigger('click')
  await wrapper.get('[aria-label="本回合备注"]').setValue('第六回合说明')
  expect(wrapper.get('.battle-preview-pages').text()).toContain('2 / 2')
  expect(wrapper.get('.battle-preview-paper').text()).toContain('第六回合说明')
  await button(wrapper, '上一段').trigger('click')
  expect(wrapper.get('.battle-preview-pages').text()).toContain('1 / 2')
  expect(wrapper.get('.battle-preview-paper').text()).not.toContain('第六回合说明')
  await button(wrapper, '放大查看').trigger('click')
  expect(wrapper.get('.battle-preview-transform').attributes('style')).toContain('scale(1)')
  await button(wrapper, '适应宽度').trigger('click')
  expect(wrapper.get('.battle-preview-transform').attributes('style')).not.toContain('scale(1)')
})
