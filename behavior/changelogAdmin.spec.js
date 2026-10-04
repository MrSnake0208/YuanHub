import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { EditorContent } from '@tiptap/vue-3'
import ChangelogAdmin from '../src/pages/changelog/admin.vue'
import * as api from '../src/api/changelog.js'
import { uploadMedia } from '../src/api/media.js'
import { prepareImageUpload } from '../src/utils/imageUpload.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/changelog.js', () => ({
  listAdminChangelog: vi.fn(), saveChangelogDraft: vi.fn(), createChangelogDraft: vi.fn(),
  submitChangelog: vi.fn(), approveChangelog: vi.fn(), rejectChangelog: vi.fn(), withdrawChangelog: vi.fn()
}))
vi.mock('../src/api/media.js', () => ({ uploadMedia: vi.fn() }))
vi.mock('../src/utils/imageUpload.js', () => ({ IMAGE_UPLOAD_PROFILES: { CHANGELOG: {} }, prepareImageUpload: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: 'session-a', userInfo: { id: 'editor-a' }, adminAccess: { permissions: ['changelog:write'] } }) }
})
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const body = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const entry = (id = 'log-a', title = '日志A', version = 1) => ({
  id, version, workingRevision: { title, versionLabel: 'v1', body: body('服务器正文'), state: 'DRAFT', authoredBy: 'editor-a' }, publishedRevision: null
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin/changelog', component: ChangelogAdmin },
    { path: '/away', component: { template: '<p>离开后的页面</p>' } }
  ] })
  await router.push('/admin/changelog'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { global: {
    plugins: [router], stubs: { IslandSidebar: true, AdminBackLink: true, ChangelogContent: true }
  } })
  await flushPromises()
  return { wrapper, router }
}
const editorFor = wrapper => wrapper.getComponent(EditorContent).props('editor')
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)
const titleFor = wrapper => wrapper.get('.fields input[maxlength="120"]')
async function edit(wrapper) {
  await titleFor(wrapper).setValue('未保存标题')
  editorFor(wrapper).commands.setContent(body('未保存正文'))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'session-a'
  auth.userInfo = { id: 'editor-a' }
  auth.adminAccess = { permissions: ['changelog:write'] }
  api.listAdminChangelog.mockReset().mockResolvedValue({ data: [entry(), entry('log-b', '日志B')], page: 1, hasNext: true })
  api.saveChangelogDraft.mockReset().mockResolvedValue(entry('log-a', '已保存标题', 2))
  api.createChangelogDraft.mockReset().mockResolvedValue(entry('log-new', '新日志', 1))
  uploadMedia.mockReset()
  prepareImageUpload.mockReset()
  dialog.confirm.mockReset().mockResolvedValue(false)
})

it('拒绝切换、新建、翻页保留完整草稿，确认切换只询问一次', async () => {
  const { wrapper } = await render()
  await edit(wrapper)
  await wrapper.findAll('.entry-button')[1].trigger('click'); await flushPromises()
  await button(wrapper, '新建').trigger('click'); await flushPromises()
  await button(wrapper, '下一页').trigger('click'); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('未保存标题')
  expect(editorFor(wrapper).getText()).toBe('未保存正文')
  expect(api.listAdminChangelog).toHaveBeenCalledTimes(1)
  expect(dialog.confirm).toHaveBeenCalledTimes(3)
  dialog.confirm.mockClear().mockResolvedValue(true)
  await wrapper.findAll('.entry-button')[1].trigger('click'); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('日志B')
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
})

it('路由离开和刷新保护草稿，取消保留，允许离开后清理刷新监听', async () => {
  const { wrapper, router } = await render()
  await edit(wrapper)
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/admin/changelog')
  expect(editorFor(wrapper).getText()).toBe('未保存正文')
  const before = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(before)
  expect(before.defaultPrevented).toBe(true)
  dialog.confirm.mockClear().mockResolvedValue(true)
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/away')
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  const after = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
})

