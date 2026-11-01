import { expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { createActivityCalendar, listActivityCalendar, listAdminActivityCalendar, updateActivityCalendar, previewActivityCalendarImport, commitActivityCalendarImport, exportActivityCalendar, previewCalendarClassification, commitCalendarClassification } from '../src/api/activityCalendar.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'synthetic', userInfo: { id: 'admin-a' } } }))

it('日历读取API带认证并绑定当前身份，管理筛选保留false，PUT编码id并传完整body，无DELETE', async () => {
  await listActivityCalendar({ game: '如鸢', from: '2026-10-03', to: '2027-01-01', category: 'SHOP' })
  let [path, options] = request.mock.lastCall
  expect(path.split('?')[0]).toBe('/v1/activity-calendar')
  expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({ game: '如鸢', from: '2026-10-03', to: '2027-01-01', category: 'SHOP' })
  expect(options.auth).toBe(true)
  expect(options.expectedUserId).toBe('admin-a')
  await listAdminActivityCalendar({ enabled: false, search: '活动 & 招募' })
  ;[path, options] = request.mock.lastCall
  expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({ enabled: 'false', search: '活动 & 招募' })
  expect(options.auth).toBe(true)
  expect(options.expectedUserId).toBe('admin-a')
  const body = { title: '活动', expected_version: 0 }
  await updateActivityCalendar('evt/1', body)
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/evt%2F1', { auth: true, expectedUserId: 'admin-a', method: 'PUT', body })
  await createActivityCalendar({ title: '新活动' })
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { title: '新活动' } })
})

it('导入预览和提交均绑定当前管理员，提交携带原文与预览token', async () => {
  await previewActivityCalendarImport('[{}]')
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/import/preview', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { json: '[{}]' } })
  await commitActivityCalendarImport('[{}]', 'token')
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/import/commit', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { json: '[{}]', preview_token: 'token' } })
})

it('分类全量导出与导入绑定当前身份，独立于新增型导入', async () => {
  await exportActivityCalendar()
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/export', { auth: true, expectedUserId: 'admin-a' })
  await previewCalendarClassification('source')
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/classification-import/preview', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { json: 'source' } })
  await commitCalendarClassification('source', 'snapshot')
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/classification-import/commit', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { json: 'source', preview_token: 'snapshot' } })
})
