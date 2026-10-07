import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import RewardDateTimePicker from '../src/components/inventory/RewardDateTimePicker.vue'
import * as inventoryApi from '../src/api/inventory.js'
import * as rewardCatalogApi from '../src/api/rewardCatalog.js'
import { deferred } from '../test-support/factories.js'
import { ITEM_CATALOG } from '../src/data/inventory/catalog.js'

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
const trainingCatalog = [...catalog, ...ITEM_CATALOG.filter(item => item.category === '修为进阶材料').map(item => ({ ...item, entity_type: 'item' }))]

async function setTrainingField(id, value, index = 0) {
  const field = document.getElementById(`training-${id}${index ? '-' + index : ''}`)
  field.value = String(value)
  field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await flushPromises()
}

async function openTraining(wrapper, { group = 'fh', level = 8, runs = '5' } = {}) {
  await button(wrapper, '添加奖励流水').trigger('click')
  await flushPromises()
  await clickElement(bodyButton('历练'))
  await clickElement(bodyButton('按次数填写'))
  await setTrainingField('group', group)
  await setTrainingField('level', level)
  await setTrainingField('runs', runs)
}

async function appendTraining(group, level, runs) {
  await clickElement(bodyButton('添加一组历练'))
  const index = document.body.querySelectorAll('.training-selection').length - 1
  await setTrainingField('group', group, index)
  await setTrainingField('level', level, index)
  await setTrainingField('runs', runs, index)
}

