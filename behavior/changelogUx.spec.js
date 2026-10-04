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

it('摘要规范空白并精确排除标题和重复段落，过滤后取三条且不改写正文', () => {
  const document = { type: 'doc', content: [
    paragraph('  版本  标题 '), paragraph('新增  工具'), paragraph('新增\n工具'),
    paragraph('新增工具'), paragraph('修复加载'), paragraph('第四个有效段落')
  ] }
  const original = JSON.stringify(document)
  expect(changelogHighlights(document, '版本 标题')).toEqual(['新增 工具', '新增工具', '修复加载'])
  expect(JSON.stringify(document)).toBe(original)
  expect(changelogHighlights({ type: 'doc', content: [paragraph('版本标题'), paragraph('版本标题'), paragraph('图片说明')] }, '版本标题')).toEqual(['图片说明'])
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
  expect(wrapper.text()).toContain('站点版本')
  expect(wrapper.get('.version').text()).toContain('最新公开日志 · 1.0')
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

it('后续分页版本深链自动读取到目标，保留前页并展开目标正文', async () => {
  window.history.replaceState(null, '', '/changelog#version-older-release')
  const release = (id, title) => ({ id, revision: 1, title, versionLabel: '1.0', publishedAt: '2026-09-30T00:00:00Z', body: body() })
  listChangelog.mockResolvedValueOnce({ data: [release('latest-release', '最新日志')], page: 1, hasNext: true })
    .mockResolvedValueOnce({ data: [release('older-release', '历史日志')], page: 2, hasNext: false })
  const wrapper = mount(ChangelogPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(listChangelog.mock.calls.map(([params]) => params.page)).toEqual([1, 2])
  expect(wrapper.findAll('.changelog-card')).toHaveLength(2)
  expect(wrapper.get('#version-older-release details').element.open).toBe(true)
  expect(wrapper.get('#version-older-release').element.scrollIntoView).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('深链后页加载失败保留首批，重试继续第二页而不重复第一页', async () => {
  window.history.replaceState(null, '', '/changelog#version-older-release')
  listChangelog.mockResolvedValueOnce({ data: [{ id: 'latest-release', revision: 1, title: '首批日志', body: body() }], page: 1, hasNext: true })
    .mockRejectedValueOnce(new Error('后页加载失败'))
    .mockResolvedValueOnce({ data: [{ id: 'older-release', revision: 1, title: '历史日志', body: body() }], page: 2, hasNext: false })
  const wrapper = mount(ChangelogPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('后页加载失败')
  expect(wrapper.findAll('.changelog-card')).toHaveLength(1)
  await wrapper.get('.load-more').trigger('click'); await flushPromises()
  expect(listChangelog.mock.calls.map(([params]) => params.page)).toEqual([1, 2, 2])
  expect(wrapper.findAll('.changelog-card')).toHaveLength(2)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

it('不存在的公开日志深链在分页结束后停止并提示', async () => {
  window.history.replaceState(null, '', '/changelog#version-missing')
  const wrapper = renderPage(); await flushPromises()
  expect(listChangelog).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[role="status"]').text()).toContain('未找到此链接对应的公开日志')
})

it('深链每次最多自动查找五页，继续加载后可以找到更旧目标', async () => {
  window.history.replaceState(null, '', '/changelog#version-page-6')
  listChangelog.mockImplementation(({ page }) => Promise.resolve({
    data: [{ id: 'page-' + page, revision: 1, title: '日志 ' + page, body: body() }], page, hasNext: page < 6
  }))
  const wrapper = mount(ChangelogPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(listChangelog).toHaveBeenCalledTimes(5)
  expect(wrapper.get('[role="status"]').text()).toContain('继续加载更多')
  await wrapper.get('.load-more').trigger('click'); await flushPromises()
  expect(listChangelog).toHaveBeenCalledTimes(6)
  expect(wrapper.get('#version-page-6 details').element.open).toBe(true)
  wrapper.unmount()
})

it('无深链时只加载一页，重复加载更多只发一个请求', async () => {
  listChangelog.mockResolvedValueOnce({ data: [{ id: 'one', revision: 1, title: '首批日志', body: body() }], page: 1, hasNext: true })
  const wrapper = renderPage(); await flushPromises()
  expect(listChangelog).toHaveBeenCalledTimes(1)
  let resolve
  listChangelog.mockReturnValueOnce(new Promise(ok => { resolve = ok }))
  await wrapper.get('.load-more').trigger('click')
  await wrapper.get('.load-more').trigger('click')
  expect(listChangelog).toHaveBeenCalledTimes(2)
  resolve({ data: [{ id: 'two', revision: 1, title: '第二页日志', body: body() }], page: 2, hasNext: false }); await flushPromises()
  expect(wrapper.findAll('.changelog-card')).toHaveLength(2)
})

it('卸载后迟到深链响应不继续翻页或滚动', async () => {
  window.history.replaceState(null, '', '/changelog#version-late-release')
  let resolve
  listChangelog.mockReturnValueOnce(new Promise(ok => { resolve = ok }))
  const wrapper = renderPage()
  wrapper.unmount()
  resolve({ data: [{ id: 'late-release', revision: 1, title: '旧日志', body: body() }], page: 1, hasNext: true }); await flushPromises()
  expect(listChangelog).toHaveBeenCalledTimes(1)
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
})

afterEach(() => window.history.replaceState(null, '', '/'))
