import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import RewardDateTimePicker from '../src/components/inventory/RewardDateTimePicker.vue'
import * as inventoryApi from '../src/api/inventory.js'
import * as rewardCatalogApi from '../src/api/rewardCatalog.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/inventory.js', () => ({
  importInventory: vi.fn(),
  getCurrent: vi.fn(),
}))
vi.mock('../src/api/rewardCatalog.js', () => ({
  getRewardCatalog: vi.fn(),
}))

const catalog = [
  { entity_type: 'item', id: 'baijinbi', name: '白金币', rarity: 3 },
  { entity_type: 'item', id: 'jizhi', name: '鸡汁', rarity: 3 },
  { entity_type: 'agent', id: 'agent_test', name: '测试密探', rarity: 5 },
]

const snapshotReport = `\uFEFF========== MaaYuan 库存记录 ==========
时间：2026-09-30T12:33:47.127+08:00
渠道：背包-物品
类型：库存快照
子账号ID：acc-1
上报状态：自动上报成功（HTTP 200，accepted=1，duplicates=0）
道具：
白金币 × 20
#@MaaYInventoryRefV2 {"r":["myshare:bag-items"],"a":"acc-1","s":"listed"}
========== 记录结束 ==========
========== MaaYuan 库存记录 ==========
时间：2026-09-30T12:33:57.895+08:00
渠道：背包-道具
类型：库存快照
子账号ID：acc-1
上报状态：自动上报成功（HTTP 200，accepted=1，duplicates=0）
道具：
鸡汁 × 0
#@MaaYInventoryRefV2 {"r":["myshare:bag-tools"],"a":"acc-1","s":"listed"}
========== 记录结束 ==========
========== MaaYuan 库存记录 ==========
时间：2026-09-30T12:34:04.680+08:00
渠道：背包-心纸
类型：库存快照
子账号ID：acc-1
上报状态：自动上报失败（HTTP 422（agent_game_mismatch））
密探：
测试密探 × 4
周忠 × 0
#@MaaYInventoryRefV2 {"r":["myshare:bag-agents"],"a":"acc-1","s":"listed"}
========== 记录结束 ==========`

async function dropReport(report = snapshotReport, read = () => Promise.resolve(report)) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files: [{ name: 'DailyRewards-测试账号-acc-1.txt', size: report.length, text: read }] } })
  document.body.querySelector('.file-drop').dispatchEvent(event)
  await flushPromises()
}

function mountWorkspace(props = {}) {
  return mount(RewardEntryWorkspace, {
    attachTo: document.body,
    props: {
      accountId: 'acc-1',
      accountName: '测试账号',
      latestInventoryAt: '',
      disabled: false,
      ...props,
    },
  })
}

function button(wrapper, text) {
  return wrapper.findAll('button').find(node => node.text().includes(text))
}

function bodyButton(text) {
  return Array.from(document.body.querySelectorAll('button')).find(node => node.textContent.includes(text))
}

async function clickElement(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await flushPromises()
}

async function openQuickCoin(wrapper, purpose = '') {
  await button(wrapper, '添加奖励流水').trigger('click')
  await flushPromises()
  await clickElement(bodyButton('月卡奖励 60'))
  const datetime = wrapper.findComponent(RewardDateTimePicker)
  datetime.vm.$emit('update:date', '2026-09-30')
  datetime.vm.$emit('update:clock', '10:00:00')
  await flushPromises()
  const select = document.body.querySelector('select[aria-label="白金币记录用途"]')
  select.value = purpose
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}
const coveredCoin = () => [{ entity_type: 'item', entries: { baijinbi: { count: 100, listed_baseline_at: new Date(2026, 8, 30, 11).toISOString() } } }]

async function openManualWithPreview(wrapper) {
  await button(wrapper, '添加奖励流水').trigger('click')
  await flushPromises()

  const reward = Array.from(document.body.querySelectorAll('button')).find(node => node.getAttribute('aria-label')?.startsWith('添加白金币'))
  expect(reward).toBeTruthy()
  await clickElement(reward)

  const stamina = document.body.querySelector('input[aria-label="消耗体力"]')
  stamina.value = '20'
  stamina.dispatchEvent(new Event('input', { bubbles: true }))
  await clickElement(bodyButton('预览本次流水'))
  expect(document.body.querySelector('.preview-section')).not.toBeNull()
}

