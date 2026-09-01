<template>
  <div class="page-admin-roles">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb"><span class="pill fill">管理</span><span class="pill">角色</span></div>
          <h1>管理员角色<span class="small">完整替换</span></h1>
          <p class="hero-sub">管理平台管理员与超级管理员的实际角色绑定。</p>
          <div class="hero-stats">
            <div><div class="k">角色绑定</div><div class="v">{{ users.length }}<small>人</small></div></div>
            <div><div class="k">超级管理员</div><div class="v">{{ superAdminCount }}<small>人</small></div></div>
            <div><div class="k">未激活绑定</div><div class="v">{{ inactiveCount }}<small>人</small></div></div>
          </div>
        </div>
      </header>

      <section class="wrap role-content">
        <AdminWorkspaceNav active="admin-roles" />

        <div class="role-toolbar">
          <label class="search-box">
            <Search :size="17" aria-hidden="true" />
            <input v-model.trim="filter" type="search" placeholder="筛选用户名或用户 ID" aria-label="筛选角色绑定" />
          </label>
          <span class="count">{{ filteredUsers.length }} 条</span>
          <button class="icon-command" type="button" title="刷新角色列表" :disabled="loading" @click="load">
            <RefreshCw :size="17" aria-hidden="true" />
          </button>
          <button class="command primary" type="button" @click="openNew">
            <Plus :size="17" aria-hidden="true" />新增角色绑定
          </button>
        </div>

        <div v-if="loading" class="state">正在加载角色绑定…</div>
        <div v-else-if="error" class="state error" role="alert">{{ error }} <button type="button" @click="load">重试</button></div>
        <div v-else class="role-table-wrap">
          <table class="role-table">
            <thead><tr><th>用户</th><th>当前角色</th><th>状态</th><th>首次授予</th><th>最近修改</th><th><span class="sr-only">操作</span></th></tr></thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.userId">
                <td><strong>{{ user.userName || '未知用户' }}</strong><code>{{ user.userId }}</code></td>
                <td><span v-for="role in user.roles" :key="role" class="role-tag" :class="{ super: role === 'SUPER_ADMIN' }">{{ roleLabel(role) }}</span></td>
                <td><span class="status-tag" :class="{ inactive: !user.activated }">{{ user.activated ? '已激活' : '未激活' }}</span></td>
                <td><strong>{{ user.grantedBy || '无' }}</strong><time>{{ formatTime(user.grantedAt) }}</time></td>
                <td><strong>{{ user.updatedBy || '无' }}</strong><time>{{ formatTime(user.updatedAt) }}</time></td>
                <td class="ops"><button class="icon-command" type="button" title="编辑角色" @click="openEdit(user)"><Pencil :size="16" aria-hidden="true" /></button></td>
              </tr>
              <tr v-if="filteredUsers.length === 0"><td colspan="6" class="empty-row">没有匹配的角色绑定</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <Teleport to="body">
        <div v-if="editor" class="modal-layer" role="presentation" @click.self="closeEditor">
          <section class="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-editor-title">
            <header class="modal-head">
              <div><span class="eyebrow">ROLE BINDING</span><h2 id="role-editor-title">{{ editor.isNew ? '新增角色绑定' : '编辑管理员角色' }}</h2></div>
              <button class="icon-command" type="button" title="关闭" :disabled="saving" @click="closeEditor"><X :size="18" aria-hidden="true" /></button>
            </header>

            <div v-if="editor.isNew && !editor.userId" class="user-picker">
              <label for="role-user-search">搜索已激活用户</label>
              <div class="search-box wide"><Search :size="17" aria-hidden="true" /><input id="role-user-search" v-model="candidateQuery" autocomplete="off" placeholder="用户名或完整邮箱" /></div>
              <p v-if="candidateLoading" class="picker-state">正在搜索…</p>
              <p v-else-if="candidateQuery.trim() && !candidates.length" class="picker-state">没有找到已激活用户</p>
              <button v-for="candidate in candidates" :key="candidate.id" class="candidate" type="button" @click="selectCandidate(candidate)">
                <span><strong>{{ candidate.userName }}</strong><small>{{ candidate.email }}</small></span><code>{{ candidate.id }}</code>
              </button>
            </div>

            <template v-else>
              <div class="selected-user">
                <span><strong>{{ editor.userName || '未知用户' }}</strong><small>{{ editor.activated ? '已激活' : '未激活，只能清空现有角色' }}</small></span>
                <code>{{ editor.userId }}</code>
              </div>
              <fieldset class="role-options">
                <legend>实际存储的角色</legend>
                <label v-for="role in ADMIN_ROLES" :key="role" :class="{ selected: editor.roles.includes(role) }">
                  <input v-model="editor.roles" type="checkbox" :value="role" :disabled="saving || (!editor.activated && !editor.roles.includes(role))" />
                  <span><strong>{{ roleLabel(role) }}</strong><small>{{ roleDescription(role) }}</small></span>
                </label>
              </fieldset>
              <p v-if="editorError" class="editor-error" role="alert">{{ editorError }}</p>
              <footer class="modal-actions">
                <button class="command secondary" type="button" :disabled="saving" @click="closeEditor">取消</button>
                <button class="command primary" type="button" :disabled="saving" @click="saveRoles"><Save :size="17" aria-hidden="true" />{{ saving ? '正在保存…' : '保存角色' }}</button>
              </footer>
            </template>
          </section>
        </div>
      </Teleport>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pencil, Plus, RefreshCw, Save, Search, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import AdminWorkspaceNav from '../../components/admin/AdminWorkspaceNav.vue'
