<template>
  <div class="feedback-page feedback-center page-feedback-access">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <h1 class="page-header-title">反馈权限</h1>
          <p class="page-header-description">配置反馈处理范围、通知接收人与授权板块。</p>
        </div>
      </header>

      <section>
        <div class="wrap">
          <FeedbackWorkspaceNav
            active="admin"
            :can-manage="canManageFeedback"
            :has-unread-feedback="canManageFeedback && feedbackUnreadState.count > 0"
            :can-configure="canConfigureFeedback"
          />
          <section class="category-panel" aria-labelledby="category-panel-title">
            <h2 id="category-panel-title">反馈板块</h2>
            <p>用户和管理员使用同一份板块目录。改名不会改变已有反馈或授权的归属。</p>
            <form class="category-create" @submit.prevent="addCategory">
              <label for="new-feedback-category">新增板块</label>
              <input id="new-feedback-category" v-model="newCategoryLabel" maxlength="24" required :disabled="categorySaving || loading || !!error" placeholder="板块名称" />
              <button class="command primary" type="submit" :disabled="categorySaving || loading || !!error || !newCategoryLabel.trim()">新增</button>
            </form>
            <ul v-if="areas.length && !error" class="category-list">
              <li v-for="area in areas" :key="area.key">
                <template v-if="editingCategoryKey === area.key">
                  <input v-model="editingCategoryLabel" :aria-label="'修改 ' + area.label + ' 名称'" maxlength="24" :disabled="categorySaving" @keydown.enter.prevent="saveCategory" @keydown.esc="cancelCategoryEdit" />
                  <button type="button" :disabled="categorySaving || !editingCategoryLabel.trim()" @click="saveCategory">保存</button>
                  <button type="button" :disabled="categorySaving" @click="cancelCategoryEdit">取消</button>
                </template>
                <template v-else>
                  <span>{{ area.label }}</span>
                  <button type="button" :aria-label="'重命名 ' + area.label" :disabled="categorySaving" @click="startCategoryEdit(area)">改名</button>
                </template>
              </li>
            </ul>
            <p v-if="categoryError" class="editor-error" role="alert">{{ categoryError }}</p>
          </section>
          <div class="access-heading">
            <h2 id="access-grants-title">用户授权</h2>
            <button class="feedback-primary-action access-create" type="button" @click="openCreate">
              <Plus :size="18" aria-hidden="true" />新增授权
            </button>
          </div>
          <div class="access-toolbar" role="group" aria-labelledby="access-grants-title">
            <label class="access-search">
              <Search :size="18" aria-hidden="true" />
              <input v-model.trim="filter" name="feedback-access-filter" type="search" placeholder="搜索用户名或用户 ID..." aria-label="搜索反馈授权用户" />
            </label>
            <span class="access-count">{{ filteredGrants.length }} 人</span>
          </div>

          <div v-if="loading" class="state" role="status">正在加载…</div>
          <div v-else-if="error" class="state error" role="alert">{{ error }}</div>
          <div v-else class="access-table-wrap">
            <table class="access-table">
              <thead>
                <tr><th>用户</th><th>反馈岗位</th><th>运营板块</th><th>程序板块</th><th>通知 / 兼容授权</th><th>最近更新</th><th class="ops">操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="grant in filteredGrants" :key="grant.userId">
                  <td><strong>{{ grant.userName }}</strong><code>{{ grant.userId }}</code></td>
                  <td>{{ grant.feedbackRoles.map(roleLabel).join('、') || '未设置' }}</td>
                  <td><span v-for="area in grant.operatorAreas" :key="'o-' + area" class="area-tag manage">{{ areaLabel(area) }}</span><span v-if="!grant.operatorAreas.length" class="muted">未配置</span></td>
                  <td><span v-for="area in grant.developerAreas" :key="'d-' + area" class="area-tag manage">{{ areaLabel(area) }}</span><span v-if="!grant.developerAreas.length" class="muted">未配置</span></td>
                  <td><small>接收：{{ grant.receiveAreas.map(areaLabel).join('、') || '无' }}</small><small>管理：{{ grant.manageAreas.map(areaLabel).join('、') || '无' }}</small></td>
                  <td><strong>{{ grant.updatedBy || '未知用户' }}</strong><small>{{ formatDate(grant.updatedAt) }}</small></td>
                  <td class="ops">
                    <button class="icon-command" type="button" title="编辑授权" :aria-label="'编辑 ' + grant.userName" @click="openEdit(grant)"><Pencil :size="16" /></button>
                    <button class="icon-command danger" type="button" title="删除授权" :aria-label="'删除 ' + grant.userName" @click="removeGrant(grant)"><Trash2 :size="16" /></button>
                  </td>
                </tr>
                <tr v-if="!filteredGrants.length"><td colspan="7" class="empty-row">暂无授权记录</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="editing" class="modal-mask" @click.self="closeEditor">
        <div ref="editorPanel" class="modal access-modal" role="dialog" aria-modal="true" aria-labelledby="access-editor-title" tabindex="-1">
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

            <fieldset class="permission-group" :disabled="saving">
              <legend>反馈岗位</legend>
              <div class="area-grid">
                <label v-for="role in ['OPERATOR', 'DEVELOPER']" :key="role" :class="{ on: form.feedbackRoles.includes(role) }">
                  <input v-model="form.feedbackRoles" type="checkbox" :value="role" />
                  <span>{{ role === 'OPERATOR' ? '运营岗' : '程序岗' }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="permission-group" :disabled="saving || !form.feedbackRoles.includes('OPERATOR')">
              <legend>运营负责板块</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'operator-' + area.key" :class="{ on: form.operatorAreas.includes(area.key) }">
                  <input v-model="form.operatorAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="permission-group" :disabled="saving || !form.feedbackRoles.includes('DEVELOPER')">
              <legend>程序负责板块</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'developer-' + area.key" :class="{ on: form.developerAreas.includes(area.key) }">
                  <input v-model="form.developerAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>

            <div class="access-preview" aria-label="授权范围预览">
              <p>工作台运营板块：{{ form.feedbackRoles.includes('OPERATOR') ? form.operatorAreas.map(areaLabel).join('、') || '无' : '无' }}；程序板块：{{ form.feedbackRoles.includes('DEVELOPER') ? form.developerAreas.map(areaLabel).join('、') || '无' : '无' }}。</p>
              <p>新反馈通知：{{ form.receiveAreas.map(areaLabel).join('、') || '无' }}；兼容管理授权：{{ form.manageAreas.map(areaLabel).join('、') || '无' }}。</p>
              <p>工作台按岗位和负责板块授权；程序岗可查看转程序及已交回的工单。通知接收与兼容管理分别生效，不会自动授予工作台岗位，也不会覆盖岗位板块。</p>
            </div>

            <details class="legacy-permissions">
              <summary>通知与兼容授权</summary>
            <fieldset class="permission-group" :disabled="saving">
              <legend>接收新反馈通知</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'receive-' + area.key" :class="{ on: form.receiveAreas.includes(area.key) }">
                  <input v-model="form.receiveAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="permission-group" :disabled="saving">
              <legend>兼容管理授权（旧接口）</legend>
              <div class="area-grid">
                <label v-for="area in areas" :key="'manage-' + area.key" :class="{ on: form.manageAreas.includes(area.key) }">
                  <input v-model="form.manageAreas" type="checkbox" :value="area.key" />
                  <span>{{ area.label }}</span>
                </label>
              </div>
            </fieldset>
            </details>

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
import { useModalFocus } from '@/composables/useModalFocus.js'
import { Pencil, Plus, Save, Search, Trash2, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  createFeedbackCategory,
  deleteFeedbackAccessGrant,
  getFeedbackAccess,
  listFeedbackAccessGrants,
  renameFeedbackCategory,
  updateFeedbackAccessGrant
} from '@/api/feedback.js'
import { searchFeedbackAccessUsers } from '@/api/user.js'
import { dialog } from '@/utils/dialog.js'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission } from '@/utils/authPermissions.js'
import { feedbackUnreadState } from '@/store/feedbackUnread.js'
import '@/styles/feedback-workspace.css'
import '@/styles/page-header.css'

