import { flushPromises } from '@vue/test-utils'

export const battleButton = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text)

export async function chooseBattleMember(wrapper, name, slot = 1) {
  await wrapper.get(`[aria-label="编辑${slot}号位"]`).trigger('click')
  await wrapper.get(`[aria-label="${slot}号位密探"]`).setValue(name)
  await wrapper.get('.battle-custom-name').trigger('submit')
  await flushPromises()
}

export async function battleField(wrapper, label, slot = 1) {
  const entry = label === '星石 / 辅星' ? '主星' : label
  if (['必须命盘', '禁用命盘'].includes(label)) {
    wrapper.get('.battle-requirements').element.open = true
  }
  await wrapper.get(`[aria-label="编辑${slot}号位${entry}"]`).trigger('click')
  const details = wrapper.get('#battle-member-detail .battle-text-editor')
  details.element.open = true
  return wrapper.get(`[aria-label="${slot}号位${label}"]`)
}

export async function battleCell(wrapper, round = 1, slot = 1) {
  await wrapper.get(`[aria-label="编辑第${round}回合${slot}号位动作"]`).trigger('click')
}
