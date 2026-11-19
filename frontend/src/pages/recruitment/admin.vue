<template>
  <div class="page-recruitment-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
          <h1 class="page-header-title">招募卡池管理</h1>
          <p class="page-header-description">维护公共卡池、当前 UP 与历史映射。</p>
        </div>
      </header>

      <div class="wrap catalog-content">
        <p v-if="!permitted" class="card" role="alert">需要招募卡池管理权限。</p>

        <template v-else>
          <p v-if="listError" ref="listErrorSummary" class="card error" role="alert" tabindex="-1">{{ listError }}</p>
          <p v-if="notice" class="notice" role="status">{{ notice }}</p>
          <p v-if="loading" class="notice" role="status">正在读取公共卡池和密探图鉴…</p>

          <section v-show="showDirectory" class="catalog-controls" aria-labelledby="catalog-list-title">
            <header class="workspace-head">
              <div>
                <h2 id="catalog-list-title">公共卡池</h2>
              </div>
              <button ref="newButton" class="primary" type="button" :disabled="loading || importing || saving" @click="openPool()">新建卡池</button>
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
                  <option value="enabled">正常</option>
                  <option value="disabled">已停用</option>
                  <option value="hidden">已隐藏</option>
                </select>
              </label>
              <label class="pool-search">搜索卡池
                <input v-model.trim="search" type="search" placeholder="名称或 ID">
              </label>
              <button type="button" :disabled="loading || importing || saving" @click="load()">刷新目录</button>
            </div>

            <details class="maintenance-tools">
              <summary>高级维护</summary>
              <div class="maintenance-body">
                <div>
                  <strong>批量导入 JSON</strong>
                  <p id="catalog-import-hint" class="hint">只新增数据库中不存在的 pool_id，不覆盖已有卡池；兼容旧目录 JSON 与带 up_agents 的目录 JSON。</p>
                </div>
                <button type="button" :disabled="loading || importing || saving" aria-describedby="catalog-import-hint" @click="openImport">{{ importing ? '导入中…' : '选择 JSON 文件' }}</button>
              </div>
            </details>
            <input ref="importInput" class="file-input" type="file" accept="application/json,.json" @change="importFile">
          </section>

          <div class="catalog-workspace">
            <section v-show="showDirectory" ref="listRegion" class="pool-list" aria-label="卡池目录列表" tabindex="-1">
              <p v-if="!loading && !listError && !filteredPools.length" class="card empty-state">没有符合条件的卡池。</p>
              <button v-for="pool in filteredPools" :key="pool.pool_id" :ref="element => rememberPoolRow(pool.pool_id, element)"
                class="card pool-row" type="button" :aria-current="selectedPoolId === pool.pool_id ? 'true' : undefined"
                :disabled="loading || importing || saving" @click="openPool(pool)">
                <span class="pool-title-row">
                  <strong>{{ pool.name }}</strong>
                  <span class="status-badge" :class="{ muted: pool.hidden || !pool.enabled }">{{ statusLabel(pool) }}</span>
                </span>
                <span class="pool-meta">{{ pool.game }} · {{ recruitmentPoolType(pool.pool_type).label }} · {{ recruitmentPoolDateLabel(pool) }}</span>
                <span v-if="activePoolSlots(pool).length" class="up-summary" role="group" aria-label="当前 UP">
                  <span v-for="slot in activePoolSlots(pool)" :key="slot.id" class="up-summary-item">
                    <img v-if="operatorAvatar(operatorById(slot.operator_id))" class="up-summary-avatar"
                      :src="avatarUrl(operatorAvatar(operatorById(slot.operator_id)))" alt="" loading="lazy">
                    <span v-else class="up-summary-avatar" aria-hidden="true">{{ Array.from(slotLabel(slot))[0] }}</span>
                    <span class="up-summary-name">{{ slotLabel(slot) }}</span>
                  </span>
                </span>
                <span v-else class="hint">当前没有启用中的 UP 名额。</span>
              </button>
            </section>

            <section v-if="form" ref="editor" class="editor-workspace" aria-labelledby="catalog-editor-title" tabindex="-1">
              <div :key="form.pool_id" class="editor-body">
                <div class="editor-topbar">
                  <button v-if="compact" class="quiet" type="button" :disabled="saving" @click="requestCloseEditor"><ArrowLeft :size="16" aria-hidden="true" /> 返回卡池目录</button>
                  <div class="editor-state">
                    <span class="status-badge" :class="{ muted: form.hidden || !form.enabled }">{{ isNew ? '新建卡池' : statusLabel(form) }}</span>
                    <span v-if="dirty" class="dirty-badge">有未保存修改</span>
                    <span v-else class="saved-badge">已保存</span>
                  </div>
                </div>

                <header class="editor-header">
                  <p class="eyebrow">{{ isNew ? '创建公开卡池' : '维护公开卡池' }}</p>
                  <h2 id="catalog-editor-title">{{ form.name || '未命名卡池' }}</h2>
                  <p v-if="!isNew" class="hint">修改不会改变既有抽数事实；历史名额的稳定身份会继续保留。</p>
                </header>

                <p v-if="error" ref="errorSummary" class="card error" role="alert" tabindex="-1">{{ error }}</p>
                <section v-if="conflict" class="card conflict-panel" aria-label="版本冲突核对">
                  <p role="status">草稿仍在编辑器中。先读取最新目录核对；不会覆盖其他管理员的修改。</p>
                  <button type="button" :disabled="saving || loading || importing" @click="readLatest">读取最新版本供核对</button>
                  <div v-if="latestPool">
                    <p>服务器版本 {{ latestPool.revision }} · {{ statusLabel(latestPool) }}</p>
                    <p>{{ latestPool.name }} · {{ latestPool.pool_type || '类型未填' }} · {{ recruitmentPoolDateLabel(latestPool) }}</p>
                    <p>UP：{{ latestPool.up_agents.map(slot => slot.name + (slot.active ? '' : '（已退役）')).join('、') || '无' }}</p>
                    <p class="hint">核对后可复制需保留的草稿，再取消编辑、刷新目录并重新打开卡池。</p>
                  </div>
                </section>
                <form id="catalog-editor-form" @submit.prevent="save">
                  <section class="card section-card" aria-labelledby="pool-basic-title">
                    <div class="section-head">
                      <div>
                        <h3 id="pool-basic-title">基础信息</h3>
                        <p class="hint">这些字段决定用户在招募档案里看到的卡池名称、类型与有效时间。</p>
                      </div>
                    </div>
                    <p v-if="!isNew" class="hint identity-hint">卡池 ID：{{ form.pool_id }}。所属游戏和 ID 不可修改；录错时先隐藏错误卡池，再新建正确卡池。</p>
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
                        <input v-model.trim="form.pool_type" maxlength="64" placeholder="如：限定 / 常驻" :disabled="saving">
                      </label>
                      <label class="wish-mode"><span><input v-model="form.allow_custom_up" type="checkbox" :disabled="saving"> 允许自选心愿 UP</span>
                        <small>用户可从本游戏全部绝密密探中选2位，各账号独立保存；开启后个人心愿替代下方固定 UP。</small>
                      </label>
                      <label class="wish-mode"><span><input v-model="form.allow_cumulative_choice" type="checkbox" :disabled="saving"> 允许累抽自选（每 300 抽一次，最多 3 次）</span>
                        <small>用户可按 300/600/900 档标记本游戏绝密密探，允许重复选择，各账号独立保存，不计入抽卡统计。</small>
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
                        <p class="hint">已关联密探的名称随图鉴更新。</p>
                      </div>
                      <button type="button" :disabled="saving || activeSlots.length >= 120" @click="addSlot"><Plus :size="16" aria-hidden="true" /> 添加 UP 名额</button>
                    </div>

                    <p v-if="!activeSlots.length" class="empty-inline">这个卡池目前没有 UP。</p>

                    <div class="slot-list">
                      <article v-for="(slot, index) in activeSlots" :key="slot.id" class="up-slot-card">
                        <div class="slot-head">
                          <div class="slot-identity">
                            <OperatorAvatar class="slot-avatar" :avatar="operatorAvatar(operatorById(slot.operator_id))" :name="slotLabel(slot)" :rarity="Number(operatorById(slot.operator_id)?.rarity) || 5" />
                            <div>
                              <span class="slot-index">UP 名额 {{ index + 1 }}</span>
                              <strong>{{ slotLabel(slot) }}</strong>
                              <small>{{ slot.operator_id ? '已对应图鉴，沿用固定历史身份' : '占位密探，可先开放记录后再补图鉴映射' }}</small>
                            </div>
                          </div>
                          <button class="danger ghost" type="button" :disabled="saving" @click="removeOrRetireSlot(slot)">{{ isUnsavedSlot(slot) ? '移除' : '退役' }}</button>
                        </div>

                        <div class="slot-fields">
                          <label>对应图鉴密探（4星/5星/照影SP）
                            <select v-model="slot.operator_id" :disabled="saving || !!operatorError || originalBoundSlotIds.has(slot.id)" @change="selectOperator(slot)">
                              <option value="">暂未进入图鉴，使用占位名称</option>
                              <option v-for="operator in eligibleOperators" :key="operator.id" :value="operator.id">{{ operator.name }}</option>
                              <option v-if="slot.operator_id && !eligibleOperators.some(operator => operator.id === slot.operator_id)" :value="slot.operator_id">{{ slot.name }}（当前图鉴不可用）</option>
                            </select>
                          </label>

                          <label v-if="!slot.operator_id">占位名称
                            <input v-model.trim="slot.name" maxlength="128" :disabled="saving || !isUnsavedSlot(slot)" placeholder="例如：尚未实装密探">
                            <small>已保存名称保留历史身份；首次绑定图鉴沿用原名额，错配请退役再新增。</small>
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
                      <p class="hint">退役名额不会出现在用户的新录入选项中，但既有记录仍引用它们。已绑定图鉴的历史身份不可换绑；错配请保留旧名额，添加正确的新名额。</p>
                      <article v-for="slot in retiredSlots" :key="slot.id" class="history-slot">
                        <div class="slot-head">
                          <div class="slot-identity compact">
                            <OperatorAvatar class="slot-avatar" :avatar="operatorAvatar(operatorById(slot.operator_id))" :name="slotLabel(slot)" :rarity="Number(operatorById(slot.operator_id)?.rarity) || 5" />
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
                          <label>对应图鉴密探（4星/5星/照影SP）
                            <select v-model="slot.operator_id" :disabled="saving || !!operatorError || originalBoundSlotIds.has(slot.id)" @change="selectOperator(slot)">
                              <option value="">保持为历史占位</option>
                              <option v-for="operator in eligibleOperators" :key="operator.id" :value="operator.id">{{ operator.name }}</option>
                              <option v-if="slot.operator_id && !eligibleOperators.some(operator => operator.id === slot.operator_id)" :value="slot.operator_id">{{ slot.name }}（当前图鉴不可用）</option>
                            </select>
                          </label>
                          <label v-if="!slot.operator_id">历史显示名称
                            <input v-model.trim="slot.name" maxlength="128" :disabled="saving || !isUnsavedSlot(slot)">
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
                        <p class="hint">停用仍显示；隐藏移出公共列表。两者都不删除已有历史。</p>
                      </div>
                    </div>
                    <fieldset class="status-options">
                      <legend class="visually-hidden">选择卡池状态</legend>
                      <label v-for="option in statusOptions" :key="option.value" class="status-option" :class="{ selected: poolState === option.value }">
                        <input v-model="poolState" type="radio" :value="option.value" :disabled="saving">
                        <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
                      </label>
                    </fieldset>
                    <p v-if="form.hidden" class="inline-warning">保存后从普通用户公共列表移除；已有个人池、记录和进度保留，可维护和导出，但不能新增出货。</p>
                    <p v-else-if="!form.enabled" class="inline-warning">保存后卡池仍显示，但不能新增出货；已有历史可以继续维护。</p>
                  </section>
                </form>
              </div>
              <footer class="editor-actions" aria-label="卡池编辑操作">
                <div class="save-state">
                  <span>{{ dirty ? '当前修改尚未保存' : '没有待保存修改' }}</span>
                  <p v-if="saveNotice" role="status">{{ saveNotice }}</p>
                </div>
                <div class="editor-buttons">
                  <button type="button" :disabled="saving" @click="requestCloseEditor">取消</button>
                  <button class="primary" type="submit" form="catalog-editor-form" :disabled="saving || loading || importing || conflict || !dirty">{{ saving ? '保存中…' : (isNew ? '创建卡池' : '保存修改') }}</button>
                </div>
              </footer>
            </section>
            <p v-else-if="!compact" class="card editor-empty">选择左侧卡池进行编辑，或新建卡池</p>
          </div>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { ArrowLeft, Plus } from '@lucide/vue'
