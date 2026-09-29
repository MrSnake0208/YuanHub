import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import * as inventoryApi from '../src/api/inventory.js'
import * as rewardCatalogApi from '../src/api/rewardCatalog.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/inventory.js', () => ({
  importInventory: vi.fn(),
}))
vi.mock('../src/api/rewardCatalog.js', () => ({
  getRewardCatalog: vi.fn(),
}))

const catalog = [
  { entity_type: 'item', id: 'baijinbi', name: '白金币', rarity: 3 },
  { entity_type: 'item', id: 'jizhi', name: '鸡汁', rarity: 3 },
  { entity_type: 'agent', id: 'agent_test', name: '测试密探', rarity: 5 },
]

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
  rewardCatalogApi.getRewardCatalog.mockReset()
  rewardCatalogApi.getRewardCatalog.mockResolvedValue(catalog)
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
})

describe('奖励补录工作台弹层', () => {
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
