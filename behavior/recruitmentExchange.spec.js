import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecruitmentExchange from '../src/pages/recruitment/RecruitmentExchange.vue'
import * as api from '../src/api/recruitment.js'
import { request } from '../src/api/request.js'
import { MAX_IMPORT_BYTES } from '../src/pages/recruitment/rules.js'
import { deferred, recruitmentEvent } from '../test-support/recruitment.js'

vi.mock('../src/api/recruitment.js', () => ({ exportRecruitment: vi.fn(), previewRecruitmentImport: vi.fn(), commitRecruitmentImport: vi.fn() }))
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
let capturedBlob
const documentFixture = () => ({ schema: 'yuanhub.recruitment.v1', exported_at: '2026-10-01T00:00:00Z', source_account: { account_id: 'acc-a' }, game: '代号鸢', archive_revision: 3, baseline: 100, current_pool_id: 'pool-a', pools: [{ pool_id: 'pool-a', snapshot: { name: '测试池' }, progress: null }], temporary_agents: [], events: [recruitmentEvent('stable', 17)], batches: [] })
function previewFixture() { return { preview_token: 'bound-preview', document_hash: 'bound-hash', target_revision: 3, expires_at: new Date(Date.now() + 60000).toISOString(), items: [{ entity_type: 'event', id: 'stable', status: 'count_overlap', reason: '可能已包含在基准中，默认跳过' }], stats: { added: 0, duplicates: 0, conflicts: 0, skipped: 1 }, risks: ['请核对基准与记录重叠'], current_known_total: 100, backup_known_total: 117, candidate_known_total: 100, can_commit: true } }
function render(props = {}) { return mount(RecruitmentExchange, { attachTo: document.body, props: { accountId: 'acc-a', accountName: '大号', identity: 'user-a', revision: 3, game: '代号鸢', contextVersion: 0, requestVersion: 0, ...props } }) }
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
async function file(wrapper, document = documentFixture(), custom = {}) {
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: 1000, text: async () => JSON.stringify(document), ...custom }] })
  await input.trigger('change'); await flushPromises()
}
async function preview(wrapper) { await file(wrapper); await wrapper.get('form').trigger('submit'); await flushPromises() }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('Blob', NodeBlob); capturedBlob = null
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(blob => { capturedBlob = blob; return 'blob:synthetic' }) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  api.exportRecruitment.mockResolvedValue(documentFixture()); api.previewRecruitmentImport.mockImplementation(async () => previewFixture()); api.commitRecruitmentImport.mockResolvedValue({ archive_revision: 4 })
})

