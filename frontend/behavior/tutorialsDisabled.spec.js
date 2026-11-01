import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useOnboardingStore, onboardingStorageKey } from '../src/stores/onboarding.js'
import { initializeOnboardingTour, refreshTutorialBusiness, recordMaaYuanAction, startOnboardingTask, destroyOnboardingTour } from '../src/utils/onboardingTour.js'
import { TUTORIALS_ENABLED } from '../src/config/features.js'
import TutorialEntry from '../src/components/TutorialEntry.vue'
import OnboardingGuide from '../src/components/OnboardingGuide.vue'
import CompactToolHeader from '../src/components/CompactToolHeader.vue'
import PoolEditor from '../src/pages/recruitment/PoolEditor.vue'
import { recruitmentCatalog, recruitmentFixture } from '../test-support/recruitment.js'

vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', ''))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true, userInfo: { id: 'owner' } } }))

let pinia, router
beforeEach(async () => {
  pinia = createPinia(); setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/operator', component: { template: '<main />' } }] })
  await router.push('/operator'); await router.isReady()
})
afterEach(() => vi.unstubAllEnvs())

it.each(['in_progress', 'paused', 'completed'])('disabled onboarding leaves %s history intact and installs no controller side effects', async status => {
  const key = onboardingStorageKey('owner')
  const record = JSON.stringify({ version: 2, status, tutorialTask: 'maayuan-first-sync', panel: 'task', maaYuan: { accountId: 'acc', connectionId: 'connection', phase: 'waiting-sync' } })
  localStorage.setItem(key, record)
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const interval = vi.spyOn(globalThis, 'setInterval')
  const listen = vi.spyOn(window, 'addEventListener')
  const navigate = vi.spyOn(router, 'push')
  const store = useOnboardingStore(pinia).initialize('owner')
  // Even a stale in-memory state must not activate a hidden tutorial.
  store.$patch({ status: 'in_progress', tutorialTask: 'maayuan-first-sync', panel: 'task' })
  const cleanup = initializeOnboardingTour(router)
  expect(TUTORIALS_ENABLED).toBe(false)
  expect(store.active).toBe(false); expect(store.visible).toBe(false)
  expect(store.start('operator-first-entry')).toBe(false)
  expect(store.chooseFirstData('operator')).toBe(false)
  expect(store.applyProgress({ waitingFor: 'verified' })).toBe(false)
  store.setMaaYuanCheckpoint({ accountId: 'other' }); store.dismiss({ disableAutoGuide: true }); store.persist()
  recordMaaYuanAction('created', { accountId: 'other', connectionId: 'other' })
  await refreshTutorialBusiness()
  expect(await startOnboardingTask(router, 'operator-first-entry')).toBe(false)
  destroyOnboardingTour(); cleanup()
  expect(localStorage.getItem(key)).toBe(record)
  expect(write).not.toHaveBeenCalled(); expect(interval).not.toHaveBeenCalled(); expect(listen).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
})

it('entry and guide stay absent even when stale tutorial props/state are present', async () => {
  const entry = mount(TutorialEntry, { props: { task: 'operator-first-entry' }, global: { plugins: [pinia] } })
  useOnboardingStore(pinia).$patch({ tutorialTask: 'operator-first-entry', status: 'in_progress', panel: 'task' })
  const listen = vi.spyOn(window, 'addEventListener')
  mount(OnboardingGuide, { props: { tasks: ['operator-first-entry'] }, global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  expect(entry.find('button').exists()).toBe(false)
  expect(document.querySelector('.tutorial-guide, .tutorial-modal-outlet')).toBeNull()
  expect(listen.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0)
})

it('ordinary compact help remains available while tutorials are disabled', async () => {
  const wrapper = mount(CompactToolHeader, { props: { title: '星石背包' }, slots: { help: '<p>导入截图并核对识别结果</p>' } })
  await wrapper.get('.compact-tool-help').trigger('click')
  expect(wrapper.get('.compact-tool-help-content').text()).toContain('核对识别结果')
})

it('recruitment ignores guided props, keeps field help and saves real progress without a tutorial', async () => {
  const pool = recruitmentFixture().pools[0]
  const wrapper = mount(PoolEditor, { props: { open: true, guided: true, pool, catalog: recruitmentCatalog().pools, canRecord: true, records: [], recordsRevision: 3 }, attachTo: document.body })
  await flushPromises()
  const panel = document.querySelector('.pool-editor')
  expect(panel.querySelector('.guide-entry, .guide-choice, .guide-hint, .guide-exit')).toBeNull()
  expect(panel.querySelector('[aria-label="保底进度填写方式"]').textContent).toContain('距保底')
  expect(panel.querySelector('[aria-label="保底进度填写方式"]').textContent).toContain('已垫')
  const input = panel.querySelector('.remaining-input input')
  input.value = '23'; input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  panel.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect(wrapper.emitted('save')).toHaveLength(1)
  expect(wrapper.emitted('save')[0][0].data.remaining_pulls).toBe(23)
})
