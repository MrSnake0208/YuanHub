<template>
  <section class="growth-tracker" aria-labelledby="growth-tracker-title">
    <div class="tracker-heading">
      <div>
        <span class="section-kicker">培养计划 · 养成追踪</span>
        <h2 id="growth-tracker-title">把下一份资源用在想练的人身上</h2>
        <p>等级、修为、化极的固定需求来自 Wiki 计算规则；五铢钱只展示总量，不参与 ETA。</p>
      </div>
      <button class="tracker-refresh" type="button" :disabled="loading || !accountId" title="刷新库存和流水" @click="loadInventory(true)">
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
        <span>{{ loading ? '同步中' : '刷新数据' }}</span>
      </button>
    </div>

    <div v-if="!isLoggedIn || !accountId" class="tracker-state">
      <Info :size="18" aria-hidden="true" />
      <span>登录并选择子账号后，才能读取库存、流水和特别关注名单。</span>
    </div>
    <div v-else-if="error" class="tracker-state is-error" role="alert">
      <Info :size="18" aria-hidden="true" />
      <span>{{ error }}</span>
      <button type="button" @click="loadInventory(true)">重试</button>
    </div>
    <template v-else>
      <OperatorTrainingPlanPicker :plans="workspace.plans" :active-plan="activePlan" :member-ids="activeMemberIds" :catalog-entries="catalogEntries" :account-id="accountId" :error="planError" :disabled="targetBusyIds.size > 0 || targetLoading" @select="selectPlan" @save="savePlan" @remove="removePlan" />
      <p class="tracker-plan-note">{{ activePlan.source === 'favorites' ? '默认清单随特别关注生成；目标同步云端，清单调整保存在本机。' : '自建计划与目标按子账号保存在当前浏览器。' }} 本计划已达成 {{ completedCount }}/{{ planRows.length }} 位。</p>
      <p v-if="planError" class="tracker-target-error" role="alert">{{ planError }}</p>
      <div v-if="planNotice" class="tracker-plan-notice" role="status">{{ planNotice }}<button v-if="undoWorkspace" type="button" @click="undoPlanChange">撤销</button></div>
      <details class="training-settings">
        <summary>历练估算设置 · 每类每日最多 6 次</summary>
        <p>按可刷层数分配次数，同层掉落合并抵扣。单项速度为该材料独占次数时的上限；整体时间按同类共享次数估算，其他材料与心纸参考近 {{ rangeDays }} 日流水。</p>
        <div class="training-levels"><label v-for="group in TRAINING_GROUPS" :key="group.id">{{ group.name }}最高已通关<select :value="workspace.trainingLevels[group.id]" @change="setTrainingLevel(group.id, $event)"><option v-for="stage in group.stages" :key="stage.level" :value="stage.level">{{ stage.name }}</option></select></label></div>
      </details>
      <div class="tracker-overview" aria-label="养成追踪概览">
        <div class="overview-cell"><span>清单密探</span><strong>{{ planRows.length }}<small>位</small></strong><em>{{ ownedPlanCount }} 位已招募</em></div>
        <div class="overview-cell"><span>心纸库存</span><strong>{{ formatNumber(totalHeartStock) }}<small>张</small></strong><em>清单密探合计</em></div>
        <div class="overview-cell"><span>本期获得</span><strong>{{ formatNumber(totalHeartAcquired) }}<small>张</small></strong><em>近 {{ rangeDays }} 日</em></div>
        <div class="overview-cell"><span>待补项</span><strong>{{ totalGapCount }}<small>项</small></strong><em>按密探目标合计</em></div>
      </div>

      <div v-if="!planRows.length" class="tracker-state empty">
        <Star :size="18" aria-hidden="true" />
        <span>当前清单还没有密探，可通过「管理密探」添加，或新建培养计划。</span>
      </div>

      <template v-else>
        <section class="aggregate-plan" aria-labelledby="aggregate-plan-title">
          <div class="aggregate-head">
            <div><h3 id="aggregate-plan-title">{{ activePlan.name }} · 目标总账</h3><p>当前清单合并计算，共享库存只抵扣一次。</p></div>
            <span>五铢钱 {{ formatMoney(aggregatePlan.total.money) }}</span>
          </div>
          <div v-if="!aggregatePlan.materialGaps.length && !aggregatePlan.heartGap" class="materials-clear">全部目标资源已备齐</div>
          <div v-else class="material-chips">
            <span v-for="gap in aggregatePlan.materialGaps" :key="gap.id" class="material-chip">
              <b>{{ itemName(gap.id) }}</b><em>缺 {{ formatNumber(gap.gap) }}</em><small>{{ rateLabel(gap.id) }}</small>
            </span>
            <span v-if="aggregatePlan.heartGap" class="material-chip heart-chip">
              <b>心纸</b><em>共缺 {{ formatNumber(aggregatePlan.heartGap) }}</em><small>按密探分别计算</small>
            </span>
          </div>
          <p class="aggregate-eta">{{ aggregateEtaLabel }}</p>
          <details v-if="aggregatePlan.schedule.length" class="training-schedule"><summary>查看历练次数分配</summary><div v-for="group in aggregatePlan.schedule" :key="group.id"><b>{{ group.name }} · {{ group.runs }} 次{{ group.days == null ? ' · 部分材料尚未开放' : ' · 约 ' + group.days + ' 天' }}</b><span v-for="stage in group.stages" :key="stage.level">{{ stage.name }} × {{ stage.runs }} 次</span></div></details>
        </section>

        <p id="tracker-edit-hint" class="tracker-edit-hint">点击进度条上方的虚线目标值即可修改；心纸自动跟随化极节点计算。</p>
        <p v-if="targetError" class="tracker-target-error" role="alert">{{ targetError }}</p>
        <p v-else-if="targetNotice" class="tracker-target-notice" role="status">{{ targetNotice }}</p>
        <div class="tracker-list">
        <article v-for="row in planRows" :key="row.id" class="tracker-row" :class="{ 'has-popover': starTargetId === row.id, 'is-complete': row.completed }" :aria-busy="targetBusyIds.has(row.id)">
          <div class="tracker-row-head">
            <div class="tracker-identity">
              <OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" />
              <div>
                <h3>{{ row.name || row.id }}</h3>
                <p>
                  <span class="tracker-prof"><img v-if="profIcon(row.prof)" :src="profIcon(row.prof)" alt="" aria-hidden="true" />{{ row.prof || '未知属性' }}</span>
                  <span>{{ firstSubProf(row) || '未标注职业' }}</span>
                  <span>{{ row.owned ? '已拥有' : '未拥有' }}</span>
                </p>
              </div>
            </div>
          </div>

          <div class="tracker-progress-grid">
            <div class="progress-block">
              <div class="progress-title">
                <span>等级</span>
                <div class="progress-values"><b>Lv{{ row.level }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '的目标等级'" aria-describedby="tracker-edit-hint" title="点击修改目标等级" :disabled="targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'level', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'level', $event)" /></div>
              </div>
              <div class="progress-track"><i :style="{ width: progress(row.level, targetFor(row).level) + '%' }"></i></div>
              <p>{{ experienceSummary(row.calculation.experienceGap) }}</p>
            </div>
            <div class="progress-block">
              <div class="progress-title">
                <span>修为</span>
                <div class="progress-values"><b>{{ row.elite }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="Math.max(row.elite, Math.min(17, Math.floor(targetFor(row).level / 5) - 3))" step="1" :value="targetFor(row).elite" :aria-label="row.name + '的目标修为'" aria-describedby="tracker-edit-hint" title="点击修改目标修为，上限随目标等级调整" :disabled="targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'elite', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'elite', $event)" /></div>
              </div>
              <div class="progress-track mint"><i :style="{ width: progress(row.elite, targetFor(row).elite) + '%' }"></i></div>
              <p>{{ materialSummary(row.calculation.xiuwei) || '无需补充修为材料' }}</p>
            </div>
            <div class="progress-block">
              <div class="progress-title tracker-star-anchor" @keydown.esc.prevent.stop="closeStarTarget(true)">
                <span>化极</span>
                <div class="progress-values"><b>{{ starLabel(row.starLevel) }}</b><span>/</span><button class="tracker-editable tracker-star-trigger" type="button" :aria-label="row.name + '的目标化极：' + starLabel(targetFor(row).starLevel)" aria-describedby="tracker-edit-hint" aria-haspopup="dialog" :aria-expanded="starTargetId === row.id" :aria-controls="starTargetId === row.id ? 'tracker-star-target-' + row.id : undefined" title="点击修改目标星级与节点" :disabled="targetLoading || targetBusyIds.has(row.id)" @click="openStarTarget(row, $event)">{{ starLabel(targetFor(row).starLevel) }}</button></div>
                <div v-if="starTargetId === row.id" :id="'tracker-star-target-' + row.id" class="tracker-star-popover" role="dialog" :aria-label="row.name + '的目标化极'">
                  <div class="tracker-popover-title"><Info :size="13" aria-hidden="true" />设置目标星级与节点</div>
                  <div class="tracker-star-controls">
                    <select :value="starTargetGroup" aria-label="目标星级" :disabled="targetBusyIds.has(row.id)" @change="setStarTargetGroup(row, $event)">
                      <option v-for="group in starGroupsFor(row)" :key="group" :value="group">{{ group === 0 ? '未拥有' : group === 31 ? '觉醒' : group + ' 星' }}</option>
                    </select>
                    <select v-if="starTargetGroup > 0 && starTargetGroup < 5" v-model.number="starTargetDraft" aria-label="目标节点" :disabled="targetBusyIds.has(row.id)">
                      <option v-for="stage in starNodesFor(row, starTargetGroup)" :key="stage.value" :value="stage.value">节点 {{ (stage.value - 1) % 6 }}</option>
                    </select>
                  </div>
                  <div class="tracker-popover-actions"><button type="button" class="cancel" :disabled="targetBusyIds.has(row.id)" @click="closeStarTarget(true)">取消</button><button type="button" :disabled="targetBusyIds.has(row.id)" @click="saveStarTarget(row)">{{ targetBusyIds.has(row.id) ? '保存中…' : '保存目标' }}</button></div>
                </div>
              </div>
              <div class="progress-track rose"><i :style="{ width: progress(starStage(row.starLevel), starStage(targetFor(row).starLevel)) + '%' }"></i></div>
              <p>心纸持有 {{ formatNumber(row.calculation.heartOwned) }} · 需 {{ formatNumber(row.calculation.heartRequired) }} · 缺 <strong>{{ formatNumber(row.calculation.heartGap) }}</strong></p>
            </div>
          </div>
          <div v-if="row.completed" class="tracker-complete" role="status"><Check :size="16" aria-hidden="true" /><span>养成目标已达成</span></div>

          <div v-if="!row.completed" class="tracker-materials">
            <div class="materials-head"><span>单人缺口</span><small>ETA 按本密探独占资源估算，清单共享时间见总账</small></div>
            <div v-if="!row.calculation.gaps.length && !row.calculation.heartGap" class="materials-clear">当前目标材料已备齐</div>
            <div v-else class="material-chips">
              <span v-for="gap in row.calculation.gaps" :key="gap.id" class="material-chip" tabindex="0" :title="itemName(gap.id)" :data-material-name="itemName(gap.id)">
                <span class="material-chip-line"><img v-if="itemIcon(gap.id)" :src="itemIcon(gap.id)" :alt="itemName(gap.id)" loading="lazy" /><Gem v-else :size="24" :aria-label="itemName(gap.id)" /><em> {{ formatNumber(gap.gap) }}</em></span><small>{{ materialEtaLabel(row, gap) }}</small>
              </span>
              <span v-if="row.calculation.heartGap" class="material-chip heart-chip" tabindex="0" title="心纸" data-material-name="心纸">
                <span class="material-chip-line"><Heart :size="24" aria-label="心纸" /><em>缺 {{ formatNumber(row.calculation.heartGap) }}</em></span><small>{{ materialEtaLabel(row, { id: '__heart__', gap: row.calculation.heartGap }) }}</small>
              </span>
            </div>
            <div class="eta-line">
              <span v-if="row.calculation.etaDays != null">按刷取计划与流水估算约 {{ formatEta(row.calculation.etaDays) }}</span>
              <span v-else>暂无法估算：存在未开放掉落或无流水材料</span>
              <span class="money-total">五铢钱需求 {{ formatMoney(row.calculation.total.money) }}</span>
            </div>
          </div>
          <button class="tracker-remove" type="button" :disabled="targetLoading || targetBusyIds.size > 0" @click="removePlanMember(row)"><Check v-if="row.completed" :size="14" aria-hidden="true" /><X v-else :size="14" aria-hidden="true" />{{ row.completed ? '已完成，移出清单' : '移出清单' }}</button>
        </article>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Check, Gem, Heart, Info, RefreshCw, Star, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import OperatorTrainingPlanPicker from './OperatorTrainingPlanPicker.vue'
import { TRAINING_GROUPS, bookExperience, levelBookGapBundle, trainingRate, trainingSchedule, trainingMaterialEtas, growthTargetReached } from '../../data/operatorTraining.js'
import { FAVORITES_PLAN_ID, emptyTrainingWorkspace, readTrainingWorkspace, writeTrainingWorkspace, trainingWorkspaceKey, trainingPlanMemberIds } from '../../data/operatorTrainingPlans.js'
import { getAcquired, getCurrent } from '../../api/inventory.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../../api/operator.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import {
  calculateLevelRequirements,
  calculateStarRequirements,
  calculateXiuweiRequirements,
  mergeRequirements,
  netRequirement,
  starLabelForStage,
  starStageFromLevel
} from '../../data/operatorRequirements.js'

