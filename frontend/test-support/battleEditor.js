import { flushPromises } from '@vue/test-utils'

export const battleButton = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text)

export async function chooseBattleMember(wrapper, name, slot = 1) {
  await wrapper.get(`[aria-label="编辑${slot}号位"]`).trigger('click')
  // 已有密探的槽位默认打开“练度”，点击弹窗头像才进入选人。
  if (!wrapper.find(`[aria-label="${slot}号位密探"]`).exists()) {
    await wrapper.get(`[aria-label="更换${slot}号位密探"]`).trigger('click')
    await flushPromises()
  }
  await wrapper.get(`[aria-label="${slot}号位密探"]`).setValue(name)
  await wrapper.get('.battle-custom-name').trigger('submit')
  await flushPromises()
}

export async function battleField(wrapper, label, slot = 1) {
  // 携带／必须／禁用命盘合并在同一个“命盘”分区，从表格的携带命盘格进入。
  const entry = label === '星石 / 辅星' ? '主星' : ['必须命盘', '禁用命盘'].includes(label) ? '携带命盘' : label
  await wrapper.get(`[aria-label="编辑${slot}号位${entry}"]`).trigger('click')
  const field = wrapper.find(`[aria-label="${slot}号位${label}"]`)
  return field.exists() ? field : wrapper.get('#battle-member-detail')
}

// 读取命盘分区当前的携带／必须／禁用词条（按已选区顺序），以换行连接，与草稿字段格式一致。
export async function battleDiscValue(wrapper, field = 'discs', slot = 1) {
  await battleField(wrapper, '携带命盘', slot)
  const chips = wrapper.findAll('#battle-member-detail .battle-selected-terms button')
  const picked = field === 'requiredDiscs'
    ? chips.filter(chip => chip.classes('requiredDiscs') || (chip.classes('discs') && chip.find('small').exists()))
    : chips.filter(chip => chip.classes(field))
  return picked.map(chip => chip.attributes('aria-label').replace(/^移除.+?第\d+项：/, '')).join('\n')
}

export async function battleCell(wrapper, round = 1, slot = 1) {
  await wrapper.get(`[aria-label="编辑第${round}回合${slot}号位动作"]`).trigger('click')
}
