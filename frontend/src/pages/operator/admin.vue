<template>
  <div class="page-operator page-admin-op">
    <IslandSidebar />

    <main id="main-content" class="operator-main">
      <header class="page-header page-header--mobile-context">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
          <h1 class="page-header-title">公共密探图鉴</h1>
          <p class="page-header-description">维护全站公共密探目录与导入校验数据。</p>
        </div>
      </header>

      <section class="catalog-content">
        <div class="wrap">
          <!-- 非管理员 / 未授权提示 -->
          <div v-if="forbidden" class="state err banner" role="alert" v-reveal>
            <b>仅管理员可访问</b>：{{ forbidden }} · 请用管理员账号登录后再试
          </div>

          <!-- 目录管理工具条 -->
          <div v-else v-show="!compact || !editing" class="admin-bar" v-reveal>
            <label class="adm-search-wrap">
              <Search :size="18" aria-hidden="true" />
              <input v-model.trim="search" class="adm-search" type="search" aria-label="搜索密探图鉴" placeholder="搜索名称、别名、ID 或属性" />
            </label>
            <span v-if="!loading && !error" class="result-count" aria-live="polite">{{ filteredRows.length }} 位密探</span>
            <span class="sp"></span>
            <button class="btn ghost" type="button" :disabled="busy || checkingLeave" @click="openNew">
              <Plus :size="17" aria-hidden="true" />
              新增密探
            </button>
          </div>

          <p v-if="!forbidden" v-show="!compact || !editing" class="catalog-summary">共 {{ rows.length }} 位 · SP 形态 {{ spCount }} 位 · <span :class="{ warn: missingOddityCount }">奇闻待维护 {{ missingOddityCount }} 位</span></p>

          <!-- 列表 -->
          <div v-if="loading && !rows.length && !editing" class="state" role="status" aria-live="polite">正在加载密探公共图鉴…</div>
          <div v-if="error" class="state err" role="alert">
             {{ error }}<button class="state-retry" type="button" :disabled="loading || busy || checkingLeave" @click="load">重试</button>
          </div>
          <div v-if="!forbidden" class="catalog-workspace">
            <div v-show="!compact || !editing" ref="listPanel" class="catalog-list" aria-label="公共密探目录列表">
              <p v-if="!loading && !error && !filteredRows.length" class="state">{{ search ? '没有匹配「' + search + '」的密探' : '公共图鉴暂无密探' }}</p>
              <button v-for="r in filteredRows" :key="r.id" class="catalog-row" type="button" :aria-current="editing && !isNew && selectedId === r.id ? 'true' : undefined" :disabled="busy || checkingLeave" @click="openEdit(r)">
                <span class="catalog-row-heading">
                  <img v-if="r.avatar && !failedAvatars.has(catalogAvatarSrc(r.avatar))" class="op-avatar" :src="catalogAvatarSrc(r.avatar)" alt="" loading="lazy" width="40" height="40" @error="failedAvatars.add($event.target.getAttribute('src'))" />
                  <span v-else class="op-ph" :class="'s' + Math.min(5, r.rarity || 5)" aria-hidden="true">{{ monogram(r) }}</span>
                  <span class="op-name"><b>{{ r.name || r.id }}</b><small>{{ r.id }}</small></span>
                  <span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}星</span>
                </span>
                <span class="cell-tag-flow">
                  <span v-for="p in r.prof" :key="'prof-' + p" class="tag-prof" :style="profStyle(p)">{{ p }}</span>
                  <span v-for="career in r.subProf" :key="'career-' + career" class="tag-subprof">{{ subProfLabel(career) }}</span>
                  <span v-for="g in r.games" :key="g" class="tag-station">{{ g }}</span>
                </span>
                <span class="catalog-row-status"><span v-if="r.spOf" class="tag-sp">SP</span><span v-if="!r.specialOddityName || r.incompleteFields.includes('special_oddity_name')" class="oddity-missing">奇闻待维护</span><span>命盘 {{ r.discs.length }} · 星石 {{ r.starStones.length }}</span></span>
              </button>
            </div>
            <OperatorCatalogEditor ref="editor" :rows="rows" :compact="compact" :reload="load" :avatar-src="catalogAvatarSrc" :on-forbidden="leaveIfForbidden" @back="restoreListScroll" @avatar-updated="refreshAvatar" />
            <p v-if="!editing && !compact" class="state editor-empty">{{ loading ? '正在加载密探公共图鉴…' : '选择一位密探，或新增密探' }}</p>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>密探公共图鉴<br><span>管理端</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探公共图鉴管理<br>
          仅具有公共图鉴写入权限的管理员可增删改查 · 与个人密探养成档案隔离<br>
          改动即时生效，请谨慎操作
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, ArrowLeft } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import OperatorCatalogEditor from '../../components/operator/OperatorCatalogEditor.vue'
import '../../styles/page-header.css'
import { listAdminOperatorCatalog } from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { adminCatalogEntries, compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
import { elementAppearance } from '../../data/inventory/elementColors.js'
import { normalizeOperatorOdditySchema } from '../../utils/operatorCombatStats.js'

const rows = ref([])
const router = useRouter()
const loading = ref(true)
const error = ref('')
const forbidden = ref('')
const search = ref('')
const editor = ref(null)
const listPanel = ref(null)
const failedAvatars = ref(new Set())
const avatarVersions = ref(new Map())
const media = window.matchMedia('(max-width: 1080px)')
const compact = ref(media.matches)
const editing = computed(function () { return editor.value?.editing || false })
const isNew = computed(function () { return editor.value?.isNew || false })
const selectedId = computed(function () { return editor.value?.selectedId || '' })
const busy = computed(function () { return editor.value?.busy || false })
const checkingLeave = computed(function () { return editor.value?.checkingLeave || false })
let listScrollY = 0
let listScrollTop = 0
let disposed = false
let permissionRedirect = false

// —— 列表面板 ——
function normalizeRow(r) {
  r = r || {}
  const rawSub = r.sub_prof || r.subProf || []
  const specialOddityName = r.special_oddity_name != null ? r.special_oddity_name : r.specialOddityName
  const odditySchema = normalizeOperatorOdditySchema(r.oddity_schema || r.odditySchema)
  return {
    id: r.id || r.operator_id || r.operatorId || '',
    name: r.name || '',
    alias: r.alias || '',
    rarity: r.rarity != null ? r.rarity : 5,
    prof: Array.isArray(r.prof) ? r.prof : [],
    subProf: Array.isArray(rawSub) ? rawSub : [],
    games: Array.isArray(r.games) ? r.games : [],
    discs: Array.isArray(r.discs) ? r.discs : [],
    starStones: Array.isArray(r.star_stones) ? r.star_stones : (Array.isArray(r.starStones) ? r.starStones : []),
    spOf: r.sp_of || r.spOf || null,
    specialOddityName: String(specialOddityName || '').trim(),
    odditySchema: odditySchema,
    incompleteFields: Array.isArray(r.incomplete_fields) ? r.incomplete_fields : (Array.isArray(r.incompleteFields) ? r.incompleteFields : []),
    avatar: r.avatar || '',
    xinzhi: r.xinzhi || '',
    xinzhiSha256: r.xinzhiSha256 || r.xinzhi_sha256 || '',
    portrait: r.portrait || '',
    portraitSha256: r.portraitSha256 || r.portrait_sha256 || '',
    catalogVersion: r.catalog_version || r.catalogVersion || '',
    createdAt: r.created_at || r.createdAt || null
  }
}

const spCount = computed(function () {
  return rows.value.filter(function (r) { return r.spOf }).length
})
const missingOddityCount = computed(function () {
  return rows.value.filter(function (r) {
    return !r.specialOddityName || r.incompleteFields.indexOf('special_oddity_name') !== -1
  }).length
})

const filteredRows = computed(function () {
  const q = search.value.toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(function (r) {
    const hay = [r.name, r.alias, r.id, r.prof.join(''), r.subProf.join(''), r.specialOddityName, r.specialOddityName ? '' : '待维护'].filter(Boolean).join(' ').toLowerCase()
    return hay.indexOf(q) !== -1
  })
})

function monogram(r) {
  const s = String(r.name || r.id || '?')
  return Array.from(s)[0] || '?'
}

function catalogAvatarSrc(path) {
  const src = avatarUrl(path)
  const version = avatarVersions.value.get(path)
  return version ? src + (src.includes('?') ? '&' : '?') + 'v=' + version : src
}

function refreshAvatar(path) {
  failedAvatars.value.delete(catalogAvatarSrc(path))
  avatarVersions.value.set(path, Date.now())
}

function subProfLabel(value) {
  const text = String(value || '').trim()
  return { shenji: '神纪', guidao: '诡道', pojun: '破军', qihuang: '岐黄', longdun: '龙盾' }[text] || text
}

function profStyle(prof) {
  const appearance = elementAppearance(prof)
  if (!appearance) return null
  return {
    '--element-color': appearance.color,
    '--element-text-color': appearance.darkInk
      ? 'color-mix(in srgb, var(--element-color) 40%, var(--ink))'
      : 'color-mix(in srgb, var(--element-color) 60%, var(--ink))'
  }
}

function rememberListScroll() {
  if (!compact.value || editing.value) return
  listScrollY = window.scrollY
  listScrollTop = listPanel.value?.scrollTop || 0
}

async function openNew() {
  rememberListScroll()
  await editor.value?.openNew()
}

async function openEdit(row) {
  rememberListScroll()
  await editor.value?.openEdit(row)
}

async function restoreListScroll(id) {
  await nextTick()
  if (listPanel.value) listPanel.value.scrollTop = listScrollTop
  window.scrollTo({ top: listScrollY })
  const index = filteredRows.value.findIndex(function (row) { return row.id === id })
  listPanel.value?.querySelectorAll('.catalog-row')[index]?.focus({ preventScroll: true })
}

function onMediaChange(event) {
  if (event.matches) {
    listScrollY = window.scrollY
    listScrollTop = listPanel.value?.scrollTop || 0
  }
  compact.value = event.matches
}

// —— 加载 ——
async function load() {
  loading.value = true
  error.value = ''
  forbidden.value = ''
  try {
    const data = await listAdminOperatorCatalog()
    if (disposed || permissionRedirect) return false
    const entries = adminCatalogEntries(data)
    if (entries === null) throw new Error('管理接口响应格式异常，请刷新后重试')
    rows.value = entries.map(normalizeRow).sort(compareOperatorIdDesc)
    await nextTick()
    if (!compact.value && !editing.value && filteredRows.value.length) await editor.value?.selectRow(filteredRows.value[0])
    return true
  } catch (err) {
    if (disposed || permissionRedirect) return false
    if (err?.status === 403) {
      if (editor.value) await editor.value.leaveIfForbidden(err)
      else await leaveIfForbidden(err)
      return false
    }
    const msg = err && err.message ? err.message : ''
    if (/forbidden|管理|administrator/i.test(msg)) {
      forbidden.value = msg
      rows.value = []
      editor.value?.clearEditor()
    } else {
      error.value = humanErr(err, '公共图鉴加载失败')
    }
    return false
  } finally {
    loading.value = false
  }
}

async function leaveIfForbidden(errorValue) {
  if (!errorValue || errorValue.status !== 403) return false
  permissionRedirect = true
  rows.value = []
  editor.value?.clearEditor()
  await router.replace({ path: '/forbidden', query: { from: '/operator/admin' } })
  return true
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。'
  return msg
}

media.addEventListener('change', onMediaChange)
watch(compact, async function (value) {
  if (!value && !editing.value && filteredRows.value.length) await editor.value?.selectRow(filteredRows.value[0])
})
onBeforeUnmount(function () {
  disposed = true
  media.removeEventListener('change', onMediaChange)
})

load()
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* —— 复用全局 CSS 变量，对齐密探页（operator/index.vue）版式与配色规范 —— */
.catalog-summary { color: var(--ink-60) }
.catalog-summary .warn { color: var(--theme-danger-text, var(--rouge)) }

.banner { background: var(--theme-danger-wash, rgba(166, 81, 74, .08)) }

.admin-bar { border-block: 1px solid var(--line) }
.adm-search-wrap { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-35); background: var(--paper); transition: border-color .25s, box-shadow .25s }
.adm-search-wrap:focus-within { border-color: var(--theme-focus, var(--accent)); box-shadow: 0 0 0 3px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.14) }
.adm-search { border: 0; color: var(--ink); background: transparent; outline: none }
.adm-search::placeholder { color: var(--ink-35) }
.result-count { color: var(--ink-60) }