const grants = ref([])
const areas = ref([])
const newCategoryLabel = ref('')
const editingCategoryKey = ref('')
const editingCategoryLabel = ref('')
const categorySaving = ref(false)
const categoryError = ref('')
const loading = ref(true)
const error = ref('')
const filter = ref('')
const editing = ref(false)
const editorPanel = ref(null)
const saving = ref(false)
const editorError = ref('')
const userQuery = ref('')
const userResults = ref([])
const searchingUsers = ref(false)
const selectedUser = ref(null)
let searchTimer = null
let searchRequestId = 0
let loadRequestId = 0
let isMounted = false
const form = reactive({ userId: '', userName: '', receiveAreas: [], manageAreas: [], feedbackRoles: [], operatorAreas: [], developerAreas: [] })
const router = useRouter()
useModalFocus(() => editing.value, editorPanel, {
  initialFocus: () => editorPanel.value?.querySelector('input:not(:disabled), button'),
  onEscape: closeEditor
})

function roleLabel(role) {
  return { OPERATOR: '运营岗', DEVELOPER: '程序岗' }[role] || role
}

const currentUserId = computed(() => {
  const user = auth.userInfo || {}
  return user.id || user.user_id || user.userId || ''
})
const canManageFeedback = computed(() => canManageAnyFeedback(auth.adminAccess))
const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
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
    feedbackRoles: grant.feedbackRoles || grant.feedback_roles || [],
    operatorAreas: grant.operatorAreas || grant.operator_areas || [],
    developerAreas: grant.developerAreas || grant.developer_areas || [],
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

