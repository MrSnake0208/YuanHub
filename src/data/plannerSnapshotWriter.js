const activeWriters = new WeakMap()
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, function (key, item) {
  return item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
})
const conflict = () => Object.assign(new Error('云端已有其他修改。请导出未保存内容，或放弃本次修改并读取云端。'), { status: 409 })

// One sequential CAS writer per account + plan. Pending drafts survive navigation
// and failed responses; retries first reconcile a potentially committed request.
export function createPlannerSnapshotWriter({ initial, read, write, body, storage, key, onChange = () => {}, onSaved = () => {} }) {
  const owners = activeWriters.get(storage) || new Map()
  activeWriters.set(storage, owners)
  const owner = {}
  owners.set(key, owner)
  const active = () => owners.get(key) === owner
  let base = clone(initial), pending = null, sent = null, error = null, running = null, latest = null
  const restored = JSON.parse(storage.getItem(key) || 'null')
  if (restored) { pending = restored.pending; sent = restored.sent; base.revision = restored.revision; error = new Error('发现上次未完成的保存，可重试恢复或读取云端。') }
  function state() { return { pending: pending && clone(pending), saving: Boolean(running), error, latest, revision: base.revision } }
  function notify() { onChange(state()) }
  function persist() {
    if (!active()) return
    if (pending) storage.setItem(key, JSON.stringify({ pending, sent, revision: base.revision }))
    else storage.removeItem(key)
  }
  function same(a, b) { return stable(body(a, 0)) === stable(body(b, 0)) }
  async function drain() {
    while (pending && !error && active()) {
      const draft = pending
      sent = clone(draft)
      try {
        persist()
        const saved = await write(body(draft, base.revision))
        base = clone(saved)
        sent = null
        if (pending === draft) pending = null
        persist()
        onSaved(saved, Boolean(pending))
      } catch (err) { error = err; try { persist() } catch (_) {} }
      notify()
    }
    return !pending
  }
  function start() {
    if (running) return running
    // Assign before drain callbacks so a synchronous storage failure is observable.
    running = Promise.resolve().then(drain).finally(() => { running = null; notify() })
    notify()
    return running
  }
  return {
    state,
    async save(value) {
      if (error || !active()) return false
      pending = clone(value)
      try { persist() } catch (err) { error = new Error('本机无法保留待保存内容：' + err.message); notify(); return false }
      return start()
    },
    retry() {
      if (!active()) return Promise.resolve(false)
      if (running) return running
      running = Promise.resolve().then(async () => {
        try {
          latest = await read()
          if (sent && same(latest, sent)) { base = clone(latest); sent = null; if (pending && same(latest, pending)) pending = null }
          else if (latest.revision !== base.revision) throw conflict()
          error = null
          persist()
          if (!pending) { onSaved(base, false); return true }
          return drain()
        } catch (err) { error = err; return false }
      }).finally(() => { running = null; notify() })
      notify()
      return running
    },
    discard() {
      if (!active()) return Promise.resolve(false)
      if (running) return running
      running = Promise.resolve().then(async () => {
        try {
          const remote = await read()
          if (!active()) return false
          storage.removeItem(key)
          base = remote; pending = null; sent = null; error = null; latest = null
          onSaved(remote, false); return true
        } catch (err) { error = err; return false }
      }).finally(() => { running = null; notify() })
      notify()
      return running
    },
    async refresh() {
      if (running || pending) return false
      const remote = await read()
      // A write may have begun while GET was in flight.
      if (!active() || running || pending || remote.revision < base.revision) return false
      base = remote; onSaved(remote, false); notify(); return true
    }
  }
}
