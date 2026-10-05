import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkEditor from '../src/pages/work/editor.vue'
import { createEmptyWorkDocument } from '../src/utils/workEditor.js'
import { getOwnedWork } from '../src/api/work.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn()
}))
vi.mock('../src/api/work.js', () => ({
  getOwnedWork: vi.fn(), createWork: vi.fn(), updateWork: vi.fn(), deleteWork: vi.fn(),
  publishWork: vi.fn(), unpublishWork: vi.fn(), previewWorkCompatibility: vi.fn()
}))
vi.mock('../src/api/level.js', () => ({ listLevelCatalog: vi.fn(async () => ({ levels: [] })) }))

beforeEach(() => vi.clearAllMocks())
const render = id => mount(WorkEditor, {
  props: { id }, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true, WorkCompatibilityResult: true } }
})

it('新建身份与尚未保存状态明确，保存只在表单中', async () => {
  const wrapper = render(''); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('新建作业')
  expect(wrapper.get('.page-header-context').text()).toContain('尚未保存')
  expect(wrapper.get('.page-header-back').attributes('to')).toBe('/works')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  expect(wrapper.findAll('button[type="submit"]')).toHaveLength(1)
  wrapper.unmount()
})

it.each(['DRAFT', 'PUBLIC'])('已有对象显示完整标题及真实 %s 状态', async status => {
  const title = '兰台第三十层 · 低练度通关与回合顺序'.repeat(4)
  getOwnedWork.mockResolvedValue({
    metadata: { id: 'synthetic-work', status, revision: 3 },
    document: { ...createEmptyWorkDocument(), stage_name: '兰台第三十层', doc: { title, details: '' } }
  })
  const wrapper = render('synthetic-work'); await flushPromises()
  expect(wrapper.get('h1').text()).toBe(title)
  expect(wrapper.get('.page-header-description').text()).toBe('编辑作业')
  expect(wrapper.get('.page-header-context').text()).toContain(status === 'PUBLIC' ? '已发布' : '草稿')
  expect(wrapper.get('.page-header-context').text()).toContain('ID synthetic-work')
  expect(wrapper.get('.page-header-back').attributes('to')).toBe('/work/synthetic-work')
  await wrapper.get('[data-work-path="$.doc.title"] input').setValue('修改后的作业')
  expect(wrapper.get('h1').text()).toBe('修改后的作业')
  expect(wrapper.get('.page-header-context').text()).toContain('有未保存修改')
  wrapper.unmount()
})

it('读取中及权限/对象错误不展示虚构的草稿或已保存状态', async () => {
  let reject
  getOwnedWork.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const wrapper = render('missing-work')
  expect(wrapper.get('h1').text()).toBe('编辑作业')
  expect(wrapper.find('.page-header-context').exists()).toBe(false)
  expect(wrapper.get('.editor-state').text()).toContain('正在读取')
  reject(new Error('无编辑权限或作业不存在')); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('编辑作业')
  expect(wrapper.find('.page-header-context').exists()).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toContain('无编辑权限或作业不存在')
  expect(wrapper.find('.work-form').exists()).toBe(false)
  wrapper.unmount()
})
