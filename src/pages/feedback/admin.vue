<template>
  <div class="feedback-page page-feedback-access">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <div class="feedback-hero-kicker">ADMIN / ACCESS CONTROL</div>
          <div class="feedback-hero-layout">
            <div>
              <h1>反馈权限</h1>
              <p class="hero-sub">配置各板块的新反馈通知接收人，以及可以查看、回复和处理工单的管理员。</p>
            </div>
            <button class="feedback-primary-action feedback-hero-action" type="button" @click="openCreate">
              <Plus :size="18" aria-hidden="true" />
              新增授权
            </button>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <FeedbackWorkspaceNav active="admin" :can-manage="canManageFeedback" can-configure />
          <div class="access-toolbar">
            <label class="access-search">
              <Search :size="18" aria-hidden="true" />
              <input v-model.trim="filter" name="feedback-access-filter" type="search" placeholder="搜索用户名或用户 ID..." aria-label="搜索反馈授权用户" />
            </label>
            <span class="access-count">{{ filteredGrants.length }} 人</span>
            <div class="access-links">
              <router-link v-if="canManageRoles" to="/admin/roles">角色管理</router-link>
              <router-link v-if="canReadAudit" to="/admin/audit">审计记录</router-link>
            </div>
          </div>

          <div v-if="loading" class="state" role="status">正在加载…</div>
          <div v-else-if="error" class="state error" role="alert">{{ error }}</div>
          <div v-else class="access-table-wrap">
            <table class="access-table">
              <thead>
                <tr><th>用户</th><th>接收通知</th><th>管理工单</th><th>最近更新</th><th class="ops">操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="grant in filteredGrants" :key="grant.userId">
                  <td><strong>{{ grant.userName }}</strong><code>{{ grant.userId }}</code></td>
                  <td><span v-for="area in grant.receiveAreas" :key="'r-' + area" class="area-tag">{{ areaLabel(area) }}</span><span v-if="!grant.receiveAreas.length" class="muted">未配置</span></td>
                  <td><span v-for="area in grant.manageAreas" :key="'m-' + area" class="area-tag manage">{{ areaLabel(area) }}</span><span v-if="!grant.manageAreas.length" class="muted">未配置</span></td>
                  <td><strong>{{ grant.updatedBy || '未知用户' }}</strong><small>{{ formatDate(grant.updatedAt) }}</small></td>
                  <td class="ops">
                    <button class="icon-command" type="button" title="编辑授权" :aria-label="'编辑 ' + grant.userName" @click="openEdit(grant)"><Pencil :size="16" /></button>
                    <button class="icon-command danger" type="button" title="删除授权" :aria-label="'删除 ' + grant.userName" @click="removeGrant(grant)"><Trash2 :size="16" /></button>
                  </td>
                </tr>
                <tr v-if="!filteredGrants.length"><td colspan="5" class="empty-row">暂无授权记录</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="editing" class="modal-mask" @click.self="closeEditor">
        <div class="modal access-modal" role="dialog" aria-modal="true" aria-labelledby="access-editor-title" @keydown.esc.prevent="closeEditor">
          <div class="modal-head">
            <h2 id="access-editor-title">{{ form.userName || '新增反馈授权' }}</h2>
            <button type="button" aria-label="关闭" title="关闭" @click="closeEditor"><X :size="20" /></button>
          </div>

          <div class="access-modal-body">
            <div v-if="!form.userId" class="user-picker">
              <label>
                <span>用户</span>
                <input v-model.trim="userQuery" name="feedback-access-user" type="search" placeholder="输入用户名或邮箱" @input="scheduleUserSearch" />
              </label>
              <div v-if="searchingUsers" class="picker-state">正在搜索…</div>
              <div v-else-if="userQuery.trim() && !userResults.length && !editorError" class="picker-state">没有找到已激活用户</div>
              <button v-for="user in userResults" :key="user.id" class="user-result" type="button" @click="selectUser(user)">
                <span>
                  <strong>{{ user.userName || user.user_name }}</strong>
                  <small>{{ user.email || '未提供邮箱' }}</small>
                </span>
                <code>{{ user.id }}</code>
              </button>
            </div>

            <div v-else class="selected-user">
              <span>
                <strong>{{ form.userName }}</strong>
                <small>{{ selectedUser?.email || '未从授权记录返回邮箱' }}</small>
              </span>
              <code>{{ form.userId }}</code>
            </div>

            <fieldset class="permission-group">
              <legend>接收新反馈通知</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'receive-' + area.key" :class="{ on: form.receiveAreas.includes(area.key) }">
                  <input v-model="form.receiveAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="permission-group">
              <legend>查看、回复与处理工单</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'manage-' + area.key" :class="{ on: form.manageAreas.includes(area.key) }">
                  <input v-model="form.manageAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>

            <div v-if="editorError" class="editor-error" role="alert">{{ editorError }}</div>
          </div>
          <div class="modal-foot">
            <button class="command secondary" type="button" @click="closeEditor">取消</button>
            <button class="command primary" type="button" :disabled="saving || !form.userId" @click="saveGrant"><Save :size="17" />{{ saving ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, Save, Search, Trash2, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  deleteFeedbackAccessGrant,
  getFeedbackAccess,
  listFeedbackAccessGrants,
  updateFeedbackAccessGrant
} from '@/api/feedback.js'
import { searchFeedbackAccessUsers } from '@/api/user.js'
import { dialog } from '@/utils/dialog.js'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission } from '@/utils/authPermissions.js'
import '@/styles/feedback-workspace.css'