import { listAdminRoleUsers, replaceAdminRoles } from '../../api/admin.js'
import { searchFeedbackAccessUsers } from '../../api/user.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, ADMIN_ROLES, hasPermission } from '../../utils/authPermissions.js'
import { dialog } from '../../utils/dialog.js'

const router = useRouter()
const users = ref([])
const loading = ref(true)
const error = ref('')
const filter = ref('')
const editor = ref(null)
const editorError = ref('')
const saving = ref(false)
const candidateQuery = ref('')
const candidates = ref([])
const candidateLoading = ref(false)
let candidateTimer = null
let candidateSequence = 0

const filteredUsers = computed(function () {
  const query = filter.value.toLowerCase()
  if (!query) return users.value
  return users.value.filter(function (user) {
    return user.userName.toLowerCase().includes(query) || user.userId.toLowerCase().includes(query)
  })
})
const superAdminCount = computed(function () { return users.value.filter(function (user) { return user.roles.includes('SUPER_ADMIN') }).length })
const inactiveCount = computed(function () { return users.value.filter(function (user) { return !user.activated }).length })
const currentUserId = computed(function () {
  const user = auth.userInfo || {}
  return user.id || user.user_id || user.userId || ''
})

watch(candidateQuery, function (value) {
  if (candidateTimer) clearTimeout(candidateTimer)
  candidates.value = []
  if (!value.trim()) { candidateLoading.value = false; return }
  candidateTimer = setTimeout(function () { searchCandidates(value) }, 250)
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    users.value = await listAdminRoleUsers()
  } catch (err) {
    if (err && err.status === 403) return leaveAfterPermissionChange()
    error.value = humanError(err, '角色绑定加载失败')
  } finally {
    loading.value = false
  }
}

function openNew() {
  editor.value = { isNew: true, userId: '', userName: '', activated: true, roles: [], originalRoles: [] }
  editorError.value = ''
  candidateQuery.value = ''
  candidates.value = []
}

function openEdit(user) {
  editor.value = { ...user, isNew: false, roles: user.roles.slice(), originalRoles: user.roles.slice() }
  editorError.value = ''
}

function closeEditor() {
  if (saving.value) return
  editor.value = null
  editorError.value = ''
}

function selectCandidate(candidate) {
  editor.value = { isNew: true, userId: candidate.id, userName: candidate.userName, activated: candidate.activated, roles: [], originalRoles: [] }
  candidates.value = []
}

async function searchCandidates(query) {
  const sequence = ++candidateSequence
  candidateLoading.value = true
  try {
    const result = await searchFeedbackAccessUsers({ q: query, page: 1, size: 10 })
    if (sequence === candidateSequence) candidates.value = result.filter(function (candidate) { return candidate.activated })
  } catch (err) {
    if (err && err.status === 403) return leaveAfterPermissionChange()
    if (sequence === candidateSequence) editorError.value = humanError(err, '用户搜索失败')
  } finally {
    if (sequence === candidateSequence) candidateLoading.value = false
  }
}

async function saveRoles() {
  const value = editor.value
  if (!value || !value.userId) return
  if (!value.activated && value.roles.length) {
    editorError.value = '未激活用户不能保留或新增管理员角色'
    return
  }
  const reasons = []
  if (value.roles.length === 0) reasons.push('清空该用户的全部平台角色')
  if (value.originalRoles.includes('SUPER_ADMIN') && !value.roles.includes('SUPER_ADMIN')) reasons.push('回收超级管理员角色')
  if (value.userId === currentUserId.value) reasons.push('修改当前登录用户自己的角色')
  if (reasons.length) {
    const confirmed = await dialog.confirm({
      title: '确认角色变更',
      message: reasons.join('；') + '。保存后权限会立即生效。',
      confirmText: '确认保存',
      cancelText: '取消',
      type: 'danger'
    })
    if (!confirmed) return
  }

  saving.value = true
  editorError.value = ''
  try {
    await replaceAdminRoles(value.userId, value.roles)
    const editedSelf = value.userId === currentUserId.value
    await load()
    if (editedSelf) {
      await auth.refreshAdminAccess({ suppressErrors: true })
      if (!hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ROLE_MANAGE)) return leaveAfterPermissionChange()
    }
    editor.value = null
    editorError.value = ''
  } catch (err) {
    if (err && err.status === 403) return leaveAfterPermissionChange()
    if (err && err.status === 404) {
      editor.value = null
      editorError.value = ''
      await load()
      return
    }
    editorError.value = humanError(err, err && err.status === 409 ? '必须保留至少一名可用的超级管理员' : '角色保存失败')
    if (err && err.status === 409) await load()
  } finally {
    saving.value = false
  }
}