it('保存期间暂停文字和条目切换，重复保存只发一次，成功后离开不再确认', async () => {
  const { wrapper, router } = await render()
  await edit(wrapper)
  const pending = deferred()
  api.saveChangelogDraft.mockReturnValue(pending.promise)
  await button(wrapper, '保存草稿').trigger('click')
  await flushPromises()
  expect(titleFor(wrapper).element.disabled).toBe(true)
  expect(editorFor(wrapper).isEditable).toBe(false)
  expect(wrapper.findAll('.entry-button').every(item => item.element.disabled)).toBe(true)
  expect(button(wrapper, '新建').element.disabled).toBe(true)
  await button(wrapper, '处理中…').trigger('click')
  expect(api.saveChangelogDraft).toHaveBeenCalledTimes(1)
  expect(api.saveChangelogDraft).toHaveBeenCalledWith('log-a', expect.objectContaining({
    title: '未保存标题', body: body('未保存正文'), expectedVersion: 1
  }))
  pending.resolve(entry('log-a', '已保存标题', 2)); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('已保存标题')
  expect(editorFor(wrapper).isEditable).toBe(true)
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/away')
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it.each([500, 409])('保存%s保留草稿，409重载取消/失败保留，成功才更新版本', async status => {
  const { wrapper } = await render()
  await edit(wrapper)
  api.saveChangelogDraft.mockRejectedValueOnce(Object.assign(new Error('保存失败'), { status }))
  await button(wrapper, '保存草稿').trigger('click'); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('未保存标题')
  expect(editorFor(wrapper).getText()).toBe('未保存正文')
  if (status === 500) {
    expect(editorFor(wrapper).isEditable).toBe(true)
    return
  }
  await button(wrapper, '重新加载').trigger('click'); await flushPromises()
  expect(api.listAdminChangelog).toHaveBeenCalledTimes(1)
  expect(editorFor(wrapper).getText()).toBe('未保存正文')
  dialog.confirm.mockResolvedValue(true)
  api.listAdminChangelog.mockRejectedValueOnce(new Error('重载失败'))
  await button(wrapper, '重新加载').trigger('click'); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('未保存标题')
  expect(editorFor(wrapper).getText()).toBe('未保存正文')
  api.listAdminChangelog.mockResolvedValueOnce({ data: [entry('log-a', '服务器最新标题', 3)], page: 1, hasNext: false })
  await button(wrapper, '重新加载').trigger('click'); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('服务器最新标题')
  await titleFor(wrapper).setValue('再次修改')
  await button(wrapper, '保存草稿').trigger('click'); await flushPromises()
  expect(api.saveChangelogDraft).toHaveBeenLastCalledWith('log-a', expect.objectContaining({ expectedVersion: 3 }))
})

it('等待确认时重复点击不会同时切换两条日志', async () => {
  const { wrapper } = await render()
  await edit(wrapper)
  const confirmation = deferred()
  dialog.confirm.mockReturnValue(confirmation.promise)
  await wrapper.findAll('.entry-button')[1].trigger('click')
  await button(wrapper, '新建').trigger('click')
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  confirmation.resolve(true); await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('日志B')
})

it.each(['save', 'confirm', 'load'])('换用户后旧%s响应不能覆盖新用户日志', async kind => {
  const old = deferred()
  if (kind === 'load') api.listAdminChangelog.mockReturnValueOnce(old.promise)
  const { wrapper } = await render()
  if (kind !== 'load') {
    await edit(wrapper)
    if (kind === 'save') {
      api.saveChangelogDraft.mockReturnValueOnce(old.promise)
      await button(wrapper, '保存草稿').trigger('click')
    } else {
      dialog.confirm.mockReturnValueOnce(old.promise)
      await wrapper.findAll('.entry-button')[1].trigger('click')
    }
  }
  api.listAdminChangelog.mockResolvedValue({ data: [entry('user-b-log', '用户B日志')], page: 1, hasNext: false })
  auth.userInfo = { id: 'editor-b' }; await flushPromises()
  if (kind === 'save') old.resolve(entry('log-a', '旧保存结果', 2))
  else if (kind === 'confirm') old.resolve(true)
  else old.resolve({ data: [entry('log-a', '旧加载结果')], page: 1, hasNext: false })
  await flushPromises()
  expect(titleFor(wrapper).element.value).toBe('用户B日志')
  expect(wrapper.text()).not.toContain('旧保存结果')
  expect(wrapper.text()).not.toContain('旧加载结果')
})

it('上传期间禁用编辑和保存，换用户后旧上传不能插入新正文', async () => {
  const { wrapper } = await render()
  const pending = deferred()
  vi.spyOn(window, 'prompt').mockReturnValue('合成图片')
  prepareImageUpload.mockResolvedValue({ file: new File(['synthetic'], 'image.webp', { type: 'image/webp' }) })
  uploadMedia.mockReturnValue(pending.promise)
  const fileInput = wrapper.get('input[type="file"]')
  Object.defineProperty(fileInput.element, 'files', { value: [new File(['synthetic'], 'image.png', { type: 'image/png' })] })
  await fileInput.trigger('change'); await flushPromises()
  expect(titleFor(wrapper).element.disabled).toBe(true)
  expect(button(wrapper, '保存草稿').element.disabled).toBe(true)
  expect(editorFor(wrapper).isEditable).toBe(false)
  api.listAdminChangelog.mockResolvedValue({ data: [entry('user-b-log', '用户B日志')], page: 1, hasNext: false })
  auth.userInfo = { id: 'editor-b' }; await flushPromises()
  pending.resolve({ id: 'old-media', url: '/old-media.webp' }); await flushPromises()
  expect(editorFor(wrapper).getJSON()).toEqual(body('服务器正文'))
  expect(titleFor(wrapper).element.value).toBe('用户B日志')
})

it('离页放弃后旧保存失败不在其它页面显示错误', async () => {
  const { wrapper, router } = await render()
  await edit(wrapper)
  const pending = deferred()
  api.saveChangelogDraft.mockReturnValue(pending.promise)
  await button(wrapper, '保存草稿').trigger('click')
  dialog.confirm.mockResolvedValue(true)
  await router.push('/away'); await flushPromises()
  pending.reject(new Error('迟到的保存错误')); await flushPromises()
  expect(wrapper.text()).toBe('离开后的页面')
})

it('无写入权限不允许编辑，有审核权限仍不能自审', async () => {
  auth.adminAccess = { permissions: ['changelog:review'] }
  api.listAdminChangelog.mockResolvedValue({ data: [{ ...entry(), workingRevision: { ...entry().workingRevision, state: 'IN_REVIEW' } }], page: 1, hasNext: false })
  const { wrapper } = await render()
  expect(titleFor(wrapper).element.disabled).toBe(true)
  expect(button(wrapper, '保存草稿')).toBeUndefined()
  expect(button(wrapper, '审核通过并发布')).toBeUndefined()
  expect(api.approveChangelog).not.toHaveBeenCalled()
})
