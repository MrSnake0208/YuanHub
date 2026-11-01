import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { computed, defineComponent, ref } from 'vue'
import { dialog } from '../src/utils/dialog.js'
import { useUnsavedChanges } from '../src/utils/useUnsavedChanges.js'

vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const dirty = ref(false)
const editor = defineComponent({
  setup() {
    const confirmDiscard = useUnsavedChanges(computed(() => dirty.value), '库存草稿')
    return { confirmDiscard }
  },
  template: '<button @click="confirmDiscard">关闭</button>',
})

afterEach(() => { dirty.value = false; vi.clearAllMocks() })

it('脏草稿关闭、路由离开与浏览器刷新都要求确认；取消后保留原页面', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: editor }, { path: '/other', component: { template: '<p>其他页面</p>' } },
  ] })
  await router.push('/')
  await router.isReady()
  const host = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
  dirty.value = true
  dialog.confirm.mockResolvedValue(false)
  await host.get('button').trigger('click')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '放弃修改', cancelText: '继续编辑' }))
  await router.push('/other')
  expect(router.currentRoute.value.path).toBe('/')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  dialog.confirm.mockResolvedValue(true)
  await router.push('/other')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/other')
  host.unmount()
})
