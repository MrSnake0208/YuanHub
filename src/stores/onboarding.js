import { defineStore } from 'pinia'
import { ONBOARDING_TASKS } from '../utils/onboardingTasks.js'

export const ONBOARDING_VERSION = 2
export const ONBOARDING_STORAGE_KEY = 'yuanhub:onboarding:v2'
export const onboardingStorageKey = ownerId => `${ONBOARDING_STORAGE_KEY}:${encodeURIComponent(ownerId || 'guest')}`

const defaults = () => ({
  ownerId: 'guest', status: 'idle', tutorialTask: null, waitingFor: null,
  tutorialCompleted: false, completedTasks: {}, dismissedForNow: null, disableAutoGuide: false,
  panel: 'hidden', initialized: false
})

function verifiedReceipt(evidence, task, ownerId) {
  return Object.hasOwn(ONBOARDING_TASKS, task) && evidence?.ownerId === ownerId && evidence?.task === task &&
    typeof evidence.accountId === 'string' && !!evidence.accountId &&
    (task !== 'operator-first-entry' || (typeof evidence.operatorId === 'string' && !!evidence.operatorId))
}

export const useOnboardingStore = defineStore('onboarding', {
  state: defaults,
  getters: {
    active: state => state.status === 'in_progress',
    visible: state => state.panel !== 'hidden'
  },
  actions: {
    initialize(ownerId = this.ownerId) {
      ownerId = String(ownerId || 'guest')
      if (this.initialized && this.ownerId === ownerId) return this
      // Only an explicitly started guest task follows its login handoff.
      const handoff = this.ownerId === 'guest' && this.active && ownerId !== 'guest' ? this.tutorialTask : null
      const guestDismissal = this.ownerId === 'guest' && this.initialized ? this.dismissedForNow : null
      const guestDisabled = this.ownerId === 'guest' && this.initialized && this.disableAutoGuide
      if (this.initialized && this.active) {
        this.status = 'paused'
        this.persist()
      }
      this.$patch({ ...defaults(), ownerId, initialized: true })
      try {
        const saved = JSON.parse(localStorage.getItem(onboardingStorageKey(ownerId)) || 'null')
        if (saved?.version === ONBOARDING_VERSION) {
          this.dismissedForNow = typeof saved.dismissedForNow === 'number' ? saved.dismissedForNow : null
          this.disableAutoGuide = saved.disableAutoGuide === true
          this.completedTasks = Object.fromEntries(Object.entries(saved.completedTasks || {})
            .filter(([task, evidence]) => verifiedReceipt(evidence, task, ownerId)))
          if (Object.hasOwn(ONBOARDING_TASKS, saved.tutorialTask) && ['in_progress', 'paused', 'completed'].includes(saved.status)) {
            this.tutorialTask = saved.tutorialTask
            this.status = saved.status
            this.tutorialCompleted = saved.status === 'completed' && !!this.completedTasks[saved.tutorialTask]
            if (saved.status === 'completed' && !this.tutorialCompleted) this.status = 'paused'
            // Re-read business evidence; a historical waiting state is not evidence.
            this.waitingFor = 'business_state'
            if (this.active) this.panel = 'task'
          }
        } else if (localStorage.getItem('yuanhub:onboarding:v1')) {
          // A returning Tour user is not a verified business-task graduate.
          this.dismissedForNow = Date.now()
        }
      } catch { /* Unavailable storage keeps this session usable. */ }
      if (guestDismissal) this.dismissedForNow ||= guestDismissal
      if (guestDisabled) this.disableAutoGuide = true
      if (guestDismissal || guestDisabled) this.persist()
      if (handoff) this.start(handoff)
      return this
    },
    recommend() {
      if (this.status !== 'idle' || this.visible || this.dismissedForNow || this.disableAutoGuide || Object.keys(this.completedTasks).length) return false
      this.panel = 'invitation'
      return true
    },
    openTasks() {
      // Returning to the selector pauses teaching, never a business form.
      if (this.active) this.status = 'paused'
      this.panel = 'tasks'
      this.persist()
    },
    start(taskId) {
      if (!Object.hasOwn(ONBOARDING_TASKS, taskId)) return false
      this.tutorialTask = taskId
      this.status = 'in_progress'
      this.tutorialCompleted = false
      this.waitingFor = 'business_state'
      this.panel = 'task'
      this.persist()
      return true
    },
    applyProgress({ waitingFor, evidence } = {}) {
      if (!this.active) return false
      if (waitingFor === 'verified') {
        if (!verifiedReceipt(evidence, this.tutorialTask, this.ownerId)) return false
        this.completedTasks[this.tutorialTask] = evidence
        this.tutorialCompleted = true
        this.status = 'completed'
        this.panel = 'result'
      }
      this.waitingFor = waitingFor
      this.persist()
      return true
    },
    dismiss({ disableAutoGuide = false } = {}) {
      if (this.active) this.status = 'paused'
      this.panel = 'hidden'
      this.dismissedForNow = Date.now()
      if (disableAutoGuide) this.disableAutoGuide = true
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(onboardingStorageKey(this.ownerId), JSON.stringify({
          version: ONBOARDING_VERSION, status: this.status, tutorialTask: this.tutorialTask,
          waitingFor: this.waitingFor, tutorialCompleted: this.tutorialCompleted,
          completedTasks: this.completedTasks, dismissedForNow: this.dismissedForNow, disableAutoGuide: this.disableAutoGuide
        }))
        return true
      } catch { return false }
    }
  }
})
