import { test } from 'node:test'
import assert from 'node:assert/strict'
import { operatorBoxImageEntry, operatorBoxImagePages } from '../src/utils/operatorBoxImage.js'

test('105 operators keep order and appear exactly once across 30/30/30/15 pages', () => {
  const entries = Array.from({ length: 105 }, (_, id) => ({ id }))
  const pages = operatorBoxImagePages(entries)
  assert.deepEqual(pages.map(page => page.entries.length), [30, 30, 30, 15])
  assert.deepEqual(pages.map(({ start, end }) => [start, end]), [[1, 30], [31, 60], [61, 90], [91, 105]])
  assert.deepEqual(pages.flatMap(page => page.entries), entries)
  assert.equal(operatorBoxImagePages(entries, true).length, 1)
  assert.equal(operatorBoxImagePages(entries, true)[0].end, 105)
})

test('empty, row and page boundaries have no blank final page', () => {
  for (const [count, sizes] of [[0, []], [1, [1]], [5, [5]], [30, [30]], [31, [30, 1]], [125, [30, 30, 30, 30, 5]]]) {
    assert.deepEqual(operatorBoxImagePages(Array.from({ length: count }, (_, id) => id)).map(page => page.entries.length), sizes)
  }
  assert.deepEqual(operatorBoxImagePages([], true), [])
})

test('export allowlist contains actual fate terms, never private names, notes or targets', () => {
  const entry = {
    id: 'op', name: '测试密探', prof: '阳', subProf: 'shenji', level: 100, elite: 17,
    rarity: 5, huaji: { owned: true, stage: 25, awakened: true },
    remark: 'private-remark', tags: ['private-tag'], userId: 'private-owner',
    discLoadouts: [{ name: 'private-loadout', discNames: ['实际词条'], targetDiscNames: ['private-target'], status: 'perfect' }],
  }
  const output = operatorBoxImageEntry(entry, { avatar: '/avatar/test.webp', discs: [{ ot_name: '实际词条', abbreviation: '实际', color: '金' }] }, { attackLabel: '12,345' })
  assert.equal(output.huaji, '5★ · 已觉醒')
  assert.equal(output.job, '神纪')
  assert.equal(output.attack, '12,345')
  assert.equal(output.hp, '—')
  assert.deepEqual(output.loadouts, [[{ name: '实际', color: '金' }], []])
  assert.doesNotMatch(JSON.stringify(output), /private-|perfect|target|remark|userId/)
})

test('legacy fate terms and unknown huaji are preserved without fabricating progress', () => {
  const output = operatorBoxImageEntry({ id: 'op', name: '测试', rarity: 5, huaji: { owned: true, stage: null }, discs: [{ otName: '旧词条' }] }, {}, {})
  assert.equal(output.huaji, '化极待确认')
  assert.deepEqual(output.loadouts, [[{ name: '旧词条', color: '' }], []])
  assert.equal(output.level, '—')
  assert.equal(output.elite, '—')
})

test('export keeps real huaji stars, nodes and awakening without treating legacy starLevel as independent stars', () => {
  for (const [growth, expected] of [
    [{ huaji: { owned: true, stage: 9, awakened: false }, starLevel: 25 }, '2★ · 2 节点'],
    [{ starLevel: 19 }, '4★ · 0 节点'],
    [{ star_level: 31 }, '5★ · 已觉醒'],
    [{ spOf: 'base', starLevel: 3 }, '3★'],
    [{ huaji: { owned: true, stage: null } }, '化极待确认'],
  ]) {
    const entry = { id: 'op', name: '测试', rarity: 5, level: 73, elite: 0, ...growth }
    const output = operatorBoxImageEntry(entry, {}, {})
    assert.equal(output.huaji, expected)
    assert.equal(output.level, 73)
    assert.equal(output.elite, 0)
  }
})

test('export retains calculated combat and actual oddities without inventing unknown limits or leaking sources', () => {
  const entry = { id: 'op', name: '测试', combatStats: { oddities: {
    attack: { current: 500, max: 500 }, hp: { current: 0, max: null },
  } } }
  const before = JSON.stringify(entry)
  const output = operatorBoxImageEntry(entry, {}, {
    attackLabel: '9,999', hpLabel: '99,999', attackSource: 'calculated', hpSource: 'observed', status: 'stale',
  })
  assert.equal(output.attack, '9,999')
  assert.equal(output.hp, '99,999')
  assert.deepEqual(output.oddities, { attack: { current: 500, max: 500 }, hp: { current: 0, max: '—' } })
  assert.deepEqual(operatorBoxImageEntry({ id: 'unknown' }).oddities, {
    attack: { current: '—', max: '—' }, hp: { current: '—', max: '—' },
  })
  assert.deepEqual(operatorBoxImageEntry({ id: 'zero', combatStats: { oddities: { attack: { current: 0, max: 0 } } } }).oddities.attack, { current: 0, max: 0 })
  assert.equal(Object.hasOwn(output, 'sources'), false)
  assert.equal(JSON.stringify(entry), before)
})
