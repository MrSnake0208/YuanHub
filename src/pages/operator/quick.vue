<template>
  <div class="page-quick">
    <IslandSidebar />

    <main class="quick-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">密探</span>
            <span class="pill">养成</span>
            <span class="pill">首次 / 快捷导入</span>
          </div>
          <h1>快捷导入<span class="small">首次建档 · 星阶批量</span></h1>
          <p class="hero-sub">按星阶逐页勾选密探档案：1 星 → 2 星 → … → 觉醒，每一页批量设置「等级 / 修为」，点「保存本页并下一步」即把本页立即写入该子账号，逐页即存，适合账号首次建档或快速补录。</p>
          <div class="hero-stats">
            <div><div class="k">密探目录</div><div class="v">{{ catalogCount }}<small>位</small></div></div>
            <div><div class="k">本页已勾选</div><div class="v">{{ checkedOfCurrent.length }}<small>位</small></div></div>
            <div><div class="k">本次已保存</div><div class="v">{{ sessionSavedCount }}<small>位</small></div></div>
            <div class="is-authed"><div class="k">{{ auth.isLoggedIn ? '保存到' : '登录状态' }}</div><div class="v">{{ auth.isLoggedIn ? (accountName || '—') : '未登录' }}<small>{{ auth.isLoggedIn ? '子账号' : '需登录后使用' }}</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 统一子账号 + 版本 -->
          <div class="account-bar" v-reveal>
            <div class="ac-sel">
              <span class="ac-label">子账号</span>
              <select id="quick-account" v-model="accountId" :disabled="!auth.isLoggedIn || accountsLoading || importing" @change="onAccountChange">
                <option v-if="!accounts.length" value="">（未创建）</option>
                <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span v-if="accountError" class="ac-warn">{{ accountError }}</span>
            </div>
            <span class="ac-sel">
              <span class="ac-label">版本</span>
              <select id="quick-game" v-model="gameFilter" :disabled="importing" @change="onGameChange">
                <option value="all">全部（通用）</option>
                <option value="如鸢">如鸢</option>
                <option value="代号鸢">代号鸢</option>
              </select>
            </span>
            <span class="sp"></span>
            <router-link class="act-btn ghost" to="/operator">返回密探页</router-link>
          </div>

          <!-- 未登录 / 未建账号 -->
          <div v-if="!auth.isLoggedIn" class="state err" v-reveal>
            请先登录后再使用快捷导入
            <router-link class="link" to="/login">去登录</router-link>
          </div>
          <div v-else-if="accountsLoading || catalogLoading" class="state" v-reveal>正在加载快捷导入数据…</div>
          <div v-else-if="!accounts.length" class="state err" v-reveal>
            尚未创建子账号，请先返回密探页创建
            <router-link class="link" to="/operator">去创建</router-link>
          </div>
          <div v-else-if="catalogError && !catalogOperators.length" class="state err" v-reveal>
            {{ catalogError }}<button class="link" @click="loadCatalog">重试</button>
          </div>

          <template v-else>
            <!-- 步骤条 -->
            <div class="stepper" v-reveal>
              <button
                v-for="s in steps"
                :key="s.key"
                type="button"
                class="step"
                :class="{ on: s.key === currentKey, done: isStepDone(s.key), locked: !isStepUnlocked(s.key) }"
                :disabled="importing || !isStepUnlocked(s.key)"
                :title="isStepUnlocked(s.key) ? s.title : '请先在上一步点击“下一步”解锁'"
                @click="goStep(s.key)"
              >
                <span class="step-no">{{ steps.indexOf(s) + 1 }}</span>
                <span class="step-txt">{{ s.nav }}<small v-if="isStepDone(s.key)">{{ countOf(s.key) }} 位</small><small v-if="savedByKey[s.key]" class="saved">已存</small></span>
              </button>
            </div>

            <!-- 单页：勾选某星阶密探 + 批量修为/等级，逐页即存 -->
            <div class="wiz-card" v-reveal>
              <div class="wiz-head">
                <h2>{{ currentStep.title }}</h2>
                <p class="wiz-sub">{{ currentStep.sub }}；本页的「等级 / 修为」会批量应用到已勾选的密探上，点「保存本页并下一步」即写入该子账号。</p>
              </div>

              <!-- 本页保存状态 -->
              <div v-if="pageSave.show" class="page-save" :class="{ err: !pageSave.ok }">
                <template v-if="pageSave.ok">✓ {{ pageSave.message }}</template>
                <template v-else>{{ pageSave.message }}<button class="link" type="button" :disabled="importing" @click="saveCurrentPage">重试</button></template>
              </div>
              <div v-else-if="savedByKey[currentKey]" class="page-save ok-static">✓ 本页已保存 · 修改后可重新点「保存本页并下一步」覆盖保存</div>

              <!-- 批量设置条 -->
              <div class="batch-bar">
                <span class="batch-count">已勾选 <b>{{ checkedOfCurrent.length }}</b> 位</span>
                <div class="batch-fields">
                  <label class="bf">
                    <span>等级</span>
                    <input name="level" type="number" v-model.number="pageForm.level" min="0" max="100" :disabled="importing" @change="normalizePageForm" />
                    <i>/100</i>
                  </label>
                  <label class="bf">
                    <span>修为</span>
                    <input name="elite" type="number" v-model.number="pageForm.elite" min="0" :max="maxEliteHint" :disabled="importing" @change="normalizePageForm" />
                    <i>/{{ OPERATOR_ELITE_MAX }}</i>
                  </label>
                </div>
                <span v-if="maxEliteHint" class="elite-hint">当前等级最高修为 {{ maxEliteHint }}</span>
                <span class="sp"></span>
                <button class="mini" type="button" :disabled="importing" @click="selectAllPage">全选本页</button>
                <button class="mini" type="button" :disabled="importing" @click="clearPage">清空本页</button>
              </div>

              <!-- 搜索 -->
              <div class="op-search">
                <input v-model.trim="search" class="op-search-input" type="search" placeholder="搜索名称 / 别名 / id" />
                <span class="op-search-count">本页 {{ pageOperators.length }} 位 · 已有数据 {{ hasDataOperators.length }} 位 · 目录 {{ catalogCount }} 位</span>
              </div>

              <!-- 属性 / 从属 筛选（随翻页重置） -->
              <div class="prof-filter" v-reveal>
                <div class="pf-row">
                  <span class="pf-label">属性</span>
                  <div class="mf-filter">
                    <button :class="{ on: profFilter === 'all' }" @click="profFilter = 'all'">全部</button>
                    <button v-for="p in profOptions" :key="p" :class="{ on: profFilter === p }" @click="profFilter = p">{{ p }}</button>
                  </div>
                </div>
                <div class="pf-row">
                  <span class="pf-label">从属</span>
                  <div class="mf-filter">
                    <button :class="{ on: subProfFilter === 'all' }" @click="subProfFilter = 'all'">全部</button>
                    <button v-for="s in subProfOptions" :key="s" :class="{ on: subProfFilter === s }" @click="subProfFilter = s">{{ s }}</button>
                  </div>
                </div>
              </div>

              <!-- 分组：无数据密探在前，已有数据的沉底并用分割线隔开 -->
              <template v-if="operatorGroups.length">
                <template v-for="(g, gi) in operatorGroups" :key="gi">
                  <div v-if="g.divider" class="op-divider"><span>{{ g.label }}</span></div>
                  <ul class="op-list" :class="{ 'op-list-group': g.divider }">
                    <li v-for="op in g.items" :key="op.id" class="op-col">
                      <label class="op-card" :class="{ on: isChecked(op.id) }">
                        <input type="checkbox" class="op-check" :checked="isChecked(op.id)" :disabled="importing" @change="toggleOperator(op.id, $event)" />
                        <img v-if="op.avatar" class="op-avatar" :src="avatarUrl(op.avatar)" :alt="op.name" loading="lazy" />
                        <span v-else class="op-ph">{{ monogram(op) }}</span>
                        <span class="op-meta">
                          <span class="op-name">{{ op.name }}</span>
                          <span class="op-sub">{{ op.prof }} · {{ op.rarity }}★</span>
                        </span>
                      </label>
                    </li>
                  </ul>
                </template>
              </template>
              <div v-else class="state slim">没有匹配{{ filterSuffix }}的密探</div>

              <div class="wiz-actions">
                <button class="btn ghost" type="button" :disabled="importing || stepIndex === 0" @click="goStep(steps[stepIndex - 1].key)">上一步</button>
                <button class="btn primary" type="button" :disabled="importing" @click="nextStep">
                  {{ importing ? '保存中…' : (isAwaken ? '保存并完成' : '保存本页并下一步') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </section>

      <SiteFooter>
        <template #big>快捷导入<br><span>首次建档 · 星阶批量</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探养成档案· 快捷导入<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际养成为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import {
  getOperatorCatalog,
  listOperatorAccounts,
  getOperatorCurrent,
  importOperator
} from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { auth } from '../../store/auth.js'
import { activeAccount } from '../../store/activeAccount.js'
import { dialog } from '../../utils/dialog.js'
import { AGENT_CATALOG, AGENT_PROFS } from '../../data/inventory/catalog.js'
import { matchesProfSubFilter, subProfOptions as deriveSubProfOptions } from '../../utils/operatorFilters.js'

const router = useRouter()
const route = useRoute()

// —— 星阶常量（与后端 OperatorService.MAX_STAR_LEVEL 对齐） ——
const OPERATOR_LEVEL_MAX = 100
const OPERATOR_ELITE_MAX = 17
const MAX_STAR_LEVEL = 31
const STAR_LEVEL_AWAKEN = 31
const NODE_RANGE = [0, 1, 2, 3, 4, 5]

function getMaxEliteForLevel(level) {
  const normalizedLevel = Math.min(
    OPERATOR_LEVEL_MAX,
    Math.max(0, Math.trunc(Number(level) || 0))
  )
  return Math.min(
    OPERATOR_ELITE_MAX,
    Math.max(0, Math.floor(normalizedLevel / 5) - 3)
  )
}

// —— 步骤定义 ——
const starSteps = [
  { key: '1', nav: '1星', title: '选择 1 星密探', sub: '勾选当前为「1 星」的密探（节点 0~5）。' },
  { key: '2', nav: '2星', title: '勾选 2 星密探', sub: '勾选当前为「2 星」的密探（节点 0~5）。' },
  { key: '3', nav: '3星', title: '勾选 3 星密探', sub: '勾选当前为「3 星」的密探（节点 0~5）。' },
  { key: '4', nav: '4星', title: '勾选 4 星密探', sub: '勾选当前为「4 星」的密探（节点 0~5）。' },
  { key: '5', nav: '5星', title: '勾选 5 星密探', sub: '勾选当前为「5 星」的密探（节点 0~5）。' },
  { key: 'awaken', nav: '觉醒', title: '勾选 觉醒 密探', sub: '勾选当前已「觉醒」的密探（仅一档）。' }
]
const steps = starSteps

// —— 页面状态 ——
const stepIndex = ref(0)
const maxUnlockedStep = ref(0)
const search = ref('')
const gameFilter = ref('all')
const profFilter = ref('all')
const subProfFilter = ref('all')
const profOptions = AGENT_PROFS
const subProfOptions = computed(function () { return deriveSubProfOptions(catalogOperators.value) })
const accounts = ref([])
// 当前选中账号由 activeAccount store 记忆并持久化（跨页面导航 / 刷新不丢）
const accountId = computed({
  get: function () { return activeAccount.id },
  set: function (v) { activeAccount.set(v) }
})
const accountsLoading = ref(false)
const accountError = ref('')
const catalogLoading = ref(false)
const catalogError = ref('')
const catalogVersion = ref('')
const backendCatalog = ref([])
const currentEntries = ref([])
const importing = ref(false)
const sessionSavedCount = ref(0)
// 每页是否已保存过（用于步骤条“已存”标记 + 返回已保存页时的提示）
const savedByKey = reactive({})
// 本页最近一次保存结果（成功 / 失败提示）
const pageSave = reactive({ show: false, ok: false, message: '' })
let currentLoadToken = 0

// 每页：勾选集合 + 批量表单（等级 / 修为；节点不显示，默认 0）
const checkedByKey = reactive({ '1': [], '2': [], '3': [], '4': [], '5': [], awaken: [] })
const formByKey = reactive({})
starSteps.forEach(function (s) {
  formByKey[s.key] = { elite: 0, level: 0, node: 0 }
  if (!checkedByKey[s.key]) checkedByKey[s.key] = []
})

// —— 派生状态 ——
const currentStep = computed(function () { return steps[stepIndex.value] })
const currentKey = computed(function () { return currentStep.value.key })
const isAwaken = computed(function () { return currentKey.value === 'awaken' })
const checkedOfCurrent = computed(function () { return checkedByKey[currentKey.value] || [] })
const pageForm = computed(function () { return formByKey[currentKey.value] || { elite: 0, level: 0, node: 0 } })

// —— 目录归一化（与密探页一致） ——
function normalizeOperator(op) {
  const rawSub = op.subProf || op.sub_prof || ''
  return {
    id: op.operatorId || op.operator_id || op.id || '',
    name: op.name || '',
    alias: op.alias || '',
    rarity: op.rarity != null ? op.rarity : 3,
    prof: Array.isArray(op.prof) ? op.prof.join('、') : (op.prof || '未知'),
    subProf: Array.isArray(rawSub) ? rawSub : (rawSub ? [rawSub] : []),
    games: op.games || op.games_list || [],
    discs: op.discs || op.discs_list || [],
    starStones: op.starStones || op.star_stones || [],
    avatar: op.avatar || ''
  }
}

const catalogOperators = computed(function () {
  if (backendCatalog.value.length) return backendCatalog.value.map(normalizeOperator)
  return AGENT_CATALOG.map(function (e) {
    return {
      id: e.id,
      name: e.name,
      alias: '',
      rarity: e.rarity || 3,
      prof: e.prof || '未知',
      subProf: e.subProf || '',
      games: ['如鸢', '代号鸢'],
      discs: [],
      starStones: [],
      avatar: ''
    }
  })
})

const catalogMap = computed(function () {
  const m = {}
  catalogOperators.value.forEach(function (op) { m[op.id] = op })
  return m
})

const catalogCount = computed(function () { return catalogOperators.value.length })

function matchesGame(item, game) {
  if (game === 'all') return true
  const games = item && (item.games || [])
  if (!games || games.length === 0) return true
  return games.indexOf(game) !== -1
}

const pageOperators = computed(function () {
  const q = search.value.toLowerCase()
  return catalogOperators.value
    .filter(function (op) { return matchesGame(op, gameFilter.value) })
    .filter(function (op) { return matchesProfSubFilter(op, profFilter.value, subProfFilter.value) })
    .filter(function (op) {
      if (!q) return true
      const hay = [op.name, op.alias, op.id, op.prof, op.subProf].filter(Boolean).join(' ').toLowerCase()
      return hay.indexOf(q) !== -1
    })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh') })
})

// 筛选条件摘要（用于空态提示）
const filterSuffix = computed(function () {
  const parts = []
  if (search.value) parts.push('「' + search.value + '」')
  if (gameFilter.value !== 'all') parts.push('版本「' + gameFilter.value + '」')
  if (profFilter.value !== 'all') parts.push('属性「' + profFilter.value + '」')
  if (subProfFilter.value !== 'all') parts.push('从属「' + subProfFilter.value + '」')
  return parts.length ? parts.join(' · ') : ''
})

// 分组：无数据密探放前面；已有数据的沉底，用分割线隔开（仍跟随搜索 / 版本筛选）
const noDataOperators = computed(function () {
  return pageOperators.value.filter(function (op) { return !hasExistingData(op.id) })
})
const hasDataOperators = computed(function () {
  return pageOperators.value.filter(function (op) { return hasExistingData(op.id) })
})
const operatorGroups = computed(function () {
  const groups = []
  if (noDataOperators.value.length) groups.push({ divider: false, items: noDataOperators.value })
  if (hasDataOperators.value.length) groups.push({
    divider: true,
    label: '已有养成数据 · ' + hasDataOperators.value.length + ' 位',
    items: hasDataOperators.value
  })
  return groups
})

// —— 当前养成（用于“已有”标记 + 保留命盘/星石） ——
function normalizeEntry(e) {
  e = e || {}
  return {
    elite: e.elite != null ? e.elite : 0,
    starLevel: e.starLevel != null ? e.starLevel : (e.star_level != null ? e.star_level : 0),
    level: e.level != null ? e.level : 0,
    discs: e.discs || [],
    starStones: e.starStones || e.star_stones || []
  }
}

const currentMap = computed(function () {
  const m = {}
  currentEntries.value.forEach(function (e) { m[e.id] = e })
  return m
})

function starLabelOf(v) {
  const n = Number(v) || 0
  if (n <= 0) return ''
  if (n === STAR_LEVEL_AWAKEN) return '觉醒'
  if (n >= 1 && n <= 30) return Math.floor((n - 1) / 6) + 1 + '星'
  return ''
}

// —— 勾选辅助 ——
function isChecked(id) {
  return (checkedByKey[currentKey.value] || []).indexOf(id) !== -1
}

function isStepDone(key) {
  return (checkedByKey[key] || []).length > 0
}

function isStepUnlocked(key) {
  const idx = steps.findIndex(function (s) { return s.key === key })
  return idx !== -1 && idx <= maxUnlockedStep.value
}

function countOf(key) {
  return (checkedByKey[key] || []).length
}

function stepLabel(key) {
  const step = starSteps.find(function (s) { return s.key === key })
  return step ? step.nav : key
}

function previousStepFor(id, keepKey) {
  for (const s of starSteps) {
    if (s.key === keepKey) continue
    if ((checkedByKey[s.key] || []).indexOf(id) !== -1) return s.key
  }
  return ''
}

async function confirmOverwrite(names, fromKey, toKey) {
  if (!names.length) return true
  const shown = names.slice(0, 5).join('、')
  const suffix = names.length > 5 ? '等 ' + names.length + ' 位密探' : ''
  return await dialog.confirm({
    title: '调整勾选',
    message:
      (names.length === 1 ? names[0] : shown + suffix) +
      '已在' + stepLabel(fromKey) + '选择，是否覆盖到' + stepLabel(toKey) + '？'
  })
}

function hasExistingData(id) {
  const entry = currentMap.value[id]
  return !!entry && (Number(entry.level) > 0 || Number(entry.elite) > 0 || Number(entry.starLevel) > 0 ||
    (Array.isArray(entry.discs) && entry.discs.length > 0) ||
    (Array.isArray(entry.starStones) && entry.starStones.length > 0))
}

async function confirmExistingData(id, key) {
  if (!hasExistingData(id)) return true
  const op = catalogMap.value[id]
  const entry = currentMap.value[id]
  const name = op ? op.name || id : id
  const detail = entry ? '（已有 Lv' + (entry.level || 0) + ' · 修为 ' + (entry.elite || 0) + ' · ' + (starLabelOf(entry.starLevel) || '已有养成数据') + '）' : ''
  return await dialog.confirm({
    title: '覆盖养成数据',
    message: name + detail + '，是否覆盖为' + stepLabel(key) + '的设置？\n已有的命盘和星石会继续保留。',
    confirmText: '覆盖'
  })
}

function removeFromOtherSteps(ids, keepKey) {
  const idSet = new Set(ids)
  starSteps.forEach(function (s) {
    if (s.key === keepKey) return
    checkedByKey[s.key] = (checkedByKey[s.key] || []).filter(function (id) { return !idSet.has(id) })
  })
}

async function toggleOperator(id, event) {
  const checkbox = event && event.target
  const checked = !!(checkbox && checkbox.checked)
  const key = currentKey.value
  const cur = checkedByKey[key] || []
  if (checked) {
    if (cur.indexOf(id) !== -1) return
    const fromKey = previousStepFor(id, key)
    const name = catalogMap.value[id] ? catalogMap.value[id].name || id : id
    if (fromKey && !(await confirmOverwrite([name], fromKey, key))) {
      // 原生 checkbox 会先切换状态再触发 change；取消覆盖时需立即恢复视觉状态。
      checkbox.checked = false
      return
    }
    if (!(await confirmExistingData(id, key))) {
      checkbox.checked = false
      return
    }
    removeFromOtherSteps([id], key)
    checkedByKey[key] = cur.concat(id)
  } else {
    checkedByKey[key] = cur.filter(function (item) { return item !== id })
  }
}

async function selectAllPage() {
  const key = currentKey.value
  const cur = checkedByKey[key] || []
  const ids = pageOperators.value.map(function (op) { return op.id })
  const toAdd = []
  // 对「跨页冲突 / 已有数据」的密探逐个确认：点“否/跳过”只跳过那一个，其余照常勾选。
  for (const id of ids) {
    const name = catalogMap.value[id] ? (catalogMap.value[id].name || id) : id
    const fromKey = previousStepFor(id, key)
    if (fromKey) {
      const ok = await dialog.confirm({
        title: '调整勾选',
        message: '「' + name + '」已在' + stepLabel(fromKey) + '选择，全选时是否覆盖到' + stepLabel(key) + '？',
        confirmText: '覆盖并勾选',
        cancelText: '跳过'
      })
      if (!ok) continue
    } else if (hasExistingData(id)) {
      const entry = currentMap.value[id]
      const detail = entry ? '（已有 Lv' + (entry.level || 0) + ' · 修为 ' + (entry.elite || 0) + ' · ' + (starLabelOf(entry.starLevel) || '已有养成数据') + '）' : ''
      const ok = await dialog.confirm({
        title: '覆盖养成数据',
        message: '「' + name + '」' + detail + '，全选时是否覆盖为' + stepLabel(key) + '的设置？\n已有的命盘和星石会继续保留。',
        confirmText: '覆盖并勾选',
        cancelText: '跳过'
      })
      if (!ok) continue
    }
    toAdd.push(id)
  }
  if (!toAdd.length) return
  removeFromOtherSteps(toAdd, key)
  checkedByKey[key] = Array.from(new Set(cur.concat(toAdd)))
}

function clearPage() {
  const ids = pageOperators.value.map(function (op) { return op.id })
  checkedByKey[currentKey.value] = (checkedByKey[currentKey.value] || []).filter(function (id) {
    return ids.indexOf(id) === -1
  })
}

// 修为不能超过当前等级上限（每页各自跟随：等级变更下修、修为手工上调时封顶）
watch(
  function () { return currentKey.value && (formByKey[currentKey.value] || {}).level },
  function (level) {
    const f = formByKey[currentKey.value]
    if (!f) return
    const max = getMaxEliteForLevel(level)
    if (f.elite > max) f.elite = max
  }
)
watch(
  function () { return currentKey.value && (formByKey[currentKey.value] || {}).elite },
  function (elite) {
    const f = formByKey[currentKey.value]
    if (!f) return
    const max = getMaxEliteForLevel(f.level)
    if (elite > max) f.elite = max
  }
)

const maxEliteHint = computed(function () {
  const f = pageForm.value
  if (!f) return ''
  return getMaxEliteForLevel(f.level)
})

function clampInt(v, max) {
  return Math.max(0, Math.min(max, Math.trunc(Number(v) || 0)))
}

function normalizePageForm() {
  const f = formByKey[currentKey.value]
  if (!f) return
  f.level = clampInt(f.level, OPERATOR_LEVEL_MAX)
  f.elite = clampInt(f.elite, getMaxEliteForLevel(f.level))
  f.node = clampInt(f.node, NODE_RANGE[NODE_RANGE.length - 1])
}

function starLabelForStep(s, node) {
  if (s.key === 'awaken') return '觉醒'
  return Number(s.key) + ' 星 · ' + (node == null ? 0 : node)
}

// —— 组装某页待导入条目（保留已有命盘 / 星石） ——
function buildPageEntries(key) {
  const ids = checkedByKey[key] || []
  const f = formByKey[key] || { elite: 0, level: 0, node: 0 }
  return ids.map(function (id) {
    const op = catalogMap.value[id]
    if (!op) return null
    const existing = currentMap.value[id] || {}
    const level = clampInt(f.level, OPERATOR_LEVEL_MAX)
    const elite = Math.min(clampInt(f.elite, OPERATOR_ELITE_MAX), getMaxEliteForLevel(level))
    const starLevel = key === 'awaken'
      ? STAR_LEVEL_AWAKEN
      : 6 * (Number(key) - 1) + ((f.node == null ? 0 : f.node)) + 1
    return {
      starKey: key,
      starLabel: starLabelForStep({ key: key }, f.node),
      id: id,
      name: op.name || id,
      elite: elite,
      starLevel: starLevel,
      level: level,
      discs: existing.discs || [],
      starStones: existing.starStones || [],
      rarity: op.rarity,
      prof: op.prof ? op.prof.split('、') : [],
      subProf: Array.isArray(op.subProf) ? op.subProf : (op.subProf ? op.subProf.split('、') : []),
      games: op.games || []
    }
  }).filter(Boolean)
}

const saveGame = computed(function () {
  return gameFilter.value === 'all' ? null : gameFilter.value
})
const saveGameLabel = computed(function () {
  const g = saveGame.value
  return g ? '· 版本「' + g + '」' : '· 版本「通用」'
})

const accountName = computed(function () {
  const hit = accounts.value.find(function (a) { return a.id === accountId.value })
  return (hit && hit.name) || ''
})

// —— 导航 ——
function goStep(key) {
  const idx = steps.findIndex(function (s) { return s.key === key })
  if (idx === -1 || idx > maxUnlockedStep.value) return
  stepIndex.value = idx
  search.value = ''
  profFilter.value = 'all'
  subProfFilter.value = 'all'
  pageSave.show = false
}

// 「保存本页并下一步」：先保存当前页，成功后再翻页；觉醒页保存后完成返回密探页。
async function nextStep() {
  if (importing.value) return
  const hasEntries = buildPageEntries(currentKey.value).length > 0
  const ok = await saveCurrentPage()
  if (!ok) return
  if (stepIndex.value >= steps.length - 1) {
    // 觉醒页：保存后返回密探页（留一点时间展示「已保存」）
    setTimeout(goBack, 600)
    return
  }
  if (hasEntries) {
    // 稍作停留展示「已保存」结果，再翻页
    await new Promise(function (r) { setTimeout(r, 600) })
  }
  pageSave.show = false
  const nextIndex = stepIndex.value + 1
  maxUnlockedStep.value = Math.max(maxUnlockedStep.value, nextIndex)
  stepIndex.value = nextIndex
  search.value = ''
  profFilter.value = 'all'
  subProfFilter.value = 'all'
}

// —— 数据加载 ——
async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const data = await getOperatorCatalog()
    backendCatalog.value = (data && Array.isArray(data.operators)) ? data.operators : []
    catalogVersion.value = (data && data.catalog_version) || ''
  } catch (err) {
    backendCatalog.value = []
    catalogError.value = humanErr(err, '图鉴加载失败，当前显示本地兜底目录')
  } finally {
    catalogLoading.value = false
  }
}