beforeEach(() => {
  inventoryApi.importInventory.mockReset()
  inventoryApi.getCurrent.mockReset().mockResolvedValue([])
  rewardCatalogApi.getRewardCatalog.mockReset()
  rewardCatalogApi.getRewardCatalog.mockResolvedValue(catalog)
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
})

describe('奖励补录工作台弹层', () => {
  it('快捷预填来源数量，但没有选择记录用途时不能预览或提交', async () => {
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper)
    expect(document.body.querySelector('input[aria-label="月卡奖励白金币数量"]').value).toBe('60')
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.error-message').textContent).toContain('请选择新增收入或补标')
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('同一天可以同时勾选密探50和月卡60，一次提交合计110且分别保存来源及ID', async () => {
    inventoryApi.importInventory.mockResolvedValue({ accepted: 2, duplicates: 0, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'income')
    await clickElement(bodyButton('密探日常 50'))
    expect(document.body.querySelector('.whitecoin-shortcuts').textContent).toContain('合计 110 白金币')
    expect(document.body.querySelectorAll('.shortcut-options [aria-pressed="true"]')).toHaveLength(2)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelectorAll('.preview-record')).toHaveLength(2)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await clickElement(bodyButton('确认补录 2 条'))
    const records = inventoryApi.importInventory.mock.calls[0][0].records
    expect(records.map(record => [record.acquisition_channel, record.entries[0].count])).toEqual([['月卡奖励', 60], ['密探日常', 50]])
    expect(new Set(records.map(record => record.record_id)).size).toBe(2)
    expect(records.every(record => record.account_id === 'acc-1')).toBe(true)
  })

  it('快捷来源数量可分别调整，取消月卡不会移除或改写密探数量', async () => {
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'income')
    await clickElement(bodyButton('密探日常 50'))
    const amount = document.body.querySelector('input[aria-label="密探日常白金币数量"]')
    amount.value = '70'; amount.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('.whitecoin-shortcuts').textContent).toContain('合计 130 白金币')
    await clickElement(bodyButton('月卡奖励 60'))
    expect(document.body.querySelector('.whitecoin-shortcuts').textContent).toContain('合计 70 白金币')
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelectorAll('.preview-record')).toHaveLength(1)
    expect(document.body.querySelector('.preview-record').textContent).toContain('密探日常')
    expect(document.body.querySelector('.preview-record').textContent).toContain('+ 70')
  })

  it('新增日常收入复用同一来源/游戏日 ID，重复提交冲突不换 ID 绕过去重', async () => {
    inventoryApi.importInventory.mockResolvedValueOnce({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'income')
    await clickElement(bodyButton('预览本次流水'))
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await clickElement(bodyButton('确认补录'))
    const original = inventoryApi.importInventory.mock.calls[0][0].records[0]
    expect(original.record_id).toBe('yuanhub:daily-whitecoin:monthly-card:2026-09-30')
    expect(original.acquisition_channel).toBe('月卡奖励')
    expect(original.entries).toEqual([{ id: 'baijinbi', name: '白金币', count: 60 }])
    expect(inventoryApi.getCurrent).not.toHaveBeenCalled()
    await clickElement(bodyButton('再添加一条'))
    await clickElement(bodyButton('月卡奖励 60'))
    const datetime = wrapper.findComponent(RewardDateTimePicker)
    datetime.vm.$emit('update:date', '2026-09-30')
    datetime.vm.$emit('update:clock', '10:00:01')
    await flushPromises()
    const select = document.body.querySelector('select[aria-label="白金币记录用途"]')
    select.value = 'income'; select.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录'))
    expect(inventoryApi.importInventory.mock.calls[1][0].records[0].record_id).toBe(original.record_id)
    expect(document.body.querySelector('.error-message').textContent).toContain('未重复入账')
  })

  it.each([
    [[], '尚无白金币'],
    [[{ entity_type: 'item', full_baseline_at: new Date(2026, 8, 30, 9).toISOString() }], '晚于白金币'],
    [[{ entity_type: 'agent', full_baseline_at: new Date(2026, 8, 30, 11).toISOString() }], '尚无白金币'],
  ])('补标拒绝无效或未覆盖白金币的基线 %#', async (current, message) => {
    inventoryApi.getCurrent.mockResolvedValue(current)
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'annotation')
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.error-message').textContent).toContain(message)
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('补标发送真实发生时间，网络失败后原样重试，覆盖基线前奖励由服务端仅记历史', async () => {
    inventoryApi.getCurrent.mockResolvedValue(coveredCoin())
    inventoryApi.importInventory.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ accepted: 1, duplicates: 0, history_only: 1, superseded: 0 })
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'annotation')
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录'))
    const payload = inventoryApi.importInventory.mock.calls[0][0]
    expect(payload.records[0].effective_at).toBe(new Date(2026, 8, 30, 10).toISOString())
    expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(2)
    expect(inventoryApi.getCurrent).toHaveBeenCalledWith({ accountId: 'acc-1', entityType: 'item' })
    await clickElement(bodyButton('原样重试补录'))
    expect(inventoryApi.importInventory.mock.calls[1][0]).toBe(payload)
    expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(2)
    expect(document.body.querySelector('.result').textContent).toContain('仅历史 1')
  })

  it('预览后白金币基线失效时阻止补标提交', async () => {
    inventoryApi.getCurrent.mockResolvedValueOnce(coveredCoin()).mockResolvedValueOnce([])
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'annotation')
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录'))
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    expect(document.body.querySelector('.error-message').textContent).toContain('尚无白金币')
    expect(document.body.querySelector('#reward-dialog-lock-status')).toBeNull()
  })

  it('核对基线期间切换账号，晚到响应不会生成新账号预览或写请求', async () => {
    const pending = deferred()
    inventoryApi.getCurrent.mockReturnValueOnce(pending.promise)
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'annotation')
    await clickElement(bodyButton('预览本次流水'))
    await wrapper.setProps({ accountId: 'acc-2' })
    pending.resolve(coveredCoin())
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it.each(['roundtrip', 'unmount'])('首次提交核对基线期间 %s，旧确认不会再发入账请求', async change => {
    const pending = deferred()
    inventoryApi.getCurrent.mockResolvedValueOnce(coveredCoin()).mockReturnValueOnce(pending.promise)
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'annotation')
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录'))
    if (change === 'unmount') wrapper.unmount()
    else { await wrapper.setProps({ accountId: 'acc-2' }); await wrapper.setProps({ accountId: 'acc-1' }) }
    pending.resolve(coveredCoin())
    await flushPromises()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    expect(wrapper.emitted('imported')).toBeUndefined()
  })

  it('拖入三段快照只预览，默认选失败心纸，跨游戏零值原样补传', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue([...catalog, { entity_type: 'agent', id: 'char_100_zhouzhong', name: '周忠', games: ['代号鸢'] }])
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0, warnings: ['已忽略如鸢不支持的零值密探：周忠'] })
    const wrapper = mountWorkspace({ game: '如鸢' })
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    await dropReport()

    const rows = Array.from(document.body.querySelectorAll('.preview-record'))
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.querySelector('input[type="checkbox"]').checked)).toEqual([false, false, true])
    expect(rows.every(row => row.textContent.includes('库存快照 · 列出条目'))).toBe(true)
    expect(rows[2].textContent).toContain('周忠= 0')
    expect(document.body.querySelector('.confirm-bar').textContent).toContain('库存总量')
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()

    await clickElement(bodyButton('确认补传 1 条'))
    expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
    const payload = inventoryApi.importInventory.mock.calls[0][0]
    expect(payload.records).toEqual([{
      record_id: 'myshare:bag-agents', account_id: 'acc-1', record_type: 'stock_snapshot', entity_type: 'agent', snapshot_scope: 'listed',
      acquisition_channel: '背包-心纸', effective_at: '2026-09-30T12:34:04.680+08:00',
      entries: [{ id: 'agent_test', name: '测试密探', count: 4 }, { id: 'char_100_zhouzhong', name: '周忠', count: 0 }],
    }])
    expect(wrapper.emitted('imported')).toEqual([['acc-1']])
    expect(window.document.body.querySelector('.result').textContent).toContain('报告已补传')
    expect(window.document.body.querySelector('.result').textContent).toContain('已忽略如鸢不支持的零值密探：周忠')
  })

  it('JSON 完整空快照可明确选择，确认前说明未列出条目归零', async () => {
    const wrapper = mountWorkspace()
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    await dropReport(JSON.stringify({ format: 'myshare-inventory-exchange', version: 2, records: [{ record_id: 'myshare:clear', record_type: 'stock_snapshot', snapshot_scope: 'full', entity_type: 'item', effective_at: '2026-09-30T12:00:00+08:00', entries: [] }] }))
    expect(document.body.querySelector('.preview-record').textContent).toContain('完整库存')
    expect(document.body.querySelector('.submit-button').disabled).toBe(true)
    await clickElement(document.body.querySelector('.record-checkbox input'))
    expect(document.body.querySelector('.confirm-bar').textContent).toContain('未列出的条目归零')
    expect(document.body.querySelector('.submit-button').disabled).toBe(false)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('报告可还原跨游戏零值，但手动奖励选择仍只显示当前游戏的密探', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue([...catalog,
      { entity_type: 'agent', id: 'char_100_zhouzhong', name: '周忠', games: ['代号鸢'] },
      { entity_type: 'agent', id: 'current_agent', name: '当前游戏密探', games: ['如鸢'] },
    ])
    const wrapper = mountWorkspace({ game: '如鸢' })
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('寿春'))
    expect(document.body.querySelector('[aria-label^="添加周忠"]')).toBeNull()
    expect(document.body.querySelector('[aria-label^="添加当前游戏密探"]')).not.toBeNull()
  })

  it('快照补传网络失败后保持原 ID、时间、零值和请求正文原样重试', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue([...catalog, { entity_type: 'agent', id: 'char_100_zhouzhong', name: '周忠', games: ['代号鸢'] }])
    inventoryApi.importInventory.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ accepted: 0, duplicates: 1, history_only: 0, superseded: 0, warnings: [] })
    const wrapper = mountWorkspace({ game: '如鸢' })
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    await dropReport()
    await clickElement(bodyButton('确认补传'))
    const firstDocument = inventoryApi.importInventory.mock.calls[0][0]
    expect(document.body.querySelector('#reward-dialog-lock-status').textContent).toContain('原样重试')
    expect(document.body.querySelector('.record-checkbox input').disabled).toBe(true)
    await clickElement(bodyButton('原样重试补录'))
    expect(inventoryApi.importInventory.mock.calls[1][0]).toBe(firstDocument)
    expect(document.body.querySelector('.result').textContent).toContain('记录已存在')
  })

  it('读取快照报告期间切换账号，晚到的文件内容不进入新账号预览', async () => {
    const pending = deferred()
    const wrapper = mountWorkspace()
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    await dropReport(snapshotReport, () => pending.promise)
    await wrapper.setProps({ accountId: 'acc-2', accountName: '另一个账号' })
    pending.resolve(snapshotReport)
    await flushPromises()
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.preview-section')).toBeNull()
    await dropReport()
    expect(document.body.querySelector('.row-error').textContent).toContain('记录属于账号 acc-1')
    expect(document.body.querySelector('.submit-button').disabled).toBe(true)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('账号切换后不接受旧目录响应，也不把旧账号补传结果归到新账号', async () => {
    const catalogPending = deferred()
    rewardCatalogApi.getRewardCatalog.mockReturnValueOnce(catalogPending.promise)
    const wrapper = mountWorkspace()
    await button(wrapper, '导入本地报告').trigger('click')
    await wrapper.setProps({ accountId: 'acc-2' })
    catalogPending.resolve(catalog)
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).toBeNull()

    await wrapper.setProps({ accountId: 'acc-1' })
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()
    const pending = deferred()
    inventoryApi.importInventory.mockReturnValueOnce(pending.promise)
    await dropReport(snapshotReport.replace('测试密探 × 4\n周忠 × 0', '测试密探 × 4'))
    await clickElement(bodyButton('确认补传'))
    await wrapper.setProps({ accountId: 'acc-2' })
    pending.resolve({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0, warnings: [] })
    await flushPromises()
    expect(wrapper.emitted('imported')).toBeUndefined()
    expect(document.body.querySelector('.result')).toBeNull()
    expect(inventoryApi.importInventory.mock.calls[0][0].records[0].account_id).toBe('acc-1')
  })

  it('已选图标可原位减少，普通道具步进 1、白金币步进 10，减至零后移除', async () => {
    const wrapper = mountWorkspace()
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()

    const tile = name => document.body.querySelector(`.reward-tile[aria-label^="添加${name}，"]`)
    const minus = name => document.body.querySelector(`.tile-minus[aria-label^="减少${name}，"]`)

    await clickElement(tile('鸡汁'))
    expect(tile('鸡汁').getAttribute('aria-label')).toContain('当前已选 1')
    await clickElement(tile('鸡汁'))
    expect(tile('鸡汁').getAttribute('aria-label')).toContain('当前已选 2')
    await clickElement(minus('鸡汁'))
    expect(tile('鸡汁').getAttribute('aria-label')).toContain('当前已选 1')
    minus('鸡汁').focus()
    await clickElement(minus('鸡汁'))
    expect(minus('鸡汁')).toBeNull()
    expect(tile('鸡汁').getAttribute('aria-label')).toContain('当前已选 0')
    expect(document.activeElement).toBe(tile('鸡汁'))

    await clickElement(tile('白金币'))
    expect(tile('白金币').getAttribute('aria-label')).toContain('当前已选 10')
    await clickElement(tile('白金币'))
    expect(tile('白金币').getAttribute('aria-label')).toContain('当前已选 20')
    await clickElement(minus('白金币'))
    expect(tile('白金币').getAttribute('aria-label')).toContain('当前已选 10')
    await clickElement(minus('白金币'))
    expect(minus('白金币')).toBeNull()
    expect(tile('白金币').getAttribute('aria-label')).toContain('当前已选 0')
  })

  it('如鸢账号只提供所属游戏的密探心纸，切换游戏后重新筛选', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue([
      catalog[0],
      { entity_type: 'agent', id: 'char_shared', name: '共同密探', rarity: 5, games: ['如鸢', '代号鸢'] },
      { entity_type: 'agent', id: 'char_daihao', name: '代号鸢密探', rarity: 5, games: ['代号鸢'] },
    ])
    const wrapper = mountWorkspace({ game: '如鸢' })
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('据点情报'))

    expect(document.body.querySelector('[aria-label^="添加共同密探"]')).not.toBeNull()
    expect(document.body.querySelector('[aria-label^="添加代号鸢密探"]')).toBeNull()

    await wrapper.setProps({ game: '代号鸢' })
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('据点情报'))
    expect(document.body.querySelector('[aria-label^="添加代号鸢密探"]')).not.toBeNull()
  })

  it('密探心纸可按属性、品质和姓名组合筛选，切换渠道后重置属性', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue([
      { entity_type: 'agent', id: 'char_fire_gold', name: '火系金卡', rarity: 5, prof: ['火'] },
      { entity_type: 'agent', id: 'char_fire_purple', name: '火系紫卡', rarity: 4, prof: ['火'] },
      { entity_type: 'agent', id: 'char_water_gold', name: '水系金卡', rarity: 5, prof: ['水'] },
    ])
    const wrapper = mountWorkspace()
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('据点情报'))

    const prof = document.body.querySelector('.prof-filter select')
    expect(prof?.value).toBe('')
    prof.value = '火'
    prof.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelectorAll('.reward-tile')).toHaveLength(2)

    await clickElement(Array.from(document.body.querySelectorAll('.rarity-options button')).find(node => node.textContent === '金'))
    expect(document.body.querySelectorAll('.reward-tile')).toHaveLength(1)
    expect(document.body.querySelector('[aria-label^="添加火系金卡"]')).not.toBeNull()

    const search = document.body.querySelector('input[aria-label="搜索密探姓名"]')
    search.value = '水系'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelectorAll('.reward-tile')).toHaveLength(0)
    search.value = '火系'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelectorAll('.reward-tile')).toHaveLength(1)

    await clickElement(document.body.querySelector('[aria-label^="添加火系金卡"]'))
    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))
    prof.value = '水'
    prof.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('[aria-label^="添加水系金卡"]')).not.toBeNull()
    expect(document.body.querySelector('.basket-list')?.textContent).toContain('火系金卡')

    await clickElement(bodyButton('其他奖励'))
    expect(document.body.querySelector('.prof-filter select')?.value).toBe('')
  })

  it.each([
    ['添加奖励流水', '添加奖励流水'],
    ['导入本地报告', '导入本地报告'],
  ])('%s 从操作历史入口打开独立 dialog', async (entryText, title) => {
    const wrapper = mountWorkspace()
    await button(wrapper, entryText).trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('#reward-entry-panel')
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector('#reward-entry-title')?.textContent).toContain(title)
    expect(wrapper.element.querySelector('#reward-entry-panel')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('Esc 关闭普通状态工作台，恢复背景滚动并把焦点还给原触发按钮', async () => {
    const wrapper = mountWorkspace()
    const trigger = button(wrapper, '添加奖励流水')
    trigger.element.focus()

    await trigger.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('#reward-entry-panel')
    expect(dialog).not.toBeNull()

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(document.body.querySelector('#reward-entry-panel')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger.element)
  })

  it('点击遮罩可以关闭普通状态工作台', async () => {
    const wrapper = mountWorkspace()
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()

    const mask = document.body.querySelector('.reward-dialog-mask')
    mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.body.querySelector('#reward-entry-panel')).toBeNull()
  })

  it('提交期间以及保留原样重试草稿时，Esc、遮罩和关闭按钮都不会意外关闭', async () => {
    const pending = deferred()
    inventoryApi.importInventory.mockReturnValue(pending.promise)
    const wrapper = mountWorkspace()
    await openManualWithPreview(wrapper)

    await clickElement(bodyButton('确认补录'))

    let dialog = document.body.querySelector('#reward-entry-panel')
    expect(dialog).not.toBeNull()
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([true])

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).not.toBeNull()
    expect(document.activeElement?.id).toBe('reward-dialog-lock-status')

    document.body.querySelector('.reward-dialog-mask').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).not.toBeNull()

    const close = document.body.querySelector('.close-button')
    close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).not.toBeNull()

    pending.reject(new TypeError('Failed to fetch'))
    await flushPromises()
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([true])
    expect(document.body.querySelector('#reward-entry-panel')).not.toBeNull()
    expect(document.body.querySelector('#reward-dialog-lock-status')?.textContent).toContain('原样重试')

    dialog = document.body.querySelector('#reward-entry-panel')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('#reward-entry-panel')).not.toBeNull()
  })

  it('导入成功仍向父页面发出 imported，供库存、获得量与操作历史刷新', async () => {
    inventoryApi.importInventory.mockResolvedValue({
      accepted: 1,
      duplicates: 0,
      history_only: 0,
      superseded: 0,
      warnings: [],
    })
    const wrapper = mountWorkspace()
    await openManualWithPreview(wrapper)

    await clickElement(bodyButton('确认补录'))

    expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('imported')).toEqual([['acc-1']])
    expect(document.body.querySelector('.result')?.textContent).toContain('奖励已入簿')
  })

  it('Tab 在工作台内循环，不会把键盘焦点送回背景页面', async () => {
    const wrapper = mountWorkspace()
    await button(wrapper, '导入本地报告').trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('#reward-entry-panel')
    const focusables = Array.from(dialog.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.disabled && element.getAttribute('aria-disabled') !== 'true')
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(first)

    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(last)
  })
})
