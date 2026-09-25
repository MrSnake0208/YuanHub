import { reactive } from 'vue'

export const BETA_COMMUNITY = Object.freeze({
  groupNumber: '978744071'
})

const AUTO_SHOWN_PREFIX = 'yuanhub:beta-community-auto-shown:v1'
const autoShownInMemory = new Set()

export const betaCommunity = reactive({
  visible: false,
  source: 'manual',

  open(source = 'manual') {
    this.source = source
    this.visible = true
  },

  close() {
    this.visible = false
  },

  tryAutoOpen({ userId, campaign, mine, isAdmin = false } = {}) {
    if (
      !userId ||
      isAdmin ||
      campaign?.accessMode !== 'BETA' ||
      mine?.enrollmentStatus !== 'ACTIVE' ||
      mine?.canUseBetaFeatures !== true ||
      !mine?.grantedAt
    ) {
      return false
    }

    const campaignId = mine.campaignId || campaign.campaignId
    if (!campaignId) return false

    const key = `${AUTO_SHOWN_PREFIX}:${userId}:${campaignId}:${mine.grantedAt}`
    if (autoShownInMemory.has(key)) return false
    try {
      if (localStorage.getItem(key) === '1') {
        autoShownInMemory.add(key)
        return false
      }
      localStorage.setItem(key, '1')
    } catch (_) {
      // Storage may be unavailable in privacy-restricted browsers; the in-memory marker
      // still prevents a 30-second beta status refresh from reopening the dialog.
    }
    autoShownInMemory.add(key)

    this.open('auto')
    return true
  }
})
