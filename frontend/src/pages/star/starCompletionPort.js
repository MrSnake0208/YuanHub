/** Completion transport is bound to the signed-in identity, account and existing CAS writer. */
export function createStarCompletionPort({ api, coordinator, identity, storage = globalThis.localStorage, enabled = false }) {
  let lease = null, boundOwner = null
  const scope = () => {
    const owner = identity()
    return owner ? coordinator.completionScope(owner.userId, owner.game) : null
  }
  const current = () => {
    const now = scope()
    if (!now || (boundOwner && [now.userId,now.accountId,now.game].join('\0') !== boundOwner)) throw new Error('账号或登录身份已变化，原操作仍待恢复。')
    return now
  }
  return {
    enabled, storage, scope,
    context() { const now = current(); return api.context(now.accountId) },
    post(body) { const now = current(); if (body.account_id !== now.accountId || body.game !== now.game) throw new Error('完成账号不一致。'); return api.post(body) },
    receipt(id, accountId) { const now = current(); if (accountId !== now.accountId) throw new Error('恢复账号不一致。'); return api.receipt(id, accountId) },
    begin(value) {
      const now = current()
      if (JSON.stringify(now) !== JSON.stringify(value)) throw new Error('完成版本已变化。')
      lease = coordinator.beginCompletion(now); boundOwner = [now.userId,now.accountId,now.game].join('\0')
    },
    async adopt(context) { current(); if (!lease) throw new Error('完成命令尚未锁定。'); lease.adopt(context) },
    release() { lease?.release(); lease = null; boundOwner = null },
  }
}
