<template>
  <div class="page-recruitment-access">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台">← 返回管理工作台</router-link>
          <h1 class="page-header-title">招募档案访问</h1>
          <p class="page-header-description">管理开放模式与有限访问名单。</p>
        </div>
      </header>

      <section class="wrap access-content">
        <p v-if="error" ref="errorSummary" class="state error" role="alert" tabindex="-1">{{ error }}</p>
        <p v-if="notice" class="state success" role="status">{{ notice }}</p>
        <div v-if="loading" class="state" role="status">正在读取访问配置…</div>

        <template v-else>
          <section class="mode-card" aria-labelledby="access-mode-title">
            <div class="section-heading">
              <div><h2 id="access-mode-title">开放模式</h2></div>
              <span class="mode-badge" :class="{ public: config.accessMode === 'PUBLIC' }">{{ config.accessMode === 'PUBLIC' ? '公开访问' : '有限访问' }}</span>
            </div>
            <div class="mode-options" role="radiogroup" aria-label="招募档案开放模式">
              <button type="button" class="mode-option" :class="{ selected: config.accessMode === 'LIMITED' }" :aria-pressed="config.accessMode === 'LIMITED'" :disabled="savingMode" @click="changeMode('LIMITED')">
                <LockKeyhole :size="22" aria-hidden="true" />
                <span><strong>有限访问</strong><small>仅下方明确授权的账号可以进入，用于内部测试。</small></span>
              </button>
              <button type="button" class="mode-option" :class="{ selected: config.accessMode === 'PUBLIC' }" :aria-pressed="config.accessMode === 'PUBLIC'" :disabled="savingMode" @click="changeMode('PUBLIC')">
                <Globe2 :size="22" aria-hidden="true" />
                <span><strong>公开访问</strong><small>所有已登录且账号正常的 YuanHub 用户都可以进入。</small></span>
              </button>
            </div>
            <p class="mode-note">切换到公开访问不会删除测试名单；以后切回有限访问时，名单继续生效。</p>
          </section>

          <section class="grant-card" aria-labelledby="grant-title">
            <div class="section-heading">
              <div><h2 id="grant-title">有限访问名单</h2></div>
              <span class="count">{{ config.grants.length }} 人</span>
            </div>
            <p v-if="config.accessMode === 'PUBLIC'" class="public-note">当前为公开访问，名单暂不参与访问判定，但会保留。</p>

            <label class="user-search">
              <span>添加测试用户</span>
              <span class="search-field"><Search :size="17" aria-hidden="true" /><input v-model.trim="query" type="search" autocomplete="off" placeholder="用户名或完整邮箱" /></span>
            </label>
            <p v-if="searching" class="picker-state">正在搜索…</p>
            <p v-else-if="query && !candidates.length" class="picker-state">没有找到可添加的已激活用户</p>
            <div v-if="candidates.length" class="candidate-list" aria-label="用户搜索结果">
              <button v-for="candidate in candidates" :key="candidate.id" type="button" class="candidate" :disabled="grantingId === candidate.id || grantedIds.has(candidate.id)" @click="grant(candidate)">
                <span><strong>{{ candidate.userName }}</strong><small>{{ candidate.email || candidate.id }}</small></span>
                <em>{{ grantedIds.has(candidate.id) ? '已授权' : grantingId === candidate.id ? '添加中…' : '授权访问' }}</em>
              </button>
            </div>

            <div v-if="config.grants.length" class="grant-list">
              <article v-for="grant in config.grants" :key="grant.userId" class="grant-row">
                <div class="grant-user"><strong>{{ grant.userName }}</strong><code>{{ grant.userId }}</code><small>{{ grant.activated ? '已激活' : '账号当前不可用' }} · 授权于 {{ formatTime(grant.grantedAt) }}</small></div>
                <button type="button" class="danger" :disabled="revokingId === grant.userId" @click="revoke(grant)"><Trash2 :size="15" aria-hidden="true" />{{ revokingId === grant.userId ? '移除中…' : '移除权限' }}</button>
              </article>
            </div>
            <div v-else class="empty-state"><UserRoundCheck :size="22" aria-hidden="true" /><span><strong>还没有测试用户</strong><small>有限访问模式下，没有被加入名单的普通用户无法进入招募档案。</small></span></div>
          </section>
        </template>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Globe2, LockKeyhole, Search, Trash2, UserRoundCheck } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import '@/styles/page-header.css'
