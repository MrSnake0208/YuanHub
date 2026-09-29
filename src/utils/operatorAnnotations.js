export function reconcileOperatorAnnotations(remote, local, busyIds) {
  const result = {
    statuses: { ...remote.statuses },
    remarks: { ...remote.remarks },
    revisions: { ...remote.revisions },
  }
  const ids = new Set(Object.keys(local.statuses).concat(Object.keys(local.remarks), Object.keys(local.revisions)))
  for (const id of ids) {
    if (!busyIds.has(id) && (Number(local.revisions[id]) || 0) <= (Number(remote.revisions[id]) || 0)) continue
    for (const key of ['statuses', 'remarks', 'revisions']) {
      if (Object.prototype.hasOwnProperty.call(local[key], id)) result[key][id] = local[key][id]
      else delete result[key][id]
    }
  }
  return result
}
