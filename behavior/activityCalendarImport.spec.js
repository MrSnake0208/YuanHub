import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import Dialog from '../src/components/calendar/CalendarImportDialog.vue'
import Admin from '../src/pages/calendar/admin.vue'
import * as api from '../src/api/activityCalendar.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'admin-a' }, adminAccess: { permissions: ['activity_calendar:write'] } }) }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), isFeatureEnabled: () => true }))
vi.mock('../src/api/activityCalendar.js', () => ({ listAdminActivityCalendar: vi.fn(), createActivityCalendar: vi.fn(), updateActivityCalendar: vi.fn(), previewActivityCalendarImport: vi.fn(), commitActivityCalendarImport: vi.fn() }))
const source = '{"schema_version":1,"items":[{"game":"如鸢","title":"活动","category":"ACTIVITY","start_date":"2026-10-10","end_date":"2026-10-20"}]}'
const row = (patch = {}) => ({ row: 1, status: 'READY', title: '活动', game: '如鸢', issues: [], data: { game: '如鸢', title: '活动', category: 'ACTIVITY', start_date: '2026-10-10', end_date: '2026-10-20', time_zone: 'Asia/Shanghai', enabled: true }, ...patch })
const report = (patch = {}) => ({ total: 1, ready: 1, existing: 0, duplicates: 0, invalid: 0, conflicts: 0, public_count: 1, created: 0, failed: 0, rows: [row()], preview_token: 'preview-one', ...patch })
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text)
const click = async text => { button(text).click(); await flushPromises() }
let wrappers = []
function render(component = Dialog) {
  const wrapper = mount(component, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub, CalendarSuggestionsReview: true } } })
  wrappers.push(wrapper); return wrapper
}
async function enter(value = source) { const input = document.querySelector('#calendar-import-json'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
async function confirm() { document.querySelector('.calendar-import-footer input[type=checkbox]').click(); await flushPromises() }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => {
  vi.clearAllMocks(); dialog.confirm.mockResolvedValue(true)
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'admin-a' }; auth.adminAccess = { permissions: ['activity_calendar:write'] }
  api.listAdminActivityCalendar.mockResolvedValue({ items: [] })
  api.previewActivityCalendarImport.mockResolvedValue(report())
  api.commitActivityCalendarImport.mockResolvedValue(report({ ready: 0, created: 1, preview_token: null, rows: [row({ status: 'CREATED' })] }))
})
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers = []; document.body.innerHTML = '' })

