import { reactive } from 'vue'
import { getCurrentStarLoadoutPresets, putCurrentStarLoadoutPresets } from '../api/starLoadoutPresets.js'
import { canonicalPresetNames } from './starLoadoutUi.js'

function clonePresets(source) {
  return {
    main: (source?.main || []).map(function (item) { return { id: item.id, name: item.name, names: item.names.slice() } }),
    support: (source?.support || []).map(function (item) { return { id: item.id, name: item.name, names: item.names.slice() } }),
  }
}

export function normalizePresetSnapshot(snapshot) {
  const row = Array.isArray(snapshot) ? snapshot[0] || {} : snapshot || {}
  function group(key) {
    return (row[key] || []).map(function (item) {
      return {
        id: String(item?.id || '').trim(),
        name: String(item?.name || '').trim(),
        names: (item?.star_names || item?.starNames || item?.names || []).map(function (name) { return String(name).trim() }),
      }
    })
  }
  return {
    revision: Number(row.revision) || 0,
    main: group('main_presets').length ? group('main_presets') : group('mainPresets'),
    support: group('support_presets').length ? group('support_presets') : group('supportPresets'),
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function validatePresetDraft(draft) {
  const normalized = { main: [], support: [] }
  for (const kind of ['main', 'support']) {
    const rows = Array.isArray(draft?.[kind]) ? draft[kind] : []
    if (rows.length > 20) return { valid: false, message: (kind === 'main' ? '主星' : '辅星') + '预设最多 20 套' }
    const ids = new Set()
    for (const row of rows) {
      const id = String(row?.id || '').trim()
      const name = String(row?.name || '').trim()
      const parsed = canonicalPresetNames(Array.isArray(row?.names) ? row.names.join(' ') : row?.names, kind)
      if (!id || ids.has(id)) return { valid: false, message: (kind === 'main' ? '主星' : '辅星') + '预设标识无效或重复' }
      if (!name) return { valid: false, message: '预设名称不能为空' }
      if (!parsed.valid) return { valid: false, message: name + ' 的星石名称无效或重复' }
      ids.add(id)
      normalized[kind].push({ id, name, names: parsed.names })
    }
  }
  return { valid: true, presets: normalized }
}

export function createStarLoadoutPresetStore(api = {}) {
  const getCurrent = api.getCurrent || getCurrentStarLoadoutPresets
  const putCurrent = api.putCurrent || putCurrentStarLoadoutPresets
  const state = reactive({
    scopeKey: '',
    loaded: false,
    loading: false,
    saving: false,
    revision: 0,
    main: [],
    support: [],
    updatedAt: null,
    error: '',
    errorCode: '',
  })
  let loadRequest = null

  function replace(snapshot) {
    const normalized = normalizePresetSnapshot(snapshot)
    state.revision = normalized.revision
    state.main = normalized.main
    state.support = normalized.support
    state.updatedAt = normalized.updatedAt
  }

  function clear(scopeKey = '') {
    state.scopeKey = scopeKey
    state.loaded = false
    state.loading = false
    state.saving = false
    state.revision = 0
    state.main = []
    state.support = []
    state.updatedAt = null
    state.error = ''
    state.errorCode = ''
    loadRequest = null
  }

  async function load(scopeKey, options = {}) {
    const nextScope = String(scopeKey || '')
    if (!nextScope) { clear(); return clonePresets(state) }
    if (state.scopeKey !== nextScope) clear(nextScope)
    if (state.loaded && !options.force) return clonePresets(state)
    if (loadRequest) return loadRequest
    state.loading = true
    state.error = ''
    state.errorCode = ''
    loadRequest = getCurrent().then(function (snapshot) {
      replace(snapshot)
      state.loaded = true
      return clonePresets(state)
    }).catch(function (error) {
      state.error = error?.message || '加载星石预设失败'
      state.errorCode = error?.code || ''
      throw error
    }).finally(function () {
      state.loading = false
      loadRequest = null
    })
    return loadRequest
  }

  async function save(draft) {
    const checked = validatePresetDraft(draft)
    if (!checked.valid) {
      const error = new Error(checked.message)
      error.code = 'star_loadout_preset_invalid_snapshot'
      throw error
    }
    state.saving = true
    state.error = ''
    state.errorCode = ''
    try {
      const response = await putCurrent({
        expected_revision: state.revision,
        main_presets: checked.presets.main.map(toCloudPreset),
        support_presets: checked.presets.support.map(toCloudPreset),
      })
      replace(response)
      state.loaded = true
      return clonePresets(state)
    } catch (error) {
      state.errorCode = error?.code || ''
      state.error = state.errorCode === 'star_loadout_preset_revision_conflict'
        ? '云端预设已被其它页面更新，请保留当前草稿并刷新后再处理。'
        : error?.message || '保存星石预设失败'
      throw error
    } finally {
      state.saving = false
    }
  }

  return { state, load, save, clear, snapshot: function () { return clonePresets(state) } }
}

function toCloudPreset(item) {
  return { id: item.id, name: item.name, star_names: item.names.slice() }
}

export const starLoadoutPresetStore = createStarLoadoutPresetStore()
