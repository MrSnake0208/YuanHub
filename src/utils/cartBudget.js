// Saved built-in values take precedence; removed catalog entries remain readable.
export function mergePackageSnapshots(catalog, snapshots) {
  const saved = new Map(snapshots.map(pkg => [pkg.id, pkg]))
  const ids = new Set(catalog.map(pkg => pkg.id))
  return catalog.map(pkg => saved.get(pkg.id) || pkg)
    .concat(snapshots.filter(pkg => !ids.has(pkg.id)))
}

export function parseReferenceRate(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const rate = Number(value)
  return Number.isFinite(rate) && rate >= 0 ? rate : null
}

export function displayPackages(packages, { query, category, drawFilter, selectedOnly, sortMode, cart, customIds }) {
  const name = query.trim().toLocaleLowerCase()
  const visible = packages.filter(pkg => {
    if (name && !pkg.name.toLocaleLowerCase().includes(name)) return false
    if (category === '自定义' ? !customIds.has(pkg.id) : category !== '全部' && pkg.category !== category) return false
    if (drawFilter === 'hasDraws' && !(pkg.draws > 0)) return false
    if (drawFilter === 'noDraws' && pkg.draws !== 0) return false
    return !selectedOnly || cart[pkg.id] > 0
  })
  if (sortMode === 'price') visible.sort((a, b) => a.calculatedPriceCny - b.calculatedPriceCny)
  if (sortMode === 'drawCost') visible.sort((a, b) => {
    const aHasDraws = a.draws > 0, bHasDraws = b.draws > 0
    if (aHasDraws !== bHasDraws) return aHasDraws ? -1 : 1
    if (!aHasDraws) return 0
    return a.calculatedPriceCny / a.draws - b.calculatedPriceCny / b.draws
  })
  return visible
}
