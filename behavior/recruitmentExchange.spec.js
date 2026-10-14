import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecruitmentExchange from '../src/pages/recruitment/RecruitmentExchange.vue'
import * as api from '../src/api/recruitment.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { request } from '../src/api/request.js'
import { MAX_IMPORT_BYTES } from '../src/pages/recruitment/rules.js'
import { deferred, recruitmentEvent } from '../test-support/recruitment.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('../src/api/recruitment.js', () => ({ exportRecruitment: vi.fn(), previewRecruitmentImport: vi.fn(), commitRecruitmentImport: vi.fn(), getRecruitmentCatalog: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
let capturedBlob
const documentFixture = () => ({ schema: 'yuanhub.recruitment.v1', exported_at: '2026-10-01T00:00:00Z', source_account: { account_id: 'acc-a' }, game: '代号鸢', archive_revision: 3, baseline: 100, current_pool_id: 'pool-a', pools: [{ pool_id: 'pool-a', snapshot: { name: '测试池' }, progress: null }], temporary_agents: [], events: [recruitmentEvent('stable', 17)], batches: [] })
function previewFixture() { return { preview_token: 'bound-preview', document_hash: 'bound-hash', target_revision: 3, expires_at: new Date(Date.now() + 60000).toISOString(), items: [{ entity_type: 'state', id: 'state', status: 'add', reason: '恢复进度' }, { entity_type: 'event', id: 'stable', status: 'count_overlap', reason: '可能已包含在基准中，默认跳过' }], stats: { added: 1, duplicates: 0, conflicts: 0, skipped: 1 }, risks: ['请核对基准与记录重叠'], current_known_total: 100, backup_known_total: 117, candidate_known_total: 100, can_commit: true } }
function render(props = {}) { return mount(RecruitmentExchange, { attachTo: document.body, global: { stubs: { Teleport: true } }, props: { open: true, accountId: 'acc-a', accountName: '大号', identity: 'user-a', revision: 3, game: '代号鸢', contextVersion: 0, requestVersion: 0, ...props } }) }
const button = (wrapper, text) => text === '确认按预览导入' ? wrapper.findAll('.dialog-footer button.primary')[0] : wrapper.findAll('button').find(item => item.text().startsWith(text))
async function file(wrapper, document = documentFixture(), custom = {}) {
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: 1000, text: async () => JSON.stringify(document), ...custom }] })
  await input.trigger('change'); await flushPromises()
}
async function preview(wrapper) { await file(wrapper) }
it.each([390, 1440])('招募备份预览跨布局保持文件、令牌绑定的预览及焦点：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = render(); await preview(wrapper)
  const instance = wrapper.vm.$
  const panel = wrapper.get('.preview')
  const text = panel.text()
  const confirm = wrapper.get('.dialog-footer button.primary'); confirm.element.focus()
  for (const next of [767, 768, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.vm.$).toBe(instance)
    expect(wrapper.get('.preview').element).toBe(panel.element)
    expect(panel.text()).toBe(text)
    expect(wrapper.text()).toContain('backup.json')
    expect(confirm.element.disabled).toBe(false)
    expect(document.activeElement).toBe(confirm.element)
    expect(api.previewRecruitmentImport).toHaveBeenCalledTimes(1)
    expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
  }
})
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('Blob', NodeBlob); capturedBlob = null
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(blob => { capturedBlob = blob; return 'blob:synthetic' }) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  api.exportRecruitment.mockResolvedValue(documentFixture()); api.previewRecruitmentImport.mockImplementation(async () => previewFixture()); api.commitRecruitmentImport.mockResolvedValue({ archive_revision: 4 })
})