function startCategoryEdit(area) {
  editingCategoryKey.value = area.key
  editingCategoryLabel.value = area.label
  categoryError.value = ''
}

function cancelCategoryEdit() {
  editingCategoryKey.value = ''
  editingCategoryLabel.value = ''
}

async function addCategory() {
  const label = newCategoryLabel.value.trim()
  if (!label || categorySaving.value) return
  categorySaving.value = true
  categoryError.value = ''
  try {
    await createFeedbackCategory(label)
    newCategoryLabel.value = ''
    await load()
  } catch (e) {
    if (!await handleForbidden(e)) categoryError.value = e.message || '新增板块失败'
  } finally {
    categorySaving.value = false
  }
}

async function saveCategory() {
  const label = editingCategoryLabel.value.trim()
  if (!label || !editingCategoryKey.value || categorySaving.value) return
  categorySaving.value = true
  categoryError.value = ''
  try {
    await renameFeedbackCategory(editingCategoryKey.value, label)
    cancelCategoryEdit()
    await load()
  } catch (e) {
    if (!await handleForbidden(e)) categoryError.value = e.message || '修改板块失败'
  } finally {
    categorySaving.value = false
  }
}

async function load() {
  if (!isMounted) return
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  try {
    const [grantData, accessData] = await Promise.all([listFeedbackAccessGrants(), getFeedbackAccess()])
    if (!isMounted || requestId !== loadRequestId) return
    grants.value = Array.isArray(grantData) ? grantData.map(normalizeGrant) : []
    const rawAreas = accessData.availableCategories || accessData.available_categories || accessData.availableAreas || accessData.available_areas || []
    if (!rawAreas.length) throw new Error('反馈板块目录为空')
    areas.value = rawAreas.map(area => ({ key: area.key, label: area.label }))
  } catch (e) {
    if (await handleForbidden(e)) return
    if (isMounted && requestId === loadRequestId) error.value = e.message || '权限配置加载失败'
  } finally {
    if (isMounted && requestId === loadRequestId) loading.value = false
  }
}

function resetForm() {
  cancelUserSearch()
  form.userId = ''
  form.userName = ''
  form.receiveAreas = []
  form.manageAreas = []
  form.feedbackRoles = []
  form.operatorAreas = []
  form.developerAreas = []
  userQuery.value = ''
  userResults.value = []
  selectedUser.value = null
  editorError.value = ''
}

function openCreate() { if (!saving.value) { resetForm(); editing.value = true } }
function openEdit(grant) {
  if (saving.value) return
  resetForm()
  form.userId = grant.userId
  form.userName = grant.userName
  selectedUser.value = { id: grant.userId, userName: grant.userName, email: '' }
  form.receiveAreas = [...grant.receiveAreas]
  form.manageAreas = [...grant.manageAreas]
  form.feedbackRoles = [...grant.feedbackRoles]
  form.operatorAreas = [...grant.operatorAreas]
  form.developerAreas = [...grant.developerAreas]
  editing.value = true
}
function closeEditor() {
  if (saving.value) return
  editing.value = false
  cancelUserSearch()
}