.catalog-list { background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
.catalog-row { border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--ink); font-family: var(--font-b); cursor: pointer }
.catalog-row:last-child { border-bottom: 0 }
.catalog-row:hover:not(:disabled) { background: var(--cream) }
.catalog-row[aria-current="true"] { background: var(--cream); box-shadow: inset 3px 0 var(--accent) }
.catalog-row:disabled { cursor: not-allowed; opacity: .65 }
.op-ph, :deep(.editor-head-avatar.op-ph) { border-radius: 10px; color: var(--on-strong) }
.op-avatar { border-radius: 10px; background: var(--paper); border: 1.5px solid var(--line) }
.op-ph.s3 { background: var(--yellow-deep); color: var(--ink) }
.op-ph.s4 { background: var(--accent) }
.op-ph.s5 { background: var(--tea) }

.op-name small { color: var(--ink-35) }
.rarity.s3 { color: var(--theme-accent-text, var(--yellow-deep)) }
.rarity.s4 { color: var(--theme-accent-text, var(--accent)) }
.rarity.s5 { color: var(--theme-strong-text, var(--tea)) }
.tag-prof { border: 1px solid var(--element-color, var(--yellow-deep)); border-radius: 6px; background: var(--surface); color: var(--ink); box-shadow: inset 3px 0 var(--element-color, var(--yellow-deep)) }
.tag-subprof { border: 1px solid var(--yellow-deep); border-radius: 6px; background: var(--yellow); color: var(--ink) }
.tag-station { border: 1.5px solid var(--line); color: var(--ink); border-radius: 6px }
.tag-sp { background: var(--tea); color: var(--on-strong); border-radius: 6px }
:deep(.oddity-missing) { color: var(--theme-danger-text, var(--rouge)) }
:deep(.editor-panel .muted) { color: var(--ink-35) }
.catalog-row-status { color: var(--ink-60) }