it('默认预览绑定原文件/账号/hash/revision/options，再确认单次原子导入；改选项必须重预览', async () => {
  const wrapper = render(); await preview(wrapper)
  expect(api.previewRecruitmentImport.mock.calls[0][0]).toMatchObject({ accountId: 'acc-a', document: { schema: 'yuanhub.recruitment.v1', source_account: { account_id: 'acc-a' } }, options: { state_strategy: 'keep_current', confirm_count_change: false } })
  expect(wrapper.text()).toContain('可能重复计数'); expect(wrapper.text()).toContain('当前已知累计 100 抽 → 提交后 100 抽')
  await wrapper.get('input[type=checkbox]').setValue(true); expect(wrapper.find('.preview').exists()).toBe(false); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
  await wrapper.get('form').trigger('submit'); await flushPromises(); await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises()
  expect(api.commitRecruitmentImport.mock.calls[0][0]).toMatchObject({ accountId: 'acc-a', previewToken: 'bound-preview', documentHash: 'bound-hash', expectedRevision: 3, options: { confirm_count_change: true } })
  expect(wrapper.emitted('committed')).toHaveLength(1); expect(wrapper.text()).toContain('导入已完成'); expect(wrapper.find('.preview').exists()).toBe(false)
})
it('A预览迟到不能应用到B；切换用户/账号清空文件与确认入口', async () => {
  const late = deferred(); api.previewRecruitmentImport.mockReturnValue(late.promise)
  const wrapper = render(); await file(wrapper); await wrapper.get('form').trigger('submit'); await wrapper.setProps({ accountId: 'acc-b', identity: 'user-b', contextVersion: 1 }); late.resolve(previewFixture()); await flushPromises()
  expect(wrapper.find('.preview').exists()).toBe(false); expect(wrapper.text()).not.toContain('backup.json'); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('档案revision变化或文件变化使未提交预览失效，过期预览不可提交', async () => {
  const wrapper = render(); await preview(wrapper); await wrapper.setProps({ revision: 4 }); expect(wrapper.find('.preview').exists()).toBe(false)
  await wrapper.setProps({ revision: 3 }); await wrapper.get('form').trigger('submit'); await flushPromises(); await file(wrapper, { ...documentFixture(), baseline: 101 }); expect(wrapper.find('.preview').exists()).toBe(false)
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), expires_at: new Date(Date.now() - 1000).toISOString() }); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(button(wrapper, '预览已过期，请重新生成').attributes('disabled')).toBeDefined(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('commit响应丢失且SSE先更新revision，保留原意图同ID重试原结果', async () => {
  const late = deferred(); api.commitRecruitmentImport.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ archive_revision: 4 })
  const wrapper = render(); await preview(wrapper); await button(wrapper, '确认按预览导入').trigger('click'); const original = api.commitRecruitmentImport.mock.calls[0][0]
  await wrapper.setProps({ revision: 4, requestVersion: 1 }); late.reject(new Error('网络中断')); await flushPromises(); expect(wrapper.text()).toContain('重试上次导入'); expect(wrapper.find('.preview').exists()).toBe(false)
  await button(wrapper, '重试上次导入').trigger('click'); await flushPromises(); expect(api.commitRecruitmentImport.mock.calls[1][0]).toEqual(original); expect(wrapper.text()).toContain('导入已完成')
})
it('失败重试意图在换文件或选项后废弃，409冲突要求重新预览，A迟到成功不清B文件', async () => {
  api.commitRecruitmentImport.mockRejectedValueOnce(new Error('offline'))
  const wrapper = render(); await preview(wrapper); await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises(); expect(wrapper.find('.retry-intent').exists()).toBe(true)
  await wrapper.get('input[type=checkbox]').setValue(true); expect(wrapper.find('.retry-intent').exists()).toBe(false)
  await wrapper.get('form').trigger('submit'); await flushPromises(); api.commitRecruitmentImport.mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 })); await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('重新生成预览'); expect(wrapper.find('.preview').exists()).toBe(false)
  await wrapper.get('form').trigger('submit'); await flushPromises(); const late = deferred(); api.commitRecruitmentImport.mockReturnValueOnce(late.promise); await button(wrapper, '确认按预览导入').trigger('click'); await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 }); await file(wrapper, { ...documentFixture(), source_account: { account_id: 'acc-b' } }); late.resolve({ archive_revision: 4 }); await flushPromises(); expect(wrapper.text()).toContain('backup.json'); expect(wrapper.text()).not.toContain('导入已完成')
})
it('完整snapshot下载包含baseline/池状态/批次/tombstone，CSV不从当前事件页推导且防公式', async () => {
  const document = documentFixture(); document.events[0].agent_snapshot.name = '=1+1'; document.events[0].batch_id = 'batch-a'; document.events.push({ ...recruitmentEvent('deleted', 31), deleted_at: '2026-10-01T01:00:00Z' }); document.batches = [{ batch_id: 'batch-a', pool_id: 'pool-a', total_pull_count: 120, deleted_at: null }]
  api.exportRecruitment.mockResolvedValue(document); const wrapper = render({ readOnly: true }); await button(wrapper, '导出完整 JSON').trigger('click'); await flushPromises()
  expect(JSON.parse(await capturedBlob.text())).toEqual(document); expect(wrapper.get('input[type=file]').attributes('disabled')).toBeDefined()
  await button(wrapper, '导出 CSV').trigger('click'); await flushPromises(); const csv = await capturedBlob.text(); expect(csv).toContain('"baseline"'); expect(csv).toContain('"pool_state"'); expect(csv).toContain('"batch"'); expect(csv).toContain('"deleted"'); expect(csv).toContain('"\'=1+1","17","0"'); expect(api.exportRecruitment).toHaveBeenCalledWith('acc-a')
})
it('JSON按实际紧凑UTF8字节导出接近5MiB仍可恢复，超限快照不下载截断文件', async () => {
  const document = documentFixture(); document.events = Array.from({ length: 4000 }, (_, index) => ({ ...recruitmentEvent('e_' + index, 17), note: '' }))
  const overhead = new NodeBlob([JSON.stringify(document)]).size, available = MAX_IMPORT_BYTES - 10 - overhead, perEvent = Math.floor(available / 4000), remainder = available % 4000
  expect(perEvent).toBeLessThanOrEqual(1000); document.events.forEach((event, index) => { event.note = 'x'.repeat(perEvent + (index < remainder ? 1 : 0)) })
  api.exportRecruitment.mockResolvedValue(document); const wrapper = render(); await button(wrapper, '导出完整 JSON').trigger('click'); await flushPromises(); expect(capturedBlob.size).toBe(MAX_IMPORT_BYTES - 10); expect((await capturedBlob.text()).startsWith('{"schema":')).toBe(true)
  api.exportRecruitment.mockResolvedValue({ ...document, extra: 'x'.repeat(100) }); capturedBlob = null; await button(wrapper, '导出完整 JSON').trigger('click'); await flushPromises(); expect(capturedBlob).toBeNull(); expect(wrapper.text()).toContain('未生成截断文件')
})
it('导出迟到不跨账号下载；5MiB/2万节点/无效JSON文件在preview前拒绝', async () => {
  const late = deferred(); api.exportRecruitment.mockReturnValueOnce(late.promise); const wrapper = render(); await button(wrapper, '导出完整 JSON').trigger('click'); await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 }); late.resolve(documentFixture()); await flushPromises(); expect(capturedBlob).toBeNull()
  await file(wrapper, documentFixture(), { size: MAX_IMPORT_BYTES + 1 }); expect(wrapper.text()).toContain('超过 5 MiB')
  await file(wrapper, { ...documentFixture(), events: Array(20001).fill({}) }); expect(wrapper.text()).toContain('超过 20,000')
  await file(wrapper, {}, { text: async () => 'not JSON' }); expect(wrapper.find('[role=alert]').exists()).toBe(true); expect(api.previewRecruitmentImport).not.toHaveBeenCalled()
})
it('真实API保持snake_case/排序分页，交换使用普通包装响应与现有文件超时', async () => {
  const actual = await vi.importActual('../src/api/recruitment.js')
  await actual.listRecruitmentEvents({ accountId: 'acc-a', poolId: '池', cursor: 'c', order: 'asc', dateFrom: '2026-01-01' }); const [path] = request.mock.calls.at(-1); const query = new URLSearchParams(path.split('?')[1]); expect(query.get('account_id')).toBe('acc-a'); expect(query.get('order')).toBe('asc'); expect(query.get('pool_id')).toBe('池')
  await actual.exportRecruitment('acc-a'); expect(request.mock.calls.at(-1)[1]).toMatchObject({ auth: true, timeoutMs: 60000 }); expect(request.mock.calls.at(-1)[1].raw).toBeUndefined()
  await actual.commitRecruitmentImport({ accountId: 'acc-a', document: documentFixture(), options: { state_strategy: 'keep_current', confirm_count_change: false }, previewToken: 'token', documentHash: 'hash', expectedRevision: 3, requestId: 'stable-request' }); expect(request.mock.calls.at(-1)[1]).toMatchObject({ method: 'POST', timeoutMs: 120000, body: { account_id: 'acc-a', preview_token: 'token', document_hash: 'hash', expected_revision: 3, request_id: 'stable-request' } })
})