import { isRecruitmentOperator } from '../../utils/operatorForms.js'

import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useViewportTier } from '@/composables/useViewportTier.js'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import '@/styles/page-header.css'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { resolveOperatorPortrait } from '../../utils/operatorPortrait.js'
import { isPermanentRecruitmentPool, recruitmentPoolDateLabel, recruitmentPoolType } from '../../data/recruitmentPoolTypes.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { dialog } from '../../utils/dialog.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import { avatarUrl } from '../../api/request.js'
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
const listError = ref('')
const operatorError = ref('')
const notice = ref('')
const saveNotice = ref('')
const filterGame = ref('')
const filterStatus = ref('')
const search = ref('')
const form = ref(null)
const isNew = ref(false)
const selectedPoolId = computed(() => isNew.value ? '' : form.value?.pool_id)
const { isCompactNav: compact } = useViewportTier()
const showDirectory = computed(() => !compact.value || !form.value)
const editor = ref(null)
const errorSummary = ref(null)
const listErrorSummary = ref(null)
const listRegion = ref(null)
const newButton = ref(null)
const importInput = ref(null)
const formBaseline = ref('')
const originalSlotIds = ref(new Set())
const originalBoundSlotIds = ref(new Set())
const originalActiveSlotIds = ref(new Set())
const originalEnabled = ref(true)
const originalHidden = ref(false)
const conflict = ref(false)
const latestPool = ref(null)
const statusOptions = [
  { value: 'enabled', label: '正常显示', description: '公共时间线显示，允许新增招募记录。' },
  { value: 'disabled', label: '停用但显示', description: '仍在时间线显示，仅维护已有历史，不新增出货。' },
  { value: 'hidden', label: '隐藏', description: '无个人历史的用户不再看到；已有历史保留，仅可维护。' },
]
const stateOf = pool => pool.hidden ? 'hidden' : pool.enabled ? 'enabled' : 'disabled'
const statusLabel = pool => statusOptions.find(option => option.value === stateOf(pool)).label
const poolState = computed({
  get: () => stateOf(form.value),
  set: value => {
    form.value.hidden = value === 'hidden'
    if (value !== 'hidden') form.value.enabled = value === 'enabled'
  },
})
const editingHistoricalSlotId = ref('')
const attemptedSave = ref(false)