const DEFAULT_AREAS = [
  { key: 'INVENTORY', label: '库存管理' },
  { key: 'OPERATOR', label: '密探养成' },
  { key: 'LEDGER', label: '广陵账房' },
  { key: 'PLAZA', label: '作业广场' },
  { key: 'ACCOUNT', label: '账号与连接' },
  { key: 'UI', label: '界面与交互' },
  { key: 'OTHER', label: '其他模块' }
]

const grants = ref([])
const areas = ref(DEFAULT_AREAS)
const loading = ref(true)
const error = ref('')
const filter = ref('')
const editing = ref(false)
const saving = ref(false)
const editorError = ref('')
const userQuery = ref('')
const userResults = ref([])
const searchingUsers = ref(false)
const selectedUser = ref(null)
let searchTimer = null
const form = reactive({ userId: '', userName: '', receiveAreas: [], manageAreas: [] })
const router = useRouter()

const canManageFeedback = computed(() => canManageAnyFeedback(auth.adminAccess))
const canManageRoles = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ROLE_MANAGE))
const canReadAudit = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.AUDIT_READ))
const currentUserId = computed(() => {
  const user = auth.userInfo || {}
  return user.id || user.user_id || user.userId || ''
})
const filteredGrants = computed(() => {
  const keyword = filter.value.toLowerCase()
  if (!keyword) return grants.value
  return grants.value.filter(grant => (grant.userName + ' ' + grant.userId).toLowerCase().includes(keyword))
})

function normalizeGrant(grant) {
  return {
    userId: grant.userId || grant.user_id,
    userName: grant.userName || grant.user_name || '未知用户',
    receiveAreas: grant.receiveCategories || grant.receive_categories || grant.receiveAreas || grant.receive_areas || [],
    manageAreas: grant.manageCategories || grant.manage_categories || grant.manageAreas || grant.manage_areas || [],
    updatedBy: grant.updatedBy || grant.updated_by || '',
    updatedAt: grant.updatedAt || grant.updated_at || null
  }
}

function areaLabel(key) {
  return areas.value.find(area => area.key === key)?.label || key
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN') : ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [grantData, accessData] = await Promise.all([listFeedbackAccessGrants(), getFeedbackAccess()])
    grants.value = Array.isArray(grantData) ? grantData.map(normalizeGrant) : []
    const rawAreas = accessData.availableCategories || accessData.available_categories || accessData.availableAreas || accessData.available_areas || []
    if (rawAreas.length) areas.value = rawAreas.map(area => ({ key: area.key, label: area.label }))
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '权限配置加载失败'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.userId = ''
  form.userName = ''
  form.receiveAreas = []
  form.manageAreas = []
  userQuery.value = ''
  userResults.value = []
  selectedUser.value = null
  editorError.value = ''
}

function openCreate() { resetForm(); editing.value = true }
function openEdit(grant) {
  resetForm()
  form.userId = grant.userId
  form.userName = grant.userName
  selectedUser.value = { id: grant.userId, userName: grant.userName, email: '' }
  form.receiveAreas = [...grant.receiveAreas]
  form.manageAreas = [...grant.manageAreas]
  editing.value = true
}
function closeEditor() { if (!saving.value) editing.value = false }

function scheduleUserSearch() {
  clearTimeout(searchTimer)
  userResults.value = []
  editorError.value = ''
  if (!userQuery.value.trim()) return
  searchTimer = setTimeout(runUserSearch, 250)
}

async function runUserSearch() {
  searchingUsers.value = true
  try {
    userResults.value = await searchFeedbackAccessUsers({ q: userQuery.value.trim(), page: 1, size: 10 })
  } catch (e) {
    if (await handleForbidden(e)) return
    editorError.value = e.message || '用户搜索失败'
  } finally {
    searchingUsers.value = false
  }
}

function selectUser(user) {
  form.userId = user.id
  form.userName = user.userName || user.user_name || user.id
  selectedUser.value = { ...user, id: user.id, userName: form.userName }
  userResults.value = []
}

