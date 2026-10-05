<template>
  <div class="page-recruitment-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台">← 返回管理工作台</router-link>
          <h1 class="page-header-title">招募卡池管理</h1>
          <p class="page-header-description">维护公共卡池、当前 UP 与历史映射。</p>
        </div>
      </header>

      <div class="wrap catalog-content">
        <p v-if="!permitted" class="card" role="alert">需要招募卡池管理权限。</p>

        <template v-else>
          <p v-if="error" ref="errorSummary" class="card error" role="alert" tabindex="-1">{{ error }}</p>
          <p v-if="notice" class="notice" role="status">{{ notice }}</p>
          <p v-if="loading" class="notice" role="status">正在读取公共卡池和密探图鉴…</p>

          <section v-if="!form" class="catalog-workspace" aria-labelledby="catalog-list-title">
            <header class="workspace-head">
              <div>
                <p class="eyebrow">卡池目录</p>
                <h2 id="catalog-list-title">公共卡池</h2>
                <p class="hint">先找到需要维护的卡池，再进入独立编辑器；列表不会和未保存的表单混在一起。</p>
              </div>
              <button class="primary" type="button" :disabled="loading || importing" @click="openNew">新建卡池</button>
            </header>

            <div class="toolbar" aria-label="卡池筛选">
              <label>游戏
                <select v-model="filterGame">
                  <option value="">全部</option>
                  <option>代号鸢</option>
                  <option>如鸢</option>
                </select>
              </label>
              <label>状态
                <select v-model="filterStatus">
                  <option value="">全部</option>
                  <option value="enabled">已启用</option>
                  <option value="disabled">已停用</option>
                </select>
              </label>
              <label>搜索卡池
                <input v-model.trim="search" type="search" placeholder="名称或 ID">
              </label>
              <button type="button" :disabled="loading || importing" @click="load">刷新目录</button>
            </div>

            <details class="maintenance-tools">
              <summary>高级维护</summary>
              <div class="maintenance-body">
                <div>
                  <strong>批量导入 JSON</strong>
                  <p id="catalog-import-hint" class="hint">只新增数据库中不存在的 pool_id，不覆盖已有卡池；兼容旧目录 JSON 与带 up_agents 的目录 JSON。</p>
                </div>
                <button type="button" :disabled="loading || importing" aria-describedby="catalog-import-hint" @click="openImport">{{ importing ? '导入中…' : '选择 JSON 文件' }}</button>
              </div>
            </details>
            <input ref="importInput" class="file-input" type="file" accept="application/json,.json" @change="importFile">

            <p v-if="!loading && !filteredPools.length" class="card empty-state">没有符合条件的卡池。</p>

            <div v-else class="pool-list">
              <article v-for="pool in filteredPools" :key="pool.pool_id" class="card pool-row">
                <div class="pool-copy">
                  <div class="pool-title-row">
                    <h3>{{ pool.name }}</h3>
                    <span class="status-badge" :class="{ muted: !pool.enabled }">{{ pool.enabled ? '已启用' : '已停用' }}</span>
                  </div>
                  <p class="pool-meta">{{ pool.game }}<template v-if="pool.pool_type"> · {{ pool.pool_type }}</template> · {{ pool.start_date || '开始日期未知' }} — {{ pool.end_date || '结束日期未知' }}</p>
                  <div v-if="activePoolSlots(pool).length" class="up-summary" aria-label="当前 UP">
                    <span v-for="slot in activePoolSlots(pool)" :key="slot.id" class="up-summary-item">
                      <OperatorAvatar class="up-summary-avatar" :avatar="operatorAvatar(operatorById(slot.operator_id))" :name="operatorById(slot.operator_id)?.name || slot.name" :rarity="5" />
                      <span>{{ operatorById(slot.operator_id)?.name || slot.name }}</span>
                    </span>
                  </div>
                  <p v-else class="hint">当前没有启用中的 UP 名额。</p>
                </div>
                <button type="button" :disabled="loading" @click="openEdit(pool)">管理卡池</button>
              </article>
            </div>
          </section>

          <section v-else ref="editor" class="editor-workspace" aria-labelledby="catalog-editor-title" tabindex="-1">
            <div class="editor-topbar">
              <button class="quiet" type="button" :disabled="saving" @click="requestCloseEditor">← 返回卡池目录</button>
              <div class="editor-state">
                <span class="status-badge" :class="{ muted: !form.enabled }">{{ isNew ? '新建卡池' : (form.enabled ? '已启用' : '已停用') }}</span>
                <span v-if="dirty" class="dirty-badge">有未保存修改</span>
                <span v-else class="saved-badge">已保存</span>
              </div>
            </div>

            <header class="editor-header">
              <p class="eyebrow">{{ isNew ? '创建公开卡池' : '维护公开卡池' }}</p>
              <h2 id="catalog-editor-title">{{ form.name || '未命名卡池' }}</h2>
              <p class="hint">{{ isNew ? '填写基础信息并直接添加需要的 UP 名额。' : '修改不会改变既有抽数事实；历史名额的稳定身份会继续保留。' }}</p>
            </header>

            <form @submit.prevent="save">
              <section class="card section-card" aria-labelledby="pool-basic-title">
                <div class="section-head">
                  <div>
                    <h3 id="pool-basic-title">基础信息</h3>
                    <p class="hint">这些字段决定用户在招募档案里看到的卡池名称、类型与有效时间。</p>
                  </div>
                </div>
                <div class="fields">
                  <label>游戏
                    <select v-model="form.game" :disabled="!isNew || saving || form.up_agents.length > 0">
                      <option>代号鸢</option>
                      <option>如鸢</option>
                    </select>
                    <small v-if="isNew && form.up_agents.length">已有 UP 名额时不能切换游戏；先移除这些名额再切换。</small>
                  </label>
                  <label>卡池名称
                    <input v-model.trim="form.name" required maxlength="128" :disabled="saving">
                  </label>
                  <label>卡池类型
                    <input v-model.trim="form.pool_type" maxlength="64" placeholder="如：限时 / 常驻" :disabled="saving">
                  </label>
                  <label>开始日期
                    <input v-model="form.start_date" type="date" :disabled="saving">
                  </label>
                  <label>结束日期
                    <input v-model="form.end_date" type="date" :min="form.start_date" :disabled="saving">
                  </label>
                </div>
              </section>

              <section class="card section-card" aria-labelledby="pool-up-title">
                <div class="section-head">
                  <div>
                    <h3 id="pool-up-title">当前 UP</h3>
                    <p class="hint">直接添加或退役名额，不需要先维护一个“UP 数量”。已绑定图鉴时，展示名称跟随图鉴。</p>
                  </div>
                  <button type="button" :disabled="saving || activeSlots.length >= 120" @click="addSlot">＋ 添加 UP 名额</button>
                </div>

                <p v-if="!activeSlots.length" class="empty-inline">这个卡池目前没有 UP。可以直接添加第一个名额。</p>

                <div class="slot-list">
                  <article v-for="(slot, index) in activeSlots" :key="slot.id" class="up-slot-card">
                    <div class="slot-head">
                      <div class="slot-identity">
                        <OperatorAvatar class="slot-avatar" :avatar="operatorAvatar(operatorById(slot.operator_id))" :name="slotLabel(slot)" :rarity="5" />
                        <div>
                          <span class="slot-index">UP 名额 {{ index + 1 }}</span>
                          <strong>{{ slotLabel(slot) }}</strong>
                          <small>{{ slot.operator_id ? '已对应图鉴，沿用固定历史身份' : '占位密探，可先开放记录后再补图鉴映射' }}</small>
                        </div>
                      </div>
                      <button class="danger ghost" type="button" :disabled="saving" @click="removeOrRetireSlot(slot)">{{ isUnsavedSlot(slot) ? '移除' : '退役' }}</button>
                    </div>

                    <div class="slot-fields">
                      <label>对应图鉴绝密
                        <select v-model="slot.operator_id" :disabled="saving || !!operatorError" @change="selectOperator(slot)">
                          <option value="">暂未进入图鉴，使用占位名称</option>
                          <option v-for="operator in eligibleOperators" :key="operator.id" :value="operator.id">{{ operator.name }}</option>
                          <option v-if="slot.operator_id && !eligibleOperators.some(operator => operator.id === slot.operator_id)" :value="slot.operator_id">{{ slot.name }}（当前图鉴不可用）</option>
                        </select>
                      </label>

                      <label v-if="!slot.operator_id">占位名称
                        <input v-model.trim="slot.name" maxlength="128" :disabled="saving" placeholder="例如：尚未实装密探">
                        <small>只在没有图鉴映射时使用；之后绑定图鉴会自动采用正式名称。</small>
                      </label>
                      <div v-else class="bound-name">
                        <span>展示名称</span>
                        <strong>{{ operatorById(slot.operator_id)?.name || slot.name }}</strong>
                        <small>{{ operatorById(slot.operator_id) ? '名称由图鉴映射提供。' : '当前图鉴不可用，暂时保留已有名称与绑定。' }}</small>
                      </div>
                    </div>

                    <p v-if="attemptedSave && slotIssue(slot)" class="slot-error" role="alert">{{ slotIssue(slot) }}</p>
                  </article>
                </div>

                <p v-if="operatorError" class="inline-warning" role="status">{{ operatorError }}。已有绑定会保留；新的名额可以先使用占位名称。</p>

                <details v-if="retiredSlots.length" class="history-section">
                  <summary>历史名额（{{ retiredSlots.length }}）</summary>
                  <p class="hint">退役名额不会出现在用户的新录入选项中，但既有记录仍引用它们。只有纠正历史展示时才需要修改映射。</p>
                  <article v-for="slot in retiredSlots" :key="slot.id" class="history-slot">
                    <div class="slot-head">
                      <div class="slot-identity compact">
                        <OperatorAvatar class="slot-avatar" :avatar="operatorAvatar(operatorById(slot.operator_id))" :name="slotLabel(slot)" :rarity="5" />
                        <div>
                          <span class="slot-index">已退役</span>
                          <strong>{{ slotLabel(slot) }}</strong>
                          <small>{{ slot.operator_id ? '保留图鉴映射与历史身份' : '历史占位名额' }}</small>
                        </div>
                      </div>
                      <div class="history-actions">
                        <button v-if="canUndoRetire(slot)" type="button" :disabled="saving" @click="undoRetire(slot)">撤销本次退役</button>
                        <button v-else type="button" :disabled="saving" @click="toggleHistoricalEdit(slot)">{{ editingHistoricalSlotId === slot.id ? '完成修正' : '修正历史映射' }}</button>
                      </div>
                    </div>

                    <div v-if="editingHistoricalSlotId === slot.id" class="slot-fields history-fields">
                      <label>对应图鉴绝密
                        <select v-model="slot.operator_id" :disabled="saving || !!operatorError" @change="selectOperator(slot)">
                          <option value="">保持为历史占位</option>
                          <option v-for="operator in eligibleOperators" :key="operator.id" :value="operator.id">{{ operator.name }}</option>
                          <option v-if="slot.operator_id && !eligibleOperators.some(operator => operator.id === slot.operator_id)" :value="slot.operator_id">{{ slot.name }}（当前图鉴不可用）</option>
                        </select>
                      </label>
                      <label v-if="!slot.operator_id">历史显示名称
                        <input v-model.trim="slot.name" maxlength="128" :disabled="saving">
                      </label>
                    </div>
                    <p v-if="attemptedSave && slotIssue(slot)" class="slot-error" role="alert">{{ slotIssue(slot) }}</p>
                  </article>
                </details>
              </section>

              <section class="card section-card status-section" aria-labelledby="pool-status-title">
                <div class="section-head">
                  <div>
                    <h3 id="pool-status-title">卡池状态</h3>
                    <p class="hint">状态会影响用户是否还能添加这个卡池或继续新增记录，不影响已经存在的历史档案。</p>
                  </div>
                </div>
                <fieldset class="status-options">
                  <legend class="visually-hidden">选择卡池状态</legend>
                  <label class="status-option" :class="{ selected: form.enabled }">
                    <input v-model="form.enabled" type="radio" :value="true" :disabled="saving">
                    <span><strong>启用</strong><small>允许用户添加档案并继续新增招募记录。</small></span>
                  </label>
                  <label class="status-option" :class="{ selected: !form.enabled }">
                    <input v-model="form.enabled" type="radio" :value="false" :disabled="saving">
                    <span><strong>停用</strong><small>保留历史，但阻止新的档案和招募记录继续写入。</small></span>
                  </label>
                </fieldset>
                <p v-if="!form.enabled" class="inline-warning">保存后这个卡池将停止接受新的用户录入；已有历史记录和退役名额不会被删除。</p>
              </section>

              <div class="editor-actions" aria-label="卡池编辑操作">
                <span class="save-state">{{ dirty ? '当前修改尚未保存' : '没有待保存修改' }}</span>
                <div>
                  <button type="button" :disabled="saving" @click="requestCloseEditor">取消</button>
                  <button class="primary" type="submit" :disabled="saving || loading || !dirty">{{ saving ? '保存中…' : (isNew ? '创建卡池' : '保存修改') }}</button>
                </div>
              </div>
            </form>
          </section>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { isStandardRecruitmentOperator } from '../../utils/operatorForms.js'

