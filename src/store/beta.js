import { reactive } from 'vue'
import * as api from '../api/beta.js'
import { betaAccessError } from '../utils/betaAccess.js'

const PERSONAL_RATE_LIMIT_COOLDOWN_MS = 65_000

/** Factory also lets Node tests verify real async race handling, rather than source-string guesses. */
export function createBetaStore(client = api, now = () => Date.now()) {
  let generation = 0
  let publicRevision = 0
  let publicRequest = null
  let meRequest = null
  let publicAt = 0
  let meAt = 0
  let meRateLimitedUntil = 0
  let pollTimer = null
  let deadlineTimer = null
  let subscribers = 0
  const state = reactive({
    campaign: null, mine: null, userId: '', publicLoading: false, personalLoading: false,
    publicError: '', personalError: '', personalLoaded: false,
    get canUseBetaFeatures() {
      // The backend owns the final access decision. This also lets administrators bypass
      // beta campaign state without the browser re-applying ordinary-user restrictions.
      return !!state.userId && !state.personalError && !state.publicError && state.mine?.canUseBetaFeatures === true
    },
    setIdentity(value) {
      const id = value ? String(value) : ''
      if (state.userId === id) return
      generation += 1
      meRequest = null
      meAt = 0
      meRateLimitedUntil = 0
      state.userId = id
      state.mine = null
      state.personalError = ''
      state.personalLoaded = false
      state.personalLoading = false
    },
    invalidate(error = '') {
      generation += 1
      meRequest = null
      meAt = 0
      meRateLimitedUntil = 0
      state.mine = null
      state.personalLoaded = true
      state.personalLoading = false
      state.personalError = error
    },
    async loadPublic({ force = false } = {}) {
      if (publicRequest) return publicRequest
      if (!force && state.campaign && !state.publicError && now() - publicAt < 15000) return state.campaign
      const revision = ++publicRevision
      state.publicLoading = true
      const pending = client.getBetaStatus().then(data => {
        if (revision === publicRevision) {
          state.campaign = data; state.publicError = ''; publicAt = now(); armDeadline()
        }
        return data
      }).catch(error => {
        if (revision === publicRevision) state.publicError = error.message || '状态读取失败'
        return null
      }).finally(() => {
        if (publicRequest === pending) { publicRequest = null; state.publicLoading = false }
      })
      publicRequest = pending
      return pending
    },
    async loadMe({ force = false } = {}) {
      if (!state.userId) return null
      if (meRequest) return meRequest
      if (meRateLimitedUntil > now()) return state.mine
      if (!force && state.mine && !state.personalError && now() - meAt < 15000) return state.mine
      const owner = state.userId
      const revision = generation
      state.personalLoading = true
      const pending = client.getBetaMe().then(data => {
        if (owner === state.userId && revision === generation) {
          meRateLimitedUntil = 0
          state.mine = data; state.personalError = ''; state.personalLoaded = true; meAt = now()
          publicRevision += 1
          state.campaign = data.campaign; state.publicError = ''; publicAt = now(); armDeadline()
        }
        return owner === state.userId && revision === generation ? data : null
      }).catch(error => {
        if (owner === state.userId && revision === generation) {
          if (error && error.status === 429) {
            meRateLimitedUntil = now() + PERSONAL_RATE_LIMIT_COOLDOWN_MS
            state.personalLoaded = true
            if (!state.mine) state.personalError = '状态刷新过于频繁，已暂缓自动刷新，请稍后再试。'
          } else {
            meRateLimitedUntil = 0
            state.mine = null; state.personalError = error.message || '本人资格读取失败'; state.personalLoaded = true
          }
        }
        return null
      }).finally(() => {
        if (meRequest === pending) { meRequest = null; state.personalLoading = false }
      })
      meRequest = pending
      return pending
    },
    async refresh() {
      return state.userId ? state.loadMe({ force: true }) : state.loadPublic({ force: true })
    },
    async requireAccess() {
      await state.loadMe()
      if (!state.canUseBetaFeatures) throw betaAccessError(state)
    },
    async join(payload) {
      generation += 1; meRequest = null; meAt = 0; state.personalLoading = false
      const owner = state.userId; const revision = generation
      try {
        const result = await client.joinBeta(payload)
        if (owner !== state.userId || revision !== generation) return null
        // Invalidate reads started while this mutation was in flight.
        generation += 1; meRequest = null; state.personalLoading = false; meRateLimitedUntil = 0
        state.mine = result; state.campaign = result.campaign; state.personalError = ''; state.publicError = ''
        state.personalLoaded = true; meAt = now(); publicAt = now(); publicRevision += 1; armDeadline()
        return result
      } catch (error) {
        // The server may have committed before a connection broke. Re-query, never deduct locally.
        if (owner === state.userId && revision === generation) {
          generation += 1; meRequest = null; state.personalLoading = false
          await state.loadMe({ force: true })
        }
        throw error
      }
    },
    async withdraw() {
      generation += 1; meRequest = null; meAt = 0; state.personalLoading = false
      const owner = state.userId; const revision = generation
      try {
        const result = await client.withdrawBeta()
        if (owner !== state.userId || revision !== generation) return null
        generation += 1; meRequest = null; state.personalLoading = false; meRateLimitedUntil = 0
        state.mine = result; state.campaign = result.campaign; state.personalError = ''; state.publicError = ''
        state.personalLoaded = true; meAt = now(); publicAt = now(); publicRevision += 1; armDeadline()
        return result
      } catch (error) {
        if (owner === state.userId && revision === generation) {
          generation += 1; meRequest = null; state.personalLoading = false
          await state.loadMe({ force: true })
        }
        throw error
      }
    },
    async resetLocalTest() {
      generation += 1; meRequest = null; meAt = 0; state.personalLoading = false
      const owner = state.userId; const revision = generation
      try {
        const result = await client.resetLocalTest()
        if (owner !== state.userId || revision !== generation) return null
        generation += 1; meRequest = null; state.personalLoading = false; meRateLimitedUntil = 0
        state.mine = result; state.campaign = result.campaign; state.personalError = ''; state.publicError = ''
        state.personalLoaded = true; meAt = now(); publicAt = now(); publicRevision += 1; armDeadline()
        return result
      } catch (error) {
        if (owner === state.userId && revision === generation) {
          generation += 1; meRequest = null; state.personalLoading = false
          await state.loadMe({ force: true })
        }
        throw error
      }
    },
    subscribe() {
      subscribers += 1
      if (subscribers === 1 && typeof window !== 'undefined') {
        pollTimer = setInterval(refreshVisible, 30000)
        window.addEventListener('focus', refreshVisible)
        document.addEventListener('visibilitychange', refreshVisible)
        armDeadline()
      }
      void state.refresh()
      let stopped = false
      return () => {
        if (stopped) return
        stopped = true; subscribers -= 1
        if (subscribers === 0 && typeof window !== 'undefined') {
          clearInterval(pollTimer); clearTimeout(deadlineTimer)
          window.removeEventListener('focus', refreshVisible)
          document.removeEventListener('visibilitychange', refreshVisible)
          pollTimer = null; deadlineTimer = null
        }
      }
    }
  })
  function refreshVisible() {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void state.refresh()
  }
  function armDeadline() {
    clearTimeout(deadlineTimer)
    if (!subscribers || typeof window === 'undefined' || !state.campaign) return
    // Use server time, not the user's computer clock. Only re-query; never grant in the browser.
    const delay = Date.parse(state.campaign.reservedUntil) - Date.parse(state.campaign.serverNow)
    if (delay > 0 && delay < 2147483647) deadlineTimer = setTimeout(refreshVisible, delay + 150)
  }
  return state
}

export const beta = createBetaStore()
