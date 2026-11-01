import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useModalViewport } from '../src/composables/useModalViewport.js'
import AppDialog from '../src/components/AppDialog.vue'
import FeedbackTicketWorkspace from '../src/components/feedback/FeedbackTicketWorkspace.vue'
import CalendarPrivateItemEditor from '../src/components/calendar/CalendarPrivateItemEditor.vue'
import StarPresetManager from '../src/components/operator/StarPresetManager.vue'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import { CALENDAR_PRIVATE_ITEMS } from '../src/data/calendarPrivateItems.js'
import { dialog } from '../src/utils/dialog.js'
import { getRewardCatalog } from '../src/api/rewardCatalog.js'

vi.mock('../src/api/rewardCatalog.js', () => ({ getRewardCatalog: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), importInventory: vi.fn() }))

beforeEach(() => {
  getRewardCatalog.mockResolvedValue([{ entity_type: 'item', id: 'baijinbi', name: '白金币', rarity: 3 }])
})

function installViewport() {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  return viewport
}

const Harness = defineComponent({
  setup() {
    const open = ref(false), body = ref(null), panel = ref(null), draft = ref('')
    return { open, body, panel, draft, ...useModalViewport(open, body, panel) }
  },
  template: `<div v-if="open" class="mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle"><section ref="panel" class="panel" tabindex="-1" @focusin="revealFocusedControl"><div ref="body" class="body" tabindex="-1"><section class="tab-panel" role="tabpanel" tabindex="0"><textarea v-model="draft" /><p class="field-error" role="alert" tabindex="-1">请填写内容</p></section></div><button>保存</button></section></div>`
})

afterEach(() => { if (dialog._state.visible) dialog._cancel() })

function mockBounds(body, input, top = 260, height = 40) {
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, bottom: 260, height: 160 }))
  vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() => ({ top: top - body.scrollTop, bottom: top + height - body.scrollTop, height }))
}

async function openHarness() {
  const wrapper = mount(Harness, { attachTo: document.body })
  wrapper.vm.open = true
  await flushPromises()
  return wrapper
}