it.each(['missing', 'null', 'same', 'other'])('来源账号%s不决定导入目标，文件原样提交到当前账号', async source => {
  const data = documentFixture()
  if (source === 'missing') delete data.source_account
  else if (source === 'null') data.source_account = null
  else if (source === 'other') data.source_account = { account_id: 'acc-other' }
  const wrapper = render()
  await file(wrapper, data)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('目标：大号')
  expect(wrapper.text().includes('备份来自另一游戏账号')).toBe(source === 'other')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.previewRecruitmentImport).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-a', document: data }))
  await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises()
  expect(api.commitRecruitmentImport).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-a', document: data }))
  expect(wrapper.text()).toContain('导入已完成')
})
it('无来源文件的预览也会在切换当前账号时清空', async () => {
  const data = documentFixture(); delete data.source_account
  const wrapper = render(); await file(wrapper, data)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  await wrapper.setProps({ accountId: 'acc-b', accountName: '小号', contextVersion: 1 })
  expect(wrapper.find('.preview').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('backup.json')
  expect(button(wrapper, '确认按预览导入')).toBeUndefined()
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})

it('默认预览绑定原文件/账号/hash/revision/options，再确认单次原子导入；改选项必须重预览', async () => {
  const wrapper = render(); await preview(wrapper)
  expect(api.previewRecruitmentImport.mock.calls[0][0]).toMatchObject({ accountId: 'acc-a', document: { schema: 'yuanhub.recruitment.v1', source_account: { account_id: 'acc-a' } }, options: { state_strategy: 'keep_current', confirm_count_change: false } })
  expect(wrapper.text()).toContain('可能重复计数'); expect(wrapper.text()).toContain('已知累计抽数 100 → 100 抽')
  await wrapper.get('input[type=checkbox]').setValue(true); await flushPromises(); expect(api.previewRecruitmentImport).toHaveBeenLastCalledWith(expect.objectContaining({ options: { state_strategy: 'keep_current', confirm_count_change: true } })); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
  await wrapper.get('form').trigger('submit'); await flushPromises(); await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises()
  expect(api.commitRecruitmentImport.mock.calls[0][0]).toMatchObject({ accountId: 'acc-a', document: documentFixture(), previewToken: 'bound-preview', documentHash: 'bound-hash', expectedRevision: 3, options: { confirm_count_change: true } })
  expect(wrapper.emitted('committed')).toHaveLength(1); expect(wrapper.text()).toContain('导入已完成'); expect(wrapper.find('.preview').exists()).toBe(false)
})
it('A预览迟到不能应用到B；切换用户/账号清空文件与确认入口', async () => {
  const late = deferred(); api.previewRecruitmentImport.mockReturnValue(late.promise)
  const wrapper = render(); await file(wrapper); await wrapper.get('form').trigger('submit'); await wrapper.setProps({ accountId: 'acc-b', identity: 'user-b', contextVersion: 1 }); late.resolve(previewFixture()); await flushPromises()
  expect(wrapper.find('.preview').exists()).toBe(false); expect(wrapper.text()).not.toContain('backup.json'); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('档案revision变化或文件变化使未提交预览失效，过期预览不可提交', async () => {
  const wrapper = render(); await preview(wrapper); await wrapper.setProps({ revision: 4 }); expect(wrapper.find('.preview').exists()).toBe(false)
  await wrapper.setProps({ revision: 3 }); await wrapper.get('form').trigger('submit'); await flushPromises(); await file(wrapper, { ...documentFixture(), baseline: 101 }); expect(api.previewRecruitmentImport).toHaveBeenLastCalledWith(expect.objectContaining({ document: expect.objectContaining({ baseline: 101 }) }))
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), expires_at: new Date(Date.now() - 1000).toISOString() }); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(button(wrapper, '确认按预览导入').attributes('disabled')).toBeDefined(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('commit响应丢失且SSE先更新revision，保留原意图同ID重试原结果', async () => {
  const late = deferred(); api.commitRecruitmentImport.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ archive_revision: 4 })
  const wrapper = render(); await preview(wrapper); await button(wrapper, '确认按预览导入').trigger('click'); const original = api.commitRecruitmentImport.mock.calls[0][0]
  await wrapper.setProps({ revision: 4, requestVersion: 1 }); late.reject(new Error('网络中断')); await flushPromises(); expect(wrapper.text()).toContain('重试上次导入'); expect(wrapper.find('.preview').exists()).toBe(false)
  await button(wrapper, '重试上次导入').trigger('click'); await flushPromises(); expect(api.commitRecruitmentImport.mock.calls[1][0]).toEqual(original); expect(wrapper.text()).toContain('导入已完成')
})
it('响应未确认时锁定选项和文件，同ID重试；409后允许重新核对', async () => {
  api.commitRecruitmentImport.mockRejectedValueOnce(new Error('offline'))
  const wrapper = render(); await preview(wrapper); await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises()
  expect(wrapper.find('.retry-intent').exists()).toBe(true)
  expect(wrapper.get('input[type=checkbox]').element.disabled).toBe(true)
  expect(wrapper.get('input[type=file]').element.disabled).toBe(true)
  const original = api.commitRecruitmentImport.mock.calls[0][0]
  api.commitRecruitmentImport.mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 }))
  await button(wrapper, '重试上次导入').trigger('click'); await flushPromises()
  expect(api.commitRecruitmentImport.mock.calls[1][0]).toEqual(original)
  expect(wrapper.text()).toContain('重新生成预览'); expect(wrapper.find('.preview').exists()).toBe(false)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const late = deferred(); api.commitRecruitmentImport.mockReturnValueOnce(late.promise)
  await button(wrapper, '确认按预览导入').trigger('click')
  await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 })
  await file(wrapper, { ...documentFixture(), source_account: { account_id: 'acc-b' } })
  late.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.text()).toContain('backup.json'); expect(wrapper.text()).not.toContain('导入已完成')
})
it('完整snapshot下载包含baseline/池状态/批次/tombstone，CSV不从当前事件页推导且防公式', async () => {
  const document = documentFixture(); document.events[0].agent_snapshot.name = '=1+1'; document.events[0].batch_id = 'batch-a'; document.events.push({ ...recruitmentEvent('deleted', 31), deleted_at: '2026-10-01T01:00:00Z' }); document.batches = [{ batch_id: 'batch-a', pool_id: 'pool-a', total_pull_count: 120, deleted_at: null }]
  api.exportRecruitment.mockResolvedValue(document); const wrapper = render({ readOnly: true }); await button(wrapper, '下载完整备份（JSON）').trigger('click'); await flushPromises()
  expect(JSON.parse(await capturedBlob.text())).toEqual(document); expect(wrapper.get('input[type=file]').attributes('disabled')).toBeDefined()
  await button(wrapper, '导出表格（CSV）').trigger('click'); await flushPromises(); const csv = await capturedBlob.text(); expect(csv).toContain('"baseline"'); expect(csv).toContain('"pool_state"'); expect(csv).toContain('"batch"'); expect(csv).toContain('"deleted"'); expect(csv).toContain('"\'=1+1","17","0"'); expect(api.exportRecruitment).toHaveBeenCalledWith('acc-a')
})
it('JSON按实际紧凑UTF8字节导出接近5MiB仍可恢复，超限快照不下载截断文件', async () => {
  const document = documentFixture(); document.events = Array.from({ length: 4000 }, (_, index) => ({ ...recruitmentEvent('e_' + index, 17), note: '' }))
  const overhead = new NodeBlob([JSON.stringify(document)]).size, available = MAX_IMPORT_BYTES - 10 - overhead, perEvent = Math.floor(available / 4000), remainder = available % 4000
  expect(perEvent).toBeLessThanOrEqual(1000); document.events.forEach((event, index) => { event.note = 'x'.repeat(perEvent + (index < remainder ? 1 : 0)) })
  api.exportRecruitment.mockResolvedValue(document); const wrapper = render(); await button(wrapper, '下载完整备份（JSON）').trigger('click'); await flushPromises(); expect(capturedBlob.size).toBe(MAX_IMPORT_BYTES - 10); expect((await capturedBlob.text()).startsWith('{"schema":')).toBe(true)
  api.exportRecruitment.mockResolvedValue({ ...document, extra: 'x'.repeat(100) }); capturedBlob = null; await button(wrapper, '下载完整备份（JSON）').trigger('click'); await flushPromises(); expect(capturedBlob).toBeNull(); expect(wrapper.text()).toContain('未生成截断文件')
})
it('导出迟到不跨账号下载；5MiB/2万节点/无效JSON文件在preview前拒绝', async () => {
  const late = deferred(); api.exportRecruitment.mockReturnValueOnce(late.promise); const wrapper = render(); await button(wrapper, '下载完整备份（JSON）').trigger('click'); await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 }); late.resolve(documentFixture()); await flushPromises(); expect(capturedBlob).toBeNull()
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