import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import '@/styles/page-header.css'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import operatorPortraits from '../../data/operatorPortraits.json'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { dialog } from '../../utils/dialog.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { createAdminRecruitmentPool, importAdminRecruitmentCatalog, listAdminRecruitmentCatalog, updateAdminRecruitmentPool } from '../../api/recruitment.js'
import { operatorCatalogEntries } from './rules.js'

const router = useRouter()
const pools = ref([])
const operators = ref([])
const loading = ref(false)
const saving = ref(false)
const importing = ref(false)
const error = ref('')
const operatorError = ref('')
const notice = ref('')
const filterGame = ref('')
const filterStatus = ref('')
const search = ref('')
const form = ref(null)
const isNew = ref(false)
const editor = ref(null)
const errorSummary = ref(null)
const importInput = ref(null)
const formBaseline = ref('')
const originalSlotIds = ref(new Set())
const originalActiveSlotIds = ref(new Set())
const originalEnabled = ref(true)
const editingHistoricalSlotId = ref('')
const attemptedSave = ref(false)

const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE))
const filteredPools = computed(() => pools.value.filter(pool => {
  if (filterGame.value && pool.game !== filterGame.value) return false
  if (filterStatus.value === 'enabled' && !pool.enabled) return false
  if (filterStatus.value === 'disabled' && pool.enabled) return false
  const query = search.value.toLowerCase()
  return !query || [pool.name, pool.pool_id].some(value => String(value || '').toLowerCase().includes(query))
}))
const eligibleOperators = computed(() => operators.value.filter(operator => isStandardRecruitmentOperator(operator, form.value?.game)))
const activeSlots = computed(() => form.value?.up_agents.filter(slot => slot.active) || [])
const retiredSlots = computed(() => form.value?.up_agents.filter(slot => !slot.active) || [])
const dirty = computed(() => {
  if (!form.value) return false
  if (isNew.value) return true
  return JSON.stringify(comparableForm(form.value)) !== formBaseline.value
})