const trainingLevelKey = (accountId = 'acc-1', game = '代号鸢') => `yuanhub:inventory:training-levels:${encodeURIComponent(accountId)}:${encodeURIComponent(game)}`
const visibleTrainingLevels = (index = 0) => Array.from(document.getElementById(`training-level${index ? '-' + index : ''}`).options).map(option => option.value).filter(Boolean).map(Number)
async function showAllTrainingLevels() {
  const input = document.body.querySelector('.training-show-all input')
  input.checked = true
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}
async function setCommonTrainingLevel(level, checked) {
  const input = document.body.querySelector(`.training-level-options input[value="${level}"]`)
  input.checked = checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

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

it('报告外部入口复用原工作台，只读取目录而不写入库存', async () => {
  const wrapper = mountWorkspace()
  await wrapper.vm.openReport()
  await flushPromises()
  expect(document.body.querySelector('[role="dialog"] h3').textContent).toBe('导入本地报告')
  expect(document.body.querySelector('.report-workbench')).not.toBeNull()
  expect(rewardCatalogApi.getRewardCatalog).toHaveBeenCalledTimes(1)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('报告外部入口在账号不可写时同样禁用', async () => {
  const wrapper = mountWorkspace({ disabled: true })
  await wrapper.vm.openReport()
  await flushPromises()
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  expect(rewardCatalogApi.getRewardCatalog).not.toHaveBeenCalled()
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

describe('历练按次数补录', () => {
  beforeEach(() => rewardCatalogApi.getRewardCatalog.mockResolvedValue(trainingCatalog))

  it('默认常用关卡初始化只读；显示全部可选十二关且不写入偏好', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    expect(visibleTrainingLevels()).toEqual([4,6,8,10,12])
    expect(document.querySelectorAll('.training-level-options input')).toHaveLength(12)
    await showAllTrainingLevels()
    expect(visibleTrainingLevels()).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
    expect(write).not.toHaveBeenCalled()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('勾选常用独立保存；取消已选关卡保留选择、数量与当前预览正文', async () => {
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await appendTraining('ds', 12, 7)
    await clickElement(bodyButton('预览本次流水'))
    const preview = document.body.querySelector('.preview-section').textContent
    await setCommonTrainingLevel(1, true)
    await setCommonTrainingLevel(8, false)
    expect(JSON.parse(localStorage.getItem(trainingLevelKey()))).toEqual([1,4,6,10,12])
    expect(visibleTrainingLevels()).toEqual([1,4,6,8,10,12])
    expect(visibleTrainingLevels(1)).toEqual([1,4,6,10,12])
    expect(document.getElementById('training-level').value).toBe('8')
    expect(document.querySelector('#training-level option[value="8"]').textContent).toContain('当前选择')
    expect(document.body.querySelector('.preview-section').textContent).toBe(preview)
    await clickElement(bodyButton('确认补录 1 条'))
    expect(inventoryApi.importInventory.mock.calls[0][0].records[0].entries.map(entry => [entry.id, entry.count])).toEqual([['jinsishan',225], ['yushan',175], ['bawanglei',420], ['mulanzhuilu',315]])
  })

  it('常用偏好重开、清空与重新挂载保留，至少一关且不误选关卡', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    for (const level of [4,6,10,12]) await setCommonTrainingLevel(level, false)
    expect(document.querySelector('.training-level-options input[value="8"]').disabled).toBe(true)
    await setCommonTrainingLevel(8, false)
    expect(JSON.parse(localStorage.getItem(trainingLevelKey()))).toEqual([8])
    await clickElement(document.querySelector('.basket-heading button'))
    expect(visibleTrainingLevels()).toEqual([8])
    expect(document.getElementById('training-level').value).toBe('')
    await clickElement(document.body.querySelector('.close-button'))
    await openTraining(wrapper)
    expect(visibleTrainingLevels()).toEqual([8])
    wrapper.unmount()
    const remounted = mountWorkspace({ game: '代号鸢' })
    await openTraining(remounted)
    expect(visibleTrainingLevels()).toEqual([8])
    expect(document.querySelector('.training-level-options input[value="8"]').checked).toBe(true)
  })

  it('常用设置按账号与游戏隔离，切换重读且不写错对象', async () => {
    localStorage.setItem(trainingLevelKey(), '[1,3]')
    localStorage.setItem(trainingLevelKey('acc-2'), '[2,5]')
    localStorage.setItem(trainingLevelKey('acc-1', '如鸢'), '[7,11]')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper, { level: 1 })
    expect(visibleTrainingLevels()).toEqual([1,3])
    await showAllTrainingLevels()
    await wrapper.setProps({ accountId: 'acc-2' })
    await openTraining(wrapper, { level: 2 })
    expect(visibleTrainingLevels()).toEqual([2,5])
    expect(document.querySelector('.training-show-all input').checked).toBe(false)
    await wrapper.setProps({ accountId: 'acc-1', game: '如鸢' })
    await openTraining(wrapper, { level: 7 })
    expect(visibleTrainingLevels()).toEqual([7,11])
    expect(write).not.toHaveBeenCalled()
    await setCommonTrainingLevel(9, true)
    expect(write).toHaveBeenCalledWith(trainingLevelKey('acc-1', '如鸢'), '[7,9,11]')
    expect(localStorage.getItem(trainingLevelKey())).toBe('[1,3]')
    expect(localStorage.getItem(trainingLevelKey('acc-2'))).toBe('[2,5]')
    await wrapper.setProps({ accountId: '' })
    expect(document.body.querySelector('.reward-panel')).toBeNull()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it.each(['bad-json', '[]', '{}', '[0,13]', '["4"]', 'null'])('无效已存偏好%s回退默认，不写入修复或阻止计算', async raw => {
    localStorage.setItem(trainingLevelKey(), raw)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    expect(visibleTrainingLevels()).toEqual([4,6,8,10,12])
    expect(document.body.textContent).toContain('已恢复默认')
    expect(write).not.toHaveBeenCalled()
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelector('.preview-record')).not.toBeNull()
  })

  it('读取乱序重复偏好排序去重，存储不可用时会话内仍能配置与计算', async () => {
    localStorage.setItem(trainingLevelKey(), '[12,1,1,8]')
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    expect(visibleTrainingLevels()).toEqual([1,8,12])
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('storage unavailable', 'QuotaExceededError') })
    await setCommonTrainingLevel(5, true)
    expect(visibleTrainingLevels()).toEqual([1,5,8,12])
    expect(document.body.textContent).toContain('仅在本次页面内生效')
    await setTrainingField('level', 5)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelector('.preview-record').textContent).toContain('翠扇')
    write.mockRestore()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    await wrapper.setProps({ game: '如鸢' })
    await openTraining(wrapper)
    expect(visibleTrainingLevels()).toEqual([4,6,8,10,12])
    expect(document.body.textContent).toContain('无法读取常用关卡')
  })

  it('低关卡单材料与多材料一起提交，图标对应稳定ID，加载失败仍保留材料名与数量', async () => {
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await showAllTrainingLevels()
    await setTrainingField('level', 1)
    await appendTraining('ds', 2, 7)
    await appendTraining('yy', 3, 1)
    const ids = ['juanshan','zhuojiu','tongjing','liubojing']
    for (const selector of ['.training-formulas', '.basket-list']) {
      const images = Array.from(document.querySelectorAll(`${selector} .reward-item-icon img`))
      expect(images.map(img => img.getAttribute('src'))).toEqual(ids.map(id => `/inventory-icons/items/${id}.png`))
      expect(images.every(img => img.alt === '' && img.parentElement.getAttribute('aria-hidden') === 'true')).toBe(true)
    }
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelectorAll('.record-rewards .reward-item-icon img')).toHaveLength(4)
    document.querySelector('.training-formulas img').dispatchEvent(new Event('error'))
    await flushPromises()
    expect(document.querySelector('.training-formulas li').textContent).toContain('绢扇')
    expect(document.querySelector('.training-formulas li').textContent).toContain('+75')
    expect(document.querySelector('.record-rewards').textContent).toContain('绢扇')
    expect(document.querySelectorAll('img[src="/inventory-icons/items/juanshan.png"]')).toHaveLength(0)
    await clickElement(bodyButton('确认补录 1 条'))
    expect(inventoryApi.importInventory.mock.calls[0][0].records[0].entries.map(entry => [entry.id, entry.count])).toEqual([['juanshan',75], ['zhuojiu',175], ['tongjing',25], ['liubojing',15]])
  })

  it.each(['代号鸢', '如鸢'])('%s同一类型7/8/9关各2次，独立公式合计三种材料；可添加第四组', async game => {
    inventoryApi.importInventory.mockResolvedValue({ accepted:1, duplicates:0, history_only:0, superseded:0 })
    const wrapper = mountWorkspace({ game })
    await openTraining(wrapper)
    await showAllTrainingLevels()
    await setTrainingField('level', 7); await setTrainingField('runs', 2)
    await appendTraining('fh', 8, 2); await appendTraining('fh', 9, 2)
    expect(document.querySelector('#training-level-1 option[value="7"]').disabled).toBe(true)
    expect(document.querySelector('#training-level-1 option[value="8"]').disabled).toBe(false)
    expect(document.querySelectorAll('.training-formulas li')).toHaveLength(6)
    expect(Array.from(document.querySelectorAll('.training-count')).map(el => el.textContent)).toEqual(['+170','+220','+70'])
    expect(document.querySelectorAll('.basket-list img')).toHaveLength(3)
    await appendTraining('ds', 7, 2)
    expect(document.querySelectorAll('.training-selection')).toHaveLength(4)
    expect(document.querySelector('#training-level-3 option[value="7"]').disabled).toBe(false)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    expect(inventoryApi.importInventory.mock.calls[0][0].records[0].entries.map(entry => [entry.id,entry.count])).toEqual([['jinsishan',170],['yushan',220],['xianmenshan',70],['baimozhijiu',80],['lingshanquan',60]])
  })

  it('同类多关卡移除和修改重新合计，模式复制合计结果；网络失败原样重试', async () => {
    inventoryApi.importInventory.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({ accepted:0, duplicates:1, history_only:0, superseded:0 })
    const wrapper = mountWorkspace({ game:'代号鸢' })
    await openTraining(wrapper); await showAllTrainingLevels()
    await setTrainingField('level', 7); await setTrainingField('runs', 2)
    await appendTraining('fh', 8, 2); await appendTraining('fh', 9, 2)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(document.querySelector('button[aria-label="移除第 2 组历练"]'))
    expect(document.querySelector('.preview-section')).toBeNull()
    expect(document.getElementById('training-level-1').value).toBe('9')
    expect(Array.from(document.querySelectorAll('.training-count')).map(el => el.textContent)).toEqual(['+80','+150','+70'])
    await setTrainingField('runs', 1, 1)
    expect(Array.from(document.querySelectorAll('.training-count')).map(el => el.textContent)).toEqual(['+80','+105','+35'])
    await clickElement(bodyButton('按材料填写'))
    expect(document.querySelector('input[aria-label="羽扇数量"]').value).toBe('105')
    await clickElement(bodyButton('按次数填写')); await clickElement(bodyButton('替换并按次数填写'))
    await clickElement(bodyButton('预览本次流水')); await clickElement(bodyButton('确认补录 1 条'))
    const first = JSON.stringify(inventoryApi.importInventory.mock.calls[0][0])
    expect(document.getElementById('training-level-1').matches(':disabled')).toBe(true)
    await clickElement(bodyButton('原样重试补录'))
    expect(JSON.stringify(inventoryApi.importInventory.mock.calls[1][0])).toBe(first)
  })

  it('重复类型+关卡与材料合计超限均阻止整笔，错误定位相应组', async () => {
    const wrapper = mountWorkspace({ game:'代号鸢' })
    await openTraining(wrapper); await appendTraining('fh', 8, 2)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelector('.error-message').textContent).toContain('同一关卡')
    expect(document.querySelector('.error-message a').getAttribute('href')).toBe('#training-level-1')
    await clickElement(document.querySelector('.error-message a'))
    expect(document.activeElement).toBe(document.getElementById('training-level-1'))
    await showAllTrainingLevels()
    await setTrainingField('level', 1); await setTrainingField('runs', 2)
    await setTrainingField('level', 2, 1); await setTrainingField('runs', '85899345', 1)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelector('.error-message').textContent).toContain('合计数量')
    expect(document.querySelector('.error-message a').getAttribute('href')).toBe('#training-runs-1')
    expect(document.querySelector('.preview-section')).toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await setTrainingField('runs', 1)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.querySelector('.preview-record').textContent).toContain('2147483640')
  })

  it.each(['代号鸢', '如鸢'])('%s可一次填写三种独立历练，预览后合并六项材料为单笔流水', async game => {
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game })
    await openTraining(wrapper)
    await appendTraining('ds', 12, 7)
    await appendTraining('yy', 4, 1)
    expect(bodyButton('添加一组历练').disabled).toBe(false)
    expect(document.querySelector('#training-group-1 option[value="fh"]').disabled).toBe(false)
    expect(document.body.querySelectorAll('.training-formulas li')).toHaveLength(6)
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(6)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelectorAll('.preview-record')).toHaveLength(1)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await clickElement(bodyButton('确认补录 1 条'))
    const documentSent = inventoryApi.importInventory.mock.calls[0][0]
    expect(documentSent.records).toHaveLength(1)
    expect(documentSent.records[0]).toMatchObject({ record_type: 'reward_delta', acquisition_channel: '历练', entity_type: 'item', account_id: 'acc-1' })
    expect(documentSent.records[0].entries.map(entry => [entry.id, entry.count])).toEqual([
      ['jinsishan', 225], ['yushan', 175], ['bawanglei', 420], ['mulanzhuilu', 315], ['tongjing', 30], ['liubojing', 20],
    ])
    expect(documentSent.records[0]).not.toHaveProperty('stamina_cost')
    await clickElement(bodyButton('再添加一条'))
    await clickElement(bodyButton('历练')); await clickElement(bodyButton('按次数填写'))
    expect(document.body.querySelectorAll('.training-selection')).toHaveLength(1)
    expect(document.getElementById('training-group').value).toBe('')
  })

  it('添加、修改和移除只重算相应组，预览失效且焦点可达，手工模式复制全部结果', async () => {
    const wrapper = mountWorkspace({ game: '如鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('添加一组历练'))
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(document.activeElement).toBe(document.getElementById('training-group-1'))
    await setTrainingField('group', 'ds', 1); await setTrainingField('level', 12, 1); await setTrainingField('runs', 7, 1)
    await appendTraining('yy', 4, 1)
    await clickElement(bodyButton('预览本次流水'))
    await setTrainingField('runs', 5, 1)
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(Array.from(document.body.querySelectorAll('.training-count')).map(node => node.textContent)).toEqual(['+225', '+175', '+300', '+225', '+30', '+20'])
    await clickElement(document.body.querySelector('button[aria-label="移除第 2 组历练"]'))
    expect(document.body.querySelectorAll('.training-selection')).toHaveLength(2)
    expect(document.activeElement).toBe(document.getElementById('training-group-1'))
    expect(document.getElementById('training-group-1').value).toBe('yy')
    expect(document.getElementById('training-runs-1').value).toBe('1')
    expect(Array.from(document.body.querySelectorAll('.training-count')).map(node => node.textContent)).toEqual(['+225', '+175', '+30', '+20'])
    await clickElement(bodyButton('按材料填写'))
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(4)
    const amount = document.body.querySelector('input[aria-label="铜镜数量"]')
    amount.value = '999'; amount.dispatchEvent(new Event('input', { bubbles: true }))
    await clickElement(bodyButton('按次数填写'))
    expect(document.body.querySelector('.training-replace')).not.toBeNull()
    await clickElement(bodyButton('替换并按次数填写'))
    expect(document.body.querySelectorAll('.training-selection')).toHaveLength(2)
    expect(Array.from(document.body.querySelectorAll('.training-count')).map(node => node.textContent)).toEqual(['+225', '+175', '+30', '+20'])
  })

  it('任何一组未填、非法或缺目录项都阻止整笔；摘要链接指向相应字段', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('添加一组历练'))
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(document.querySelector('.error-message a').getAttribute('href')).toBe('#training-group-1')
    await clickElement(document.querySelector('.error-message a'))
    expect(document.activeElement).toBe(document.getElementById('training-group-1'))
    expect(document.body.querySelector('.training-formulas').textContent).toContain('+225')
    await setTrainingField('group', 'ds', 1); await setTrainingField('level', 12, 1)
    for (const value of ['', '0', '1e2', '35791395']) {
      await setTrainingField('runs', value, 1)
      await clickElement(bodyButton('预览本次流水'))
      expect(document.body.querySelector('.preview-section')).toBeNull()
      expect(document.querySelector('.error-message a').getAttribute('href')).toBe('#training-runs-1')
    }
    await setTrainingField('runs', 7, 1)
    await appendTraining('yy', 4, 1)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-record')).not.toBeNull()
    rewardCatalogApi.getRewardCatalog.mockResolvedValue(trainingCatalog.filter(item => item.id !== 'tongjing'))
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(document.body.querySelector('.error-message').textContent).toContain('tongjing')
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(0)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('多种类网络结果不明时锁定所有组，同ID正文原样重试；清空与账号变化清理所有组', async () => {
    inventoryApi.importInventory.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({ accepted: 0, duplicates: 1, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game: '如鸢' })
    await openTraining(wrapper)
    await appendTraining('ds', 12, 7)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    const first = JSON.stringify(inventoryApi.importInventory.mock.calls[0][0])
    expect(document.getElementById('training-runs-1').matches(':disabled')).toBe(true)
    expect(bodyButton('添加一组历练').matches(':disabled')).toBe(true)
    expect(document.querySelector('button[aria-label="移除第 1 组历练"]').matches(':disabled')).toBe(true)
    expect(document.querySelector('.training-show-all input').matches(':disabled')).toBe(true)
    expect(document.querySelector('.training-level-options input').matches(':disabled')).toBe(true)
    await setCommonTrainingLevel(1, true)
    expect(localStorage.getItem(trainingLevelKey('acc-1', '如鸢'))).toBeNull()
    await clickElement(bodyButton('原样重试补录'))
    expect(JSON.stringify(inventoryApi.importInventory.mock.calls[1][0])).toBe(first)
    await clickElement(bodyButton('再添加一条'))
    await clickElement(bodyButton('历练')); await clickElement(bodyButton('按次数填写'))
    await setTrainingField('group', 'fh'); await setTrainingField('level', 8)
    await appendTraining('ds', 12, 7)
    await clickElement(document.querySelector('.basket-heading button'))
    expect(document.body.querySelectorAll('.training-selection')).toHaveLength(1)
    expect(document.getElementById('training-group').value).toBe('')
    await setTrainingField('group', 'fh'); await setTrainingField('level', 8)
    await appendTraining('yy', 4, 1)
    await wrapper.setProps({ game: '代号鸢' })
    await button(wrapper, '添加奖励流水').trigger('click'); await flushPromises()
    await clickElement(bodyButton('历练')); await clickElement(bodyButton('按次数填写'))
    expect(document.body.querySelectorAll('.training-selection')).toHaveLength(1)
    expect(document.getElementById('training-group').value).toBe('')
  })

  it('类型和层数没有默认值，次数初值1；错误邻近字段并可从摘要返回', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('历练'))
    await clickElement(bodyButton('按次数填写'))
    expect(document.getElementById('training-group').value).toBe('')
    expect(document.getElementById('training-level').value).toBe('')
    expect(document.getElementById('training-runs').value).toBe('1')
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.error-message').textContent).toContain('请选择风火')
    expect(document.activeElement).toBe(document.body.querySelector('.error-message'))
    await clickElement(document.body.querySelector('.error-message a'))
    expect(document.activeElement).toBe(document.getElementById('training-group'))
    expect(document.getElementById('training-group').getAttribute('aria-describedby')).toBe('training-error')
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it.each(['代号鸢', '如鸢'])('%s三类十二关依次重算，预览数量一致且不累加，超过6次仍可录入', async game => {
    const wrapper = mountWorkspace({ game })
    await openTraining(wrapper)
    await showAllTrainingLevels()
    const ids = {
      fh: ['juanshan', 'cuishan', 'jinsishan', 'yushan', 'xianmenshan', 'beihuifengshan'],
      ds: ['zhuojiu', 'qingjiu', 'baimozhijiu', 'lingshanquan', 'bawanglei', 'mulanzhuilu'],
      yy: ['tongjing', 'liubojing', 'liujinjing', 'baoshijing', 'shuijing', 'xinghanjing'],
    }
    for (const [group, materials] of Object.entries(ids)) {
      await setTrainingField('group', group)
      for (const [index, [tier, low, high]] of [[0,15], [0,25], [0,25,15], [0,30,20], [1,35,25], [1,40,30], [2,40,30], [2,45,35], [3,45,35], [3,50,40], [4,55,40], [4,60,45]].entries()) {
        const level = index + 1
        await setTrainingField('level', level)
        await setTrainingField('runs', '7')
        const names = materials.slice(tier, tier + (high ? 2 : 1)).map(id => trainingCatalog.find(item => item.id === id).name)
        const lines = document.body.querySelectorAll('.training-formulas li')
        expect(lines).toHaveLength(high ? 2 : 1)
        expect(lines[0].textContent).toContain(`${names[0]}单次 ${low} × 7 次 = +${low * 7}`)
        if (high) expect(lines[1].textContent).toContain(`${names[1]}单次 ${high} × 7 次 = +${high * 7}`)
        await clickElement(bodyButton('预览本次流水'))
        expect(document.body.querySelector('.preview-record').textContent).toContain(`+ ${low * 7}`)
        if (high) expect(document.body.querySelector('.preview-record').textContent).toContain(`+ ${high * 7}`)
        await setTrainingField('runs', '1')
        expect(document.body.querySelector('.preview-section')).toBeNull()
      }
    }
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('按次数清单只读；复制成材料后可修正/加奖励，切回须明确替换', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    expect(document.body.querySelector('.quantity-control')).toBeNull()
    expect(document.body.querySelector('.reward-tile')).toBeNull()
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('按材料填写'))
    expect(document.body.querySelector('.preview-section')).toBeNull()
    const amount = document.body.querySelector('input[aria-label="金丝扇数量"]')
    expect(amount.value).toBe('225')
    amount.value = '999'; amount.dispatchEvent(new Event('input', { bubbles: true }))
    await clickElement(document.body.querySelector('.reward-tile[aria-label^="添加绢扇"]'))
    await clickElement(bodyButton('按次数填写'))
    expect(document.body.querySelector('.training-replace').textContent).toContain('手工修改及额外奖励不会保留')
    expect(document.body.querySelector('input[aria-label="金丝扇数量"]').value).toBe('999')
    await clickElement(bodyButton('保留按材料填写'))
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-record').textContent).toContain('+ 999')
    await clickElement(bodyButton('按次数填写'))
    await clickElement(bodyButton('替换并按次数填写'))
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(2)
    expect(document.body.querySelector('.training-formulas').textContent).toContain('+225')
    await setTrainingField('runs', '1')
    expect(document.body.querySelector('.training-formulas').textContent).toContain('+45')
  })

  it('非法次数和溢出不产生预览或请求，修正时不抢焦点', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    for (const value of ['', '0', '-1', '1.5', '1e2', 'Infinity', 'NaN', '47721859']) {
      await setTrainingField('runs', value)
      await clickElement(bodyButton('预览本次流水'))
      expect(document.body.querySelector('.preview-section')).toBeNull()
      expect(document.body.querySelector('.error-message')).not.toBeNull()
      expect(document.getElementById('training-runs').getAttribute('aria-invalid')).toBe('true')
    }
    document.getElementById('training-runs').focus()
    await setTrainingField('runs', '5')
    expect(document.activeElement).toBe(document.getElementById('training-runs'))
    expect(document.body.querySelector('.error-message')).toBeNull()
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-record')).not.toBeNull()
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it('目录缺任一材料整笔阻止，重新读取目录后才允许预览', async () => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValueOnce(trainingCatalog.filter(item => item.id !== 'yushan'))
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(0)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.error-message').textContent).toContain('yushan')
    expect(document.body.querySelector('.preview-section')).toBeNull()
    await clickElement(bodyButton('重新加载奖励目录'))
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelectorAll('.preview-record')).toHaveLength(1)
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it.each(['', 'unknown'])('未知游戏%s禁用预设但保留原材料录入', async game => {
    const wrapper = mountWorkspace({ game })
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    await clickElement(bodyButton('历练'))
    expect(bodyButton('按次数填写').disabled).toBe(true)
    expect(document.body.textContent).toContain('没有已核实')
    await clickElement(document.body.querySelector('.reward-tile[aria-label^="添加金丝扇"]'))
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-record').textContent).toContain('金丝扇')
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  })

  it.each(['代号鸢', '如鸢'])('%s预览后才确认：v2单笔、当前目录名、真实时间和无体力字段，成功仍发刷新事件', async game => {
    rewardCatalogApi.getRewardCatalog.mockResolvedValue(trainingCatalog.map(item => item.id === 'jinsishan' ? { ...item, name: '目录中的金丝扇' } : item))
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 1, superseded: 0, warnings: ['已被盘点覆盖'] })
    const wrapper = mountWorkspace({ game, latestInventoryAt: '2026-10-02T00:00:00Z' })
    await openTraining(wrapper)
    const datetime = wrapper.findComponent(RewardDateTimePicker)
    datetime.vm.$emit('update:date', '2026-09-30')
    datetime.vm.$emit('update:clock', '10:12:34')
    await flushPromises()
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.preview-section').textContent).toContain(`游戏：${game}`)
    expect(document.body.querySelector('.preview-section').textContent).toContain('同批奖励请勿再次补录')
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await clickElement(bodyButton('确认补录 1 条'))
    const documentSent = inventoryApi.importInventory.mock.calls[0][0]
    expect(documentSent.version).toBe(2)
    expect(documentSent.records).toHaveLength(1)
    expect(documentSent.records[0]).toEqual({
      record_id: expect.stringMatching(/^yuanhub:reward:/), account_id: 'acc-1',
      record_type: 'reward_delta', entity_type: 'item', acquisition_channel: '历练',
      effective_at: new Date('2026-09-30T10:12:34').toISOString(),
      entries: [{ id: 'jinsishan', name: '目录中的金丝扇', count: 225 }, { id: 'yushan', name: '羽扇', count: 175 }],
    })
    expect(document.body.querySelector('.result').textContent).toContain('仅历史 1 条')
    expect(document.body.querySelector('.result').textContent).toContain('已被盘点覆盖')
    expect(document.body.querySelector('.result').textContent).not.toContain('库存已增加')
    expect(wrapper.emitted('imported')).toEqual([['acc-1']])
    await clickElement(bodyButton('再添加一条'))
    await clickElement(bodyButton('历练'))
    await clickElement(bodyButton('按次数填写'))
    expect(document.getElementById('training-group').value).toBe('')
    expect(document.getElementById('training-runs').value).toBe('1')
  })

  it('双击不重复请求，未知网络结果锁定同ID正文重试，重复结果不声称增加库存', async () => {
    const pending = deferred()
    inventoryApi.importInventory.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ accepted: 0, duplicates: 1, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    const submit = bodyButton('确认补录 1 条')
    submit.click(); submit.click()
    await flushPromises()
    expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
    const original = JSON.parse(JSON.stringify(inventoryApi.importInventory.mock.calls[0][0]))
    pending.reject(new Error('Failed to fetch'))
    await flushPromises()
    expect(document.getElementById('training-runs').matches(':disabled')).toBe(true)
    expect(bodyButton('按材料填写').matches(':disabled')).toBe(true)
    await clickElement(bodyButton('原样重试补录'))
    expect(inventoryApi.importInventory.mock.calls[1][0]).toEqual(original)
    expect(document.body.querySelector('.result').textContent).toContain('记录已存在，未重复补录')
    expect(bodyButton('确认补录')).toBeUndefined()
  })

  it('清空和切渠道清理公式草稿，转换后的材料也不会遗留到其他渠道', async () => {
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(document.body.querySelector('.basket-heading button'))
    expect(document.getElementById('training-group').value).toBe('')
    expect(document.getElementById('training-level').value).toBe('')
    expect(document.getElementById('training-runs').value).toBe('1')
    expect(document.body.querySelector('.preview-section')).toBeNull()
    await setTrainingField('group', 'fh'); await setTrainingField('level', 8)
    await clickElement(bodyButton('按材料填写'))
    await clickElement(bodyButton('其他奖励'))
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(0)
    await clickElement(bodyButton('历练'))
    await clickElement(bodyButton('按次数填写'))
    expect(document.getElementById('training-group').value).toBe('')
  })

  it('同日同关卡的下一批使用新的随机ID，不复用日常固定ID', async () => {
    inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    const datetime = wrapper.findComponent(RewardDateTimePicker)
    const fillTime = async () => {
      datetime.vm.$emit('update:date', '2026-10-03')
      datetime.vm.$emit('update:clock', '10:00:00')
      await flushPromises()
    }
    await fillTime()
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    const first = inventoryApi.importInventory.mock.calls[0][0].records[0]
    await clickElement(bodyButton('再添加一条'))
    await clickElement(bodyButton('历练')); await clickElement(bodyButton('按次数填写'))
    await setTrainingField('group', 'fh'); await setTrainingField('level', 8); await setTrainingField('runs', 5)
    await fillTime()
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    const second = inventoryApi.importInventory.mock.calls[1][0].records[0]
    expect(first.record_id).not.toBe(second.record_id)
    expect(first.effective_at).toBe(second.effective_at)
    expect(first.entries).toEqual(second.entries)
  })

  it('响应无有效计数时原样重试；明确422拒绝后允许修正数量', async () => {
    inventoryApi.importInventory.mockResolvedValueOnce({ accepted: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('服务端校验拒绝'), { status: 422 }))
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    expect(document.body.querySelector('.error-message').textContent).toContain('未收到有效')
    expect(document.getElementById('training-runs').matches(':disabled')).toBe(true)
    const first = JSON.stringify(inventoryApi.importInventory.mock.calls[0][0])
    await clickElement(bodyButton('原样重试补录'))
    expect(JSON.stringify(inventoryApi.importInventory.mock.calls[1][0])).toBe(first)
    expect(document.getElementById('training-runs').matches(':disabled')).toBe(false)
    await setTrainingField('runs', 7)
    expect(document.body.querySelector('.preview-section')).toBeNull()
    expect(document.body.querySelector('.training-formulas').textContent).toContain('+315')
  })

  it.each([{ accountId: 'acc-2' }, { game: '如鸢' }, { accountId: '' }])('账号/版本变化%s清理草稿，晚到提交不能误刷新', async changed => {
    const pending = deferred()
    inventoryApi.importInventory.mockReturnValue(pending.promise)
    const wrapper = mountWorkspace({ game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    await clickElement(bodyButton('确认补录 1 条'))
    await wrapper.setProps(changed)
    pending.resolve({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.emitted('imported')).toBeUndefined()
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    expect(document.body.querySelectorAll('.basket-list li')).toHaveLength(0)
    if (changed.game) {
      await clickElement(bodyButton('历练'))
      expect(bodyButton('按次数填写').disabled).toBe(false)
      await clickElement(bodyButton('按次数填写'))
      expect(document.getElementById('training-group').value).toBe('')
      expect(document.getElementById('training-level').value).toBe('')
      expect(document.getElementById('training-runs').value).toBe('1')
    }
  })

  it('无账号、目录读取失败和卸载期间不产生错误导入或刷新', async () => {
    const wrapper = mountWorkspace({ accountId: '', game: '代号鸢' })
    await openTraining(wrapper)
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelector('.error-message').textContent).toContain('子账号')
    expect(inventoryApi.importInventory).not.toHaveBeenCalled()
    await wrapper.setProps({ accountId: 'acc-1' })
    rewardCatalogApi.getRewardCatalog.mockRejectedValueOnce(new Error('目录读取失败'))
    await button(wrapper, '添加奖励流水').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.manual-form')).toBeNull()
    expect(document.body.querySelector('.error-message').textContent).toContain('目录读取失败')
    await clickElement(bodyButton('重新加载奖励目录'))
    await clickElement(bodyButton('历练'))
    await clickElement(bodyButton('按次数填写'))
    await setTrainingField('group', 'fh'); await setTrainingField('level', 8)
    await clickElement(bodyButton('预览本次流水'))
    const pending = deferred()
    inventoryApi.importInventory.mockReturnValue(pending.promise)
    await clickElement(bodyButton('确认补录 1 条'))
    wrapper.unmount()
    pending.resolve({ accepted: 1, duplicates: 0, history_only: 0, superseded: 0 })
    await flushPromises()
    expect(wrapper.emitted('imported')).toBeUndefined()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
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
    const receipt = document.body.querySelector('.reward-receipt')
    expect(document.body.querySelector('.manual-columns .reward-picker')).not.toBeNull()
    expect(receipt).not.toBeNull()
    expect(receipt.querySelectorAll('.basket-list li')).toHaveLength(2)
    expect(receipt.textContent).toContain('月卡奖励')
    expect(receipt.textContent).toContain('密探日常')
    expect(receipt.textContent).toContain('合计 110 白金币')
    expect(receipt.querySelector('.preview-button')).not.toBeNull()
    expect(document.body.querySelector('.daily-source-list')).toBeNull()
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
    expect(document.body.querySelector('.reward-receipt').textContent).toContain('合计 130 白金币')
    await clickElement(bodyButton('月卡奖励 60'))
    expect(document.body.querySelector('.reward-receipt').textContent).toContain('合计 70 白金币')
    await clickElement(bodyButton('预览本次流水'))
    expect(document.body.querySelectorAll('.preview-record')).toHaveLength(1)
    expect(document.body.querySelector('.preview-record').textContent).toContain('密探日常')
    expect(document.body.querySelector('.preview-record').textContent).toContain('+ 70')
  })

  it('快捷来源复用本次入账的数量、移除和清空操作，清空后恢复普通选取', async () => {
    const wrapper = mountWorkspace()
    await openQuickCoin(wrapper, 'income')
    await clickElement(bodyButton('密探日常 50'))
    const receipt = document.body.querySelector('.reward-receipt')
    const labelButton = label => receipt.querySelector(`button[aria-label="${label}"]`)
    expect(document.body.querySelector('.reward-tile').disabled).toBe(true)
    await clickElement(labelButton('增加白金币 · 月卡奖励'))
    expect(receipt.querySelector('input[aria-label="月卡奖励白金币数量"]').value).toBe('70')
    await clickElement(labelButton('减少白金币 · 月卡奖励'))
    expect(receipt.querySelector('input[aria-label="月卡奖励白金币数量"]').value).toBe('60')
    await clickElement(labelButton('移除白金币 · 月卡奖励'))
    expect(receipt.querySelectorAll('.basket-list li')).toHaveLength(1)
    expect(receipt.textContent).toContain('合计 50 白金币')
    expect(document.body.querySelector('.shortcut-options button[aria-pressed="true"]').textContent).toContain('密探日常')
    await clickElement(receipt.querySelector('.text-button'))
    expect(receipt.querySelector('.basket-empty')).not.toBeNull()
    expect(receipt.querySelector('.preview-button').disabled).toBe(true)
    expect(document.body.querySelector('select[aria-label="白金币记录用途"]')).toBeNull()
    const coin = document.body.querySelector('.reward-tile[aria-label^="添加白金币"]')
    expect(coin.disabled).toBe(false)
    await clickElement(coin)
    expect(receipt.querySelector('input[aria-label="白金币数量"]').value).toBe('10')
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

it('空录入没有草稿；收起和重新打开后仍能检查未保存奖励草稿，换账号清空', async () => {
  const wrapper = mountWorkspace()
  expect(wrapper.vm.hasDraft()).toBe(false)
  await button(wrapper, '添加奖励流水').trigger('click'); await flushPromises()
  expect(wrapper.vm.hasDraft()).toBe(false)
  await clickElement(bodyButton('月卡奖励 60'))
  expect(wrapper.vm.hasDraft()).toBe(true)
  await clickElement(document.body.querySelector('.close-button'))
  expect(wrapper.vm.hasDraft()).toBe(true)
  await button(wrapper, '添加奖励流水').trigger('click'); await flushPromises()
  expect(wrapper.vm.hasDraft()).toBe(true)
  await wrapper.setProps({ accountId: 'acc-2' }); await flushPromises()
  expect(wrapper.vm.hasDraft()).toBe(false)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})