const recordsFixture = () => ({ schema: 'yuanhub.recruitment.import.v1', game: '代号鸢', events: [{ event_id: '550e8400-e29b-41d4-a716-446655440000', catalog_pool_id: 'public', agent_id: 'official', pull_span: 37 }] })
it('普通记录隐藏状态恢复选项，使用服务端解析的人名池名并原样提交', async () => {
  const wrapper = render()
  await file(wrapper); await wrapper.get('select').setValue('use_backup')
  const data = recordsFixture()
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), items: [{ entity_type: 'event', id: data.events[0].event_id, status: 'add', display_name: '燕金募秀 · 庞羲 · 37 抽', reason: '新增历史记录' }], stats: { added: 1, duplicates: 0, conflicts: 0, skipped: 0 } })
  await file(wrapper, data)
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('.restore-option').exists()).toBe(false)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('燕金募秀 · 庞羲 · 37 抽')
  expect(wrapper.get('.import-summary').text()).toContain('1条新增记录')
  expect(api.previewRecruitmentImport).toHaveBeenCalledWith(expect.objectContaining({ document: data, accountId: 'acc-a', options: { state_strategy: 'keep_current', confirm_count_change: false } }))
  await button(wrapper, '确认按预览导入').trigger('click'); await flushPromises()
  expect(api.commitRecruitmentImport).toHaveBeenCalledWith(expect.objectContaining({ document: data, accountId: 'acc-a' }))
})
it('普通记录换账号清空预览，错误游戏与规范说明文件不能提交', async () => {
  const wrapper = render(); await file(wrapper, recordsFixture())
  await wrapper.get('form').trigger('submit'); await flushPromises()
  await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 })
  expect(wrapper.find('.preview').exists()).toBe(false)
  await file(wrapper, { ...recordsFixture(), game: '如鸢' })
  expect(wrapper.text()).toContain('文件游戏与当前账号不一致')
  await file(wrapper, { format: 'yuanhub.recruitment.ai-guide.v2' })
  expect(wrapper.text()).toContain('规范说明文件不能直接导入')
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
function mockGuideCatalogs() {
  api.getRecruitmentCatalog.mockResolvedValue({ catalog_revision: 'catalog-new', pools: [{ pool_id: 'public', game: '代号鸢', name: '公共池', up_agents: [], up_status: 'selection', updated_by: 'private-admin' }] })
  getOperatorCatalog.mockResolvedValue({ catalog_version: 'operators-new', operators: [{ id: 'official', name: '密探', rarity: 5, games: ['代号鸢'] }, { id: 'other', name: '其他游戏', rarity: 5, games: ['如鸢'] }] })
}
it('规范下载读取当前游戏公共目录，不含用户档案，并附最简示例', async () => {
  mockGuideCatalogs(); const wrapper = render()
  await button(wrapper, '获取 AI 导入规范').trigger('click'); await flushPromises()
  const guide = JSON.parse(await capturedBlob.text())
  expect(api.getRecruitmentCatalog).toHaveBeenCalledWith('代号鸢')
  expect(guide.catalog_revision).toBe('catalog-new')
  expect(guide.operators.map(item => item.id)).toEqual(['official'])
  expect(Object.keys(guide.example_document.events[0])).toEqual(['event_id', 'catalog_pool_id', 'agent_id', 'pull_span'])
  expect(guide.example_document.events[0].event_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(guide.import_schema.properties.schema.const).toBe('yuanhub.recruitment.import.v1')
  expect(JSON.stringify(guide)).not.toContain('private-admin')
  expect(JSON.stringify(guide)).not.toContain('acc-a')
  expect(api.exportRecruitment).not.toHaveBeenCalled()
})
it('目录读取失败或切换账号后返回，不下载过时规范', async () => {
  mockGuideCatalogs(); const late = deferred(); api.getRecruitmentCatalog.mockReturnValueOnce(late.promise)
  const wrapper = render(); await button(wrapper, '获取 AI 导入规范').trigger('click')
  await wrapper.setProps({ accountId: 'acc-b', contextVersion: 1 })
  late.resolve({ pools: [] }); await flushPromises(); expect(capturedBlob).toBeNull()
  api.getRecruitmentCatalog.mockRejectedValueOnce(new Error('目录不可用'))
  await button(wrapper, '获取 AI 导入规范').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('目录不可用'); expect(capturedBlob).toBeNull()
})

it('选文件自动预览，取消及Escape不写入，焦点返回导入入口', async () => {
  const wrapper = render()
  const opener = button(wrapper, '导入 JSON'); opener.element.focus()
  await file(wrapper)
  expect(api.previewRecruitmentImport).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[role=dialog]').element.contains(document.activeElement)).toBe(true)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false)
  expect(document.activeElement).toBe(opener.element)
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
  await button(wrapper, '继续导入').trigger('click'); await flushPromises()
  await button(wrapper, '取消').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false)
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('取消读取中的预览后，迟到响应不重新打开弹窗', async () => {
  const late = deferred(); api.previewRecruitmentImport.mockReturnValueOnce(late.promise)
  const wrapper = render(); await file(wrapper)
  await button(wrapper, '取消').trigger('click'); late.resolve(previewFixture()); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false)
  expect(wrapper.find('.preview').exists()).toBe(false)
  expect(button(wrapper, '导入 JSON').element.disabled).toBe(false)
})
it('记录与批次分开计数，明细按需展开，成功回执使用本次预览', async () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ entity_type: 'event', id: 'e' + i, status: 'add', display_name: '密探' + i, reason: '新增' }))
  items.push({ entity_type: 'batch', id: 'b', status: 'add', reason: '新增批次' })
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), items, stats: { added: 7, duplicates: 0, conflicts: 0, skipped: 0 } })
  const wrapper = render(); await file(wrapper, recordsFixture())
  expect(wrapper.get('.import-summary').text()).toContain('6条新增记录')
  expect(wrapper.findAll('.preview-items li')).toHaveLength(5)
  await button(wrapper, '查看全部 7 项明细').trigger('click')
  expect(wrapper.findAll('.preview-items li')).toHaveLength(7)
  const late = deferred(); api.commitRecruitmentImport.mockReturnValueOnce(late.promise)
  await button(wrapper, '导入 6 条记录').trigger('click')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(true)
  expect(button(wrapper, '取消').element.disabled).toBe(true)
  late.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.text()).toContain('已导入 6 条招募记录')
  expect(wrapper.text()).toContain('另有 1 项批次或档案信息已导入')
})
it('全部重复时说明无需导入并禁止提交', async () => {
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), items: [{ entity_type: 'event', id: 'stable', status: 'duplicate' }], stats: { added: 0, duplicates: 1, conflicts: 0, skipped: 0 } })
  const wrapper = render(); await file(wrapper, recordsFixture())
  expect(wrapper.text()).toContain('无需再次导入')
  expect(button(wrapper, '确认按预览导入').element.disabled).toBe(true)
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('仅替换备份进度也显示确认，选项变化自动重新核对', async () => {
  api.previewRecruitmentImport.mockImplementation(async ({ options }) => ({ ...previewFixture(), items: [{ entity_type: 'state', id: 'archive', status: 'add', reason: '替换进度' }], stats: { added: 1, duplicates: 0, conflicts: 0, skipped: 0 }, can_commit: options.state_strategy !== 'use_backup' || options.confirm_count_change }))
  const wrapper = render(); await file(wrapper)
  await wrapper.get('select').setValue('use_backup'); await flushPromises()
  expect(wrapper.text()).toContain('备份进度将替换现有进度')
  expect(button(wrapper, '确认按预览导入').element.disabled).toBe(true)
  await wrapper.get('input[type=checkbox]').setValue(true); await flushPromises()
  expect(api.previewRecruitmentImport).toHaveBeenLastCalledWith(expect.objectContaining({ options: { state_strategy: 'use_backup', confirm_count_change: true } }))
  expect(button(wrapper, '确认按预览导入').element.disabled).toBe(false)
  expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('备份中的删除标记不冒充新增招募记录', async () => {
  const data = documentFixture(); data.events[0].deleted_at = '2026-10-01T01:00:00Z'
  api.previewRecruitmentImport.mockResolvedValue({ ...previewFixture(), items: [{ entity_type: 'event', id: 'stable', status: 'add' }], stats: { added: 1, duplicates: 0, conflicts: 0, skipped: 0 } })
  const wrapper = render(); await file(wrapper, data)
  expect(wrapper.get('.import-summary').text()).toContain('0条新增记录')
  expect(wrapper.text()).toContain('删除标记')
  expect(wrapper.text()).toContain('另有 1 项批次或档案信息将导入')
})
