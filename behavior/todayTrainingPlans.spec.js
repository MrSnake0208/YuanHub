import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodayTrainingPlans from '../src/components/today/TodayTrainingPlans.vue'
import { auth } from '../src/store/auth.js'
import * as planner from '../src/api/operatorPlanner.js'
import * as operators from '../src/api/operator.js'
import * as inventory from '../src/api/inventory.js'

const events = vi.hoisted(() => new Set())
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'owner-a' } }) }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: listener => { events.add(listener); return () => events.delete(listener) } }))
vi.mock('../src/api/operatorPlanner.js', () => ({ getTrainingWorkspace: vi.fn(), putTrainingWorkspace: vi.fn(), putStaminaSchedule: vi.fn(), importLocalTrainingWorkspace: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), getOperatorAnnotations: vi.fn(), getOperatorGrowthTargets: vi.fn(), putOperatorAnnotation: vi.fn(), putOperatorGrowthTarget: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ listAgentFavorites: vi.fn(), addAgentFavorite: vi.fn() }))
const yangxiu = 'char_001_yangxiu', achan = 'char_014_achan'
const workspace = account => ({ schema_version: 1, account_id: account, revision: 2, active_plan_id: 'main', plans: [
  { id: 'favorites', name: '特别关注', source: 'favorites', operator_ids: [], excluded_operator_ids: [], targets: {} },
  { id: 'main', name: '我的主队', source: 'custom', operator_ids: [yangxiu], excluded_operator_ids: [], targets: { [yangxiu]: { level: 60, elite: 9, star_level: 7 } } }
] })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const render = (props = { accountId: 'a', game: '如鸢' }) => mount(TodayTrainingPlans, { attachTo: document.body, props, global: { stubs: { RouterLink: RouterLinkStub } } })
const publish = (event, account = 'a') => events.forEach(listener => listener({ event, data: { account_id: account } }))
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); events.clear()
  auth.isLoggedIn = true; auth.userInfo = { id: 'owner-a' }
  planner.getTrainingWorkspace.mockImplementation(async account => workspace(account))
  operators.getOperatorCatalog.mockResolvedValue({ operators: [] })
  operators.getOperatorAnnotations.mockImplementation(async account => ({ account_id: account, items: [{ operator_id: yangxiu, note: '优先练主队' }] }))
  operators.getOperatorGrowthTargets.mockImplementation(async account => ({ account_id: account, items: [] }))
  inventory.listAgentFavorites.mockImplementation(async account => ({ account_id: account, agent_ids: [] }))
})

it('shows saved plan targets and complete plain-text notes, including notes outside plans', async () => {
  const note = '<img src=x onerror=alert(1)>\n' + '长备注'.repeat(250)
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [
    { operator_id: yangxiu, note }, { operator_id: achan, note: '没有加入清单也保留' }
  ] })
  operators.getOperatorGrowthTargets.mockResolvedValue({ account_id: 'a', items: [{ operator_id: yangxiu, level: 100 }] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('我的主队 · 当前清单')
  expect(wrapper.text()).toContain('杨修')
  expect(wrapper.text()).toContain('目标：等级 60 · 修为 9 · 2 星 · 0 节点')
  expect(wrapper.text()).not.toContain('等级 100')
  expect(wrapper.get('.training-note').element.textContent).toBe(note)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('其他密探备注')
  expect(wrapper.text()).toContain('没有加入清单也保留')
  expect(wrapper.findAllComponents(RouterLinkStub)[1].props('to')).toEqual({ path: '/operator', query: { tab: 'current', focus: yangxiu } })
  expect(planner.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(planner.putStaminaSchedule).not.toHaveBeenCalled()
  expect(planner.importLocalTrainingWorkspace).not.toHaveBeenCalled()
  expect(operators.putOperatorAnnotation).not.toHaveBeenCalled()
  expect(operators.putOperatorGrowthTarget).not.toHaveBeenCalled()
  expect(inventory.addAgentFavorite).not.toHaveBeenCalled()
})

it('uses public catalog names for favorites, custom plans and notes while preserving focus IDs', async () => {
  const zhoutai = 'char_129_zhoutai', chenlin = 'char_130_chenlin', weiyan = 'char_131_weiyan'
  const data = workspace('a'); data.plans[1].operator_ids = [weiyan, yangxiu]
  planner.getTrainingWorkspace.mockResolvedValue(data)
  inventory.listAgentFavorites.mockResolvedValue({ account_id: 'a', agent_ids: [chenlin] })
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [{ operator_id: zhoutai, note: '计划外备注' }] })
  operators.getOperatorCatalog.mockResolvedValue({ operators: [
    { id: zhoutai, name: '周泰' }, { id: chenlin, name: '陈琳' }, { id: weiyan, name: '魏延' },
    { id: yangxiu, name: '杨修（公共图鉴）' }
  ] })
  const wrapper = render(); await flushPromises()
  const links = wrapper.findAllComponents(RouterLinkStub).slice(1)
  expect(links.map(link => link.text())).toEqual(['陈琳', '魏延', '杨修（公共图鉴）', '周泰'])
  expect(links.map(link => link.props('to').query.focus)).toEqual([chenlin, weiyan, yangxiu, zhoutai])
  expect(wrapper.text()).toContain('计划外备注')
})

