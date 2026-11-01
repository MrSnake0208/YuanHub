import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StarBreakthroughEditor from '../src/components/operator/StarBreakthroughEditor.vue'
import { patchCurrentStarState } from '../src/api/starState.js'

vi.mock('../src/api/starState.js', () => ({ patchCurrentStarState: vi.fn() }))
afterEach(() => vi.clearAllMocks())
const state = { account_id: 'a', generation: 1, revision: 3, inventory: [
  { instance_id: 'stone', kind: 'main', name: '测试星石', quality: 'orange', level: 20, breakthrough_stage: null },
], plan_targets: {}, experience: {}, bag: {} }
const props = () => ({ accountId: 'a', state: structuredClone(state), loadout: { main1: 'stone' } })

it('选择节点状态立即以 CAS 保存，成功向宿主发布新档案', async () => {
  patchCurrentStarState.mockResolvedValue({ state: { ...state, revision: 4 } })
  const wrapper = mount(StarBreakthroughEditor, { props: props() })
  expect(wrapper.get('select').element.value).toBe('')
  await wrapper.get('select').setValue('2'); await flushPromises()
  expect(patchCurrentStarState).toHaveBeenCalledWith('a', expect.objectContaining({ expected_generation: 1, expected_revision: 3,
    inventory: [expect.objectContaining({ instance_id: 'stone', breakthrough_stage: 2 })] }))
  expect(wrapper.emitted('saved')[0][0].revision).toBe(4)
  expect(state.inventory[0].breakthrough_stage).toBe(null)
})

it('冲突不覆盖档案，换账号后迟到响应不能发给新账号', async () => {
  patchCurrentStarState.mockRejectedValueOnce({ status: 409 })
  const wrapper = mount(StarBreakthroughEditor, { props: props() })
  await wrapper.get('select').setValue('1'); await flushPromises()
  expect(wrapper.text()).toContain('星石档案已变化')
  expect(wrapper.emitted('saved')).toBeUndefined()
  let finish
  patchCurrentStarState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await wrapper.get('button').trigger('click')
  await wrapper.setProps({ accountId: 'b', state: { ...state, account_id: 'b' } })
  finish({ state: { ...state, revision: 4 } }); await flushPromises()
  expect(wrapper.emitted('saved')).toBeUndefined()
  expect(wrapper.get('select').element.value).toBe('')
})