const confirmEditorDiscard = useUnsavedChanges(dirty, '卡池修改')
const operatorById = id => operators.value.find(operator => operator.id === id)
const operatorAvatar = operator => operator?.avatar || operator?.avatar_url || operatorPortraits[operator?.id] || ''
const activePoolSlots = pool => pool.up_agents.filter(slot => slot.active)
let generation = 0
let alive = true

const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
const capture = () => ({ generation, identity: identity.value })

function comparableForm(value) {
  if (!value) return null
  return {
    pool_id: value.pool_id,
    game: value.game,
    name: value.name,
    pool_type: value.pool_type || '',
    start_date: value.start_date || '',
    end_date: value.end_date || '',
    enabled: !!value.enabled,
    up_agents: value.up_agents.map(slot => ({
      id: slot.id,
      name: slot.name,
      operator_id: slot.operator_id || '',
      active: !!slot.active,
    })),
  }
}

function resetEditorTracking(pool) {
  const slots = pool?.up_agents || []
  formBaseline.value = JSON.stringify(comparableForm(pool))
  originalSlotIds.value = new Set(slots.map(slot => slot.id))
  originalActiveSlotIds.value = new Set(slots.filter(slot => slot.active).map(slot => slot.id))
  originalEnabled.value = pool?.enabled !== false
  editingHistoricalSlotId.value = ''
  attemptedSave.value = false
}