it.each(['unavailable', 'invalid', 'invalid entries'])('keeps plans and local names when the public catalog is %s', async kind => {
  if (kind === 'unavailable') operators.getOperatorCatalog.mockRejectedValue(new Error('图鉴暂不可用'))
  if (kind === 'invalid') operators.getOperatorCatalog.mockResolvedValue({ operators: null })
  if (kind === 'invalid entries') operators.getOperatorCatalog.mockResolvedValue({ operators: [null, { id: yangxiu, name: ' ' }, { id: yangxiu, name: 3 }] })
  const unknown = 'char_unknown'
  const data = workspace('a'); data.plans[1].operator_ids.push(unknown)
  planner.getTrainingWorkspace.mockResolvedValue(data)
  const wrapper = render(); await flushPromises()
  expect(wrapper.findAllComponents(RouterLinkStub).slice(1).map(link => link.text())).toEqual(['杨修', unknown])
  expect(wrapper.text()).toContain('优先练主队')
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
})

it('discards a late public catalog response after switching accounts', async () => {
  const pending = deferred(); operators.getOperatorCatalog.mockReturnValueOnce(pending.promise)
  const wrapper = render(); await flushPromises()
  operators.getOperatorCatalog.mockResolvedValue({ operators: [{ id: yangxiu, name: '最新图鉴名称' }] })
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  pending.resolve({ operators: [{ id: yangxiu, name: '旧图鉴名称' }] }); await flushPromises()
  expect(wrapper.text()).toContain('最新图鉴名称')
  expect(wrapper.text()).not.toContain('旧图鉴名称')
})

it('resolves live favorites, explicit members and exclusions with the shared plan rule', async () => {
  const data = workspace('a'); data.plans = [data.plans[0]]
  data.plans[0].operator_ids = [yangxiu]; data.plans[0].excluded_operator_ids = [achan]
  planner.getTrainingWorkspace.mockResolvedValue(data)
  inventory.listAgentFavorites.mockResolvedValue({ account_id: 'a', agent_ids: [yangxiu, achan] })
  operators.getOperatorGrowthTargets.mockResolvedValue({ account_id: 'a', items: [{ operator_id: yangxiu, level: 80, elite: 13 }] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.findAll('.training-list li')).toHaveLength(1)
  expect(wrapper.text()).toContain('特别关注')
  expect(wrapper.text()).toContain('目标：等级 80 · 修为 13')
  expect(wrapper.text()).not.toContain('阿蝉')
})

it('does not request without login, a known identity or a selected account', async () => {
  const wrapper = render({ accountId: '', game: '如鸢' }); await flushPromises()
  auth.isLoggedIn = false; await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  auth.isLoggedIn = true; auth.userInfo = null; await flushPromises()
  expect(planner.getTrainingWorkspace).not.toHaveBeenCalled()
  expect(operators.getOperatorCatalog).not.toHaveBeenCalled()
  expect(operators.getOperatorAnnotations).not.toHaveBeenCalled()
  expect(operators.getOperatorGrowthTargets).not.toHaveBeenCalled()
  expect(inventory.listAgentFavorites).not.toHaveBeenCalled()
})

it('reloads after a same-turn context round trip and cancels a queued load on unmount', async () => {
  const wrapper = render(); await flushPromises()
  auth.userInfo = { id: 'owner-b' }; auth.userInfo = { id: 'owner-a' }
  await flushPromises()
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('优先练主队')
  auth.userInfo = { id: 'owner-b' }; wrapper.unmount()
  await flushPromises()
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(2)
})

it('distinguishes an empty workspace from a failed read and supports retry', async () => {
  planner.getTrainingWorkspace.mockRejectedValueOnce(new Error('离线'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('离线')
  expect(wrapper.text()).not.toContain('还没有培养成员')
  planner.getTrainingWorkspace.mockResolvedValue({ ...workspace('a'), plans: [], active_plan_id: null })
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [] })
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  expect(wrapper.text()).toContain('还没有培养成员或备注')
})

it.each(['account', 'identity', 'game', 'clear', 'logout', 'unmount'])('discards late old notes after %s changes', async change => {
  const pending = deferred(); planner.getTrainingWorkspace.mockReturnValueOnce(pending.promise)
  const wrapper = render(); await flushPromises()
  operators.getOperatorAnnotations.mockImplementation(async account => ({ account_id: account, items: [{ operator_id: yangxiu, note: '新上下文' }] }))
  if (change === 'account') await wrapper.setProps({ accountId: 'b' })
  if (change === 'identity') auth.userInfo = { id: 'owner-b' }
  if (change === 'game') await wrapper.setProps({ game: '代号鸢' })
  if (change === 'clear') await wrapper.setProps({ accountId: '' })
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'unmount') wrapper.unmount()
  await flushPromises(); pending.resolve(workspace('a')); await flushPromises()
  expect(document.body.textContent).not.toContain('优先练主队')
  if (['account', 'identity', 'game'].includes(change)) expect(wrapper.text()).toContain('新上下文')
  if (change === 'unmount') expect(events.size).toBe(0)
})