async function saveGrant() {
  if (!form.userId) return
  const confirmed = await dialog.confirm({
    title: '确认反馈授权',
    message: [
      '授权对象',
      '用户名：' + form.userName,
      '邮箱：' + (selectedUser.value?.email || '未从授权记录返回'),
      '用户 ID：' + form.userId,
      '',
      '接收新反馈：' + (form.receiveAreas.map(areaLabel).join('、') || '无'),
      '可管理反馈：' + (form.manageAreas.map(areaLabel).join('、') || '无')
    ].join('\n'),
    confirmText: '确认保存'
  })
  if (!confirmed) return
  saving.value = true
  editorError.value = ''
  try {
    await updateFeedbackAccessGrant(form.userId, form)
    if (form.userId === currentUserId.value) await auth.refreshAdminAccess({ suppressErrors: true })
    await load()
    editing.value = false
  } catch (e) {
    if (await handleForbidden(e)) return
    editorError.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function removeGrant(grant) {
  if (!confirm('删除“' + grant.userName + '”的反馈授权？')) return
  try {
    await deleteFeedbackAccessGrant(grant.userId)
    if (grant.userId === currentUserId.value) await auth.refreshAdminAccess({ suppressErrors: true })
    await load()
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '删除失败'
  }
}

async function handleForbidden(errorValue) {
  if (!errorValue || errorValue.status !== 403) return false
  editing.value = false
  await router.replace({ path: '/forbidden', query: { from: '/feedback/admin' } })
  return true
}

onMounted(load)
onBeforeUnmount(function () { if (searchTimer) clearTimeout(searchTimer) })
</script>

<style scoped>
.page-feedback-access { min-height: 100vh }
.access-toolbar { display: flex; align-items: center; gap: 12px; margin-top: 24px; padding-bottom: 14px }
.access-links { display: inline-flex; gap: 16px; margin-left: auto; font-size: 12px; font-weight: 800 }
.access-links a { color: var(--ink-60); text-decoration: none }
.access-links a:hover { color: var(--accent-strong) }
.access-search { display: flex; align-items: center; gap: 8px; width: min(480px, 55%); padding: 0 12px; height: 48px; border: 1px solid var(--feedback-line-strong); background: var(--feedback-panel-deep); color: var(--feedback-text-dim) }
.access-search:focus-within { border-color: var(--feedback-accent) }
.access-search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--ink) }
.access-search input::placeholder { color: var(--feedback-text-dim) }
.access-count { color: var(--feedback-text-dim); font: 11px var(--font-d) }
.icon-command { width: 36px; height: 36px; display: inline-grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); cursor: pointer }
.icon-command.primary { background: var(--tea); color: var(--cream); border-color: var(--tea) }
.icon-command.danger { color: var(--rouge) }
.state { padding: 40px 0; text-align: center; color: var(--ink-60) }
.state.error,.editor-error { color: var(--rouge) }
.access-table-wrap { overflow-x: auto; margin-bottom: 48px; border: 1px solid var(--feedback-line); border-radius: 8px; box-shadow: 0 16px 36px -32px rgba(73,59,44,.42); scrollbar-gutter: stable }
.access-table { width: 100%; min-width: 760px; border-collapse: collapse; background: var(--feedback-panel) }
.access-table th,.access-table td { padding: 14px 16px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top }
.access-table th { background: var(--tea); color: var(--cream); font-size: 11px }
.access-table tbody tr:hover { background: var(--feedback-panel-hover) }
.access-table td strong,.access-table td code { display: block }
.access-table td small { display: block; margin-top: 4px; color: var(--ink-60); font-size: 11px }
.access-table td code { margin-top: 3px; color: var(--ink-35); font-size: 11px }
.access-table .ops { width: 92px; white-space: nowrap; text-align: right }
.area-tag { display: inline-block; margin: 0 5px 5px 0; padding: 2px 7px; border: 1px solid var(--yellow-deep); border-radius: 5px; background: var(--yellow); color: var(--ink); font-size: 11px; font-weight: 700 }
.area-tag.manage { border-color: var(--brand-blue); background: transparent; color: var(--brand-blue) }
.muted,.empty-row { color: var(--ink-35) }
.access-modal { width: min(640px, calc(100vw - 28px)); max-height: min(760px, calc(100vh - 32px)); overflow-y: auto }
.access-modal-body { padding: 20px }
.user-picker label { display: grid; gap: 6px; color: var(--ink-60); font-size: 12px; font-weight: 700 }
.user-picker input { height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink) }
.picker-state { padding: 10px; color: var(--ink-60); font-size: 12px }
.user-result { width: 100%; display: flex; justify-content: space-between; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer }
.user-result span,.selected-user span { display: grid; gap: 3px; text-align: left }
.user-result small,.selected-user small { color: var(--ink-60); font-size: 11px }
.selected-user { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--line) }
.selected-user code { color: var(--ink-60) }
.permission-group { margin-top: 18px; padding: 0; border: 0 }
.permission-group legend { margin-bottom: 9px; color: var(--ink); font-weight: 800 }
.area-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.area-grid label { min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink-60); cursor: pointer; white-space: nowrap }
.area-grid label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px }
.command { min-height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 16px; border: 1px solid var(--line); border-radius: 7px; font-weight: 700; cursor: pointer }
.command.secondary { background: var(--surface); color: var(--ink) }
.command.primary { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.command:disabled { opacity: .5; cursor: default }
@media (max-width: 720px) {
  .access-toolbar { flex-wrap: wrap }
  .access-search { width: 100%; min-width: 0; flex: 1 1 100% }
  .access-links { margin-left: 0 }
  .area-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .access-table th:nth-child(4),.access-table td:nth-child(4) { display: none }
  .access-modal-body { padding: 16px }
}
</style>
