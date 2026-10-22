export const ledgerCurrencies = ['CNY', 'USD', 'HKD', 'JPY']
export const currencyNames = { CNY: '人民币', USD: '美元', HKD: '港币', JPY: '日元' }

export function defaultPricing() {
  return { currency: 'CNY', rates: {}, discount_percent: 100, custom_only: false }
}

export function finiteNumber(value) {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function referenceRate(currency, pricing, legacyRate) {
  if (currency === 'CNY') return 1
  const rate = finiteNumber(pricing.rates?.[currency] ?? (currency === 'USD' ? legacyRate : null))
  return rate !== null && rate >= 0 && rate <= 1e6 && (currency === 'USD' || rate > 0) ? rate : null
}

export function packagePrice(pkg, version) {
  return pkg.priceAmount != null
    ? { amount: pkg.priceAmount, currency: pkg.priceCurrency }
    : { amount: (version === 'daihao' ? pkg.priceUsd : pkg.priceCny) ?? 0, currency: version === 'daihao' ? 'USD' : 'CNY' }
}

export function pricePackage(pkg, version, pricing, legacyRate) {
  const { amount, currency } = packagePrice(pkg, version)
  const rate = referenceRate(currency, pricing, legacyRate)
  const targetRate = referenceRate(pricing.currency, pricing, legacyRate)
  const percent = finiteNumber(pricing.discount_percent)
  const validDiscount = percent !== null && percent > 0 && percent <= 100
  const cny = rate === null || !validDiscount ? null : amount * (pkg.discountEligible === false ? 1 : percent / 100) * rate
  return {
    ...pkg, originalPrice: amount, originalCurrency: currency,
    calculatedPriceCny: cny,
    calculatedPrice: cny === null || targetRate === null || targetRate <= 0 ? null : cny / targetRate,
  }
}

export function pricingError(pricing, items, version, legacyRate, cart = {}) {
  if (!ledgerCurrencies.includes(pricing.currency)) return '请选择有效的预算币种'
  const discount = finiteNumber(pricing.discount_percent)
  if (discount === null || discount <= 0 || discount > 100) return '折扣须大于 0 且不超过 100%'
  const currencies = new Set([pricing.currency, ...items.map(pkg => packagePrice(pkg, version).currency)])
  for (const currency of currencies) {
    const rate = referenceRate(currency, pricing, legacyRate)
    if (rate === null || (currency === pricing.currency && rate <= 0)) return `请填写有效的 ${currency} 兑人民币参考汇率`
  }
  const total = items.reduce((sum, pkg) => sum + pricePackage(pkg, version, pricing, legacyRate).calculatedPrice * (cart[pkg.id] ?? 1), 0)
  if (!Number.isFinite(total)) return '预算金额超出计算范围，请检查价格和汇率'
  return ''
}

export function pricingPayload(pricing, legacyRate) {
  const rates = {}
  for (const currency of ledgerCurrencies.filter(c => c !== 'CNY')) {
    const rate = referenceRate(currency, pricing, legacyRate)
    if (rate !== null) rates[currency] = rate
  }
  return { ...pricing, discount_percent: Number(pricing.discount_percent), rates }
}

export function formatMoney(amount, currency = 'CNY', digits = currency === 'JPY' ? 0 : 2) {
  if (amount == null || !Number.isFinite(amount)) return '待填写汇率'
  const prefix = { CNY: '¥', USD: 'US$', HKD: 'HK$', JPY: 'JP¥' }[currency] || currency
  return prefix + amount.toFixed(digits)
}
