import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { useTodayPreferences, TODAY_MODULES } from '../src/composables/useTodayPreferences.js'
import TodayPreferencesPanel from '../src/components/today/TodayPreferencesPanel.vue'
import { auth } from '../src/store/auth.js'
import { getTodayPreferences, saveTodayPreferences } from '../src/api/todayPreferences.js'
import { installViewport } from '../test-support/viewport.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, userInfo: { id: 'a' } }) }
})
vi.mock('../src/api/todayPreferences.js', () => ({ getTodayPreferences: vi.fn(), saveTodayPreferences: vi.fn() }))
const snapshot = (mode, hidden = [], version = 0) => ({ layout_mode: mode, hidden_modules: hidden, version, schema_version: 1, updated_at: null })
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function render() {
  let preferences
  const wrapper = mount(defineComponent({ setup() { preferences = useTodayPreferences(); return {} }, template: '<div />' }))
  return { wrapper, preferences }
}
function panel(preferences) {
  return mount(TodayPreferencesPanel, { attachTo: document.body, props: { preferences, open: false } })
}
const screen = () => document.querySelector('.today-preferences')
const click = text => [...screen().querySelectorAll('button')].find(button => button.textContent.includes(text)).click()

beforeEach(() => {
  vi.resetAllMocks()
  auth.isLoggedIn = true; auth.userInfo = { id: 'a' }
  installViewport(1440)
  getTodayPreferences.mockImplementation(async mode => snapshot(mode))
  saveTodayPreferences.mockImplementation(async (mode, body) => snapshot(mode, body.hidden_modules, body.expected_version + 1))
})

it('全新用户默认显示五模块，预取双端且切换布局不重复请求', async () => {
  const viewport = installViewport(1440)
  const { preferences: p } = render()
  expect(TODAY_MODULES.some(item => p.shown(item.id))).toBe(false)
  await flushPromises()
  expect(TODAY_MODULES.every(item => p.shown(item.id))).toBe(true)
  for (const width of [390, 767, 768, 1440, 390]) {
    viewport.resize(width)
    expect(p.layoutMode.value).toBe(width < 768 ? 'mobile' : 'desktop')
  }
  expect(getTodayPreferences.mock.calls).toEqual([['desktop', 'a'], ['mobile', 'a']])
})

it('双端独立保存，同类型另一设备读取服务器记录，游戏子账号不参与偏好', async () => {
  const server = new Map()
  getTodayPreferences.mockImplementation(async (mode, user) => server.get(user + mode) || snapshot(mode))
  saveTodayPreferences.mockImplementation(async (mode, body, user) => {
    const value = snapshot(mode, body.hidden_modules, body.expected_version + 1)
    server.set(user + mode, value); return value
  })
  const { preferences: p, wrapper } = render(); await flushPromises()
  p.setShown('desktop', 'private_items', false); await p.save('desktop')
  p.setShown('mobile', 'training', false); await p.save('mobile')
  expect(p.states.desktop.snapshot.hidden_modules).toEqual(['private_items'])
  expect(p.states.mobile.snapshot.hidden_modules).toEqual(['training'])
  auth.userInfo = { id: 'a', game_account: 'different' }; await flushPromises()
  expect(getTodayPreferences).toHaveBeenCalledTimes(2)
  wrapper.unmount()
  const another = render().preferences; await flushPromises()
  expect(another.states.desktop.draft).toEqual(['private_items'])
  expect(another.states.mobile.draft).toEqual(['training'])
  auth.userInfo = { id: 'b' }; await flushPromises()
  expect(another.states.desktop.draft).toEqual([])
  expect(another.states.mobile.draft).toEqual([])
})