async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; return }
  accountsLoading.value = true
  accountError.value = ''
  try {
    const list = await listOperatorAccounts()
    accounts.value = Array.isArray(list) ? list : []
    // 优先级：入口携带的 ?account= > activeAccount 记住的账号 > 第一个
    const queryId = route.query.account
    const rememberedId = accounts.value.some(function (a) { return a.id === activeAccount.id }) ? activeAccount.id : ''
    const candidate = (queryId && accounts.value.some(function (a) { return a.id === queryId }))
      ? queryId
      : (rememberedId || (accounts.value.length ? accounts.value[0].id : ''))
    if (accountId.value !== candidate) accountId.value = candidate
  } catch (err) {
    accountError.value = humanErr(err, '子账号加载失败')
  } finally {
    accountsLoading.value = false
  }
}

function onAccountChange() {
  currentEntries.value = []
  reloadCurrent()
}

function onGameChange() {
  currentEntries.value = []
  reloadCurrent()
}

async function reloadCurrent() {
  const loadToken = ++currentLoadToken
  if (!auth.isLoggedIn || !accountId.value) {
    currentEntries.value = []
    return
  }
  const requestedAccountId = accountId.value
  const requestedGame = gameFilter.value
  try {
    const game = requestedGame === 'all' ? undefined : requestedGame
    const data = await getOperatorCurrent({ accountId: requestedAccountId, game: game })
    if (loadToken !== currentLoadToken) return
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const combined = {}
    list.forEach(function (doc) {
      const entriesObj = (doc && doc.entries) ? doc.entries : {}
      Object.keys(entriesObj).forEach(function (id) {
        combined[id] = normalizeEntry(entriesObj[id])
      })
    })
    currentEntries.value = Object.keys(combined).map(function (id) {
      return Object.assign({ id: id }, combined[id])
    })
  } catch (_err) {
    // 养成加载失败不阻塞快捷导入，仅“已有”标记缺失；过期请求不得覆盖新选择。
    if (loadToken === currentLoadToken) currentEntries.value = []
  }
}

