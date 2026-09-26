export const STAR_CAPTURE_LIFECYCLE_KEY = 'yuanhub:star-capture-lifecycle:v1'

const validStates = new Set(['imported', 'consume_pending'])

function normalized(value) {
  return String(value || '').trim()
}

export function createStarCaptureLifecycle(storage, now = Date.now) {
  function targetStorage() { return storage || globalThis.localStorage }
  function read() {
    try {
      const raw = targetStorage().getItem(STAR_CAPTURE_LIFECYCLE_KEY)
      if (!raw) return { version: 1, records: {} }
      const parsed = JSON.parse(raw)
      if (parsed?.version !== 1 || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) throw new Error('invalid lifecycle')
      const records = {}
      for (const [key, record] of Object.entries(parsed.records)) {
        if (!record || record.accountId !== key || !normalized(record.captureId) || !validStates.has(record.state) || !Number.isFinite(record.updatedAt)) throw new Error('invalid record')
        records[key] = record
      }
      return { version: 1, records }
    } catch {
      try { targetStorage().removeItem(STAR_CAPTURE_LIFECYCLE_KEY) } catch {}
      return { version: 1, records: {} }
    }
  }

  function write(data) {
    targetStorage().setItem(STAR_CAPTURE_LIFECYCLE_KEY, JSON.stringify(data))
  }

  function get(accountId) {
    return read().records[normalized(accountId)] || null
  }

  function mark(accountId, captureId, state, jobId) {
    const account = normalized(accountId)
    const capture = normalized(captureId)
    if (!account || !capture) throw new Error('星石截图账号或批次无效。')
    const data = read()
    const record = { accountId: account, captureId: capture, state, updatedAt: now() }
    if (jobId) record.jobId = normalized(jobId)
    data.records[account] = record
    write(data)
    return record
  }

  function clearIfMatches(accountId, captureId, state = 'consume_pending') {
    const account = normalized(accountId)
    const data = read()
    const record = data.records[account]
    if (!record || record.captureId !== normalized(captureId) || record.state !== state) return false
    delete data.records[account]
    write(data)
    return true
  }

  function shouldSuppressImport(accountId, captureId) {
    const record = get(accountId)
    return record?.captureId === normalized(captureId) ? record.state : null
  }

  function captureAction(accountId, captureId) {
    return shouldSuppressImport(accountId, captureId) || 'import'
  }

  return {
    get,
    markImported: (accountId, captureId) => mark(accountId, captureId, 'imported'),
    markConsumePending: (accountId, captureId, jobId) => mark(accountId, captureId, 'consume_pending', jobId),
    clearIfMatches,
    shouldSuppressImport,
    captureAction,
  }
}

export async function importAndMarkStarCapture({ lifecycle, accountId, captureId, importCapture, isCurrent }) {
  const completed = await importCapture()
  if (!completed || !isCurrent()) return false
  lifecycle.markImported(accountId, captureId)
  return true
}

export function createStarCaptureInbox(lifecycle) {
  const consumedInPage = new Set()
  const key = (accountId, captureId) => normalized(accountId) + '\u0000' + normalized(captureId)
  return {
    captureAction(accountId, captureId) {
      if (consumedInPage.has(key(accountId, captureId))) return 'consumed'
      return lifecycle.captureAction(accountId, captureId)
    },
    markConsumed(accountId, captureId) {
      consumedInPage.add(key(accountId, captureId))
    },
  }
}

export function createStarCaptureHost({ lifecycle, consume, onState = function () {} }) {
  const inFlight = new Map()

  function retry(accountId, captureId) {
    const record = lifecycle.get(accountId)
    if (!record || record.state !== 'consume_pending' || (captureId && record.captureId !== captureId)) return Promise.resolve(false)
    const key = record.accountId + '\u0000' + record.captureId
    if (inFlight.has(key)) return inFlight.get(key)
    const operation = (async function () {
      onState({ type: 'retrying', ...record })
      try {
        await consume(record.accountId, record.captureId)
      } catch (error) {
        if (error?.status !== 404 && error?.code !== 'star_capture_not_found') {
          if (lifecycle.shouldSuppressImport(record.accountId, record.captureId) === 'consume_pending') onState({ type: 'failed', ...record })
          return false
        }
      }
      if (lifecycle.clearIfMatches(record.accountId, record.captureId)) onState({ type: 'consumed', ...record })
      return true
    })().finally(function () { inFlight.delete(key) })
    inFlight.set(key, operation)
    return operation
  }

  async function onCaptureCommitted(event) {
    if (event?.source !== 'maayuan' || !normalized(event.accountId) || !normalized(event.captureId)) return false
    const accountId = normalized(event.accountId)
    const captureId = normalized(event.captureId)
    try {
      lifecycle.markConsumePending(accountId, captureId, event.jobId)
    } catch {
      onState({ type: 'storage_failed', accountId, captureId })
      return false
    }
    return retry(accountId, captureId)
  }

  return { retry, onCaptureCommitted }
}
