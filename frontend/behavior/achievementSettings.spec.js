import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AchievementSettingsImport from '../src/pages/achievement/AchievementSettingsImport.vue'

const draft = { categories: [{ category_id: 'cat_test', name: '测试分类' }], reward_items: [], point_tracks: [], reward_filter_keys: [] }
const document = { format: 'yuanhub-achievement-settings', schema_version: 1, game: '如鸢', reward_items: [{ item_key: 'test_coin', name: '测试币', games: ['如鸢'] }], point_tracks: [], reward_filter_keys: ['test_coin'] }
async function select(wrapper, text) {
  const input = wrapper.find('input')
  Object.defineProperty(input.element, 'files', { value: [{ size: 100, text }], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

it('选择配置只预览，明确应用才交给草稿；取消与错误不修改原数据', async () => {
  const wrapper = mount(AchievementSettingsImport, { props: { game: '如鸢', draft, revision: 1 } })
  await select(wrapper, async () => JSON.stringify(document))
  expect(wrapper.text()).toContain('待应用：1 种奖励')
  expect(wrapper.emitted('apply')).toBeUndefined()
  await wrapper.findAll('button').find(button => button.text() === '取消').trigger('click')
  expect(wrapper.text()).not.toContain('待应用')
  await select(wrapper, async () => '{')
  expect(wrapper.find('[role="alert"]').text()).toContain('有效 JSON')
  expect(wrapper.emitted('apply')).toBeUndefined()
  await select(wrapper, async () => JSON.stringify(document))
  await wrapper.findAll('button').find(button => button.text() === '应用到草稿').trigger('click')
  expect(wrapper.emitted('apply')[0][0].reward_items).toEqual(document.reward_items)
  expect(draft.reward_items).toEqual([])
  wrapper.unmount()
})

it('切换游戏或草稿版本后，旧文件读取结果失效', async () => {
  const wrapper = mount(AchievementSettingsImport, { props: { game: '如鸢', draft, revision: 1 } })
  let resolve
  await select(wrapper, () => new Promise(done => { resolve = done }))
  await wrapper.setProps({ game: '代号鸢', revision: 2 })
  resolve(JSON.stringify(document))
  await flushPromises()
  expect(wrapper.text()).not.toContain('待应用')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.emitted('apply')).toBeUndefined()
  wrapper.unmount()
})
