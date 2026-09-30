import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import ChangelogContent from '../src/components/changelog/ChangelogContent.vue'
import ChangelogPage from '../src/pages/changelog/index.vue'
import { listChangelog } from '../src/api/changelog.js'
import { changelogHighlights } from '../src/utils/changelogContent.js'

vi.mock('../src/api/changelog.js', () => ({ listChangelog: vi.fn() }))
vi.mock('../src/api/coCreation.js', () => ({ listPublicFeedback: vi.fn(() => Promise.resolve({ items: [] })) }))
vi.mock('../src/api/request.js', () => ({ avatarUrl: path => 'https://assets.example.invalid' + path }))

const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = () => ({ type: 'doc', content: [paragraph('可以查看更新内容')] })
const renderPage = () => mount(ChangelogPage, {
  global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } }
})

beforeEach(() => {
  window.history.replaceState(null, '', '/changelog')
  Element.prototype.scrollIntoView = vi.fn()
  listChangelog.mockReset().mockResolvedValue({ data: [{ id: 'release-example', revision: 1, title: '可读的版本', versionLabel: '1.0', publishedAt: '2026-09-30T00:00:00Z', body: body() }], page: 1, hasNext: false })
})

it('响应式正文和嵌套图片可以渲染，更新正文不改写原始图片地址', async () => {
  const document = reactive(body())
  document.content.push({ type: 'image', attrs: { src: '/avatar/example.webp', alt: '示例截图' } })
  document.content[0].content[0].marks = [{ type: 'link', attrs: { href: 'https://example.invalid/help' } }]
  const wrapper = mount(ChangelogContent, { props: { body: document } }); await flushPromises()
  expect(wrapper.text()).toContain('可以查看更新内容')
  expect(wrapper.get('img').attributes('src')).toBe('https://assets.example.invalid/avatar/example.webp')
  expect(document.content[1].attrs.src).toBe('/avatar/example.webp')
  expect(wrapper.get('a').attributes('href')).toBe('https://example.invalid/help')
  expect(wrapper.get('[contenteditable]').attributes('contenteditable')).toBe('false')
  document.content[0].content[0].text = '后来更新的正文'
  await flushPromises()
  expect(wrapper.text()).toContain('后来更新的正文')
  wrapper.unmount()
})

it('无效正文显示局部错误并可在正文恢复后重试', async () => {
  const document = body()
  document.type = 'invalid'
  const wrapper = mount(ChangelogContent, { props: { body: document } }); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('正文暂时无法显示')
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  await wrapper.setProps({ body: body() }); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('可以查看更新内容')
  wrapper.unmount()
})

it('摘要提取真实段落和列表，跳过图片和标题且最多三条', () => {
  const document = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '版本标题' }] },
    { type: 'image', attrs: { src: '/avatar/example.webp' } },
    paragraph(' '),
    { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('新增工具')] }] },
    paragraph('修复加载'), paragraph('改进阅读'), paragraph('第四条')
  ] }
  expect(changelogHighlights(document)).toEqual(['新增工具', '修复加载', '改进阅读'])
  expect(changelogHighlights(null)).toEqual([])
})

it('版本标题、摘要和正文同时可读，首次请求失败后可恢复', async () => {
  listChangelog.mockRejectedValueOnce(new Error('网络暂时不可用'))
  const wrapper = renderPage(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('网络暂时不可用')
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.get('.changelog-card').attributes('id')).toBe('version-release-example')
  expect(wrapper.get('.changelog-card h2').text()).toBe('可读的版本')
  expect(wrapper.get('.changelog-highlights').text()).toContain('可以查看更新内容')
  expect(wrapper.get('.changelog-full').attributes()).toHaveProperty('open')
  expect(wrapper.get('.changelog-rich-text').text()).toContain('可以查看更新内容')
  wrapper.unmount()
})


it('异步加载首批日志后定位已存在的版本锚点', async () => {
  window.history.replaceState(null, '', '/changelog#version-release-example')
  const wrapper = mount(ChangelogPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(wrapper.get('#version-release-example').element.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  wrapper.unmount()
})

afterEach(() => window.history.replaceState(null, '', '/'))