const props = defineProps({
  accountId: { type: String, default: '' },
  currentEntries: { type: Array, default: () => [] },
  catalogEntries: { type: Array, default: () => [] },
  favoriteIds: { type: Object, default: () => new Set() },
  isLoggedIn: { type: Boolean, default: false },
  refreshKey: { type: Number, default: 0 },
  initialCurrentItems: { type: Object, default: () => ({}) },
  initialCurrentAgents: { type: Object, default: () => ({}) },
  currentInventoryReady: { type: Boolean, default: false }
})

const loading = ref(false)
const error = ref('')
const currentItems = ref({})
const currentAgents = ref({})
const acquiredItems = ref({})
const acquiredAgents = ref({})
const rangeDays = 30
const rangeFrom = new Date(Date.now() - rangeDays * 86400000).toISOString()
const rangeTo = new Date().toISOString()
const targets = ref({})
const targetLoading = ref(false)
const targetError = ref('')
const targetNotice = ref('')
const targetBusyIds = ref(new Set())
const workspace = ref(emptyTrainingWorkspace(props.accountId))
const planError = ref('')
const planNotice = ref('')
const undoWorkspace = ref(null)
const activePlan = computed(() => workspace.value.plans.find(plan => plan.id === workspace.value.activePlanId) || workspace.value.plans[0])
const activeMemberIds = computed(() => trainingPlanMemberIds(activePlan.value, props.favoriteIds))
const completedCount = computed(() => planRows.value.filter(row => row.completed).length)
const starTargetId = ref('')
const starTargetDraft = ref(0)
const starTargetGroup = computed(function () { return starGroup(starTargetDraft.value) })
let starTargetTrigger = null
let targetLoadSeq = 0
let targetNoticeTimer = null
let inventoryLoadSeq = 0

