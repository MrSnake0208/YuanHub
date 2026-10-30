import overview from '../src/pages/operator/index.vue?raw'
import sheet from '../src/components/operator/OperatorBoxImageSheet.vue?raw'
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { parse } from '@vue/compiler-dom'
import Sheet from '../src/components/operator/OperatorBoxImageSheet.vue'
import { BOX_IMAGE_LAYOUT_WIDTH, operatorBoxImageEntry } from '../src/utils/operatorBoxImage.js'
import { operatorLedgerCardVersionClass } from '../src/config/operatorLedgerCard.js'

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
  expect(wrapper.get('.ledger-status-button').text()).toBe('养成中')
  expect(wrapper.findAll('.ledger-growth-row').map(row => row.text())).toEqual(['等级100', '修为17', '化极5'])
  expect(wrapper.findAll('.ledger-combat-value').map(row => row.text())).toEqual(['7706', '37195'])
  expect(wrapper.findAll('.ledger-oddity').map(row => row.text())).toEqual(['500/ 500', '2600/ 2600'])
  expect(wrapper.findAll('.ledger-oddity.is-full')).toHaveLength(2)
  expect(wrapper.text()).not.toMatch(/历程|未记录日期/)
  expect(wrapper.get('.box-image-sheet').element.style.width).toBe(BOX_IMAGE_LAYOUT_WIDTH + 'px')
  expect(wrapper.get('article').classes()).toEqual(expect.arrayContaining(operatorLedgerCardVersionClass().split(' ')))
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

it('the export keeps the overview section ancestry and imports its actual desktop skins', () => {
  const landmarks = new Set(['ledger-portrait', 'ledger-card-head', 'ledger-name-tab', 'ledger-identity', 'ledger-name-row', 'ledger-prof-tab', 'ledger-status-menu', 'ledger-status-button', 'ledger-combat', 'ledger-combat-stat', 'ledger-combat-head', 'ledger-combat-value', 'ledger-oddity', 'ledger-growth', 'ledger-growth-row', 'ledger-grow-label', 'ledger-inline-field', 'ledger-inline-input', 'ledger-huaji-value', 'ledger-loadouts', 'ledger-destiny', 'ledger-destiny-row', 'ledger-destiny-values'])
  function ancestry(source) {
    const paths = new Set()
    function visit(node, parents = []) {
      if (node.type === 1) {
        const classes = node.props.find(prop => prop.type === 6 && prop.name === 'class')?.value?.content.split(/\s+/) || []
        const landmark = classes.find(name => landmarks.has(name))
        if (landmark) { parents = [...parents, landmark]; paths.add(parents.join(' > ')) }
      }
      node.children?.forEach(child => visit(child, parents))
    }
    visit(parse(source.slice(source.indexOf('<template>') + 10, source.lastIndexOf('</template>'))))
    return paths
  }
  const original = ancestry(overview)
  for (const path of ancestry(sheet)) expect(original.has(path), path).toBe(true)
  expect(sheet).toMatch(/grid-template-columns:\s*repeat\(5, 190px\)\s*!important/)
  expect(BOX_IMAGE_LAYOUT_WIDTH).toBe(5 * 190 + 4 * 10 + 2 * 24)
  expect(sheet).not.toMatch(/background:\s*transparent\s*!important|\.ledger-status-menu\s*\{\s*top:/)
  for (const name of ['reading', 'v1', 'v1Desktop', 'v2', 'v2Desktop', 'v3', 'v3Desktop']) {
    const imported = `src="../../styles/operator-ledger-card.${name}.css"`
    expect(overview).toContain(imported)
    expect(sheet).toContain(imported)
  }
})