async function leaveAfterPermissionChange() {
  await router.replace({ path: '/forbidden', query: { from: '/admin/roles' } })
}

function roleLabel(role) { return role === 'SUPER_ADMIN' ? '超级管理员' : '平台管理员' }
function roleDescription(role) { return role === 'SUPER_ADMIN' ? '继承平台能力，并管理角色、反馈授权与审计' : '维护公共密探图鉴' }
function formatTime(value) {
  if (!value) return '无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
function humanError(err, fallback) { return err && err.message ? err.message : fallback }

onMounted(load)
onBeforeUnmount(function () { if (candidateTimer) clearTimeout(candidateTimer) })
</script>

<style scoped>
.page-admin-roles { min-height: 100vh }
.page-admin-roles .hero { --wm: '角' }
.role-content { padding-bottom: 56px }
.role-toolbar { display: flex; align-items: center; gap: 10px; padding: 14px 0; border-block: 1px solid var(--line) }
.search-box { min-width: 260px; min-height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--ink-60) }
.search-box input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit }
.search-box.wide { width: 100%; margin-top: 6px }
.count { margin-left: auto; color: var(--ink-60); font-family: var(--font-d); font-size: 12px }
.command,.icon-command { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--line); border-radius: 8px; font-weight: 800; cursor: pointer }
.command { padding: 0 16px }
.icon-command { width: 40px; padding: 0; background: var(--surface); color: var(--ink) }
.command.primary { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.command.secondary { background: var(--surface); color: var(--ink) }
.command:disabled,.icon-command:disabled { opacity: .5; cursor: default }
.state { padding: 52px 0; color: var(--ink-60); text-align: center }
.state.error,.editor-error { color: var(--rouge) }
.role-table-wrap { overflow-x: auto }
.role-table { width: 100%; min-width: 920px; border-collapse: collapse; background: var(--surface) }
.role-table th,.role-table td { padding: 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top }
.role-table th { background: var(--tea); color: var(--cream); font-size: 12px }
.role-table td strong,.role-table td code,.role-table td time { display: block }
.role-table td code,.role-table td time { margin-top: 4px; color: var(--ink-60); font-family: var(--font-d); font-size: 11px }
.role-table .ops { width: 58px; text-align: right }
.role-tag,.status-tag { display: inline-flex; margin: 0 5px 5px 0; padding: 3px 8px; border-radius: 6px; background: var(--yellow); color: var(--ink); font-size: 11px; font-weight: 800 }
.role-tag.super { color: var(--accent-strong); background: transparent; border: 1px solid var(--accent) }
.status-tag { background: rgba(191,220,192,.6) }
.status-tag.inactive { color: var(--rouge); background: rgba(240,207,200,.55) }
.empty-row { color: var(--ink-60); text-align: center !important }
.modal-layer { position: fixed; inset: 0; z-index: 150; display: grid; place-items: center; padding: 16px; background: rgba(73,59,44,.28) }
.role-modal { width: min(620px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 24px 70px rgba(73,59,44,.28) }
.modal-head,.selected-user,.modal-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px }
.eyebrow { color: var(--accent-strong); font-family: var(--font-d); font-size: 11px; font-weight: 800; letter-spacing: .12em }
.modal-head h2 { margin-top: 4px; font-family: var(--font-s); font-size: 22px; font-weight: 900; letter-spacing: 0 }
.user-picker { margin-top: 22px }
.user-picker>label { color: var(--ink-60); font-size: 12px; font-weight: 800 }
.picker-state { padding: 14px 2px; color: var(--ink-60); font-size: 12px }
.candidate { width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; text-align: left }
.candidate span,.selected-user span { display: grid; gap: 3px }
.candidate small,.selected-user small { color: var(--ink-60) }
.candidate code,.selected-user code { color: var(--ink-60); font-family: var(--font-d); font-size: 11px; overflow-wrap: anywhere }
.selected-user { margin-top: 22px; padding: 12px; background: var(--cream); border: 1px solid var(--line); border-radius: 8px }
.role-options { margin-top: 20px; padding: 0; border: 0 }
.role-options legend { margin-bottom: 9px; font-weight: 800 }
.role-options label { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer }
.role-options label.selected { background: rgba(239,210,142,.28); border-color: var(--accent) }
.role-options input { width: 17px; height: 17px; margin-top: 2px; accent-color: var(--accent) }
.role-options span { display: grid; gap: 3px }
.role-options small { color: var(--ink-60); line-height: 1.5 }
.editor-error { margin-top: 14px; font-size: 13px }
.modal-actions { justify-content: flex-end; margin-top: 22px }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0) }
@media (max-width: 720px) {
  .role-toolbar { flex-wrap: wrap }
  .search-box { min-width: 0; flex: 1 1 calc(100% - 50px) }
  .count { order: 3; margin: 0 auto 0 0 }
  .role-toolbar>.command { order: 4 }
}
</style>