const PROF_ICON_FILES = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }

function workspaceCopy() { return JSON.parse(JSON.stringify(workspace.value)) }
function loadWorkspace() {
  planError.value = ''
  planNotice.value = ''
  undoWorkspace.value = null
  workspace.value = emptyTrainingWorkspace(props.accountId)
  if (!props.isLoggedIn || !props.accountId) return
  try { workspace.value = readTrainingWorkspace(localStorage, props.accountId) }
  catch (err) { planError.value = '本地计划读取失败：' + err.message }
}
function commitWorkspace(next, notice = '', undoable = false) {
  try {
    const previous = workspaceCopy()
    next.revision = workspace.value.revision
    workspace.value = writeTrainingWorkspace(localStorage, next)
    undoWorkspace.value = undoable ? previous : null
    planError.value = ''
    planNotice.value = notice
    return true
  } catch (err) { planError.value = '本地计划保存失败：' + err.message; return false }
}
function selectPlan(id) {
  if (targetBusyIds.value.size) return
  const next = workspaceCopy()
  next.activePlanId = id
  if (commitWorkspace(next)) { closeStarTarget(); targetNotice.value = ''; targetError.value = '' }
}
function savePlan(draft, onSaved) {
  const next = workspaceCopy()
  const id = draft.id || crypto.randomUUID()
  let plan = next.plans.find(plan => plan.id === id)
  if (!plan) { plan = { id, name: draft.name, source: 'custom', operatorIds: [], excludedOperatorIds: [], targets: {} }; next.plans.push(plan) }
  plan.name = draft.name
  if (plan.source === 'favorites') {
    plan.operatorIds = draft.operatorIds.filter(id => !props.favoriteIds.has(id))
    plan.excludedOperatorIds = [...props.favoriteIds].filter(id => !draft.operatorIds.includes(id))
  } else {
    plan.operatorIds = draft.operatorIds
    for (const memberId of draft.operatorIds) {
      if (!plan.targets[memberId]) plan.targets[memberId] = targetFor({ id: memberId, ...currentMap.value[memberId] })
    }
  }
  next.activePlanId = id
  if (commitWorkspace(next, draft.id ? '清单已保存到本机' : '培养计划已创建')) { closeStarTarget(); onSaved?.() }
}
function removePlanMember(row) {
  if (targetBusyIds.value.size) return
  const next = workspaceCopy()
  const plan = next.plans.find(plan => plan.id === activePlan.value.id)
  plan.operatorIds = plan.operatorIds.filter(id => id !== row.id)
  if (plan.source === 'favorites') plan.excludedOperatorIds = [...new Set([...plan.excludedOperatorIds, row.id])]
  if (commitWorkspace(next, (row.name || row.id) + '已移出当前清单，特别关注不变', true)) closeStarTarget()
}
function removePlan() {
  if (activePlan.value.source === 'favorites' || targetBusyIds.value.size) return
  const next = workspaceCopy()
  next.plans = next.plans.filter(plan => plan.id !== activePlan.value.id)
  next.activePlanId = FAVORITES_PLAN_ID
  if (commitWorkspace(next, '培养计划已删除', true)) closeStarTarget()
}
function undoPlanChange() {
  if (undoWorkspace.value) commitWorkspace(JSON.parse(JSON.stringify(undoWorkspace.value)), '已恢复清单')
}
function setTrainingLevel(groupId, event) {
  const next = workspaceCopy()
  next.trainingLevels[groupId] = Number(event.target.value)
  if (!commitWorkspace(next)) event.target.value = workspace.value.trainingLevels[groupId]
}
function syncWorkspace(event) {
  if (event.key === trainingWorkspaceKey(props.accountId)) { closeStarTarget(); loadWorkspace() }
}

const itemMap = computed(function () {
  const map = {}
  ITEM_CATALOG.forEach(function (item) { map[item.id] = item.name })
  props.catalogEntries.forEach(function (item) { if (item.id) map[item.id] = item.name || map[item.id] || item.id })
  return map
})

const currentMap = computed(function () {
  const map = {}
  props.currentEntries.forEach(function (entry) { map[entry.id] = entry })
  return map
})

const starStages = [
  { value: 0, label: '未拥有' }
].concat(Array.from({ length: 24 }, function (_, index) {
  const value = index + 1
  return { value, label: starLabelForStage(starStageFromLevel(value)) }
}), [
  { value: 30, label: '五星' },
  { value: 31, label: '觉醒' }
])