it('有效预览后人工确认才允许提交；JSON修改立即失效，提交携带相同原文与token', async () => {
  const wrapper = render(); await enter()
  expect(button('确认导入').disabled).toBe(true)
  await click('校验并预览')
  expect(api.previewActivityCalendarImport).toHaveBeenCalledWith(source)
  expect(button('确认导入').disabled).toBe(true)
  await confirm(); expect(button('确认导入').disabled).toBe(false)
  await enter(source + ' '); expect(button('确认导入').disabled).toBe(true)
  expect(document.querySelector('.calendar-import-rows')).toBeNull()
  await click('校验并预览'); await confirm(); await click('确认导入')
  expect(api.commitActivityCalendarImport).toHaveBeenCalledWith(source + ' ', 'preview-one')
  expect(document.body.textContent).toContain('已创建 1')
  expect(wrapper.emitted('imported')).toHaveLength(1)
  expect(button('确认导入').disabled).toBe(true)
})
it('无效行定位条目与字段，错误筛选和分页不要求翻看200条，禁止整批提交', async () => {
  const rows = Array.from({ length: 25 }, (_, index) => row({ row: index + 1 }))
  rows[21] = row({ row: 22, status: 'INVALID', issues: [{ field: 'end_date', message: '结束日期不能早于开始日期' }] })
  api.previewActivityCalendarImport.mockResolvedValue(report({ total: 25, ready: 24, invalid: 1, rows }))
  render(); await enter(); await click('校验并预览')
  expect(document.querySelectorAll('.calendar-import-rows > li')).toHaveLength(1)
  expect(document.body.textContent).toContain('第 22 条'); expect(document.body.textContent).toContain('end_date')
  expect(document.querySelector('.calendar-import-footer input').disabled).toBe(true)
  const filter = document.querySelector('.calendar-import-filter select'); filter.value = 'all'; filter.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
  expect(document.querySelectorAll('.calendar-import-rows > li')).toHaveLength(10)
  await click('下一页'); expect(document.body.textContent).toContain('第 11 条')
  expect(api.commitActivityCalendarImport).not.toHaveBeenCalled()
})
it('提交中不能关闭/修改/重复点击，部分失败提示重新预览安全重试', async () => {
  const pending = deferred(); api.commitActivityCalendarImport.mockReturnValue(pending.promise)
  const wrapper = render(); await enter(); await click('校验并预览'); await confirm(); await click('确认导入')
  expect(button('导入中…').disabled).toBe(true); expect(document.querySelector('#calendar-import-json').disabled).toBe(true)
  await click('关闭'); expect(wrapper.emitted('close')).toBeUndefined()
  expect(api.commitActivityCalendarImport).toHaveBeenCalledTimes(1)
  pending.resolve(report({ total: 2, ready: 0, created: 1, failed: 1, rows: [row({ status: 'CREATED' }), row({ row: 2, status: 'FAILED', issues: [{ field: 'items', message: '未确认' }] })] }))
  await flushPromises(); expect(document.body.textContent).toContain('已创建 1'); expect(document.body.textContent).toContain('安全重试')
  expect(document.body.textContent).toContain('第 2 条'); expect(button('确认导入').disabled).toBe(true)
  await click('关闭'); expect(dialog.confirm).toHaveBeenCalled()
})
it('过期预览与超时后失效并刷新目录；错误摘要获得焦点，JSON草稿保留', async () => {
  api.commitActivityCalendarImport.mockRejectedValue(Object.assign(new Error('expired'), { status: 409 }))
  const wrapper = render(); await enter(); await click('校验并预览'); await confirm(); await click('确认导入')
  expect(document.body.textContent).toContain('请重新校验并预览')
  expect(document.activeElement.id).toBe('calendar-import-error')
  expect(document.querySelector('#calendar-import-json').value).toBe(source)
  expect(wrapper.emitted('imported')).toHaveLength(1)
  await click('校验并预览'); await confirm(); api.commitActivityCalendarImport.mockRejectedValue(new Error('超时')); await click('确认导入')
  expect(document.body.textContent).toContain('安全重试'); expect(button('确认导入').disabled).toBe(true)
})
it('文件替换包括坏文件立即废弃旧预览，正常文件与粘贴使用同一输入', async () => {
  render(); await enter(); await click('校验并预览'); await confirm()
  const fileInput = document.querySelector('input[type=file]')
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'bad.json', size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer }] })
  fileInput.dispatchEvent(new Event('change')); await flushPromises()
  expect(button('确认导入').disabled).toBe(true); expect(document.body.textContent).toContain('UTF-8')
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'good.json', size: source.length, arrayBuffer: async () => new TextEncoder().encode(source).buffer }] })
  fileInput.dispatchEvent(new Event('change')); await flushPromises()
  expect(document.querySelector('#calendar-import-json').value).toBe(source)
  await click('校验并预览'); expect(api.previewActivityCalendarImport).toHaveBeenCalledTimes(2)
})
it('Escape遵循未保存确认，键盘焦点留在弹窗并恢复入口', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const wrapper = render(); await flushPromises(); expect(document.activeElement.id).toBe('calendar-import-title')
  await enter(); dialog.confirm.mockResolvedValueOnce(false)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.emitted('close')).toHaveLength(1); expect(document.activeElement).toBe(opener)
})
it('管理员目录入口与身份隔离，失权销毁弹窗且忽略迟到预览；成功事件刷新目录', async () => {
  render(Admin); await flushPromises(); await click('批量导入'); await enter(); await click('校验并预览'); await confirm(); await click('确认导入')
  expect(api.listAdminActivityCalendar).toHaveBeenCalledTimes(2)
  const pending = deferred(); api.previewActivityCalendarImport.mockReturnValue(pending.promise)
  await enter(source + ' '); await click('校验并预览')
  auth.adminAccess = { permissions: [] }; await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(button('批量导入')).toBeUndefined()
  pending.resolve(report()); await flushPromises(); expect(document.querySelector('[role=dialog]')).toBeNull()
})
