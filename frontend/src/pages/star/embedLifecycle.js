// The YuanStar bundle owns mounting. This host helper only serializes async disposal
// so a Vue route re-entry cannot race its previous handle's cleanup.
let pendingDisposal = Promise.resolve()

// The embedded picker is attached to the document and owns the draft and save.
export function stepYuanStarLevelFromOne(event) {
  const step = event.target?.closest?.('[data-level-step="10"]')
  const picker = step?.closest('.yuanstar-level-picker[data-mode="level"]')
  const range = picker?.querySelector('[data-level-range]')
  const value = picker?.querySelector('[data-level-direct]')?.value.trim()
  if (step?.disabled || range?.value !== '1' || !/^0*1$/.test(value ?? '')) return

  event.stopPropagation()
  range.value = '10'
  range.dispatchEvent(new Event('input'))
}

export function waitForYuanStarDisposal() {
  return pendingDisposal
}

export function disposeYuanStarHandle(handle) {
  const disposal = pendingDisposal.then(function () { return handle.dispose() })
  pendingDisposal = disposal.catch(function () {})
  return disposal
}