it('读取失败不是默认配置；单模式重试不清另一端草稿', async () => {
  getTodayPreferences.mockRejectedValueOnce(new Error('离线'))
  const p = render().preferences; await flushPromises()
  expect(p.states.desktop.snapshot).toBe(null)
  expect(p.states.desktop.error).toBe('离线')
  expect(p.shown('training')).toBe(false)
  p.setShown('mobile', 'activities', false)
  expect(await p.load('desktop')).toBe(true)
  expect(p.shown('training')).toBe(true)
  expect(p.states.mobile.draft).toEqual(['activities'])
})

it('写入失败保留草稿与已保存布局，不能宣称成功；重试成功才更新页面', async () => {
  const p = render().preferences; await flushPromises()
  p.setShown('desktop', 'training', false)
  saveTodayPreferences.mockRejectedValueOnce(new Error('写入失败'))
  expect(await p.save('desktop')).toBe(false)
  expect(p.shown('training')).toBe(true)
  expect(p.states.desktop.draft).toEqual(['training'])
  expect(p.states.desktop.notice).toBe('')
  expect(p.states.desktop.saveError).toBe('写入失败')
  expect(await p.save('desktop')).toBe(true)
  expect(p.shown('training')).toBe(false)
  expect(p.states.desktop.notice).toContain('已保存')
})

it('冲突阻止盲目覆盖，显式读取远端后才能重新保存', async () => {
  const p = render().preferences; await flushPromises()
  p.setShown('desktop', 'training', false)
  saveTodayPreferences.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  await p.save('desktop')
  expect(p.states.desktop.conflict).toBe(true)
  expect(await p.save('desktop')).toBe(false)
  expect(saveTodayPreferences).toHaveBeenCalledTimes(1)
  getTodayPreferences.mockResolvedValueOnce(snapshot('desktop', ['activities'], 2))
  await p.load('desktop', { replaceDraft: true })
  expect(p.states.desktop.draft).toEqual(['activities'])
  p.setShown('desktop', 'training', false); await p.save('desktop')
  expect(saveTodayPreferences).toHaveBeenLastCalledWith('desktop', { schema_version: 1, expected_version: 2, hidden_modules: ['activities', 'training'] }, 'a')
})

it('快速A→B→A与登出隔离迟到读取，不残留私人偏好', async () => {
  const slow = deferred()
  getTodayPreferences.mockImplementationOnce(() => slow.promise)
  const p = render().preferences; await flushPromises()
  auth.userInfo = { id: 'b' }; await flushPromises()
  auth.userInfo = { id: 'a' }; await flushPromises()
  slow.resolve(snapshot('desktop', ['training'], 8)); await flushPromises()
  expect(p.states.desktop.snapshot.version).toBe(0)
  const late = deferred(); getTodayPreferences.mockImplementationOnce(() => late.promise)
  const loading = p.load('desktop')
  auth.isLoggedIn = false
  expect(p.states.desktop.snapshot).toBe(null)
  late.resolve(snapshot('desktop', ['private_items'], 10)); await loading
  expect(p.states.desktop.snapshot).toBe(null)
  expect(p.states.desktop.draft).toEqual([])
})

it('A的迟到保存不更新B，卸载后不采用响应', async () => {
  const slow = deferred(), { preferences: p, wrapper } = render(); await flushPromises()
  p.setShown('desktop', 'training', false); saveTodayPreferences.mockReturnValueOnce(slow.promise)
  const saving = p.save('desktop')
  auth.userInfo = { id: 'b' }; await flushPromises()
  slow.resolve(snapshot('desktop', ['training'], 1)); await saving
  expect(p.states.desktop.snapshot.hidden_modules).toEqual([])
  expect(p.states.desktop.notice).toBe('')
  const late = deferred(); getTodayPreferences.mockReturnValueOnce(late.promise)
  const loading = p.load('desktop'); wrapper.unmount()
  late.resolve(snapshot('desktop', ['activities'], 5)); await loading
  expect(p.states.desktop.snapshot.version).toBe(0)
})