import { getAdminRecruitmentAccess, grantRecruitmentAccess, revokeRecruitmentAccess, searchRecruitmentAccessUsers, updateRecruitmentAccessMode } from '../../api/recruitmentAccess.js'
import { recruitmentAccess } from '../../store/recruitmentAccess.js'
import { dialog } from '../../utils/dialog.js'

const loading = ref(true)
const savingMode = ref(false)
const searching = ref(false)
const grantingId = ref('')
const revokingId = ref('')
const error = ref('')
const notice = ref('')
const errorSummary = ref(null)
const query = ref('')
const candidates = ref([])
const config = ref({ accessMode: 'LIMITED', version: 0, grants: [] })
let searchTimer = null
let searchSequence = 0
const grantedIds = computed(() => new Set(config.value.grants.map(item => item.userId)))

watch(query, value => {
  clearTimeout(searchTimer)
  candidates.value = []
  if (!value.trim()) { searching.value = false; return }
  searchTimer = setTimeout(() => searchUsers(value), 250)
})

async function showError(message) {
  error.value = message
  await nextTick()
  errorSummary.value?.focus()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    config.value = await getAdminRecruitmentAccess()
  } catch (err) {
    await showError(err?.message || '访问配置读取失败')
  } finally {
    loading.value = false
  }
}

async function changeMode(mode) {
  if (savingMode.value || mode === config.value.accessMode) return
  const confirmed = await dialog.confirm({
    title: mode === 'PUBLIC' ? '确认正式公开招募档案？' : '确认切回有限访问？',
    message: mode === 'PUBLIC'
      ? '切换后，所有已登录且账号正常的用户都可以访问招募档案。测试名单会保留。'
      : '切换后，只有有限访问名单中的用户可以继续访问。未授权用户会立即被拒绝。',
    confirmText: mode === 'PUBLIC' ? '确认公开' : '确认限制访问',
    cancelText: '取消',
    type: mode === 'PUBLIC' ? 'info' : 'danger'
  })
  if (!confirmed) return
  savingMode.value = true
  error.value = ''; notice.value = ''
  try {
    config.value = await updateRecruitmentAccessMode(mode, config.value.version)
    recruitmentAccess.invalidate()
    notice.value = mode === 'PUBLIC' ? '招募档案已切换为公开访问' : '招募档案已切换为有限访问'
  } catch (err) {
    if (err?.status === 409) await load()
    await showError(err?.message || '开放模式保存失败')
  } finally {
    savingMode.value = false
  }
}

async function searchUsers(value) {
  const sequence = ++searchSequence
  searching.value = true
  try {
    const result = await searchRecruitmentAccessUsers({ q: value, page: 1, size: 10 })
    if (sequence === searchSequence) candidates.value = result.filter(item => item.activated)
  } catch (err) {
    if (sequence === searchSequence) await showError(err?.message || '用户搜索失败')
  } finally {
    if (sequence === searchSequence) searching.value = false
  }
}

async function grant(candidate) {
  if (!candidate?.id || grantedIds.value.has(candidate.id) || grantingId.value) return
  grantingId.value = candidate.id
  error.value = ''; notice.value = ''
  try {
    const saved = await grantRecruitmentAccess(candidate.id)
    config.value = { ...config.value, grants: [...config.value.grants.filter(item => item.userId !== saved.userId), saved].sort((a, b) => a.userName.localeCompare(b.userName, 'zh-CN')) }
    notice.value = '已为 ' + saved.userName + ' 开通招募档案访问'
  } catch (err) {
    await showError(err?.message || '授权失败')
  } finally {
    grantingId.value = ''
  }
}