function closeEditor() {
  form.value = null
  isNew.value = false
  formBaseline.value = ''
  originalSlotIds.value = new Set()
  originalActiveSlotIds.value = new Set()
  originalEnabled.value = true
  editingHistoricalSlotId.value = ''
  attemptedSave.value = false
  error.value = ''
}

async function requestCloseEditor() {
  if (saving.value) return
  if (await confirmEditorDiscard()) closeEditor()
}

function openImport() {
  if (permitted.value && !loading.value && !saving.value && !importing.value) importInput.value?.click()
}

async function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !permitted.value || importing.value) return
  const token = capture()
  importing.value = true
  error.value = ''
  notice.value = ''
  try {
    const document = JSON.parse(await file.text())
    const result = await importAdminRecruitmentCatalog(document)
    if (!current(token)) return
    importing.value = false
    notice.value = `导入完成：新增 ${result.created_count ?? 0} 个，跳过已存在 ${result.skipped_count ?? 0} 个。`
    await load()
  } catch (err) {
    if (!current(token)) return
    importing.value = false
    await showError(err instanceof SyntaxError ? 'JSON 文件格式不正确，请检查后重新选择文件。' : err.message || '卡池导入失败，请检查文件后重试')
  } finally {
    if (current(token)) importing.value = false
  }
}