it('恢复可见按新鲜度检查且单飞，不覆盖草稿的基准版本；无轮询', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T00:00:00Z'))
  const p = render().preferences; await flushPromises()
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(getTodayPreferences).toHaveBeenCalledTimes(2)
  p.setShown('desktop', 'training', false)
  const slow = deferred(); getTodayPreferences.mockReturnValueOnce(slow.promise)
  vi.setSystemTime(new Date('2026-10-16T00:00:31Z'))
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow'))
  await flushPromises()
  expect(getTodayPreferences).toHaveBeenCalledTimes(4)
  slow.resolve(snapshot('desktop', ['activities'], 4)); await flushPromises()
  expect(p.states.desktop.draft).toEqual(['training'])
  expect(p.states.desktop.baseVersion).toBe(0)
  expect(p.states.desktop.snapshot.hidden_modules).toEqual(['activities'])
  expect(vi.getTimerCount()).toBe(0)
})

it('无效读取及未确认的保存响应均不显示成功，新模块默认可见', async () => {
  getTodayPreferences.mockResolvedValueOnce({ ...snapshot('desktop'), version: '0' })
  const p = render().preferences; await flushPromises()
  expect(p.states.desktop.snapshot).toBe(null)
  await p.load('desktop')
  expect(p.shown('future_module')).toBe(true)
  p.setShown('desktop', 'training', false)
  saveTodayPreferences.mockResolvedValueOnce(snapshot('desktop', [], 1))
  expect(await p.save('desktop')).toBe(false)
  expect(p.states.desktop.notice).toBe('')
  expect(p.states.desktop.snapshot.version).toBe(0)
})

it('面板默认当前布局，切换保留双草稿，保存只更新选中端，全部隐藏可恢复', async () => {
  installViewport(390)
  const p = render().preferences; await flushPromises()
  const wrapper = panel(p); await wrapper.setProps({ open: true }); await flushPromises()
  expect(screen().querySelector('[aria-pressed="true"]').textContent).toContain('手机端')
  const toggle = screen().querySelector('input[aria-label="显示我的养成计划"]')
  toggle.click(); await flushPromises()
  click('电脑端'); await flushPromises()
  screen().querySelector('input[aria-label="显示私人安排"]').click(); await flushPromises()
  click('手机端'); await flushPromises()
  expect(screen().querySelector('input[aria-label="显示我的养成计划"]').checked).toBe(false)
  click('保存设置'); await flushPromises()
  expect(p.states.mobile.snapshot.hidden_modules).toEqual(['training'])
  expect(p.states.desktop.snapshot.hidden_modules).toEqual([])
  expect(p.states.desktop.draft).toEqual(['private_items'])
  TODAY_MODULES.forEach(item => p.setShown('mobile', item.id, false)); await p.save('mobile')
  expect(TODAY_MODULES.every(item => !p.shown(item.id))).toBe(true)
  click('恢复默认'); await flushPromises(); click('保存设置'); await flushPromises()
  expect(TODAY_MODULES.every(item => p.shown(item.id))).toBe(true)
})

it('关闭确认保留或放弃草稿，Escape走同一处理，焦点返回入口', async () => {
  const p = render().preferences; await flushPromises()
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const wrapper = panel(p); await wrapper.setProps({ open: true }); await flushPromises()
  expect(screen().contains(document.activeElement)).toBe(true)
  p.setShown('desktop', 'training', false)
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValueOnce(false)
  screen().querySelector('[aria-label="关闭首页设置"]').click(); await flushPromises()
  expect(wrapper.emitted('update:open')).toBeUndefined()
  expect(p.dirty('desktop')).toBe(true)
  confirm.mockResolvedValueOnce(true)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.emitted('update:open')).toEqual([[false]])
  expect(p.anyDirty.value).toBe(false)
  await wrapper.setProps({ open: false }); await flushPromises()
  expect(document.activeElement).toBe(opener)
})

