// The YuanStar bundle owns mounting. This host helper only serializes async disposal
// so a Vue route re-entry cannot race its previous handle's cleanup.
let pendingDisposal = Promise.resolve()

export function waitForYuanStarDisposal() {
  return pendingDisposal
}

export function disposeYuanStarHandle(handle) {
  const disposal = pendingDisposal.then(function () { return handle.dispose() })
  pendingDisposal = disposal.catch(function () {})
  return disposal
}