// —— 逐页保存：一页一导入（一页即存，不再攒到最后一次导入） ——
async function saveCurrentPage() {
  if (!auth.isLoggedIn) { router.push('/login'); return false }
  if (!accountId.value) {
    pageSave.show = true
    pageSave.ok = false
    pageSave.message = '请先创建并选择一个子账号（可在密探或库存页新建）'
    return false
  }
  const key = currentKey.value
  const entries = buildPageEntries(key)
  if (!entries.length) {
    // 本页未勾选：不导入，直接放行（不计入已保存）
    return true
  }
  const account = accounts.value.find(function (a) { return a.id === accountId.value }) || { id: accountId.value, name: accountId.value }
  const now = new Date().toISOString()
  const doc = {
    format: 'myshare-operator-exchange',
    version: 2,
    exported_at: now,
    catalog_version: catalogVersion.value || '',
    producer: { platform: 'yuanhub', version: '1' },
    accounts: [{ id: account.id, name: account.name }],
    records: [{
      account_id: account.id,
      record_id: 'yuanhub:quick:' + Date.now() + ':' + Math.random().toString(16).slice(2, 8),
      record_type: 'operator_snapshot',
      game: saveGame.value,
      effective_at: now,
      snapshot_scope: 'listed',
      entries: entries.map(function (e) {
        return {
          id: e.id,
          name: e.name || undefined,
          alias: undefined,
          rarity: e.rarity,
          prof: e.prof,
          subProf: e.subProf,
          games: e.games,
          elite: e.elite,
          starLevel: e.starLevel,
          level: e.level,
          discs: e.discs,
          starStones: e.starStones
        }
      })
    }]
  }
  importing.value = true
  try {
    await importOperator(doc)
    sessionSavedCount.value += entries.length
    savedByKey[key] = true
    pageSave.show = true
    pageSave.ok = true
    pageSave.message = '本页已保存 ' + entries.length + ' 位到「' + account.name + '」' + saveGameLabel.value
    // 重新拉取当前养成数据，让「已有数据」分组与“已有”标记即时更新
    await reloadCurrent()
    return true
  } catch (err) {
    pageSave.show = true
    pageSave.ok = false
    pageSave.message = '「' + stepLabel(key) + '」保存失败：' + humanErr(err, '导入失败')
    return false
  } finally {
    importing.value = false
  }
}