it('保存中不能关闭或重复保存，身份变化取消关闭确认', async () => {
  const p = render().preferences; await flushPromises()
  const wrapper = panel(p); await wrapper.setProps({ open: true }); await flushPromises()
  p.setShown('desktop', 'training', false)
  const slow = deferred(); saveTodayPreferences.mockReturnValueOnce(slow.promise)
  const saving = p.save('desktop')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.emitted('update:open')).toBeUndefined()
  expect(await p.save('desktop')).toBe(false)
  slow.resolve(snapshot('desktop', ['training'], 1)); await saving
  p.setShown('desktop', 'activities', false)
  const decision = deferred(); vi.spyOn(dialog, 'confirm').mockReturnValueOnce(decision.promise)
  screen().querySelector('[aria-label="关闭首页设置"]').click(); await flushPromises()
  auth.userInfo = { id: 'b' }; await flushPromises()
  decision.resolve(true); await flushPromises()
  expect(p.states.desktop.draft).toEqual([])
  expect(wrapper.emitted('update:open')).toEqual([[false]])
})


it('路由返回也先处理尚未保存草稿，取消时仍留在首页', async () => {
  let preferences
  const Home = defineComponent({
    components: { TodayPreferencesPanel },
    setup() { preferences = useTodayPreferences(); return { preferences, open: ref(false) } },
    template: '<button @click="open = true">设置</button><TodayPreferencesPanel v-model:open="open" :preferences="preferences" />'
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }, { path: '/away', component: { template: '<p>其他页</p>' } }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises(); await wrapper.get('button').trigger('click'); await flushPromises()
  preferences.setShown('desktop', 'training', false)
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValueOnce(false)
  await router.push('/away')
  expect(router.currentRoute.value.path).toBe('/')
  expect(preferences.dirty('desktop')).toBe(true)
  confirm.mockResolvedValueOnce(true)
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/away')
})


it('确认读取最新与已有后台读取合并时仍替换草稿，跨用户不得采用', async () => {
  const p = render().preferences; await flushPromises()
  p.setShown('desktop', 'training', false)
  saveTodayPreferences.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  await p.save('desktop')
  const slow = deferred(); getTodayPreferences.mockReturnValueOnce(slow.promise)
  const background = p.load('desktop'), explicit = p.load('desktop', { replaceDraft: true })
  slow.resolve(snapshot('desktop', ['activities'], 3)); await Promise.all([background, explicit])
  expect(p.states.desktop.draft).toEqual(['activities'])
  expect(p.states.desktop.baseVersion).toBe(3)
  expect(p.states.desktop.conflict).toBe(false)
  const late = deferred(); getTodayPreferences.mockReturnValueOnce(late.promise)
  const reading = p.load('desktop'), replacing = p.load('desktop', { replaceDraft: true })
  auth.userInfo = { id: 'b' }; await flushPromises()
  late.resolve(snapshot('desktop', ['private_items'], 6)); await Promise.all([reading, replacing])
  expect(p.states.desktop.draft).toEqual([])
  expect(p.states.desktop.baseVersion).toBe(0)
})

it('后台读取失败保留已保存布局，重试后按远端更新；隐藏文档不触发请求', async () => {
  const p = render().preferences; await flushPromises()
  p.setShown('desktop', 'training', false); await p.save('desktop')
  getTodayPreferences.mockRejectedValueOnce(new Error('远端离线'))
  await p.load('desktop')
  expect(p.shown('training')).toBe(false)
  expect(p.states.desktop.snapshot.version).toBe(1)
  expect(p.states.desktop.error).toBe('远端离线')
  getTodayPreferences.mockResolvedValueOnce(snapshot('desktop', [], 2))
  await p.load('desktop')
  expect(p.shown('training')).toBe(true)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  const calls = getTodayPreferences.mock.calls.length
  window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(getTodayPreferences).toHaveBeenCalledTimes(calls)
  delete document.visibilityState
})