async function showError(message) {
  error.value = message
  await nextTick()
  errorSummary.value?.focus()
}

async function load() {
  if (!permitted.value) return
  const token = capture()
  const read = ++generation
  token.generation = read
  loading.value = true
  error.value = ''
  operatorError.value = ''
  try {
    const [catalog, operatorResult] = await Promise.all([
      listAdminRecruitmentCatalog(),
      getOperatorCatalog().then(operatorCatalogEntries).catch(err => ({ error: err.message })),
    ])
    if (!current(token)) return
    if (!Array.isArray(catalog?.pools)) throw new Error('公共卡池目录响应无效')
    pools.value = catalog.pools
    operators.value = Array.isArray(operatorResult) ? operatorResult : []
    operatorError.value = operatorResult.error || ''
  } catch (err) {
    if (!current(token)) return
    if (err.status === 403) {
      closeEditor()
      pools.value = []
      await router.replace({ path: '/forbidden', query: { from: '/recruitment/admin' } })
      return
    }
    await showError(err.message || '目录读取失败，请重试')
  } finally {
    if (current(token)) loading.value = false
  }
}

async function focusEditor() {
  await nextTick()
  editor.value?.focus()
}

function openNew() {
  if (!permitted.value) return
  isNew.value = true
  form.value = {
    pool_id: 'pool_' + crypto.randomUUID(),
    game: filterGame.value || '代号鸢',
    name: '',
    pool_type: '',
    start_date: '',
    end_date: '',
    enabled: true,
    revision: 0,
    up_agents: [],
  }
  resetEditorTracking(form.value)
  error.value = ''
  notice.value = ''
  focusEditor()
}

function openEdit(pool) {
  if (!permitted.value) return
  isNew.value = false
  form.value = {
    ...pool,
    pool_type: pool.pool_type || '',
    start_date: pool.start_date || '',
    end_date: pool.end_date || '',
    up_agents: pool.up_agents.map(slot => ({ ...slot, name: slot.name || '', operator_id: slot.operator_id || '' })),
  }
  resetEditorTracking(form.value)
  error.value = ''
  notice.value = ''
  focusEditor()
}

