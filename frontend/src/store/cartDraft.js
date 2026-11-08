import { reactive } from 'vue'
import { bundledLedgerCatalog } from '../utils/ledgerCatalog.js'
import { defaultPricing } from '../utils/ledgerPricing.js'

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
    pricingByVersion: { daihao: defaultPricing(), ru: defaultPricing() },
    plansByVersion: {
      daihao: { id: null, name: '', isLocal: false },
      ru: { id: null, name: '', isLocal: false },
    },
  }
}

// 草稿随标签页存活；刷新前需手动保存方案，不自动写入本机或云端。
const draft = reactive(emptyDraft())
let draftOwner = null
let draftAccount = null
const accountDrafts = new Map()
const accountFields = ['cartDaihao', 'cartRu', 'initialPointsDaihao', 'initialPointsRu', 'customPackagesDaihao', 'customPackagesRu', 'builtinSnapshots', 'plansByVersion']

export function selectCartDraftAccount(accountKey) {
  if (draftAccount === accountKey) return
  // 首次加载账号承接当前草稿；随后才按账号恢复，汇率始终沿用当前标签页。
  if (draftAccount === null && accountDrafts.size === 0) {
    draftAccount = accountKey
    return
  }
  accountDrafts.set(draftAccount, {
    ...Object.fromEntries(accountFields.map(key => [key, draft[key]])),
    pricingByVersion: draft.pricingByVersion,
  })
  const next = accountDrafts.get(accountKey) || emptyDraft()
  for (const key of accountFields) draft[key] = next[key]
  draft.pricingByVersion = Object.fromEntries(Object.entries(next.pricingByVersion).map(([version, settings]) => [version, { ...settings, rates: draft.pricingByVersion[version].rates }]))
  draftAccount = accountKey
}

export function resetCartDraft(owner = null) {
  draftOwner = owner
  draftAccount = null
  accountDrafts.clear()
  Object.assign(draft, emptyDraft())
}

export function useCartDraft(owner) {
  if (draftOwner !== owner) resetCartDraft(owner)
  return draft
}