function cancelUserSearch() {
  searchRequestId += 1
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = null
  searchingUsers.value = false
  userResults.value = []
}

function scheduleUserSearch() {
  cancelUserSearch()
  editorError.value = ''
  const keyword = userQuery.value.trim()
  if (!keyword || saving.value) return
  const requestId = searchRequestId
  searchingUsers.value = true
  searchTimer = setTimeout(() => runUserSearch(requestId, keyword), 250)
}

async function runUserSearch(requestId, keyword) {
  if (!isMounted || !editing.value || requestId !== searchRequestId) return
  try {
    const users = await searchFeedbackAccessUsers({ q: keyword, page: 1, size: 10 })
    if (isMounted && editing.value && requestId === searchRequestId) userResults.value = users
  } catch (e) {
    if (!isMounted || requestId !== searchRequestId || await handleForbidden(e)) return
    editorError.value = e.message || '用户搜索失败'
  } finally {
    if (requestId === searchRequestId) searchingUsers.value = false
  }
}

function selectUser(user) {
  if (saving.value) return
  cancelUserSearch()
  form.userId = user.id
  form.userName = user.userName || user.user_name || user.id
  selectedUser.value = { ...user, id: user.id, userName: form.userName }
  userResults.value = []
}

async function saveGrant() {
  if (!form.userId || saving.value || !isMounted) return
  const actorId = currentUserId.value
  const grant = {
    ...form,
    receiveAreas: [...form.receiveAreas], manageAreas: [...form.manageAreas],
    feedbackRoles: [...form.feedbackRoles],
    operatorAreas: form.feedbackRoles.includes('OPERATOR') ? [...form.operatorAreas] : [],
    developerAreas: form.feedbackRoles.includes('DEVELOPER') ? [...form.developerAreas] : []
  }
  const email = selectedUser.value?.email || '未从授权记录返回'
  saving.value = true
  editorError.value = ''
  try {
    const confirmed = await dialog.confirm({
      title: '确认反馈授权',
      message: [
        '授权对象',
        '用户名：' + grant.userName,
        '邮箱：' + email,
        '用户 ID：' + grant.userId,
        '',
        '接收新反馈：' + (grant.receiveAreas.map(areaLabel).join('、') || '无'),
        '旧管理授权：' + (grant.manageAreas.map(areaLabel).join('、') || '无'),
        '反馈岗位：' + (grant.feedbackRoles.map(roleLabel).join('、') || '无'),
        '运营板块：' + (grant.operatorAreas.map(areaLabel).join('、') || '无'),
        '程序板块：' + (grant.developerAreas.map(areaLabel).join('、') || '无')
      ].join('\n'),
      confirmText: '确认保存'
    })
    if (!confirmed || !isMounted || currentUserId.value !== actorId) return
    await updateFeedbackAccessGrant(grant.userId, grant)
    if (!isMounted || currentUserId.value !== actorId) return
    if (grant.userId === currentUserId.value) {
      await auth.refreshAdminAccess({ suppressErrors: true })
      if (!hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE)) return leaveAfterPermissionChange()
    }
    await load()
    editing.value = false
  } catch (e) {
    if (!isMounted || currentUserId.value !== actorId || await handleForbidden(e)) return
    editorError.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function removeGrant(grant) {
  if (!confirm('删除“' + grant.userName + '”的反馈授权？')) return
  try {
    await deleteFeedbackAccessGrant(grant.userId)
    if (grant.userId === currentUserId.value) {
      await auth.refreshAdminAccess({ suppressErrors: true })
      if (!hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE)) return leaveAfterPermissionChange()
    }
    await load()
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '删除失败'
  }
}

async function handleForbidden(errorValue) {
  if (!isMounted || !errorValue || errorValue.status !== 403) return false
  editing.value = false
  cancelUserSearch()
  await router.replace({ path: '/forbidden', query: { from: '/feedback/admin' } })
  return true
}

async function leaveAfterPermissionChange() {
  await router.replace({ path: '/forbidden', query: { from: '/feedback/admin' } })
}

onMounted(() => { isMounted = true; load() })
onBeforeUnmount(() => { isMounted = false; loadRequestId += 1; cancelUserSearch() })
</script>

