import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPricing, pricePackage, pricingError, pricingPayload, formatMoney, referenceRate } from '../src/utils/ledgerPricing.js'

test('95% changes spend, not package points or draws, and respects exclusions', () => {
  const pricing = { ...defaultPricing(), discount_percent: 95 }
  const pkg = { priceCny: 648, points: 6480, draws: 40 }
  const result = pricePackage(pkg, 'ru', pricing, 7)
  assert.equal(formatMoney(result.calculatedPrice), '¥615.60')
  assert.equal(result.points, 6480)
  assert.equal(result.draws, 40)
  assert.equal(pricePackage({ ...pkg, discountEligible: false }, 'ru', pricing, 7).calculatedPrice, 648)
  assert.equal(pkg.priceCny, 648)
})

test('explicit HKD/JPY store prices and display currencies convert independently', () => {
  const pricing = { ...defaultPricing(), currency: 'JPY', rates: { HKD: 0.9, JPY: 0.05 } }
  const hkd = pricePackage({ priceAmount: 100, priceCurrency: 'HKD', priceUsd: 1000 }, 'daihao', pricing, 7)
  assert.equal(hkd.calculatedPriceCny, 90)
  assert.equal(hkd.calculatedPrice, 1800)
  assert.equal(formatMoney(hkd.calculatedPrice, 'JPY'), 'JP¥1800')
  const jpy = pricePackage({ priceAmount: 2000, priceCurrency: 'JPY' }, 'ru', { ...pricing, currency: 'HKD' }, 7)
  assert.equal(jpy.calculatedPriceCny, 100)
  assert.equal(formatMoney(jpy.calculatedPrice, 'HKD'), 'HK$111.11')
})

test('legacy snapshots retain their original game-bound prices and USD zero contract', () => {
  assert.equal(pricePackage({ priceUsd: 2 }, 'daihao', defaultPricing(), 7).calculatedPrice, 14)
  assert.equal(pricePackage({ priceCny: 3 }, 'ru', defaultPricing(), 7).calculatedPrice, 3)
  assert.equal(pricePackage({ priceUsd: 2 }, 'daihao', defaultPricing(), 0).calculatedPrice, 0)
  assert.match(pricingError({ ...defaultPricing(), currency: 'USD' }, [], 'daihao', 0), /USD/)
})

test('only needed rates block budgets and unresolved totals are never formatted as zero', () => {
  const pkg = { priceAmount: 80, priceCurrency: 'HKD' }
  assert.equal(pricingError(defaultPricing(), [], 'ru', 7), '')
  assert.match(pricingError(defaultPricing(), [pkg], 'ru', 7), /HKD/)
  assert.equal(pricePackage(pkg, 'ru', defaultPricing(), 7).calculatedPrice, null)
  assert.equal(formatMoney(null), '待填写汇率')
  for (const bad of ['', -1, 0, Infinity, NaN, 1000001]) {
    assert.equal(referenceRate('JPY', { rates: { JPY: bad } }, 7), null)
  }
  assert.equal(referenceRate('JPY', { rates: { JPY: 0.00001 } }, 7), 0.00001)
  assert.equal(referenceRate('CNY', { rates: { CNY: 9 } }, 7), 1)
})

test('blank, invalid or out-of-range discounts cannot silently save as full price', () => {
  for (const bad of ['', 0, -1, 101, Infinity]) {
    assert.match(pricingError({ ...defaultPricing(), discount_percent: bad }, [], 'ru', 7), /折扣/)
  }
  assert.match(pricingError({ ...defaultPricing(), currency: 'JPY', rates: { JPY: Number.MIN_VALUE } }, [{ priceCny: 100 }], 'ru', 7), /超出计算范围/)
})

test('save payload materializes rates and keeps source drafts untouched', () => {
  const pricing = { ...defaultPricing(), currency: 'HKD', rates: { HKD: '0.9', JPY: '' }, discount_percent: '95', custom_only: true }
  assert.deepEqual(pricingPayload(pricing, 7), { currency: 'HKD', rates: { USD: 7, HKD: 0.9 }, discount_percent: 95, custom_only: true })
  assert.equal(pricing.rates.HKD, '0.9')
})