const planRows = computed(function () {
  const ids = activeMemberIds.value
  return props.catalogEntries.filter(function (entry) { return ids.has(entry.id) }).map(function (entry) {
    const current = currentMap.value[entry.id] || {}
    const target = targetFor(Object.assign({}, entry, current))
    const level = calculateLevelRequirements(current.level || 0, target.level, firstSubProf(entry))
    const xiuwei = calculateXiuweiRequirements(current.elite || 0, target.elite, xiuweiJob(entry.prof))
    const star = calculateStarRequirements(current.starLevel || 0, target.starLevel)
    const total = mergeRequirements(level, xiuwei, star)
    const stock = currentItems.value
    const net = netRequirement(total, stock)
    const ownedExperience = bookExperience(currentItems.value)
    const experienceGap = Math.max(level.experience - ownedExperience, 0)
    const heartOwned = Number(currentAgents.value[entry.id]) || 0
    const heartRequired = Number(star.heart) || 0
    const heartGap = Math.max(heartRequired - heartOwned, 0)
    const gaps = net.gaps.slice()
    gaps.push(...experienceGaps(experienceGap))
    const etaGaps = gaps.slice()
    if (heartGap) etaGaps.push({ id: '__heart__', agentId: entry.id, required: heartRequired, owned: heartOwned, gap: heartGap })
    const etaDays = etaForGaps(etaGaps)
    return Object.assign({}, entry, current, {
      avatar: entry.avatar || '',
      completed: growthTargetReached(current, target),
      owned: Boolean(current.level || current.elite || current.starLevel),
      level: Number(current.level) || 0,
      elite: Number(current.elite) || 0,
      starLevel: Number(current.starLevel) || 0,
      heartAcquired: Number(acquiredAgents.value[entry.id]) || 0,
      calculation: { level, xiuwei, star, total, net, experienceGap, heartOwned, heartRequired, heartGap, gaps, etaDays, materialEtas: trainingMaterialEtas(gaps, workspace.value.trainingLevels) }
    })
  })
})

const aggregatePlan = computed(function () {
  const requirements = []
  let experience = 0
  const heartGaps = []
  planRows.value.forEach(function (row) {
    requirements.push(row.calculation.level, row.calculation.xiuwei, row.calculation.star)
    experience += Number(row.calculation.level.experience) || 0
    if (row.calculation.heartGap) {
      heartGaps.push({
        id: '__heart__',
        agentId: row.id,
        required: row.calculation.heartRequired,
        owned: row.calculation.heartOwned,
        gap: row.calculation.heartGap
      })
    }
  })
  const total = mergeRequirements(...requirements)
  const net = netRequirement(total, currentItems.value)
  const materialGaps = net.gaps.slice()
  const experienceGap = Math.max(experience - bookExperience(currentItems.value), 0)
  materialGaps.push(...experienceGaps(experienceGap))
  const heartGap = heartGaps.reduce(function (sum, gap) { return sum + gap.gap }, 0)
  return {
    total,
    materialGaps,
    heartGaps,
    heartGap,
    schedule: trainingSchedule(materialGaps, workspace.value.trainingLevels),
    etaDays: etaForGaps(materialGaps.concat(heartGaps))
  }
})

const ownedPlanCount = computed(function () { return planRows.value.filter(function (row) { return row.owned }).length })
const totalHeartStock = computed(function () { return planRows.value.reduce(function (sum, row) { return sum + (Number(currentAgents.value[row.id]) || 0) }, 0) })
const totalHeartAcquired = computed(function () { return planRows.value.reduce(function (sum, row) { return sum + (Number(acquiredAgents.value[row.id]) || 0) }, 0) })
const totalGapCount = computed(function () {
  return aggregatePlan.value.materialGaps.length + aggregatePlan.value.heartGaps.length
})
const aggregateEtaLabel = computed(function () {
  if (!aggregatePlan.value.materialGaps.length && !aggregatePlan.value.heartGaps.length) return '当前目标无需等待'
  if (aggregatePlan.value.etaDays == null) return '暂无法估算整体时间：存在未开放掉落或无流水材料'
  return '按当前刷取计划与流水估算约 ' + formatEta(aggregatePlan.value.etaDays)
})

function targetStorageKey() { return 'yuanhub:operator-targets:' + props.accountId }

function targetMigrationKey() { return 'yuanhub:operator-targets-migrated:v1:' + props.accountId }

function readLocalTargets() {
  if (typeof localStorage === 'undefined' || !props.accountId) return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(targetStorageKey()) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) { return {} }
}

function cacheTargets() {
  if (typeof localStorage === 'undefined' || !props.accountId) return
  try { localStorage.setItem(targetStorageKey(), JSON.stringify(targets.value)) } catch (_) {}
}

function targetErrorMessage(err, fallback) {
  if (err && err.code === 'growth_target_revision_conflict') return '养成目标已在其他页面更新，已重新同步'
  if (err && err.code === 'invalid_growth_target') return '目标数值或组合不符合要求'
  return err && err.message ? err.message : fallback
}

function normalizedTargetItem(item) {
  return {
    level: item.level == null ? null : Number(item.level),
    elite: item.elite == null ? null : Number(item.elite),
    starLevel: (item.star_level != null ? item.star_level : item.starLevel) == null ? null : Number(item.star_level != null ? item.star_level : item.starLevel),
    heartPaper: (item.heart_paper != null ? item.heart_paper : item.heartPaper) == null ? null : Number(item.heart_paper != null ? item.heart_paper : item.heartPaper),
    revision: Number(item.revision) || 0
  }
}

function applyTargetItem(id, item) {
  const operatorId = id || (item && (item.operator_id || item.operatorId))
  if (!operatorId || !item) return
  targets.value = Object.assign({}, targets.value, { [operatorId]: normalizedTargetItem(item) })
}

async function migrateLocalTargets(targetAccount, remoteIds) {
  if (typeof localStorage === 'undefined' || localStorage.getItem(targetMigrationKey()) === 'done') return
  const local = readLocalTargets()
  const ids = Object.keys(local).filter(function (id) { return !remoteIds.has(id) })
  for (const id of ids) {
    const saved = local[id] || {}
    const body = { expected_revision: 0 }
    if (saved.level != null) body.level = Number(saved.level)
    if (saved.elite != null) body.elite = Number(saved.elite)
    if (saved.starLevel != null || saved.star_level != null) body.star_level = Number(saved.starLevel != null ? saved.starLevel : saved.star_level)
    if (Object.keys(body).length === 1) continue
    const item = await putOperatorGrowthTarget({ accountId: targetAccount, operatorId: id, target: body })
    if (props.accountId !== targetAccount) return
    applyTargetItem(id, item)
  }
  localStorage.setItem(targetMigrationKey(), 'done')
}