<style scoped>
.page-feedback-access { min-height: 100vh; min-height: 100dvh }
.category-panel { margin-top: 24px; padding: 20px; border: 1px solid var(--feedback-line-strong); background: var(--feedback-panel-deep) }
.category-panel h2 { margin: 0 0 6px; font-size: 18px }
.category-panel p { margin: 0 0 14px; color: var(--feedback-text-dim) }
.category-create, .category-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 10px }
.category-create input, .category-list input { min-height: 40px; padding: 0 10px; border: 1px solid var(--feedback-line-strong); background: var(--surface); color: var(--ink) }
.category-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; padding: 0; list-style: none }
.category-list li { padding: 7px 10px; border: 1px solid var(--feedback-line-strong) }
.category-list button { min-height: 32px; border: 0; background: transparent; color: var(--feedback-accent); cursor: pointer }
.category-list button:disabled { opacity: .5; cursor: default }
.access-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px }
.access-heading h2 { margin: 0; color: var(--tea); font: 900 22px/1.4 var(--font-s) }
.access-create { flex: none; min-height: 44px; white-space: nowrap }
.access-toolbar { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding-bottom: 14px }
.access-search { display: flex; align-items: center; gap: 8px; width: min(480px, 55%); padding: 0 12px; height: 48px; border: 1px solid var(--feedback-line-strong); background: var(--feedback-panel-deep); color: var(--feedback-text-dim) }
.access-search:focus-within { border-color: var(--feedback-accent) }
.access-search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--ink) }
.access-search input::placeholder { color: var(--feedback-text-dim) }
.access-count { color: var(--feedback-text-dim); font: 11px var(--font-d) }
.icon-command { width: 44px; height: 44px; display: inline-grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); cursor: pointer }
.icon-command.primary { background: var(--tea); color: var(--cream); border-color: var(--tea) }
.icon-command.danger { color: var(--rouge) }
.state { padding: 40px 0; text-align: center; color: var(--ink-60) }
.state.error,.editor-error { color: var(--rouge) }
.access-table-wrap { overflow-x: auto; margin-bottom: 48px; border: 1px solid var(--feedback-line); border-radius: 8px; box-shadow: 0 16px 36px -32px rgba(73,59,44,.42); scrollbar-gutter: stable }
.access-table { width: 100%; min-width: 980px; border-collapse: collapse; background: var(--feedback-panel) }
.access-preview { margin-top: 16px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.access-preview p + p { margin-top: 8px }
.legacy-permissions { margin-top: 14px }
.legacy-permissions summary { display: list-item; min-height: 44px; padding-block: 12px; color: var(--ink); font-weight: 700; cursor: pointer }
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
.access-modal { width: min(640px, calc(100vw - 28px)); max-height: min(760px, calc(100vh - 32px)); max-height: min(760px, calc(100dvh - 32px)); overflow-y: auto }
.access-modal-body { padding: 20px }
.user-picker label { display: grid; gap: 6px; color: var(--ink-60); font-size: 12px; font-weight: 700 }
.user-picker input { height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink) }
.picker-state { padding: 10px; color: var(--ink-60); font-size: 12px }
.user-result { width: 100%; display: flex; justify-content: space-between; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer }
.user-result span,.selected-user span { display: grid; gap: 3px; text-align: left }
.user-result small,.selected-user small { color: var(--ink-60); font-size: 11px }
.selected-user { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--line) }
.selected-user code { color: var(--ink-60) }
.permission-group { margin-top: 18px; padding: 0; border: 0 }
.permission-group legend { margin-bottom: 9px; color: var(--ink); font-weight: 800 }
.area-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.area-grid label { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink-60); cursor: pointer; white-space: nowrap }
.area-grid label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px }
.command { min-height: 44px; display: inline-flex; align-items: center; gap: 7px; padding: 0 16px; border: 1px solid var(--line); border-radius: 7px; font-weight: 700; cursor: pointer }
.command.secondary { background: var(--surface); color: var(--ink) }
.command.primary { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.command:disabled { opacity: .5; cursor: default }
@media (max-width: 720px) {
  .access-toolbar { flex-wrap: wrap }
  .access-search { width: 100%; min-width: 0; flex: 1 1 100% }
  .area-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .access-table th:nth-child(5),.access-table td:nth-child(5),.access-table th:nth-child(6),.access-table td:nth-child(6) { display: none }
  .access-modal-body { padding: 16px }
}
</style>