const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE))
const filteredPools = computed(() => pools.value.filter(pool => {
  if (filterGame.value && pool.game !== filterGame.value) return false
  if (filterStatus.value && stateOf(pool) !== filterStatus.value) return false
  const query = search.value.toLowerCase()
  return !query || [pool.name, pool.pool_id].some(value => String(value || '').toLowerCase().includes(query))
}).sort((a, b) => Number(isPermanentRecruitmentPool(b)) - Number(isPermanentRecruitmentPool(a))))
const eligibleOperators = computed(() => operators.value.filter(operator => isRecruitmentOperator(operator, form.value?.game)))
const activeSlots = computed(() => form.value?.up_agents.filter(slot => slot.active) || [])
const retiredSlots = computed(() => form.value?.up_agents.filter(slot => !slot.active) || [])
const dirty = computed(() => {
  if (!form.value) return false
  if (isNew.value) return true
  return JSON.stringify(comparableForm(form.value)) !== formBaseline.value
})

const confirmEditorDiscard = useUnsavedChanges(dirty, '卡池修改')
const operatorById = id => operators.value.find(operator => operator.id === id)
const operatorAvatar = operator => operator?.avatar || operator?.avatar_url || resolveOperatorPortrait(operator?.id, operator)
const activePoolSlots = pool => pool.up_agents.filter(slot => slot.active)
let generation = 0
let alive = true
let returnPoolId = ''
let listScrollY = 0
const poolRows = new Map()