async function loadTargets() {
  closeStarTarget()
  targets.value = {}
  targetError.value = ''
  if (!props.isLoggedIn || !props.accountId) {
    targetLoadSeq += 1
    targetLoading.value = false
    return
  }
  const targetAccount = props.accountId
  const seq = ++targetLoadSeq
  targetLoading.value = true
  try {
    const data = await getOperatorGrowthTargets(targetAccount)
    if (seq !== targetLoadSeq || props.accountId !== targetAccount) return
    const items = Array.isArray(data && data.items) ? data.items : []
    const mapped = {}
    const remoteIds = new Set()
    items.forEach(function (item) {
      const id = item && (item.operator_id || item.operatorId)
      if (!id) return
      remoteIds.add(id)
      mapped[id] = normalizedTargetItem(item)
    })
    targets.value = mapped
    await migrateLocalTargets(targetAccount, remoteIds)
    if (seq !== targetLoadSeq || props.accountId !== targetAccount) return
    cacheTargets()
  } catch (err) {
    if (seq !== targetLoadSeq || props.accountId !== targetAccount) return
    targets.value = readLocalTargets()
    targetError.value = targetErrorMessage(err, '养成目标同步失败，当前显示本地缓存')
  } finally {
    if (seq === targetLoadSeq && props.accountId === targetAccount) targetLoading.value = false
  }
}

function defaultTarget(row) {
  return { level: 100, elite: 17, starLevel: 7, revision: 0 }
}

function targetFor(row, plan = activePlan.value) {
  if (!row || !row.id) return defaultTarget(row)
  const saved = (plan.source === 'custom' ? plan.targets[row.id] : targets.value[row.id]) || defaultTarget(row)
  const defaults = defaultTarget(row)
  const currentLevel = Number(row.level) || 0
  const currentElite = Number(row.elite) || 0
  const level = Math.max(currentLevel, Math.min(100, Number(saved.level == null ? defaults.level : saved.level) || 0))
  const eliteLimit = Math.min(17, Math.max(0, Math.floor(level / 5) - 3))
  const elite = Math.max(currentElite, Math.min(eliteLimit, Number(saved.elite == null ? defaults.elite : saved.elite) || 0))
  const savedStarLevel = Math.min(31, Math.max(0, Number(saved.starLevel == null ? defaults.starLevel : saved.starLevel) || 0))
  const currentStarLevel = Number(row.starLevel) || 0
  const starLevel = starStage(savedStarLevel) < starStage(currentStarLevel) ? currentStarLevel : savedStarLevel
  return { level, elite, starLevel, revision: Number(saved.revision) || 0 }
}

function resetTargetInput(row, field, event) {
  const latestRow = planRows.value.find(function (item) { return item.id === row.id }) || row
  event.target.value = targetFor(latestRow)[field]
  if (event.type === 'keydown') event.target.blur()
}

async function setTarget(row, field, event) {
  const id = row && row.id
  if (!id || targetLoading.value || targetBusyIds.value.has(id)) return false
  const current = currentMap.value[id] || {}
  const target = Object.assign({}, targetFor(row))
  const input = event && event.target
  const raw = input ? input.value : event
  if (input && (input.validity.badInput || raw === '')) {
    resetTargetInput(row, field, event)
    return false
  }
  const max = field === 'level' ? 100 : field === 'elite' ? 17 : 31
  const currentValue = Number(current[field]) || 0
  target[field] = Math.min(max, Math.max(currentValue, Math.trunc(Number(raw)) || 0))
  const eliteLimit = Math.min(17, Math.max(0, Math.floor((target.level || 0) / 5) - 3))
  if (field === 'elite') target[field] = Math.max(Number(current.elite) || 0, Math.min(target[field], eliteLimit))
  if (field === 'level') target.elite = Math.max(Number(current.elite) || 0, Math.min(target.elite, eliteLimit))
  if (target[field] === targetFor(row)[field]) {
    if (input) resetTargetInput(row, field, event)
    return true
  }
  if (activePlan.value.source === 'custom') {
    const next = workspaceCopy()
    next.plans.find(plan => plan.id === activePlan.value.id).targets[id] = target
    const saved = commitWorkspace(next, (row.name || id) + '的计划目标已保存到本机')
    if (input) { await nextTick(); resetTargetInput(row, field, event) }
    return saved
  }
  const targetAccount = props.accountId
  const loadSeq = targetLoadSeq
  const previous = targets.value[id]
  targets.value = Object.assign({}, targets.value, { [id]: target })
  targetBusyIds.value = new Set(targetBusyIds.value).add(id)
  targetError.value = ''
  targetNotice.value = ''
  try {
    const body = { expected_revision: Number(previous && previous.revision) || 0 }
    body[field === 'starLevel' ? 'star_level' : field] = target[field]
    if (field === 'level' && target.elite !== (previous && previous.elite)) body.elite = target.elite
    const item = await putOperatorGrowthTarget({ accountId: targetAccount, operatorId: id, target: body })
    if (props.accountId !== targetAccount || targetLoadSeq !== loadSeq) return false
    applyTargetItem(id, item)
    cacheTargets()
    targetNotice.value = (row.name || id) + '的养成目标已同步'
    if (targetNoticeTimer != null) clearTimeout(targetNoticeTimer)
    targetNoticeTimer = setTimeout(function () { targetNotice.value = '' }, 1800)
    return true
  } catch (err) {
    if (props.accountId !== targetAccount || targetLoadSeq !== loadSeq) return false
    if (err && err.code === 'growth_target_revision_conflict') await loadTargets()
    else targets.value = Object.assign({}, targets.value, { [id]: previous || defaultTarget(row) })
    targetError.value = targetErrorMessage(err, '养成目标保存失败')
    return false
  } finally {
    const next = new Set(targetBusyIds.value)
    next.delete(id)
    targetBusyIds.value = next
    if (input && props.accountId === targetAccount) {
      await nextTick()
      resetTargetInput(row, field, event)
    }
  }
}

function starStagesFor(row) {
  const currentStage = starStage(row && row.starLevel)
  return starStages.filter(function (stage) {
    return stage.value >= (Number(row && row.starLevel) || 0) && starStage(stage.value) >= currentStage
  })
}

function starGroup(value) {
  if (value === 31 || value === 0) return value
  return Math.min(5, Math.floor((value - 1) / 6) + 1)
}

function starGroupsFor(row) {
  return [...new Set(starStagesFor(row).map(function (stage) { return starGroup(stage.value) }))]
}

function starNodesFor(row, group) {
  return starStagesFor(row).filter(function (stage) { return starGroup(stage.value) === group })
}

