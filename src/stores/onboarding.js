import { defineStore } from 'pinia'

export const ONBOARDING_VERSION = 1
export const ONBOARDING_STORAGE_KEY = `yuanhub:onboarding:v${ONBOARDING_VERSION}`
export const ONBOARDING_STATUSES = ['idle', 'in_progress', 'completed', 'skipped']

function isStableStepId(value) {
  return typeof value === 'string' && /[a-z]/i.test(value)
}

function readSavedState() {
  if (typeof localStorage === 'undefined') return null
  try {
    const saved = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || 'null')
    if (!saved || saved.version !== ONBOARDING_VERSION || !ONBOARDING_STATUSES.includes(saved.status)) return null
    if (saved.status === 'in_progress' && !isStableStepId(saved.activeStepId)) return null
    return saved
  } catch (_) {
    return null
  }
}

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    status: 'idle',
    activeStepId: null,
    version: ONBOARDING_VERSION,
    initialized: false
  }),

  getters: {
    active: state => state.status === 'in_progress'
  },

  actions: {
    initialize() {
      if (this.initialized) return this
      const saved = readSavedState()
      if (saved) {
        this.status = saved.status
        this.activeStepId = saved.activeStepId || null
      }
      this.initialized = true
      return this
    },

    isFirstVisit() {
      this.initialize()
      return this.status === 'idle'
    },

    start(stepId) {
      if (!isStableStepId(stepId)) return false
      this.status = 'in_progress'
      this.activeStepId = stepId
      this.persist()
      return true
    },

    updateStep(stepId) {
      if (!this.active || !isStableStepId(stepId)) return false
      this.activeStepId = stepId
      this.persist()
      return true
    },

    complete() {
      this.status = 'completed'
      this.activeStepId = null
      this.persist()
    },

    skip() {
      this.status = 'skipped'
      this.activeStepId = null
      this.persist()
    },

    restart(stepId) {
      return this.start(stepId)
    },

    persist() {
      if (typeof localStorage === 'undefined') return false
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
          version: this.version,
          status: this.status,
          activeStepId: this.activeStepId
        }))
        return true
      } catch (_) {
        return false
      }
    }
  }
})
