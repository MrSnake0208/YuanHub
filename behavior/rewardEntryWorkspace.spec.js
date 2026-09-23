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