async function revoke(grant) {
  if (!grant?.userId || revokingId.value) return
  const confirmed = await dialog.confirm({
    title: '移除招募档案权限？',
    message: '移除后，有限访问模式下 ' + grant.userName + ' 将无法继续访问招募档案。',
    confirmText: '移除权限',
    cancelText: '取消',
    type: 'danger'
  })
  if (!confirmed) return
  revokingId.value = grant.userId
  error.value = ''; notice.value = ''
  try {
    await revokeRecruitmentAccess(grant.userId)
    config.value = { ...config.value, grants: config.value.grants.filter(item => item.userId !== grant.userId) }
    notice.value = '已移除 ' + grant.userName + ' 的招募档案权限'
  } catch (err) {
    await showError(err?.message || '移除权限失败')
  } finally {
    revokingId.value = ''
  }
}

function formatTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

onMounted(load)
onBeforeUnmount(() => { clearTimeout(searchTimer); searchSequence++ })
</script>

<style scoped>
main{min-width:0}.access-content{padding-top:0;padding-bottom:36px}.state,.mode-card,.grant-card{margin:14px 0;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.state.error{color:var(--rouge)}.state.success{color:var(--tea)}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.section-heading h2{margin:2px 0 0;font-family:var(--font-s);font-size:23px}.section-kicker{color:var(--accent-strong);font-size:11px;font-weight:800;letter-spacing:.12em}.mode-badge,.count{flex:none;border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:var(--cream);font-size:12px;font-weight:800}.mode-badge.public{border-color:var(--accent);color:var(--accent-strong)}.mode-options{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.mode-option{display:flex;min-height:76px;align-items:center;gap:12px;padding:13px;text-align:left}.mode-option>svg{flex:none;color:var(--ink-60)}.mode-option span{display:grid;min-width:0;gap:4px}.mode-option strong{font-size:15px}.mode-option small,.mode-note,.public-note,.grant-user small,.empty-state small{color:var(--ink-60);font-size:12px;line-height:1.6}.mode-option.selected{border-color:var(--accent);background:var(--cream);box-shadow:inset 0 0 0 1px var(--accent)}.mode-option.selected>svg{color:var(--accent-strong)}.mode-note{margin:11px 0 0}.public-note{margin:-2px 0 14px;padding:9px 11px;border-radius:10px;background:var(--cream)}.user-search{display:grid;gap:7px;margin:14px 0 8px;font-size:13px;font-weight:800}.search-field{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 11px;border:1px solid var(--line);border-radius:10px;background:var(--cream)}.search-field svg{flex:none;color:var(--ink-60)}.search-field input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit}.picker-state{margin:8px 0;color:var(--ink-60);font-size:12px}.candidate-list{display:grid;gap:7px;margin:8px 0 18px}.candidate{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;text-align:left}.candidate span,.grant-user{display:grid;min-width:0;gap:2px}.candidate small{color:var(--ink-60);font-size:11px;overflow-wrap:anywhere}.candidate em{flex:none;color:var(--accent-strong);font-size:11px;font-style:normal;font-weight:800}.grant-list{display:grid;gap:9px}.grant-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--cream)}.grant-user strong,.candidate strong{overflow-wrap:anywhere}.grant-user code{font-size:10px;overflow-wrap:anywhere;color:var(--ink-60)}.danger{display:inline-flex;align-items:center;gap:6px;flex:none;color:var(--rouge)}.empty-state{display:flex;align-items:center;gap:12px;padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--ink-60)}.empty-state span{display:grid;gap:3px}.empty-state strong{color:var(--ink)}button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 13px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(min-width:768px){.mode-card,.grant-card{padding:20px}.mode-options{grid-template-columns:repeat(2,minmax(0,1fr))}.candidate-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.grant-row{align-items:stretch;flex-direction:column}.grant-row .danger{width:100%;justify-content:center}.section-heading{align-items:flex-start}.mode-badge,.count{margin-top:2px}}
</style>