function rememberPoolRow(id, element) {
  if (element) poolRows.set(id, element)
  else poolRows.delete(id)
}

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
    hidden: !!value.hidden,
    allow_custom_up: !!value.allow_custom_up,
    allow_cumulative_choice: !!value.allow_cumulative_choice,
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
  originalBoundSlotIds.value = new Set(slots.filter(slot => slot.operator_id).map(slot => slot.id))
  originalActiveSlotIds.value = new Set(slots.filter(slot => slot.active).map(slot => slot.id))
  originalEnabled.value = pool?.enabled !== false
  originalHidden.value = !!pool?.hidden
  conflict.value = false
  latestPool.value = null
  editingHistoricalSlotId.value = ''
  attemptedSave.value = false
}

function resetEditor() {
  returnPoolId = ''
  form.value = null
  isNew.value = false
  resetEditorTracking(null)
  error.value = ''
  saveNotice.value = ''
}

async function closeEditor() {
  const poolId = returnPoolId
  const token = capture()
  resetEditor()
  await nextTick()
  if (!current(token) || form.value) return
  const row = poolRows.get(poolId)
  if (compact.value) {
    if (row) row.scrollIntoView?.({ block: 'center', behavior: 'instant' })
    else window.scrollTo({ top: listScrollY, behavior: 'instant' })
  }
  const target = poolId ? row : newButton.value
  const focusTarget = target && !target.disabled ? target : listRegion.value
  focusTarget?.focus({ preventScroll: true })
}

