import { reactive } from 'vue'
import * as api from '../api/recruitmentAccess.js'

export function createRecruitmentAccessStore(client = api, now = () => Date.now()) {
  let generation = 0
  let pending = null
  let loadedAt = 0
  const state = reactive({
    userId: '',
    status: null,
    loading: false,
    loaded: false,
    error: '',
    get canAccess() {
      return !!state.userId && !state.error && state.status?.canAccess === true
    },
    setIdentity(value) {
      const id = value ? String(value) : ''
      if (id === state.userId) return
      generation += 1
      pending = null
      loadedAt = 0
      state.userId = id
      state.status = null
      state.loading = false
      state.loaded = false
      state.error = ''
    },
    async refresh({ force = false } = {}) {
      if (!state.userId) return null
      if (pending) return pending
      if (!force && state.loaded && !state.error && now() - loadedAt < 15000) return state.status
      const owner = state.userId
      const revision = generation
      state.loading = true
      const task = client.getRecruitmentAccess().then(value => {
        if (owner === state.userId && revision === generation) {
          state.status = value
          state.loaded = true
          state.error = ''
          loadedAt = now()
        }
        return owner === state.userId && revision === generation ? value : null
      }).catch(error => {
        if (owner === state.userId && revision === generation) {
          state.status = null
          state.loaded = true
          state.error = error?.message || '招募档案访问状态读取失败'
        }
        return null
      }).finally(() => {
        if (pending === task) pending = null
        if (owner === state.userId && revision === generation) state.loading = false
      })
      pending = task
      return task
    },
    invalidate() {
      generation += 1
      pending = null
      loadedAt = 0
      state.status = null
      state.loaded = false
      state.loading = false
      state.error = ''
    }
  })
  return state
}

export const recruitmentAccess = createRecruitmentAccessStore()