function addSlot() {
  if (!form.value || saving.value) return
  if (activeSlots.value.length >= 120) {
    showError('单个卡池最多保留 120 个启用中的 UP 名额')
    return
  }
  form.value.up_agents.push({
    id: form.value.pool_id + ':up:' + crypto.randomUUID(),
    name: '',
    operator_id: '',
    active: true,
  })
  attemptedSave.value = false
}

function isUnsavedSlot(slot) {
  return !originalSlotIds.value.has(slot.id)
}

function canUndoRetire(slot) {
  return originalActiveSlotIds.value.has(slot.id)
}

async function removeOrRetireSlot(slot) {
  if (!form.value || saving.value) return
  if (isUnsavedSlot(slot)) {
    form.value.up_agents = form.value.up_agents.filter(item => item.id !== slot.id)
    return
  }
  const confirmed = await dialog.confirm({
    title: '退役这个 UP 名额？',
    message: `「${slotLabel(slot)}」退役后将不再提供给新的招募记录选择，但既有记录仍会保留并继续引用这个名额。`,
    type: 'danger',
    confirmText: '确认退役',
    cancelText: '继续保留',
  })
  if (!confirmed) return
  slot.active = false
  editingHistoricalSlotId.value = ''
}

function undoRetire(slot) {
  if (saving.value || !canUndoRetire(slot)) return
  slot.active = true
  editingHistoricalSlotId.value = ''
}

function toggleHistoricalEdit(slot) {
  editingHistoricalSlotId.value = editingHistoricalSlotId.value === slot.id ? '' : slot.id
}

function selectOperator(slot) {
  if (!slot.operator_id) return
  const operator = operatorById(slot.operator_id)
  if (operator) slot.name = operator.name
}

function slotLabel(slot) {
  return operatorById(slot.operator_id)?.name || slot.name || '未命名 UP'
}

function slotIssue(slot) {
  if (!String(slot.name || '').trim()) return '请选择图鉴密探，或填写占位名称。'
  if (slot.active && slot.operator_id) {
    const duplicates = activeSlots.value.filter(item => item.operator_id === slot.operator_id)
    if (duplicates.length > 1) return '同一个启用中的密探不能重复出现在这个卡池。'
  }
  return ''
}

function validateForm() {
  if (!String(form.value?.name || '').trim()) return '请填写卡池名称'
  if (form.value.start_date && form.value.end_date && form.value.end_date < form.value.start_date) return '结束日期不能早于开始日期'
  if (form.value.up_agents.some(slot => slotIssue(slot))) return '请补全或修正标记出的 UP 名额'
  return ''
}

async function save() {
  if (!permitted.value || saving.value || !form.value) return
  attemptedSave.value = true
  const validationError = validateForm()
  if (validationError) {
    await showError(validationError)
    return
  }

  if (!isNew.value && originalEnabled.value && !form.value.enabled) {
    const confirmed = await dialog.confirm({
      title: '停用这个卡池？',
      message: '保存后用户将不能再添加这个卡池或继续新增招募记录；已有历史档案不会删除。',
      type: 'danger',
      confirmText: '确认停用',
      cancelText: '继续编辑',
    })
    if (!confirmed) return
  }

  const token = capture()
  try {
    const body = {
      pool_id: form.value.pool_id,
      game: form.value.game,
      name: form.value.name.trim(),
      pool_type: form.value.pool_type.trim() || null,
      start_date: form.value.start_date || null,
      end_date: form.value.end_date || null,
      enabled: form.value.enabled,
      expected_revision: form.value.revision,
      up_agents: form.value.up_agents.map(slot => ({
        id: slot.id,
        name: slot.name.trim(),
        operator_id: slot.operator_id || null,
        active: slot.active,
      })),
    }
    saving.value = true
    error.value = ''
    notice.value = ''
    const result = isNew.value
      ? await createAdminRecruitmentPool(body)
      : await updateAdminRecruitmentPool(body.pool_id, body)
    if (!current(token)) return

    const index = pools.value.findIndex(pool => pool.pool_id === result.pool_id)
    if (index >= 0) pools.value.splice(index, 1, result)
    else pools.value.unshift(result)
    closeEditor()
    notice.value = '卡池已保存；已有记录继续沿用原来的固定身份。'
  } catch (err) {
    if (!current(token)) return
    await showError(err.status === 409 ? '目录已被其他管理员更新。草稿仍保留，请返回目录刷新后再重新编辑。' : err.message || '保存失败，草稿已保留')
  } finally {
    if (current(token)) saving.value = false
  }
}

