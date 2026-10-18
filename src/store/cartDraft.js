import { reactive } from 'vue'
import { bundledLedgerCatalog } from '../utils/ledgerCatalog.js'

function emptyDraft() {
  return {
    version: 'daihao',
    exchangeRate: bundledLedgerCatalog.exchangeRate,
    rateDraft: String(bundledLedgerCatalog.exchangeRate),
    rateError: '',
    rateOwned: false,
    cartDaihao: {}, cartRu: {},
    initialPointsDaihao: 0, initialPointsRu: 0,
    customPackagesDaihao: [], customPackagesRu: [],
    builtinSnapshots: { daihao: [], ru: [] },
    plansByVersion: {
      daihao: { id: null, name: '', isLocal: false },
      ru: { id: null, name: '', isLocal: false },
    },
  }
}

// 草稿随标签页存活；刷新前需手动保存方案，不自动写入本机或云端。
const draft = reactive(emptyDraft())
let draftOwner = null

export function resetCartDraft(owner = null) {
  draftOwner = owner
  Object.assign(draft, emptyDraft())
}

export function useCartDraft(owner) {
  if (draftOwner !== owner) resetCartDraft(owner)
  return draft
}
