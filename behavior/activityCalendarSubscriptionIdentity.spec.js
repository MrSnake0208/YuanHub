import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useCalendarSubscriptions } from '../src/composables/useCalendarSubscriptions.js'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: true, userInfo: { id: 'user' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), setCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn() }))
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const record = id => ({ event_id: id, version: 0, subscribed: true, completed: false, checklist: [], item: { id } })
let wrapper, state, range
const Harness = defineComponent({ setup() { range = ref({ from: '2026-10-01', to: '2026-10-10' }); state = useCalendarSubscriptions(true, range, ref('')); return { state } }, template: '<div><span v-for="entry in state.records.value" :key="entry.event_id">{{ entry.event_id }}</span></div>' })
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Harness }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(Harness, { global: { plugins: [router] } }); await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks(); auth.isLoggedIn = true; auth.isAdmin = true; auth.userInfo = { id: 'user' }; activeAccount.set('a')
  listAccounts.mockResolvedValue([{ id: 'a', game: '如鸢' }, { id: 'b', game: '如鸢' }])
  listCalendarSubscriptions.mockResolvedValue({ items: [], unavailable_items: [], subscribed_count: 0 })
})
afterEach(() => wrapper?.unmount())
it('a background read failure does not lock an existing dirty editor', async () => {
  await render()
  const late = deferred(); listCalendarSubscriptions.mockReturnValueOnce(late.promise)
  const loading = state.load()
  state.setDirty('event', true)
  late.reject(new Error('offline')); await loading
  expect(state.error.value).toBe('')
  saveCalendarProgress.mockResolvedValue(record('event'))
  await state.progress('event', 0, { completed: false, checklist: [] })
  expect(saveCalendarProgress).toHaveBeenCalled()
})
it('a background read returning during editing waits until the draft is released', async () => {
  listCalendarSubscriptions.mockResolvedValue({ items: [record('original')], subscribed_count: 1 })
  await render()
  const late = deferred(); listCalendarSubscriptions.mockReturnValueOnce(late.promise)
  const loading = state.load()
  state.setDirty('original', true)
  late.resolve({ items: [record('changed')], subscribed_count: 1 }); await loading
  expect(wrapper.text()).toBe('original')
  listCalendarSubscriptions.mockResolvedValue({ items: [record('latest')], subscribed_count: 1 })
  state.setDirty('original', false); await flushPromises()
  expect(wrapper.text()).toBe('latest')
})
it('same-game account switch ignores late A read and clears state on permission loss', async () => {
  const late = deferred()
  listCalendarSubscriptions.mockImplementation(({ account_id }) => account_id === 'a' ? late.promise : Promise.resolve({ items: [record('B')], subscribed_count: 1 }))
  await render(); activeAccount.set('b'); await flushPromises()
  expect(wrapper.text()).toBe('B')
  late.resolve({ items: [record('A')], subscribed_count: 1 }); await flushPromises()
  expect(wrapper.text()).toBe('B')
  auth.isAdmin = false; await flushPromises()
  expect(wrapper.text()).toBe('')
})
it('switching account while reading subscription prevents subsequent PUT to new account', async () => {
  await render()
  const late = deferred(); getCalendarSubscription.mockReturnValue(late.promise)
  const action = state.subscribe('event', true)
  activeAccount.set('b'); await flushPromises()
  late.resolve(record('event')); await action
  expect(setCalendarSubscription).not.toHaveBeenCalled()
})
it('late mutation from old date range cannot invalidate or populate current list', async () => {
  await render()
  const write = deferred(), read = deferred()
  saveCalendarProgress.mockReturnValue(write.promise)
  const saving = state.progress('old', 0, { completed: true, checklist: [] })
  listCalendarSubscriptions.mockReturnValue(read.promise)
  range.value = { from: '2026-11-01', to: '2026-11-10' }; await flushPromises()
  write.resolve(record('old')); await saving
  read.resolve({ items: [record('new')], subscribed_count: 1 }); await flushPromises()
  expect(wrapper.text()).toBe('new')
})
it('logout while accounts are loading cannot restore old account or fetch private calendar', async () => {
  const late = deferred(); listAccounts.mockReturnValue(late.promise)
  await render(); auth.isLoggedIn = false; auth.userInfo = null
  late.resolve([{ id: 'a', game: '如鸢' }]); await flushPromises()
  expect(listCalendarSubscriptions).not.toHaveBeenCalled()
  expect(state.account.value).toBeNull()
})
it('no valid current account never sends a private request and GET refresh does not apply before consent', async () => {
  activeAccount.set('missing'); await render()
  expect(listCalendarSubscriptions).not.toHaveBeenCalled()
  activeAccount.set('a'); await flushPromises()
  getCalendarSubscription.mockResolvedValue(record('server'))
  expect((await state.refreshOne('server')).event_id).toBe('server')
  expect(wrapper.text()).toBe('')
})