watch([identity, permitted], () => {
  generation++
  pools.value = []
  operators.value = []
  form.value = null
  loading.value = false
  saving.value = false
  importing.value = false
  error.value = ''
  notice.value = ''
  formBaseline.value = ''
  originalSlotIds.value = new Set()
  originalActiveSlotIds.value = new Set()
  editingHistoricalSlotId.value = ''
  attemptedSave.value = false
  if (permitted.value) load()
}, { immediate: true, flush: 'sync' })

onScopeDispose(() => {
  alive = false
  generation++
})
</script>

<style scoped>
main{min-width:0}.catalog-content{padding-top:12px;padding-bottom:40px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;min-width:0;overflow-wrap:anywhere}.notice{margin:0 0 14px}.error{color:var(--rouge);margin:0 0 14px}h2,h3{font-family:var(--font-s);margin:0}h2{font-size:26px}h3{font-size:20px}.eyebrow{margin:0 0 5px;font-size:12px;font-weight:800;letter-spacing:.12em;color:var(--ink-60)}.hint,label small,.pool-meta,.slot-identity small,.bound-name small{font-size:13px;font-weight:400;line-height:1.65;color:var(--ink-60)}button,input,select{font:inherit}button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;background:var(--surface);color:var(--ink);cursor:pointer}.primary{background:var(--tea);color:var(--cream)}.quiet{background:transparent}.danger{color:var(--rouge);border-color:rgba(166,81,74,.45)}.ghost{background:transparent}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}label{min-width:0;display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700}input:not([type=radio]),select{width:100%;min-width:0;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px;color:var(--ink);background:var(--cream)}.file-input{display:none}.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

.workspace-head,.section-head,.editor-topbar,.slot-head,.pool-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.workspace-head{margin-bottom:16px}.workspace-head>div,.section-head>div,.pool-copy,.slot-identity>div{min-width:0}.toolbar{border:0;border-radius:0;background:transparent;padding:0;box-shadow:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;margin:18px 0}.toolbar>label:nth-child(3),.toolbar>button{grid-column:1/-1}.maintenance-tools{margin:0 0 18px;border:1px solid var(--line);border-radius:12px;background:rgba(255,253,246,.72)}.maintenance-tools summary{display:flex;align-items:center;min-height:44px;padding:9px 14px;font-weight:700;cursor:pointer}.maintenance-body{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;padding:0 14px 14px}.maintenance-body>div{min-width:0;flex:1}.maintenance-body p{margin:4px 0 0}.empty-state,.empty-inline{margin:14px 0;color:var(--ink-60)}.pool-list{display:grid;gap:12px}.pool-row{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:center}.pool-title-row{justify-content:flex-start;align-items:center}.pool-title-row h3{min-width:0}.pool-meta{margin:5px 0 10px}.status-badge,.dirty-badge,.saved-badge{display:inline-flex;align-items:center;min-height:26px;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:800;white-space:nowrap}.status-badge{background:rgba(239,210,142,.42);color:var(--ink)}.status-badge.muted{background:rgba(73,59,44,.08);color:var(--ink-60)}.dirty-badge{background:rgba(215,137,53,.14);color:var(--accent)}.saved-badge{background:rgba(73,59,44,.08);color:var(--ink-60)}.up-summary{display:flex;flex-wrap:wrap;gap:8px}.up-summary-item{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:4px 10px 4px 4px;border:1px solid var(--line);border-radius:999px;background:var(--cream);font-size:13px}.up-summary :deep(.up-summary-avatar){width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--surface)}.up-summary :deep(.up-summary-avatar img){width:100%;height:100%;max-width:none;object-fit:cover;object-position:center}