function goBack() { router.push('/operator') }

function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

onMounted(async function () {
  await loadCatalog()
  await loadAccounts()
  reloadCurrent()
})
</script>

<style scoped>
/* —— 复用全局 CSS 变量（不新增色值），对齐密探页版式 —— */
.quick-main { padding-bottom: 0 }
.page-quick .hero::after { content: '速录' }

/* ---- 子账号 / 版本栏 ---- */
.account-bar { display: flex; align-items: center; gap: 16px; margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; flex-wrap: wrap }
.account-bar .sp { flex: 1 }
.ac-sel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.ac-label { font-size: 13px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }
.ac-sel select { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; min-width: 160px; cursor: pointer; transition: border-color .3s }
.ac-sel select:focus { border-color: var(--accent) }
.ac-warn { font-size: 12px; color: var(--rouge); font-weight: 700 }

.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: all .3s var(--ease); white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center }
.act-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }

/* ---- 步骤条 ---- */
.stepper {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-top: 40px;
  overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.step {
  min-width: 0; width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: flex-start; gap: 8px;
  border: 1.5px solid var(--line); background: var(--surface); color: var(--ink-60); border-radius: 14px;
  padding: 7px 10px 7px 7px; font-family: var(--font-b); font-weight: 800; font-size: 13.5px;
  cursor: pointer; transition: all .3s var(--ease);
}
.step:disabled { opacity: .45; cursor: not-allowed }
.step.locked { background: var(--paper); border-style: dashed }
.step .step-no {
  width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-family: var(--font-d);
  font-size: 12px; font-weight: 900; background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60);
}
.step .step-txt { min-width: 0; display: inline-flex; flex-direction: column; align-items: flex-start; line-height: 1.25; white-space: nowrap }
.step .step-txt small { font-size: 10px; font-family: var(--font-d); font-weight: 700; color: var(--ink-35) }
.step .step-txt small.saved { color: var(--accent-strong) }
.step.done { border-color: var(--yellow-deep); background: var(--yellow) }
.step.done .step-no { border-color: var(--yellow-deep); background: var(--surface) }
.step.on { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.step.on .step-no { background: rgba(255, 255, 255, .16); border-color: rgba(255, 255, 255, .35); color: var(--cream) }
.step.on .step-txt small { color: rgba(255, 248, 236, .8) }
.step:not(.on):hover { border-color: var(--accent); color: var(--ink) }

/* ---- 向导卡片 ---- */
.wiz-card { margin-top: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 22px 24px 24px }
.wiz-head { padding-bottom: 14px; border-bottom: 1.5px dashed var(--line) }
.wiz-head h2 { font-family: var(--font-s); font-weight: 900; font-size: 26px; letter-spacing: .04em; color: var(--ink) }
.wiz-sub { margin-top: 6px; font-size: 12.5px; color: var(--ink-60); line-height: 1.8; font-weight: 600 }

/* ---- 本页保存状态 ---- */
.page-save { margin-top: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-radius: 12px; padding: 10px 14px; font-size: 12.5px; font-weight: 700; background: rgba(215, 137, 53, .14); border: 1.5px solid rgba(215, 137, 53, .45); color: var(--ink) }
.page-save.ok-static { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60) }
.page-save.err { background: rgba(166, 81, 74, .14); border: 1.5px solid rgba(166, 81, 74, .4); color: var(--rouge) }
.page-save .link { margin-left: 6px; background: none; border: none; color: var(--accent-strong); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.page-save .link:disabled { opacity: .5; cursor: not-allowed }

/* ---- 批量设置条 ---- */
.batch-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 16px; background: var(--paper); border: 1.5px solid var(--line); border-radius: 14px; padding: 12px 14px }
.batch-bar .sp { flex: 1 }
.batch-count { font-size: 13px; font-weight: 800; color: var(--ink) }
.batch-count b { font-family: var(--font-d); color: var(--accent-strong); font-size: 16px }
.batch-fields { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.bf { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); background: var(--surface); border: 1.5px solid var(--line); border-radius: 10px; padding: 6px 10px }
.bf input { width: 58px; border: none; background: transparent; font-family: var(--font-d); font-weight: 900; font-size: 14px; color: var(--ink); outline: none; -moz-appearance: textfield }
.bf input::-webkit-outer-spin-button, .bf input::-webkit-inner-spin-button { -webkit-appearance: none }
.bf i { font-style: normal; font-family: var(--font-d); font-size: 11px; color: var(--ink-35) }
.elite-hint { font-size: 11.5px; color: var(--ink-35); font-weight: 600 }
.mini { border: 1.5px solid var(--line); background: var(--surface); color: var(--ink-60); border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s }
.mini:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.mini:disabled { opacity: .45; cursor: not-allowed }

