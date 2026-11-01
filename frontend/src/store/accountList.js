import { shallowRef, watch } from 'vue'
import { auth } from './auth.js'

// A CRUD result, not another account cache. Workspace loaders remain the read owners.
export const accountListChange = shallowRef(null)
export let accountIdentityVersion = 0
export function publishAccountList(accounts) {
  accountListChange.value = { ownerId: auth.userInfo?.id, accounts }
}
watch(() => auth.userInfo?.id, () => { accountIdentityVersion++; accountListChange.value = null }, { flush: 'sync' })

export function useAccountListUpdates(apply) {
  // setup-scoped watch is disposed with its Workspace.
  watch(accountListChange, change => {
    if (change && change.ownerId === auth.userInfo?.id) apply(change.accounts)
  }, { flush: 'sync' })
}
