import { afterEach, expect, it } from 'vitest'
import { ref, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useUnsavedChanges } from '../src/utils/useUnsavedChanges.js'
import { dialog } from '../src/utils/dialog.js'
let wrapper, dirty, confirmDiscard
async function render() {
  const Page = defineComponent({ setup() { dirty = ref(false); confirmDiscard = useUnsavedChanges(dirty, '编辑内容'); return {} }, template: '<div />' })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }, { path: '/other', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
  return router
}
afterEach(() => { if (dialog._state.visible) dialog._cancel(); wrapper?.unmount() })
it('one dialog authorizes only the first action, keeps shared defaults and removes unload listener on unmount', async () => {
  await render(); expect(await confirmDiscard()).toBe(true); expect(dialog._state.visible).toBe(false)
  dirty.value = true
  const first = confirmDiscard(), second = confirmDiscard()
  expect(await second).toBe(false); expect(dialog._state.title).toBe('放弃未保存修改？')
  dialog._confirm(); expect(await first).toBe(true)
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
  wrapper.unmount()
  const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false)
})
it('an unrelated open confirmation is never overwritten by a route guard', async () => {
  const router = await render(); dirty.value = true
  const other = dialog.confirm({ title: '删除待办？' })
  const failure = await router.push('/other'); await flushPromises()
  expect(failure).toBeTruthy(); expect(router.currentRoute.value.path).toBe('/')
  expect(dialog._state.title).toBe('删除待办？')
  dialog._cancel(); expect(await other).toBe(false)
})