it('clears visible A notes before B loads, including A to B to A late responses', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('优先练主队')
  const pending = deferred(); planner.getTrainingWorkspace.mockReturnValueOnce(pending.promise)
  await wrapper.setProps({ accountId: 'b' })
  expect(wrapper.text()).not.toContain('优先练主队')
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [{ operator_id: yangxiu, note: '最新A' }] })
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  pending.resolve(workspace('b')); await flushPromises()
  expect(wrapper.text()).toContain('最新A')
  expect(wrapper.text()).not.toContain('优先练主队')
})

it.each(['workspace', 'annotations', 'favorites', 'targets'])('rejects foreign-account %s data', async kind => {
  if (kind === 'workspace') planner.getTrainingWorkspace.mockResolvedValue(workspace('b'))
  if (kind === 'annotations') operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'b', items: [{ operator_id: yangxiu, note: '其他账号秘密' }] })
  if (kind === 'favorites') inventory.listAgentFavorites.mockResolvedValue({ account_id: 'b', agent_ids: [yangxiu] })
  if (kind === 'targets') operators.getOperatorGrowthTargets.mockResolvedValue({ account_id: 'b', items: [] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(wrapper.find('.training-plan').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('其他账号秘密')
})

it('rejects incomplete notes instead of calling them empty', async () => {
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [{ operator_id: yangxiu, note: 3 }] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取结果不完整')
  expect(wrapper.text()).not.toContain('还没有培养成员')
})

it('rejects a missing workspace list instead of presenting an empty plan', async () => {
  planner.getTrainingWorkspace.mockResolvedValue({ schema_version: 1, account_id: 'a' })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取结果不完整')
  expect(wrapper.find('.training-plan').exists()).toBe(false)
})

it('refreshes for current-account changes, coalesces events, and retains labelled stale data on ordinary failure', async () => {
  const wrapper = render(); await flushPromises()
  publish('operator_annotation', 'b'); await vi.advanceTimersByTimeAsync(180)
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(1)
  operators.getOperatorAnnotations.mockRejectedValueOnce(new Error('同步失败'))
  publish('operator_annotation'); publish('operator_training_workspace'); publish('operator_growth_target')
  await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(2)
  expect(wrapper.get('[role=alert]').text()).toContain('下方保留上次读取内容')
  expect(wrapper.text()).toContain('优先练主队')
  operators.getOperatorAnnotations.mockResolvedValue({ account_id: 'a', items: [{ operator_id: yangxiu, note: '已同步的新备注' }] })
  window.dispatchEvent(new Event('pageshow')); await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(wrapper.text()).toContain('已同步的新备注')
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  publish('operator_favorites'); wrapper.unmount(); await vi.advanceTimersByTimeAsync(180)
  expect(events.size).toBe(0)
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(3)
})

it.each([401, 403, 404])('clears old notes and stops refresh on access failure %i', async status => {
  const wrapper = render(); await flushPromises()
  operators.getOperatorAnnotations.mockRejectedValueOnce({ status, code: 'account_not_found' })
  publish('operator_annotation'); await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('身份、权限或账号已失效')
  expect(wrapper.text()).not.toContain('优先练主队')
  expect(wrapper.find('button').exists()).toBe(false)
  window.dispatchEvent(new Event('pageshow')); await vi.advanceTimersByTimeAsync(180)
  expect(planner.getTrainingWorkspace).toHaveBeenCalledTimes(2)
})