/* 同页编辑器，保留当前页面主题。 */
:deep(.editor-panel) { background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
:deep(.editor-head-avatar) { border-radius: 12px; background: var(--tea) }
:deep(.editor-head) { border-bottom: 1px dashed var(--line) }
:deep(.editor-head h2) { color: var(--ink) }
:deep(.editor-sub) { color: var(--ink-60) }
:deep(.sp-picker-label) { color: var(--ink-60) }
:deep(.sp-picker-trigger) { border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); cursor: pointer }
:deep(.sp-picker-trigger.sp-missing) { border-color: var(--theme-danger-line, var(--rouge)); color: var(--theme-danger-text, var(--rouge)) }
:deep(.sp-picker-trigger:disabled) { opacity: .45; cursor: not-allowed }
:deep(.sp-picker-trigger:focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
:deep(.sp-picker-empty) { color: var(--ink-35) }
:deep(.sp-picker-avatar), :global(.operator-sp-picker-popup .sp-picker-avatar) { border-radius: 7px; background: var(--paper) }
:deep(.sp-picker-placeholder), :global(.operator-sp-picker-popup .sp-picker-placeholder) { background: var(--tea); color: var(--on-strong) }
:deep(.sp-picker-identity small), :global(.operator-sp-picker-popup .sp-picker-identity small) { color: var(--ink-60) }
:global(.operator-sp-picker-popup) { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); box-shadow: 0 8px 24px rgba(var(--theme-shadow-rgb, 73, 59, 44), .16) }
:global(.operator-sp-picker-search) { border: 1px solid var(--line); border-radius: 7px; background: var(--paper); color: var(--ink) }
:global(.operator-sp-picker-search::placeholder) { color: var(--ink-35); opacity: 1 }
:global(.operator-sp-picker-search:focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 1px }
:global(.operator-sp-picker-option) { border-radius: 7px; cursor: pointer }
:global(.operator-sp-picker-option:hover), :global(.operator-sp-picker-option.active) { background: var(--cream) }
:global(.operator-sp-picker-option.active) { outline: 1px solid var(--theme-focus, var(--accent)); outline-offset: -1px }
:global(.operator-sp-picker-option[aria-selected='true']) { background: var(--cream); box-shadow: inset 3px 0 var(--accent) }
:global(.operator-sp-picker-rarity), :global(.operator-sp-picker-empty) { color: var(--ink-60) }
:deep(.editor-text-button) { border: 0; border-radius: 4px; background: transparent; color: var(--ink-60); cursor: pointer }
:deep(.editor-text-button:disabled) { opacity: .4; cursor: not-allowed }
:deep(.editor-text-button:hover:not(:disabled)) { background: var(--cream); color: var(--ink) }
:deep(.editor-text-button.danger), :deep(.editor-text-button.danger:hover:not(:disabled)) { color: var(--theme-danger-text, var(--rouge)) }
:deep(.aliases-toggle) { color: var(--ink) }
:deep(.aliases-toggle.muted) { color: var(--ink-35) }
:deep(.aliases-toggle[aria-expanded='true']) { background: var(--cream); text-decoration: underline; text-underline-offset: 4px }
:deep(.editor-label) { color: var(--ink) }
:deep(.fields-2col label), :deep(.disc-aliases), :deep(.compact-label) { color: var(--ink-60) }
:deep(.editor-body input:not([type='checkbox']):not([type='radio'])), :deep(.editor-body select), :deep(.editor-body textarea) { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--paper) }
:deep(.editor-body input::placeholder), :deep(.editor-body textarea::placeholder) { color: var(--ink-35); opacity: 1 }
:deep(.editor-body input:focus-visible), :deep(.editor-body select:focus-visible), :deep(.editor-body textarea:focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
:deep(.editor-nav) { border-bottom: 1px solid var(--line) }
:deep(.editor-nav button) { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--ink-60); cursor: pointer }
:deep(.editor-nav button.active) { border-bottom-color: var(--accent); color: var(--ink) }
:deep(.fields-2col input[readonly]) { opacity: .55 }
:deep(.oddity-choice-field) { border: 0; color: var(--ink-60) }
:deep(.oddity-choice-field legend b) { color: var(--theme-danger-text, var(--rouge)) }
:deep(.oddity-choice-grid label) { border: 1.5px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink-60); cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
:deep(.oddity-choice-grid label.on) { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
:deep(.oddity-choice-grid label:focus-within) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
:deep(.oddity-choice-grid input) { accent-color: var(--accent) }
:deep(.oddity-custom-field input) { border: 1.5px solid var(--line); border-radius: 10px; outline: none; background: var(--paper); color: var(--ink); transition: border-color .25s, box-shadow .25s }
:deep(.oddity-custom-field input:focus) { border-color: var(--theme-focus, var(--accent)); box-shadow: 0 0 0 3px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.14) }
:deep(.oddity-custom-field input[aria-invalid="true"]) { border-color: var(--rouge) }
:deep(.editor-panel .field-error) { color: var(--theme-danger-text, var(--rouge)) }
:deep(.oddity-schema-preview dt) { color: var(--ink) }
:deep(.oddity-schema-preview dd) { color: var(--ink-60) }
:deep(.multi-field) { border: 0 }
:deep(.multi-field legend) { color: var(--ink-60) }
:deep(.multi-field legend small) { color: var(--ink-35) }
:deep(.multi-pick label) { border: 1.5px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink-60); cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
:deep(.multi-pick label.on) { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
:deep(.multi-pick label:focus-within) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
:deep(.fields-2col .multi-pick input) { border: 0; background: transparent; accent-color: var(--accent) }
:deep(.multi-pick .prof-option) { border-color: var(--line); border-left: 3px solid var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
:deep(.multi-pick .prof-option.on) { border-color: var(--line); border-left-color: var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
:deep(.multi-pick .prof-option input) { accent-color: var(--element-color, var(--accent)) }
:deep(.games-pick label) { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-60); cursor: pointer; transition: all .25s; background: var(--paper) }
:deep(.games-pick label.on) { background: var(--yellow); color: var(--ink); border-color: var(--yellow-deep) }
:deep(.games-pick input) { accent-color: var(--accent) }
:deep(.disc-editor-item) { border-bottom: 1px solid var(--line) }
:deep(.disc-color-choice[data-color='金']) { --disc-option-color: var(--theme-accent-text, #8a5a1f) }
:deep(.disc-color-choice[data-color='紫']) { --disc-option-color: var(--theme-purple-text, #6d56a0) }
:deep(.disc-color-choice[data-color='蓝']) { --disc-option-color: var(--theme-info-text, #4f6387) }
:deep(.disc-color-choice) { cursor: pointer }
:deep(.disc-color-swatch) { border: 1px solid var(--disc-option-color); border-radius: 6px; background: color-mix(in srgb, var(--disc-option-color) 10%, var(--paper)); color: var(--disc-option-color) }
:deep(.disc-color-input:checked + .disc-color-swatch) { background: var(--disc-option-color); color: var(--surface) }
:deep(.disc-color-input:focus-visible + .disc-color-swatch) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
:deep(.disc-color-input:disabled + .disc-color-swatch) { opacity: .45; cursor: not-allowed }
:deep(.disc-alias-panel) { background: var(--cream); border-radius: 8px }
:deep(.disc-columns), :deep(.stone-columns), :deep(.disc-number) { color: var(--ink-60) }
:deep(.sub-del) { border: none; border-radius: 8px; background: transparent; color: var(--ink-35); cursor: pointer }
:deep(.sub-del:hover) { color: var(--theme-danger-text, var(--rouge)) }
:deep(.editor-panel .hint) { color: var(--ink-35) }

:deep(.editor-notice) { border-radius: 12px; background: var(--theme-success-wash, rgba(167, 209, 169, .25)); color: var(--ink) }
:deep(.editor-notice.err) { background: var(--theme-danger-wash, rgba(166, 81, 74, .1)); color: var(--theme-danger-text, var(--rouge)) }
:deep(.editor-actions) { border-top: 1px solid var(--line); background: var(--surface) }
:deep(.editor-status) { color: var(--ink-60) }
:deep(.avatar-notice) { color: var(--ink) }
:deep(.avatar-notice.err), .btn.danger, :deep(.editor-panel .btn.danger), :deep(.sub-del.danger) { color: var(--theme-danger-text, var(--rouge)) }

.btn, :deep(.editor-panel .btn) { border-radius: 12px; cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled, :deep(.editor-panel .btn:disabled) { opacity: .45; cursor: not-allowed }
:deep(.editor-body:disabled button) { opacity: .45; cursor: not-allowed }
.btn.ghost, :deep(.editor-panel .btn.ghost) { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost.danger, :deep(.editor-panel .btn.ghost.danger) { color: var(--theme-danger-text, var(--rouge)) }
.btn.ghost:hover:not(:disabled), :deep(.editor-panel .btn.ghost:hover:not(:disabled)) { background: var(--cream) }
.btn.primary, :deep(.editor-panel .btn.primary) { background: var(--tea); color: var(--on-strong) }
:deep(.editor-buttons .btn.primary:disabled) { opacity: .4 }
.btn.primary:hover:not(:disabled), :deep(.editor-panel .btn.primary:hover:not(:disabled)) { background: var(--tea-deep) }

.state { color: var(--ink-60); background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.state.err { color: var(--theme-danger-text, var(--rouge)) }
.state-retry { border: 0; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); text-decoration: underline; text-underline-offset: 3px; cursor: pointer }
.state-retry:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px }

.admin-bar button:focus-visible,
.catalog-row:focus-visible,
:deep(.editor-panel button:focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px }

@media (max-width: 1080px) {
  :deep(.disc-editor-item) { background: var(--cream); border: 1px solid var(--line); border-radius: 10px }
  :deep(.disc-alias-panel) { border-top: 1px solid var(--line) }
}
</style>
<style scoped src="./operatorAdminDesktop.css"></style>
<style scoped src="./operatorAdminMobile.css"></style>
