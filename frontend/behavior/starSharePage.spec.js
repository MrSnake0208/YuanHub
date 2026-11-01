import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import Page from '../src/pages/star/share.vue'
import { useRoute, useRouter } from 'vue-router'
import { viewStarShare } from '../src/api/accountShare.js'
import { deferred } from '../test-support/factories.js'
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ params: { token: '' } }), router = { push: vi.fn() }
  return { useRoute: () => route, useRouter: () => router }
})
vi.mock('../src/api/accountShare.js', () => ({ viewStarShare: vi.fn() }))
const data = { game: '如鸢', has_state: true, updated_at: '2026-10-14T00:00:00Z', inventory: [{ kind: 'main', quality: 'orange', name: '天府', level: 10 }] }
const render = () => mount(Page, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true } } })
beforeEach(() => { useRoute().params.token = 'a'; useRouter().push.mockReset(); viewStarShare.mockReset().mockResolvedValue(data) })
it('纯码按星石入口，完整密探和星石链接尊重明确类型', async () => {
  useRoute().params.token = ''
  const wrapper = render(); await flushPromises()
  for (const [input, name] of [['code', 'star-share'], ['https://x.test/operator/share/code', 'operator-share'], ['https://x.test/star/share/code', 'star-share']]) {
    await wrapper.get('input').setValue(input); await wrapper.get('form').trigger('submit')
    expect(useRouter().push).toHaveBeenLastCalledWith({ name, params: { token: 'code' } })
  }
  await wrapper.get('input').setValue('bad code'); await wrapper.get('form').trigger('submit')
  expect(wrapper.get('[role="alert"]').text()).toContain('未识别')
  expect(viewStarShare).not.toHaveBeenCalled()
})
it('快速换码后迟到响应隔离；刷新读取最新等级', async () => {
  const a = deferred(), b = deferred()
  viewStarShare.mockImplementation(code => code === 'a' ? a.promise : b.promise)
  const wrapper = render(); useRoute().params.token = 'b'; await flushPromises()
  b.resolve({ ...data, game: '代号鸢' }); await flushPromises()
  a.resolve(data); await flushPromises()
  expect(wrapper.text()).toContain('代号鸢'); expect(wrapper.text()).not.toContain('如鸢')
  viewStarShare.mockResolvedValue({ ...data, inventory: [{ ...data.inventory[0], level: 20 }] })
  await wrapper.findAll('button').find(button => button.text() === '刷新数据').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('Lv.20')
  expect(fetch).not.toHaveBeenCalled()
})
it.each([
  [{ has_state: false, updated_at: null, inventory: [] }, '暂无已保存的云端星石背包'],
  [{ has_state: true, inventory: [] }, '当前云端背包为空']
])('无文档与已保存空背包各自展示，不是失效链接', async (fields, text) => {
  viewStarShare.mockResolvedValue({ ...data, ...fields }); const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain(text); expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
it.each([
  [Object.assign(new Error('private detail'), { status: 404, code: 'share_not_authorized' }), '尚未公开星石背包'],
  [Object.assign(new Error('private detail'), { status: 404 }), '分享码不存在或已失效'],
  [Object.assign(new Error('private detail'), { status: 503 }), '分享服务暂时不可用'],
  [Object.assign(new Error('private detail'), { code: 'REQUEST_TIMEOUT' }), '读取分享数据超时'],
  [new TypeError('Failed to fetch'), '请检查网络后重试']
])('权限、失效与网络错误独立处理并可重试', async (error, text) => {
  viewStarShare.mockRejectedValueOnce(error); const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(text); expect(wrapper.text()).not.toContain('private detail')
  await wrapper.findAll('button').find(button => button.text() === '重试').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('天府')
})
it('卸载后迟到响应不会改变后续分享页面', async () => {
  const late = deferred(); viewStarShare.mockReturnValueOnce(late.promise)
  const first = render(); first.unmount(); useRoute().params.token = 'b'
  const second = render(); await flushPromises(); late.resolve({ ...data, game: '旧账号' }); await flushPromises()
  expect(second.text()).not.toContain('旧账号')
})
it('刷新保留品质、搜索、排序及网格节点，换码重置状态，旧刷新不得覆盖新码', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('select')[0].setValue('orange')
  await wrapper.findAll('select')[1].setValue('name')
  await wrapper.findAll('input[type="search"]')[0].setValue('天府')
  const grid = wrapper.get('.star-share-inventory').element
  const list = wrapper.get('.star-share-list').element
  list.scrollTop = 20
  const refresh = deferred()
  viewStarShare.mockReturnValueOnce(refresh.promise)
  await wrapper.findAll('button').find(button => button.text() === '刷新数据').trigger('click')
  expect(wrapper.get('.star-share-inventory').element).toBe(grid)
  refresh.resolve({ ...data, inventory: [{ ...data.inventory[0], level: 30 }] }); await flushPromises()
  expect(wrapper.findAll('select').slice(0, 2).map(node => node.element.value)).toEqual(['orange', 'name'])
  expect(wrapper.findAll('input[type="search"]')[0].element.value).toBe('天府')
  expect(wrapper.get('.star-share-list').element).toBe(list)
  expect(list.scrollTop).toBe(20)
  expect(wrapper.text()).toContain('Lv.30')
  const old = deferred()
  viewStarShare.mockReturnValueOnce(old.promise)
  await wrapper.findAll('button').find(button => button.text() === '刷新数据').trigger('click')
  useRoute().params.token = 'new'; await flushPromises()
  old.resolve({ ...data, game: '旧账号' }); await flushPromises()
  expect(wrapper.text()).not.toContain('旧账号')
  expect(wrapper.findAll('select').slice(0, 2).map(node => node.element.value)).toEqual(['all', 'catalog'])
  expect(wrapper.findAll('input[type="search"]')[0].element.value).toBe('')
})
it('刷新发现授权已关闭时移除旧背包，重试后筛选仍保留', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('input[type="search"]')[0].setValue('天府')
  viewStarShare.mockRejectedValueOnce(Object.assign(new Error(), { code: 'share_not_authorized' }))
  await wrapper.findAll('button').find(button => button.text() === '刷新数据').trigger('click'); await flushPromises()
  expect(wrapper.find('.star-share-inventory').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '重试').trigger('click'); await flushPromises()
  expect(wrapper.findAll('input[type="search"]')[0].element.value).toBe('天府')
})
