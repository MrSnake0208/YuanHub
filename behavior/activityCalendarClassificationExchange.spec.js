import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import Dialog from '../src/components/calendar/CalendarClassificationImportDialog.vue'
import Admin from '../src/pages/calendar/admin.vue'
import * as api from '../src/api/activityCalendar.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'
import { downloadClassification, CLASSIFICATION_MAX_BYTES } from '../src/data/activityCalendarClassificationExchange.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'admin-a' }, adminAccess: { permissions: ['activity_calendar:write'] } }) }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), isFeatureEnabled: () => true }))
vi.mock('../src/api/activityCalendar.js', () => ({ listAdminActivityCalendar: vi.fn(), createActivityCalendar: vi.fn(), updateActivityCalendar: vi.fn(), exportActivityCalendar: vi.fn(), previewCalendarClassification: vi.fn(), commitCalendarClassification: vi.fn() }))
const documentData = { document_type: 'activity-calendar-classification', schema_version: 1, items: [], reference_items: [] }
const source = JSON.stringify(documentData)
const report = patch => ({ total: 1, ready: 1, unchanged: 0, skipped: 0, invalid: 0, conflicts: 0, reference_count: 1, updated: 0, rows: [{ row: 1, id: 'evt_1', title: '资料', status: 'READY', before: null, after: { level1: '家具', level2: '历练' } }], preview_token: 'snapshot', ...patch })
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text)
const click = async text => { button(text).click(); await flushPromises() }
let wrappers = []
function render(component = Dialog) {
  const wrapper = mount(component, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub, CalendarSuggestionsReview: true } } })
  wrappers.push(wrapper); return wrapper
}
async function enter(value = source) { const input = document.querySelector('textarea'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
async function confirm() { document.querySelector('.calendar-import-footer input[type=checkbox]').click(); await flushPromises() }
beforeEach(() => {
  vi.clearAllMocks(); dialog.confirm.mockResolvedValue(true)
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'admin-a' }; auth.adminAccess = { permissions: ['activity_calendar:write'] }
  api.listAdminActivityCalendar.mockResolvedValue({ items: [] })
  api.exportActivityCalendar.mockResolvedValue(documentData)
  api.previewCalendarClassification.mockResolvedValue(report())
  api.commitCalendarClassification.mockResolvedValue(report({ ready: 0, updated: 1 }))
})
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers = []; document.body.innerHTML = ''; vi.unstubAllGlobals() })

it('预览无写，必须勾选确认，文件改变立即废弃预览，提交同一原文和令牌', async () => {
  const wrapper = render(); await enter(); await click('校验并预览')
  expect(api.commitCalendarClassification).not.toHaveBeenCalled()
  expect(button('确认更新分类').disabled).toBe(true)
  await confirm(); expect(button('确认更新分类').disabled).toBe(false)
  await enter(source + ' '); expect(button('确认更新分类').disabled).toBe(true)
  await click('校验并预览'); await confirm(); await click('确认更新分类')
  expect(api.commitCalendarClassification).toHaveBeenCalledWith(source + ' ', 'snapshot')
  expect(wrapper.emitted('updated')).toHaveLength(1)
  expect(document.body.textContent).toContain('已更新 1 条分类')
  expect(button('确认更新分类').disabled).toBe(true)
})
it.each([{ ready: 0, unchanged: 1 }, { invalid: 1 }, { conflicts: 1 }])('零更新或错误禁止提交：%j', async patch => {
  api.previewCalendarClassification.mockResolvedValue(report(patch))
  render(); await enter(); await click('校验并预览')
  expect(button('确认更新分类').disabled).toBe(true)
  expect(document.querySelector('.calendar-import-footer input[type=checkbox]')).toBeNull()
  expect(api.commitCalendarClassification).not.toHaveBeenCalled()
})
it('超时保留原文并废弃令牌，刷新实际数据后要求重新预览', async () => {
  api.commitCalendarClassification.mockRejectedValue(new Error('超时'))
  const wrapper = render(); await enter(); await click('校验并预览'); await confirm(); await click('确认更新分类')
  expect(document.querySelector('textarea').value).toBe(source)
  expect(document.body.textContent).toContain('请重新预览文件')
  expect(document.activeElement.getAttribute('role')).toBe('alert')
  expect(button('确认更新分类').disabled).toBe(true)
  expect(wrapper.emitted('updated')).toHaveLength(1)
})
it('坏文件废弃旧预览；关闭草稿经过确认，焦点和滚动恢复', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const wrapper = render(); await enter(); await click('校验并预览'); await confirm()
  const input = document.querySelector('input[type=file]')
  Object.defineProperty(input, 'files', { value: [{ name: 'bad.json', size: 1, arrayBuffer: async () => new Uint8Array([255]).buffer }] })
  input.dispatchEvent(new Event('change')); await flushPromises()
  expect(button('确认更新分类').disabled).toBe(true)
  expect(document.body.textContent).toContain('UTF-8')
  dialog.confirm.mockResolvedValueOnce(false); await click('关闭')
  expect(wrapper.emitted('close')).toBeUndefined()
  await click('关闭'); expect(wrapper.emitted('close')).toHaveLength(1)
  expect(document.activeElement).toBe(opener)
  wrapper.unmount(); wrappers = []
  expect(document.body.style.overflow).toBe('')
})
it('完整导出不带筛选，释放下载URL；切换身份忽略迟到下载与预览', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:fixture'); URL.revokeObjectURL = vi.fn()
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(Admin); await flushPromises(); await click('导出全部')
  expect(api.exportActivityCalendar).toHaveBeenCalledWith()
  expect(download).toHaveBeenCalledTimes(1)
  await new Promise(resolve => setTimeout(resolve, 10)); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
  let resolveExport
  api.exportActivityCalendar.mockReturnValue(new Promise(resolve => { resolveExport = resolve }))
  await click('导出全部'); auth.userInfo = { id: 'admin-b' }; await flushPromises()
  resolveExport(documentData); await flushPromises(); expect(download).toHaveBeenCalledTimes(1)
  await click('导入更新分类'); await enter()
  let resolvePreview
  api.previewCalendarClassification.mockReturnValue(new Promise(resolve => { resolvePreview = resolve }))
  await click('校验并预览'); auth.adminAccess = { permissions: [] }; await flushPromises()
  resolvePreview(report()); await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(api.commitCalendarClassification).not.toHaveBeenCalled()
})

it('紧邻容量的完整导出去除缩进仍可往返，不截断条目', () => {
  const value = { ...documentData, items: [{ original: { description: '' } }] }
  value.items[0].original.description = 'x'.repeat(CLASSIFICATION_MAX_BYTES - JSON.stringify(value).length)
  URL.createObjectURL = vi.fn(() => 'blob:limit'); URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  downloadClassification(value)
  expect(URL.createObjectURL.mock.calls[0][0].size).toBe(CLASSIFICATION_MAX_BYTES)
  expect(value.items).toHaveLength(1)
})