/* ---- 搜索 ---- */
.op-search { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap }
.op-search-input { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 220px; transition: border-color .3s }
.op-search-input:focus { border-color: var(--accent) }
.op-search-count { font-size: 12px; color: var(--ink-35); font-weight: 600 }

/* ---- 属性 / 从属 筛选行 ---- */
.prof-filter { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px }
.pf-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.pf-label { flex: none; min-width: 34px; font-size: 12.5px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }
.mf-filter { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 10px; padding: 4px; flex-wrap: wrap }
.mf-filter button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; color: var(--ink-60); transition: all .3s var(--ease) }
.mf-filter button.on { background: var(--surface); color: var(--accent-strong); box-shadow: 0 1px 4px rgba(73, 59, 44, .16) }
.mf-filter button:hover:not(.on) { color: var(--ink) }

/* ---- 密探勾选卡片 ---- */
.op-list { list-style: none; margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 10px }
.op-col { min-width: 0 }
.op-card {
  display: flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); background: var(--paper);
  border-radius: 12px; padding: 9px 11px; cursor: pointer; transition: all .25s; min-width: 0; height: 100%;
}
.op-card:hover { border-color: var(--accent); box-shadow: 0 10px 22px -14px rgba(73, 59, 44, .3) }
.op-card.on { background: var(--yellow); border-color: var(--yellow-deep) }
.op-check { accent-color: var(--accent-strong); flex: none; width: 16px; height: 16px; cursor: pointer }
.op-ph {
  flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: var(--surface); border: 1.5px solid var(--line); color: var(--ink-35);
  font-family: var(--font-s); font-weight: 900; font-size: 17px;
}
.op-avatar {
  flex: none; width: 34px; height: 34px; border-radius: 10px; object-fit: cover;
  background: var(--surface); border: 1.5px solid var(--line);
}
.op-card.on .op-ph { border-color: var(--yellow-deep); color: var(--ink) }
.op-card.on .op-avatar { border-color: var(--yellow-deep) }
.op-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.op-name { font-size: 13px; font-weight: 800; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.op-sub { font-size: 11px; color: var(--ink-60); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }

/* ---- 分割线：已有数据的密探与无数据区隔开 ---- */
.op-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0 4px }
.op-divider::before, .op-divider::after { content: ''; flex: 1; height: 1.5px; background: repeating-linear-gradient(90deg, var(--line) 0 6px, transparent 6px 12px) }
.op-divider span { flex: none; font-size: 11.5px; font-weight: 800; font-family: var(--font-b); color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 3px 12px; white-space: nowrap }
.op-list-group { margin-top: 8px }

/* ---- 底部操作 ---- */
.wiz-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; flex-wrap: wrap }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }
.btn.primary { background: var(--tea); color: var(--cream) }
.btn.primary:hover:not(:disabled) { background: var(--accent); color: #fff }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.state.slim { padding: 26px 20px; margin-top: 14px; border-radius: 14px }

/* 深色块上的文字 */
.hero-stats div.is-authed .k { font-size: 12px; letter-spacing: .12em; font-weight: 700; color: rgba(73, 59, 44, .65) }
.hero-stats div.is-authed .v small { font-family: var(--font-b); font-size: 14px; font-weight: 700 }

@media (max-width: 900px) {
  .stepper { grid-template-columns: repeat(6, minmax(104px, 1fr)); scroll-snap-type: x proximity }
  .step { scroll-snap-align: start }
}

@media (max-width: 640px) {
  .wiz-card { padding: 16px 14px 18px }
  .op-list { grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)) }
  .op-search-input { width: 100% }
  .step { font-size: 12.5px; padding: 6px 10px 6px 6px }
}
</style>