async function requestCloseEditor() {
  if (saving.value) return
  const token = capture()
  const draft = form.value
  if (await confirmEditorDiscard() && current(token) && !saving.value && form.value === draft) await closeEditor()
}

function openImport() {
  if (permitted.value && !loading.value && !saving.value && !importing.value) importInput.value?.click()
}

async function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !permitted.value || loading.value || saving.value || importing.value) return
  const token = capture()
  importing.value = true
  listError.value = ''
  notice.value = ''
  try {
    const document = JSON.parse(await file.text())
    if (!current(token)) return
    const result = await importAdminRecruitmentCatalog(document)
    if (!current(token)) return
    importing.value = false
    notice.value = `导入完成：新增 ${result.created_count ?? 0} 个，跳过已存在 ${result.skipped_count ?? 0} 个。`
    await load()
  } catch (err) {
    if (!current(token)) return
    importing.value = false
    await showListError(err instanceof SyntaxError ? 'JSON 文件格式不正确，请检查后重新选择文件。' : err.message || '卡池导入失败，请检查文件后重试', token)
  } finally {
    if (current(token)) importing.value = false
  }
}

async function showError(message) {
  error.value = message
  await nextTick()
  errorSummary.value?.focus()
}

async function showListError(message, token) {
  listError.value = message
  await nextTick()
  if (current(token) && showDirectory.value && !saving.value) listErrorSummary.value?.focus()
}

async function load() {
  if (!permitted.value || loading.value) return
  const token = capture()
  const read = ++generation
  token.generation = read
  loading.value = true
  listError.value = ''
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
    return catalog.pools
  } catch (err) {
    if (!current(token)) return
    if (err.status === 403) {
      resetEditor()
      pools.value = []
      await router.replace({ path: '/forbidden', query: { from: '/recruitment/admin' } })
      return
    }
    await showListError(err.message || '目录读取失败，请重试', token)
  } finally {
    if (current(token)) loading.value = false
  }
}

async function openPool(pool) {
  if (!permitted.value || saving.value || loading.value || importing.value) return
  const token = capture()
  const draft = form.value
  if (!pool || pool.pool_id !== selectedPoolId.value) {
    if (!await confirmEditorDiscard() || !current(token) || form.value !== draft || saving.value || loading.value || importing.value) return
    if (compact.value && !draft) listScrollY = window.scrollY
    if (pool) setEditorPool(pool)
    else setNewPool()
    notice.value = ''
    saveNotice.value = ''
  }
  const opened = form.value
  await nextTick()
  if (!current(token) || form.value !== opened) return
  if (compact.value) editor.value?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  editor.value?.focus({ preventScroll: true })
}

function setNewPool() {
  returnPoolId = ''
  isNew.value = true
  form.value = {
    pool_id: 'pool_' + crypto.randomUUID(),
    game: filterGame.value || '代号鸢',
    name: '',
    pool_type: '',
    start_date: '',
    end_date: '',
    enabled: true,
    hidden: false,
    allow_custom_up: false,
    allow_cumulative_choice: false,
    revision: 0,
    up_agents: [],
  }
  resetEditorTracking(form.value)
  error.value = ''
}

