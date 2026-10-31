import sheet from '../src/components/operator/OperatorBoxImageSheet.vue?raw'
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Sheet from '../src/components/operator/OperatorBoxImageSheet.vue'
import { BOX_IMAGE_LAYOUT_WIDTH, operatorBoxImageEntry } from '../src/utils/operatorBoxImage.js'

// Values visible on the supplied overview screenshot; dates/unknown terms are not invented.
const xushu = {
  id: 'char_063_xushu', name: '徐庶', prof: '阳', subProf: 'shenji', rarity: 5,
  level: 100, elite: 17, huaji: { owned: true, stage: 25, awakened: null },
  combatStats: { oddities: { attack: { current: 500, max: 500 }, hp: { current: 2600, max: 2600 } } },
  discLoadouts: [{ discNames: ['人多增伤', '降低阴抗'] }, { discNames: ['攻击中幅', '人少增伤'] }],
}

it('the screenshot operator retains identity, growth, oddities and every configured fate term, with no history or controls', () => {
  const entry = operatorBoxImageEntry(xushu, {}, { attackLabel: '7706', hpLabel: '37195' }, 'active')
  const wrapper = mount(Sheet, { props: { entries: [entry] } })
  expect(wrapper.get('.ledger-portrait img').attributes('src')).toContain('char_063_xushu.webp')
  expect(wrapper.get('h3').text()).toBe('徐庶')
  expect(wrapper.get('.ledger-prof-tab').text()).toBe('神纪')
  expect(wrapper.get('.ledger-prof-tab img').attributes('alt')).toBe('阳属性')
  expect(wrapper.find('.ledger-status-button').exists()).toBe(false)
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('化极5星')
  expect(wrapper.findAll('.ledger-growth-row').map(row => row.text())).toEqual(['等级100', '修为17'])
  expect(wrapper.findAll('.ledger-combat-value').map(row => row.text())).toEqual(['7706', '37195'])
  expect(wrapper.findAll('.ledger-oddity').map(row => row.text())).toEqual(['500/ 500', '2600/ 2600'])
  expect(wrapper.findAll('.ledger-oddity.is-full')).toHaveLength(2)
  expect(wrapper.text()).not.toMatch(/历程|未记录日期/)
  expect(wrapper.get('.box-image-sheet').element.style.width).toBe(BOX_IMAGE_LAYOUT_WIDTH + 'px')
  expect(wrapper.findAll('.ledger-destiny-row').map(row => row.findAll('em').map(term => term.text()))).toEqual(xushu.discLoadouts.map(row => row.discNames))
  expect(wrapper.find('button, input, textarea, select, details, [role="button"], [tabindex]').exists()).toBe(false)
  expect(wrapper.find('.ledger-stones, .ledger-card-footer, .ledger-favorite').exists()).toBe(false)
  wrapper.unmount()
})

it('the screenshot three-character operator keeps nodes, different oddities and all six colored fate terms', () => {
  const saved = {
    id: 'char_003_sunshangxiang', name: '孙尚香', prof: '火', subProf: 'pojun', rarity: 5,
    level: 100, elite: 17, huaji: { owned: true, stage: 24, awakened: null },
    combatStats: { oddities: { attack: { current: 500, max: 500 }, hp: { current: 500, max: 2600 } } },
    discLoadouts: [{ discNames: ['暴击提升', '技伤小幅', '技伤中幅'] }, { discNames: ['普攻群伤', '技伤小幅', '技能群伤'] }],
  }
  const catalog = { discs: [
    { ot_name: '暴击提升', color: '金' }, { ot_name: '技伤小幅', color: '蓝' }, { ot_name: '技伤中幅', color: '紫' },
    { ot_name: '普攻群伤', color: '金' }, { ot_name: '技能群伤', color: '金' },
  ] }
  const entry = operatorBoxImageEntry(saved, catalog, { attackLabel: '8509', hpLabel: '26304' }, 'active')
  const wrapper = mount(Sheet, { props: { entries: [entry] } })
  expect(wrapper.get('h3').classes()).toContain('is-three-char-name')
  expect(wrapper.get('.ledger-huaji-value').attributes('aria-label')).toBe('4★ · 5 节点')
  expect(wrapper.findAll('.ledger-oddity').map(row => row.text())).toEqual(['500/ 500', '500/ 2600'])
  expect(wrapper.findAll('.ledger-oddity.is-full')).toHaveLength(1)
  expect(wrapper.findAll('.ledger-destiny-row').map(row => row.findAll('em').map(term => term.text()))).toEqual(saved.discLoadouts.map(row => row.discNames))
  expect(wrapper.findAll('em').map(term => term.classes().find(name => name.startsWith('rarity-')))).toEqual(['rarity-gold', 'rarity-blue', 'rarity-purple', 'rarity-gold', 'rarity-blue', 'rarity-gold'])
  wrapper.unmount()
})

it.each([
  ['char_084_chendengsp', '陈登·黍王', '黍王'],
  ['char_085_shizimiaosp', '史子眇·赴烛', '赴烛'],
])('the real long-name identity %s retains the overview continuation without inventing account progress', (id, name, continuation) => {
  const wrapper = mount(Sheet, { props: { entries: [operatorBoxImageEntry({ id, name })] } })
  expect(wrapper.get('h3').text()).toBe(name)
  expect(wrapper.get('.ledger-name-continuation').text()).toBe(continuation)
  expect(wrapper.get('.ledger-huaji-value').text()).not.toMatch(/\d/)
  expect(wrapper.findAll('.ledger-oddity output').map(value => value.text())).toEqual(['—', '—'])
  wrapper.unmount()
})

it.each([{ terms: [] }, { terms: ['已配词条'] }])('empty loadouts show a read-only state while configured terms remain: $terms', ({ terms }) => {
  const wrapper = mount(Sheet, { props: { entries: [operatorBoxImageEntry({
    id: 'empty', name: '测试', discLoadouts: [{ discNames: terms }, { discNames: [] }],
  })] } })
  const rows = wrapper.findAll('.ledger-destiny-row')
  expect(rows).toHaveLength(2)
  expect(rows[0].findAll('em').map(term => term.text())).toEqual(terms.length ? terms : ['未配置'])
  expect(rows[1].get('em.empty').text()).toBe('未配置')
  expect(wrapper.text()).not.toContain('+ 命盘')
  expect(wrapper.find('button, input, [role="button"], [tabindex]').exists()).toBe(false)
  wrapper.unmount()
})

it('the export owns its three-column layout without importing editable overview skins', () => {
  expect(sheet).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  expect(sheet).not.toMatch(/operator-ledger-card\.|agent-ledger-card--editable/)
})

it('awakened progress stays visible alongside stars', () => {
  const wrapper = mount(Sheet, { props: { entries: [operatorBoxImageEntry({ id: 'awake', rarity: 5, huaji: { owned: true, stage: 25, awakened: true } })] } })
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('化极5星 · 已觉醒')
  wrapper.unmount()
})
