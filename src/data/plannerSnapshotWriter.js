const activeWriters = new WeakMap()
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, function (key, item) {
  return item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
})
const conflict = () => Object.assign(new Error('云端已有其他修改。请导出未保存内容，或放弃本次修改并读取云端。'), { status: 409 })

// One sequential CAS writer per account + plan. Pending drafts survive navigation
// and failed responses; retries first reconcile a potentially committed request.
export function createPlannerSnapshotWriter({ initial, read, write, body, storage, key, equals, sameVersion = (a, b) => a.revision === b.revision, isCurrent = () => true, onChange = () => {}, onSaved = () => {} }) {
  const owners = activeWriters.get(storage) || new Map()
  activeWriters.set(storage, owners)
  const owner = {}
  owners.set(key, owner)
  const active = () => owners.get(key) === owner && isCurrent()
  let base = clone(initial), pending = null, sent = null, error = null, running = null, latest = null, discarding = false
  let persisted = storage.getItem(key)
  const restored = JSON.parse(persisted || 'null')
  if (restored) { pending = restored.pending; sent = restored.sent; base = restored.base || { ...base, revision: restored.revision,
    ...(Object.hasOwn(base, 'generation') && pending?.generation !== undefined ? { generation: pending.generation } : {}) }; error = new Error('发现上次未完成的保存，可重试恢复或读取云端。') }
  function state() { return { base: clone(base), pending: pending && clone(pending), saving: Boolean(running), error, latest, revision: base.revision } }
  function notify() { onChange(state()) }
  function assertOwner() {
    if (!active() || storage.getItem(key) !== persisted) throw conflict()
  }
  function persist() {
    assertOwner()
    const value = pending ? JSON.stringify({ base, pending, sent, revision: base.revision }) : null
    if (pending) storage.setItem(key, value)
    else storage.removeItem(key)
    persisted = value
  }
  function same(a, b) { return equals ? equals(a, b) : stable(body(a, 0)) === stable(body(b, 0)) }
  async function drain() {
    while (pending && !error && active()) {
      const draft = pending
      sent = clone(draft)
      try {
        persist()
        const saved = await write(body(draft, base.revision))
        assertOwner()
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
    state, isActive: active,
    async save(value) {
      if (!active()) return false
      if (!pending && !running && same(value, base)) return false
      pending = clone(value)
      try { persist() } catch (err) { error = new Error('本机无法保留待保存内容：' + err.message); notify(); return false }
      // Keep later local commits even while an earlier request needs reconciliation.
      if (error || discarding) { notify(); return false }
      return start()
    },
    retry() {
      if (!active()) return Promise.resolve(false)
      if (running) return running
      running = Promise.resolve().then(async () => {
        try {
          assertOwner()
          latest = await read()
          assertOwner()
          if (sent && same(latest, sent)) { base = clone(latest); sent = null; if (pending && same(latest, pending)) pending = null }
          else if (!sameVersion(latest, base)) throw conflict()
          error = null
          persist()
          if (!pending) { onSaved(base, false); return true }
          return drain()
        } catch (err) { error = err; return false }
      }).finally(() => { running = null; notify() })
      notify()
      return running
    },
    discard({ beforeDiscard = async () => {} } = {}) {
      if (!active()) return Promise.resolve(false)
      if (running) return running
      discarding = true
      const draft = pending
      const assertUnchanged = () => { assertOwner(); if (pending !== draft) throw conflict() }
      running = Promise.resolve().then(async () => {
        try {
          assertUnchanged()
          const remote = await read()
          assertUnchanged()
          // The caller may back up and hydrate its workspace. Failure must keep the draft.
          await beforeDiscard(clone(remote))
          assertUnchanged()
          storage.removeItem(key)
          persisted = null
          base = remote; pending = null; sent = null; error = null; latest = null
          onSaved(remote, false); return true
        } catch (err) { error = err; return false }
      }).finally(() => { discarding = false; running = null; notify() })
      notify()
      return running
    },
    async refresh() {
      if (running || pending) return false
      const remote = await read()
      // A write may have begun while GET was in flight.
      if (!active() || running || pending || remote.revision < base.revision) return false
      base = remote; onSaved(remote, false); notify(); return true
    },
    adopt(value) {
      if (!active() || running || pending || error) return false
      base = clone(value); sent = null; latest = null
      try { persist() } catch (err) { error = new Error('本机无法更新云端版本：' + err.message); notify(); return false }
      onSaved(base, false); notify(); return true
    },
    stop() { if (owners.get(key) === owner) owners.delete(key) }
  }
}