function setEditorPool(pool) {
  returnPoolId = pool.pool_id
  isNew.value = false
  form.value = {
    ...pool,
    hidden: !!pool.hidden,
    allow_custom_up: !!pool.allow_custom_up,
    allow_cumulative_choice: !!pool.allow_cumulative_choice,
    pool_type: pool.pool_type || '',
    start_date: pool.start_date || '',
    end_date: pool.end_date || '',
    up_agents: pool.up_agents.map(slot => ({ ...slot, name: slot.name || '', operator_id: slot.operator_id || '' })),
  }
  resetEditorTracking(form.value)
  error.value = ''
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
  const draft = form.value
  const confirmed = await dialog.confirm({
    title: '退役这个 UP 名额？',
    message: `「${slotLabel(slot)}」退役后将不再提供给新的招募记录选择，但既有记录仍会保留并继续引用这个名额。`,
    type: 'danger',
    confirmText: '确认退役',
    cancelText: '继续保留',
  })
  if (!confirmed || form.value !== draft || saving.value) return
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
  if (!permitted.value || saving.value || loading.value || importing.value || conflict.value || !dirty.value) return
  attemptedSave.value = true
  const validationError = validateForm()
  if (validationError) {
    await showError(validationError)
    return
  }

  let token = capture()
  const draft = form.value
  saving.value = true
  try {
    if (!originalHidden.value && form.value.hidden) {
      const confirmed = await dialog.confirm({
        title: '隐藏这个卡池？',
        message: '普通用户公共列表将移除此池，无个人历史的用户不可再录入。已有个人池、出货与保底进度不会删除，仍可维护、统计、导出和备份，但不能新增出货。',
        type: 'danger', confirmText: '确认隐藏', cancelText: '继续编辑',
      })
      if (!confirmed || !current(token) || form.value !== draft) return
    } else if (!isNew.value && originalEnabled.value && !form.value.enabled && !form.value.hidden) {
      const confirmed = await dialog.confirm({
        title: '停用这个卡池？',
        message: '卡池仍在普通用户时间线显示，但不能新增出货；已有历史档案不会删除。',
        type: 'danger', confirmText: '确认停用', cancelText: '继续编辑',
      })
      if (!confirmed || !current(token) || form.value !== draft) return
    }
    const body = {
      pool_id: form.value.pool_id,
      game: form.value.game,
      name: form.value.name.trim(),
      pool_type: form.value.pool_type.trim() || null,
      start_date: form.value.start_date || null,
      end_date: form.value.end_date || null,
      enabled: form.value.enabled,
      hidden: form.value.hidden,
      allow_custom_up: form.value.allow_custom_up,
      allow_cumulative_choice: form.value.allow_cumulative_choice,
      expected_revision: form.value.revision,
      up_agents: form.value.up_agents.map(slot => ({
        id: slot.id,
        name: slot.name.trim(),
        operator_id: slot.operator_id || null,
        active: slot.active,
      })),
    }
    error.value = ''
    notice.value = ''
    saveNotice.value = ''
    const result = isNew.value
      ? await createAdminRecruitmentPool(body)
      : await updateAdminRecruitmentPool(body.pool_id, body)
    if (!current(token)) return

    const poolId = draft.pool_id
    const index = pools.value.findIndex(pool => pool.pool_id === poolId)
    if (index >= 0) pools.value.splice(index, 1, result)
    else pools.value.unshift(result)
    isNew.value = false
    formBaseline.value = JSON.stringify(comparableForm(draft))
    const refresh = load()
    token = capture()
    const refreshed = await refresh
    if (!current(token) || form.value !== draft) return

    const message = '卡池已保存；已有记录继续沿用原来的固定身份。'
    if (compact.value) {
      returnPoolId = poolId
      saving.value = false
      notice.value = message
      await closeEditor()
    } else {
      setEditorPool(refreshed?.find(pool => pool.pool_id === poolId) || result)
      saveNotice.value = message
    }
  } catch (err) {
    if (!current(token)) return
    conflict.value = err.status === 409
    await showError(conflict.value ? '目录已被其他管理员更新。草稿仍保留，请读取最新版本核对；不会覆盖他人修改。' : err.message || '保存失败，草稿已保留')
  } finally {
    if (current(token)) saving.value = false
  }
}