describe('弹窗可视视口保护（jsdom，几何由测试提供）', () => {
  it('仅打开时监听；键盘高度、偏移和滚动变化保留 DOM、焦点与草稿', async () => {
    const viewport = installViewport()
    const add = vi.spyOn(viewport, 'addEventListener'), remove = vi.spyOn(viewport, 'removeEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(Harness, { attachTo: document.body })
    expect(add).not.toHaveBeenCalled()
    wrapper.vm.open = true
    await flushPromises()
    const input = wrapper.get('textarea'), body = wrapper.get('.body').element
    await input.setValue('尚未保存的内容')
    input.element.focus()
    await flushPromises()
    body.scrollTop = 0
    mockBounds(body, input.element)
    viewport.height = 420; viewport.offsetTop = 48
    viewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(wrapper.get('.mask').element.style.height).toBe('420px')
    expect(wrapper.get('.mask').element.style.top).toBe('48px')
    expect(body.scrollTop).toBe(52)
    viewport.offsetTop = 64
    viewport.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(wrapper.get('.mask').element.style.top).toBe('64px')
    expect(body.scrollTop).toBe(52)
    expect(wrapper.get('textarea').element).toBe(input.element)
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('尚未保存的内容')
    wrapper.vm.open = false
    await flushPromises()
    for (const [type, handler] of add.mock.calls) expect(remove).toHaveBeenCalledWith(type, handler)
    expect(removeWindow).toHaveBeenCalledWith('resize', add.mock.calls[0][1])
    expect(wrapper.vm.viewportStyle).toEqual({})
    wrapper.vm.open = true
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('尚未保存的内容')
    expect(add.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(2)
    wrapper.unmount()
    expect(remove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(2)
  })

  it.each([[80, 40, -32], [180, 300, 68], [140, 40, 0]])('focusin 只调整正文：输入顶部 %i、高度 %i', async (top, height, expected) => {
    installViewport()
    const wrapper = await openHarness()
    const body = wrapper.get('.body').element, input = wrapper.get('textarea').element
    mockBounds(body, input, top, height)
    const background = vi.spyOn(window, 'scrollTo')
    input.focus()
    await flushPromises()
    expect(body.scrollTop).toBe(expected)
    expect(background).not.toHaveBeenCalled()
  })

  it.each([800, 200])('%ipx 视口中聚焦空白容器及视口更新均保留滚动位置', async height => {
    const viewport = installViewport()
    viewport.height = height
    const wrapper = await openHarness()
    const scroller = wrapper.get(height < 360 ? '.panel' : '.body').element
    for (const selector of ['.panel', '.body', '.tab-panel']) {
      const target = wrapper.get(selector).element
      vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 260, height: 160 })
      if (target !== scroller) {
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: -200, bottom: 600, height: 800 })
      }
      scroller.scrollTop = 300
      target.focus({ preventScroll: true })
      await flushPromises()
      expect(document.activeElement).toBe(target)
      expect(scroller.scrollTop).toBe(300)
      viewport.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect(scroller.scrollTop).toBe(300)
    }
    wrapper.unmount()
  })

  it('错误提示获得焦点时仍滚动到可见区域', async () => {
    installViewport()
    const wrapper = await openHarness()
    const body = wrapper.get('.body').element, error = wrapper.get('.field-error').element
    mockBounds(body, error)
    error.focus()
    await flushPromises()
    expect(body.scrollTop).toBe(52)
    wrapper.unmount()
  })

  it('上层弹窗的输入不会滚动下层正文', async () => {
    const viewport = installViewport(), wrapper = await openHarness()
    const body = wrapper.get('.body').element
    const outside = document.createElement('input'); document.body.append(outside); outside.focus()
    const bounds = vi.spyOn(body, 'getBoundingClientRect')
    viewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(bounds).not.toHaveBeenCalled()
    expect(body.scrollTop).toBe(0)
  })

  it('无 visualViewport 时回退窗口高度并响应旋转；卸载解除监听', async () => {
    vi.stubGlobal('visualViewport', undefined)
    vi.stubGlobal('innerHeight', 700)
    const remove = vi.spyOn(window, 'removeEventListener'), wrapper = await openHarness()
    expect(wrapper.get('.mask').element.style.height).toBe('700px')
    window.innerHeight = 360; window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(wrapper.get('.mask').element.style.height).toBe('360px')
    expect(wrapper.get('.mask').element.style.top).toBe('0px')
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})

describe('实际输入弹窗接入', () => {
  const cases = [
    ['通用输入', async () => {
      mount(AppDialog, { attachTo: document.body })
      dialog.prompt({ title: '填写原因' })
      await flushPromises()
      return ['.dialog-mask', '.dialog-body', '.dialog-field input']
    }],
    ['反馈回复/流转', async () => {
      mount(FeedbackTicketWorkspace, { attachTo: document.body,
        props: { selectedItem: { id: 'ticket', status: 'OPEN' }, categoryLabel: value => value, statusLabel: () => '处理中', formatDate: () => '' },
        slots: { detail: '<textarea aria-label="回复内容" />' }
      })
      return ['.ticket-detail-mask', '.ticket-detail-scroll', 'textarea']
    }],
    ['日历私人事项', async () => {
      mount(CalendarPrivateItemEditor, { attachTo: document.body, props: { account: { name: '账号', game: '如鸢' } },
        global: { provide: { [CALENDAR_PRIVATE_ITEMS]: {
          editor: ref({ form: { title: '', start_date: '2026-10-16', end_date: '2026-10-16', note: '' }, errors: {} }),
          dirty: ref(false), close: vi.fn(), save: vi.fn()
        } } }
      })
      return ['.calendar-private-mask', '.calendar-private-body', '#private-item-title-input']
    }],
    ['星石预设', async () => {
      const wrapper = mount(StarPresetManager, { attachTo: document.body, props: {
        open: false, presets: { main: [{ id: 'preset', name: '预设', names: ['天府'] }], support: [] }, saveHandler: vi.fn()
      } })
      await wrapper.setProps({ open: true })
      return ['.preset-overlay', '.preset-columns', 'input[aria-label="预设名称"]']
    }],
    ['库存报告粘贴', async () => {
      const wrapper = mount(RewardEntryWorkspace, { attachTo: document.body, props: { accountId: 'account', game: '如鸢' } })
      await wrapper.findAll('button').find(button => button.text().includes('导入本地报告')).trigger('click')
      await flushPromises()
      const ui = new DOMWrapper(document.body)
      await ui.get('.paste-toggle').trigger('click')
      return ['.reward-dialog-mask', '.reward-dialog-scroll', '.paste-area textarea']
    }]
  ]
  for (const height of [420, 200]) it.each(cases)(`%s：${height}px 可视高度保留草稿和焦点，使用对应滚动区`, async (_, render) => {
    const viewport = installViewport()
    const [maskSelector, bodySelector, inputSelector] = await render()
    await flushPromises()
    const ui = new DOMWrapper(document.body), input = ui.get(inputSelector)
    await input.setValue('未提交草稿')
    input.element.focus()
    await flushPromises()
    const body = ui.get(bodySelector).element
    body.scrollTop = 0
    const scroll = height < 360 ? body.parentElement : body
    scroll.scrollTop = 0
    mockBounds(scroll, input.element)
    viewport.height = height; viewport.offsetTop = 36
    viewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(ui.get(maskSelector).element.style.height).toBe(`${height}px`)
    expect(ui.get(maskSelector).classes('is-short-viewport')).toBe(height < 360)
    expect(ui.get(maskSelector).element.style.top).toBe('36px')
    expect(scroll.scrollTop).toBe(52)
    if (height < 360) expect(body.scrollTop).toBe(0)
    expect(ui.get(inputSelector).element).toBe(input.element)
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('未提交草稿')
    viewport.height = 800; viewport.offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(ui.get(maskSelector).element.style.height).toBe('800px')
    expect(ui.get(maskSelector).classes('is-short-viewport')).toBe(false)
    expect(input.element.value).toBe('未提交草稿')
  })
})