function setStarTargetGroup(row, event) {
  const stages = starNodesFor(row, Number(event.target.value))
  const node = (starTargetDraft.value - 1) % 6
  const matching = stages.find(function (stage) { return (stage.value - 1) % 6 === node })
  if (stages.length) starTargetDraft.value = (matching || stages[0]).value
}

async function openStarTarget(row, event) {
  if (starTargetId.value === row.id) return closeStarTarget()
  starTargetTrigger = event.currentTarget
  starTargetDraft.value = targetFor(row).starLevel
  starTargetId.value = row.id
  await nextTick()
  document.getElementById('tracker-star-target-' + row.id)?.querySelector('select')?.focus()
}

function closeStarTarget(restoreFocus = false) {
  starTargetId.value = ''
  if (restoreFocus) starTargetTrigger?.focus()
  starTargetTrigger = null
}

async function saveStarTarget(row) {
  const saved = await setTarget(row, 'starLevel', starTargetDraft.value)
  if (saved && starTargetId.value === row.id) {
    await nextTick()
    closeStarTarget(true)
  }
}

function dismissStarTarget(event) {
  if (starTargetId.value && !event.target.closest('.tracker-star-anchor')) closeStarTarget()
}

function flattenCurrent(data) {
  const result = {}
  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  rows.forEach(function (row) {
    const entries = row && row.entries && typeof row.entries === 'object' ? row.entries : {}
    Object.keys(entries).forEach(function (id) {
      const value = entries[id]
      result[id] = Number(value && value.count != null ? value.count : value) || 0
    })
  })
  return result
}

function flattenAcquired(data) {
  const source = data && data.acquired && typeof data.acquired === 'object' ? data.acquired : {}
  const result = {}
  Object.keys(source).forEach(function (id) { result[id] = Number(source[id]) || 0 })
  return result
}

async function loadInventory(forceCurrent) {
  if (!props.isLoggedIn || !props.accountId) {
    inventoryLoadSeq += 1
    currentItems.value = {}
    currentAgents.value = {}
    acquiredItems.value = {}
    acquiredAgents.value = {}
    loading.value = false
    error.value = ''
    return
  }
  const targetAccount = props.accountId
  const seq = ++inventoryLoadSeq
  loading.value = true
  error.value = ''
  try {
    const reuseCurrent = !forceCurrent && props.currentInventoryReady
    const results = await Promise.all([
      reuseCurrent ? Promise.resolve(null) : getCurrent({ accountId: targetAccount, entityType: 'item' }),
      reuseCurrent ? Promise.resolve(null) : getCurrent({ accountId: targetAccount, entityType: 'agent' }),
      getAcquired({ accountId: targetAccount, entityType: 'item', from: rangeFrom, to: rangeTo }),
      getAcquired({ accountId: targetAccount, entityType: 'agent', from: rangeFrom, to: rangeTo })
    ])
    if (seq !== inventoryLoadSeq || props.accountId !== targetAccount) return
    currentItems.value = reuseCurrent ? Object.assign({}, props.initialCurrentItems) : flattenCurrent(results[0])
    currentAgents.value = reuseCurrent ? Object.assign({}, props.initialCurrentAgents) : flattenCurrent(results[1])
    acquiredItems.value = flattenAcquired(results[2])
    acquiredAgents.value = flattenAcquired(results[3])
  } catch (err) {
    if (seq !== inventoryLoadSeq || props.accountId !== targetAccount) return
    error.value = err && err.message ? err.message : '库存或流水加载失败'
  } finally {
    if (seq === inventoryLoadSeq && props.accountId === targetAccount) loading.value = false
  }
}

function firstSubProf(row) { return Array.isArray(row && row.subProf) ? row.subProf[0] : (row && row.subProf ? String(row.subProf).split('、')[0] : '') }
function profIcon(prof) { const file = PROF_ICON_FILES[String(prof || '').split('、')[0]]; return file ? import.meta.env.BASE_URL + 'assets/prof-icons/' + file : '' }
function xiuweiJob(prof) { const first = String(prof || '').split('、')[0]; return ['风', '火'].includes(first) ? 'fh' : ['水', '地'].includes(first) ? 'ds' : 'yy' }
function starStage(level) { return starStageFromLevel(level) }
function starLabel(level) {
  const value = Number(level) || 0
  if (value <= 0) return '未拥有'
  if (value >= 31) return '觉醒'
  if (value >= 25) return '5星'
  return starGroup(value) + '星·' + (value - 1) % 6
}
function progress(current, target) { const a = Number(current) || 0; const b = Number(target) || 0; return b <= 0 ? 100 : Math.min(100, Math.round(a * 100 / b)) }
function itemName(id) { return id === '__heart__' ? '心纸' : itemMap.value[id] || id }
function itemIcon(id) {
  // 本地目录尚无装金玻璃位图，使用宝石图标保底。
  if (id === 'zhuangjinboli' || !ITEM_CATALOG.some(item => item.id === id)) return ''
  return import.meta.env.BASE_URL + 'inventory-icons/items/' + encodeURIComponent(id) + '.png'
}
function formatNumber(value) { return (Number(value) || 0).toLocaleString('zh-CN') }
function formatMoney(value) { return formatNumber(value) }
function materialSummary(requirement) { return Object.keys(requirement.items || {}).filter(function (id) { return requirement.items[id] > 0 }).slice(0, 3).map(function (id) { return itemName(id) + '×' + formatNumber(requirement.items[id]) }).join('、') }

function experienceGaps(gap) { return levelBookGapBundle(gap, workspace.value.trainingLevels.experience).map(book => ({ id: book.id, required: book.required, owned: 0, gap: book.lack })) }
function experienceSummary(gap) {
  const books = levelBookGapBundle(gap, workspace.value.trainingLevels.experience)
  return books.length ? '经验还缺 ' + books.map(book => book.name + '×' + formatNumber(book.lack)).join('、') : '经验道具已备齐'
}
function rateFor(id) {
  const rate = trainingRate(id, workspace.value.trainingLevels)
  return rate == null ? (Number(acquiredItems.value[id]) || 0) / rangeDays : rate
}
function rateLabel(id) {
  const training = trainingRate(id, workspace.value.trainingLevels)
  if (training != null) return training > 0 ? '历练至多 ' + formatNumber(training) + '/日' : '所需层数未开放'
  const rate = rateFor(id)
  return rate > 0 ? '流水日均 ' + rate.toFixed(1) : '暂无流水'
}
function materialEtaLabel(row, gap) {
  if (Object.prototype.hasOwnProperty.call(row.calculation.materialEtas, gap.id)) {
    const days = row.calculation.materialEtas[gap.id]
    return days == null ? 'ETA 待开放' : '约 ' + formatEta(days)
  }
  const rate = gap.id === '__heart__' ? (Number(acquiredAgents.value[row.id]) || 0) / rangeDays : rateFor(gap.id)
  return rate > 0 ? '约 ' + formatEta(gap.gap / rate) : 'ETA 暂无流水'
}
function etaForGaps(gaps) {
  if (!gaps.length) return 0
  const schedule = trainingSchedule(gaps, workspace.value.trainingLevels)
  const days = schedule.map(group => group.days)
  for (const gap of gaps) {
    if (trainingRate(gap.id, workspace.value.trainingLevels) != null) continue
    const rate = gap.id === '__heart__' ? (Number(acquiredAgents.value[gap.agentId]) || 0) / rangeDays : rateFor(gap.id)
    days.push(rate > 0 ? gap.gap / rate : null)
  }
  if (days.some(value => value == null)) return null
  return Math.max(0, ...days)
}