async function readLatest() {
  if (saving.value || loading.value || importing.value) return
  const token = capture()
  const poolId = form.value?.pool_id
  loading.value = true
  try {
    const catalog = await listAdminRecruitmentCatalog()
    if (!current(token) || form.value?.pool_id !== poolId) return
    latestPool.value = catalog.pools.find(pool => pool.pool_id === poolId) || null
  } catch (err) {
    if (current(token)) await showError(err.message || '最新目录读取失败，草稿仍保留')
  } finally {
    if (current(token)) loading.value = false
  }
}

watch([identity, permitted], () => {
  generation++
  resetEditor()
  listScrollY = 0
  pools.value = []
  operators.value = []
  loading.value = false
  saving.value = false
  importing.value = false
  listError.value = ''
  operatorError.value = ''
  notice.value = ''
  if (permitted.value) load()
}, { immediate: true, flush: 'sync' })

watch(compact, value => { if (value) listScrollY = window.scrollY })
onScopeDispose(() => {
  alive = false
  generation++
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.fields .wish-mode > span { display: flex; align-items: center; gap: 8px; }
.fields .wish-mode input { width: auto; flex: none; }
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px}.error{color:var(--theme-danger-text, var(--rouge))}.eyebrow{color:var(--ink-60)}.hint,label small,.pool-meta,.slot-identity small,.bound-name small{color:var(--ink-60)}button{border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);cursor:pointer}.primary{background:var(--tea);color:var(--on-strong)}.quiet{background:transparent}.danger{color:var(--theme-danger-text, var(--rouge));border-color:var(--theme-danger-line, rgba(166,81,74,.45))}.ghost{background:transparent}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:3px}input:not([type=radio]),select{border:1px solid var(--line);border-radius:10px;color:var(--ink);background:var(--cream)}.visually-hidden{border:0!important}.toolbar{border:0;border-radius:0;background:transparent;box-shadow:none}.maintenance-tools{border:1px solid var(--line);border-radius:12px;background:var(--theme-surface, rgba(255,253,246,.72))}.maintenance-tools summary{cursor:pointer}.empty-state,.empty-inline{color:var(--ink-60)}.status-badge,.dirty-badge,.saved-badge{border-radius:999px}.status-badge{background:var(--theme-wash-strong, rgba(239,210,142,.42));color:var(--ink)}.status-badge.muted{background:var(--theme-wash, rgba(73,59,44,.08));color:var(--ink-60)}.dirty-badge{background:var(--theme-wash, rgba(215,137,53,.14));color:var(--theme-accent-text, var(--accent))}.saved-badge{background:var(--theme-wash, rgba(73,59,44,.08));color:var(--ink-60)}.up-summary-item{border:1px solid var(--line);border-radius:999px;background:var(--cream)}.up-summary-avatar{border-radius:50%;background:var(--surface)}.up-slot-card,.history-slot{border:1px solid var(--line);border-radius:14px;background:var(--cream)}.slot-index{color:var(--theme-accent-text, var(--accent))}.slot-identity :deep(.slot-avatar){border-radius:10px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}.bound-name{border:1px dashed var(--line);border-radius:10px;background:var(--surface)}.slot-error{color:var(--theme-danger-text, var(--rouge))}.inline-warning{border-left:3px solid var(--accent);background:var(--theme-wash, rgba(215,137,53,.08))}.history-section{border-top:1px solid var(--line)}.history-section summary{cursor:pointer}.history-slot{background:var(--surface)}

.pool-row[aria-current="true"] { background: var(--cream); box-shadow: inset 3px 0 var(--accent); }
.pool-row:focus-visible, .pool-list:focus-visible, .editor-workspace:focus-visible { outline-offset: -3px; }
.pool-title-row strong { font: 800 17px/1.4 var(--font-s); }
.up-summary-avatar { display: grid; place-items: center; flex: none; object-fit: cover; font-weight: 800; }
.save-state p { margin: 4px 0 0; }

.status-options{border:0}.status-option{border:1px solid var(--line);border-radius:12px;background:var(--cream);cursor:pointer}.status-option.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.editor-actions{border:1px solid var(--line);border-radius:14px;background:var(--theme-surface, rgba(255,253,246,.96));box-shadow:0 10px 28px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.12);backdrop-filter:blur(8px)}.save-state{color:var(--ink-60)}
</style>
<style scoped src="./recruitmentAdminDesktop.css"></style>
<style scoped src="./recruitmentAdminMobile.css"></style>
