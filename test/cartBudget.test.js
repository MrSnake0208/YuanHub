import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePackageSnapshots, parseReferenceRate, displayPackages } from '../src/utils/cartBudget.js'

test('saved values override existing IDs and removed packages remain available without catalog mutation', () => {
  const catalog = Object.freeze([Object.freeze({ id: 1, name: '新价格', priceUsd: 10 }), Object.freeze({ id: 2, priceUsd: 20 })])
  const snapshots = [{ id: 1, name: '旧价格', priceUsd: 2 }, { id: 99, name: '下架礼包', priceUsd: 3 }]
  assert.deepEqual(mergePackageSnapshots(catalog, snapshots), [snapshots[0], catalog[1], snapshots[1]])
  assert.equal(catalog[0].priceUsd, 10)
  assert.deepEqual(mergePackageSnapshots(catalog, []), catalog)
})

test('rate rejects incomplete, negative and non-finite input; preserves allowed zero', () => {
  for (const value of ['', ' ', null, undefined, '-1', NaN, Infinity, '1e999', 'invalid']) assert.equal(parseReferenceRate(value), null)
  assert.equal(parseReferenceRate('7.25'), 7.25)
  assert.equal(parseReferenceRate('0'), 0)
})

const packages = Object.freeze([
  Object.freeze({ id: 1, name: '年卡', category: '超值', draws: 10, calculatedPriceCny: 20 }),
  Object.freeze({ id: 2, name: '恋念礼包', category: '恋念', draws: 0, calculatedPriceCny: 1 }),
  Object.freeze({ id: 3, name: '自定义卡 ABC', category: '超值', draws: 10, calculatedPriceCny: 10 }),
  Object.freeze({ id: 4, name: '旧存档', category: '存档', draws: 0, calculatedPriceCny: 2 }),
])
const options = { query: '', category: '全部', drawFilter: 'all', selectedOnly: false, sortMode: 'default', cart: { 1: 2, 3: 1 }, customIds: new Set([3]) }

test('name/category/draw/selected filters compose and never mutate source or quantities', () => {
  assert.deepEqual(displayPackages(packages, { ...options, query: ' abc ', category: '自定义', drawFilter: 'hasDraws', selectedOnly: true }).map(p => p.id), [3])
  assert.deepEqual(displayPackages(packages, { ...options, category: '恋念', selectedOnly: true }), [])
  assert.deepEqual(displayPackages(packages, { ...options, drawFilter: 'noDraws' }).map(p => p.id), [2, 4])
  assert.deepEqual(packages.map(p => p.id), [1, 2, 3, 4])
  assert.deepEqual(options.cart, { 1: 2, 3: 1 })
})

test('default order is unchanged; explicit cost sort places no-draw packages last and retains ties', () => {
  assert.deepEqual(displayPackages(packages, options).map(p => p.id), [1, 2, 3, 4])
  assert.deepEqual(displayPackages(packages, { ...options, sortMode: 'drawCost' }).map(p => p.id), [3, 1, 2, 4])
  assert.deepEqual(displayPackages(packages, { ...options, sortMode: 'price' }).map(p => p.id), [2, 4, 3, 1])
})