.editor-workspace{max-width:980px;margin:0 auto}.editor-topbar{align-items:center;margin-bottom:18px}.editor-state{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.editor-header{margin-bottom:16px}.editor-header h2{font-size:26px;overflow-wrap:anywhere;margin-bottom:6px}.section-card{margin:0 0 16px}.section-head{margin-bottom:16px}.section-head .hint{margin:5px 0 0}.fields{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.slot-list{display:grid;gap:12px}.up-slot-card,.history-slot{border:1px solid var(--line);border-radius:14px;background:var(--cream);padding:14px}.slot-head{align-items:center}.slot-identity{display:flex;align-items:center;gap:12px;min-width:0}.slot-identity strong{display:block;line-height:1.4}.slot-identity small{display:block;margin-top:3px}.slot-index{display:block;margin-bottom:2px;font-size:12px;font-weight:800;color:var(--accent)}.slot-identity :deep(.slot-avatar){width:68px;height:68px;flex:none;overflow:hidden;border-radius:10px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}.slot-identity :deep(.slot-avatar img){display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:center}.slot-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:14px}.bound-name{display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:70px;border:1px dashed var(--line);border-radius:10px;padding:10px 12px;background:var(--surface)}.bound-name>span{font-size:13px;font-weight:700}.slot-error{margin:10px 0 0;color:var(--rouge);font-size:13px;line-height:1.6}.inline-warning{margin:14px 0 0;padding:10px 12px;border-left:3px solid var(--accent);background:rgba(215,137,53,.08);font-size:13px;line-height:1.7}.history-section{margin-top:18px;border-top:1px solid var(--line);padding-top:12px}.history-section summary{display:flex;align-items:center;min-height:44px;font-weight:800;cursor:pointer}.history-section>.hint{margin:0 0 12px}.history-slot{margin-top:10px;background:var(--surface)}.slot-identity.compact :deep(.slot-avatar){width:52px;height:52px}.history-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.history-fields{margin-top:12px}

.status-options{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;border:0;padding:0;margin:0}.status-option{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:flex-start;gap:10px;min-height:72px;margin:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--cream);cursor:pointer}.status-option.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.status-option input{margin-top:4px}.status-option strong,.status-option small{display:block}.status-option small{margin-top:4px}.editor-actions{position:sticky;bottom:max(12px,env(safe-area-inset-bottom));z-index:var(--z-sticky-low);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,253,246,.96);box-shadow:0 10px 28px rgba(73,59,44,.12);backdrop-filter:blur(8px)}.editor-actions>div{display:flex;flex-wrap:wrap;gap:10px}.save-state{font-size:13px;color:var(--ink-60)}

@media(max-width:599px){.workspace-head,.section-head,.slot-head{align-items:stretch;flex-direction:column}.workspace-head>button,.section-head>button,.slot-head>button{width:100%}.pool-row>button{width:100%}.editor-topbar{align-items:flex-start;flex-direction:column}.editor-state{justify-content:flex-start}.slot-identity{align-items:flex-start}.history-actions{justify-content:flex-start;width:100%}.history-actions button{flex:1}.editor-actions{bottom:max(8px,env(safe-area-inset-bottom));align-items:stretch}.editor-actions>div{width:100%}.editor-actions button{flex:1}.save-state{text-align:center}.up-summary-item{max-width:100%}.up-summary-item>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}@media(min-width:600px){.status-options{grid-template-columns:repeat(2,minmax(0,1fr))}.slot-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:768px){.toolbar>label:nth-child(3),.toolbar>button{grid-column:auto}.toolbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,2fr) auto}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.pool-row{grid-template-columns:minmax(0,1fr) auto}}@media(min-width:1024px){.catalog-content{padding-top:12px}.pool-row{padding:18px 20px}}
</style>