function formatEta(days) { if (days <= 0) return '无需等待'; if (days < 1) return '不足 1 天'; return Math.ceil(days) + ' 天' }

watch(function () { return [props.accountId, props.isLoggedIn] }, loadWorkspace, { immediate: true })
watch(function () { return [props.accountId, props.isLoggedIn, props.refreshKey] }, function () { loadTargets(); loadInventory() }, { immediate: true })
watch(function () { return [props.currentInventoryReady, props.initialCurrentItems, props.initialCurrentAgents] }, function () {
  if (!props.currentInventoryReady) return
  currentItems.value = Object.assign({}, props.initialCurrentItems)
  currentAgents.value = Object.assign({}, props.initialCurrentAgents)
})

onMounted(function () {
  window.addEventListener('storage', syncWorkspace)
  document.addEventListener('pointerdown', dismissStarTarget)
  document.addEventListener('focusin', dismissStarTarget)
})

onBeforeUnmount(function () {
  window.removeEventListener('storage', syncWorkspace)
  document.removeEventListener('pointerdown', dismissStarTarget)
  document.removeEventListener('focusin', dismissStarTarget)
  if (targetNoticeTimer != null) clearTimeout(targetNoticeTimer)
})
</script>

<style scoped>
.growth-tracker { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 22px; }
.tracker-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 18px; border-bottom: 1px dashed var(--line); }
.section-kicker { display: block; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: 0; }
.tracker-heading h2 { margin-top: 6px; font-family: var(--font-s); font-size: 23px; font-weight: 900; letter-spacing: 0; color: var(--ink); }
.tracker-heading p { margin-top: 5px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.tracker-refresh { min-height: 44px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); padding: 0 13px; display: inline-flex; align-items: center; gap: 7px; font: 700 12px var(--font-b); cursor: pointer; }
.tracker-refresh:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.tracker-refresh:focus-visible, .tracker-state button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.tracker-refresh:disabled { opacity: .55; cursor: wait; }
.spin { animation: tracker-spin .9s linear infinite; }
@keyframes tracker-spin { to { transform: rotate(360deg); } }
.tracker-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin: 18px 0; background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.overview-cell { min-width: 0; background: var(--cream); padding: 14px; }
.overview-cell span { display: block; color: var(--ink-60); font-size: 11px; font-weight: 800; }
.overview-cell strong { display: block; margin-top: 5px; color: var(--accent-strong); font: 900 25px var(--font-d); }
.overview-cell strong small { margin-left: 3px; font: 700 11px var(--font-b); }
.overview-cell em { display: block; margin-top: 3px; color: var(--ink-35); font-size: 11px; font-style: normal; }
.tracker-state { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 100px; padding: 20px; color: var(--ink-60); font-size: 13px; text-align: center; }
.tracker-state.is-error { color: var(--rouge); background: rgba(166, 81, 74, .07); border-radius: 12px; }
.tracker-state button { border: 0; background: transparent; color: var(--accent-strong); font-weight: 800; text-decoration: underline; cursor: pointer; }
.tracker-state.empty { min-height: 80px; margin-top: 14px; border: 1px dashed var(--line); border-radius: 12px; }
.aggregate-plan { margin: 18px 0 14px; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.aggregate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.aggregate-head h3 { color: var(--ink); font-family: var(--font-s); font-size: 14px; font-weight: 900; letter-spacing: 0; }
.aggregate-head p { margin-top: 3px; color: var(--ink-60); font-size: 10.5px; }
.aggregate-head > span { flex: none; color: var(--ink-60); font: 800 11px var(--font-d); }
.aggregate-eta { margin-top: 8px; color: var(--ink-60); font-size: 10.5px; }
.tracker-edit-hint { margin: 12px 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.tracker-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; gap: 14px; }
.tracker-row { position: relative; min-width: 0; border: 1px solid var(--yellow-deep); border-top-width: 3px; border-radius: 15px; background: linear-gradient(180deg, var(--cream), var(--surface)); padding: 14px 12px; box-shadow: 0 4px 12px rgba(73, 59, 44, .04); }
.tracker-row.has-popover { z-index: 2; }
.tracker-row.is-complete { border-color: var(--yellow-deep); border-top: 3px solid var(--yellow-deep); background: linear-gradient(160deg, var(--paper), color-mix(in srgb, var(--yellow) 65%, var(--paper))); }
.tracker-complete { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 14px; padding: 10px 6px; border: 1px solid var(--yellow-deep); border-radius: 8px; background: var(--yellow); color: var(--tea); font-size: 12px; font-weight: 800; }
.tracker-remove { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; min-height: 36px; margin-top: 12px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink-60); font: 700 11px var(--font-b); cursor: pointer; }
.is-complete .tracker-remove { background: var(--tea); color: var(--cream); }
.tracker-remove:hover { border-color: var(--accent); }
.tracker-plan-note { margin: 8px 0; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.tracker-plan-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 10px 0; color: var(--accent-strong); font-size: 12px; }
.tracker-plan-notice button { min-height: 36px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--cream); color: var(--ink); cursor: pointer; }
.training-settings { margin: 14px 0; padding: 12px; border: 1px dashed var(--line); border-radius: 10px; }
.training-settings summary, .training-schedule summary { color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; }
.training-settings p { margin-top: 8px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.training-levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
.training-levels label { display: flex; flex-direction: column; gap: 5px; color: var(--ink-60); font-size: 12px; }
.training-levels select { min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 12px var(--font-b); }
.training-schedule { margin-top: 10px; }
.training-schedule > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; color: var(--ink-60); font-size: 12px; }
.tracker-remove:focus-visible, .tracker-plan-notice button:focus-visible, summary:focus-visible, .training-levels select:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.tracker-row-head { padding-bottom: 12px; border-bottom: 1px dashed var(--line); }
.tracker-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tracker-identity > div:last-child { min-width: 0; }
.tracker-identity h3 { overflow: hidden; color: var(--ink); font-family: var(--font-s); font-size: 16px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.tracker-identity p { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 3px; color: var(--ink-60); font-size: 11px; }
.tracker-identity p > span + span::before { margin-right: 4px; content: '·'; }
.tracker-prof { display: inline-flex; align-items: center; gap: 3px; }
.tracker-prof img { width: 17px; height: 17px; object-fit: contain; }
.tracker-target-error { margin: 0 0 8px; color: var(--rouge); font-size: 10px; font-weight: 700; text-align: right; }
.tracker-target-notice { margin: 0 0 8px; color: var(--accent-strong); font-size: 10px; font-weight: 700; text-align: right; }
.tracker-editable { min-height: 28px; padding: 2px; border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); font: 700 13px var(--font-d); }
.tracker-editable:hover:not(:disabled) { color: var(--accent-strong); }
.tracker-editable:focus { border-bottom-color: var(--accent-strong); background: var(--surface); }
.tracker-editable:focus-visible, .tracker-star-popover :is(select, button):focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.tracker-editable:disabled, .tracker-star-popover :disabled { opacity: .58; cursor: wait; }
.tracker-number-input { width: 4ch; min-width: 32px; text-align: center; appearance: textfield; cursor: text; }
.tracker-number-input::-webkit-outer-spin-button, .tracker-number-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.tracker-star-trigger { cursor: pointer; white-space: nowrap; }
.tracker-progress-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 12px; }
.progress-block { min-width: 0; }
.progress-title { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 28px; color: var(--ink-60); font-size: 12px; font-weight: 800; }
.progress-values { display: inline-flex; align-items: center; gap: 5px; min-width: 0; font-family: var(--font-d); }
.progress-title b { color: var(--ink); font-family: var(--font-d); white-space: nowrap; }
.tracker-star-anchor { position: relative; }
.tracker-star-popover { position: absolute; z-index: 20; top: calc(100% + 7px); left: 0; right: 0; display: flex; flex-direction: column; gap: 9px; padding: 10px; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 25px rgba(73, 59, 44, .22); }
.tracker-star-popover::before { position: absolute; top: -6px; right: 20px; width: 10px; height: 10px; border-left: 1px solid var(--accent); border-top: 1px solid var(--accent); background: var(--surface); content: ''; transform: rotate(45deg); }
.tracker-popover-title { display: flex; align-items: center; gap: 4px; color: var(--brand-blue); font-size: 11px; line-height: 1.5; }
.tracker-popover-title svg { flex: none; }
.tracker-star-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.tracker-star-controls select { width: 100%; min-width: 0; min-height: 44px; appearance: none; padding: 8px 24px 8px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 800 12px var(--font-b); text-align: center; text-align-last: center; background-image: linear-gradient(45deg, transparent 50%, var(--ink-60) 50%), linear-gradient(135deg, var(--ink-60) 50%, transparent 50%); background-position: calc(100% - 13px) 18px, calc(100% - 8px) 18px; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; cursor: pointer; }
.tracker-star-controls select:only-child { grid-column: 1 / -1; }
.tracker-popover-actions { display: flex; justify-content: space-between; gap: 8px; }
.tracker-popover-actions button { min-height: 32px; padding: 5px 10px; border: 1px solid transparent; border-radius: 5px; background: var(--tea); color: var(--cream); font: 800 11px var(--font-b); cursor: pointer; }
.tracker-popover-actions button.cancel { background: var(--paper); color: var(--ink-60); }
.tracker-popover-actions button:hover:not(:disabled) { border-color: var(--accent); }
.progress-track { height: 7px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: var(--cream); }
.progress-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--accent); transition: width .35s var(--ease); }
.progress-track.mint i { background: #BFDCC0; }
.progress-track.rose i { background: var(--rouge); }
.progress-block p { margin-top: 6px; color: var(--ink-60); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.progress-block p strong { color: var(--rouge); font-family: var(--font-d); }
.tracker-materials { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
.materials-head { display: flex; flex-direction: column; gap: 3px; color: var(--ink); font-size: 12px; font-weight: 900; }
.materials-head small { color: var(--ink-35); font-size: 10.5px; font-weight: 600; }
.materials-clear { margin-top: 8px; color: var(--ink); font-size: 11px; font-weight: 800; }
.material-chips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
.material-chip { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 5px; min-height: 28px; border: 1px solid rgba(215, 137, 53, .35); border-radius: 8px; background: var(--cream); padding: 5px 8px; }
.material-chip b { color: var(--ink); font-size: 11px; }
.material-chip em { color: var(--rouge); font: 800 11px var(--font-d); font-style: normal; }
.material-chip small { color: var(--ink-35); font-size: 10px; }
.material-chip.heart-chip { border-color: rgba(166, 81, 74, .35); }
.tracker-materials .material-chips { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.tracker-materials .material-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 7px 6px; }
.tracker-materials .material-chip b { overflow-wrap: anywhere; }
.tracker-materials .material-chip em, .tracker-materials .material-chip small { overflow-wrap: anywhere; }
.material-chip-line { display: flex; align-items: center; gap: 5px; min-width: 0; width: 100%; }
.material-chip-line img, .material-chip-line svg { flex: none; width: 24px; height: 24px; object-fit: contain; color: var(--rouge); }
.material-chip[data-material-name] { position: relative; }
.material-chip[data-material-name]:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.material-chip[data-material-name]::after { content: attr(data-material-name); position: absolute; z-index: 5; left: 0; bottom: calc(100% + 5px); width: max-content; max-width: 180px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--tea); color: var(--cream); font: 12px/1.5 var(--font-b); visibility: hidden; pointer-events: none; }
.material-chip[data-material-name]:hover::after, .material-chip[data-material-name]:focus::after { visibility: visible; }
.eta-line { display: flex; flex-direction: column; gap: 5px; margin-top: 12px; color: var(--ink-60); font-size: 11px; line-height: 1.6; }
.money-total { color: var(--ink-35); }
@media (max-width: 1280px) {
  .tracker-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1080px) {
  .tracker-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .growth-tracker { padding: 15px; border-radius: 17px; }
  .tracker-heading { flex-direction: column; }
  .tracker-refresh { width: 100%; justify-content: center; }
  .tracker-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .aggregate-head { flex-direction: column; gap: 6px; }
  .tracker-progress-grid { gap: 10px; }
}
@media (max-width: 640px) {
  .tracker-list { grid-template-columns: minmax(0, 1fr); }
  .tracker-editable, .tracker-popover-actions button { min-height: 44px; }
  .tracker-number-input { min-width: 44px; }
  .training-levels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tracker-remove { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .progress-track i { transition: none; } }
</style>
