<template>
  <section class="growth-tracker" aria-labelledby="growth-tracker-title">
    <div class="tracker-heading">
      <div>
        <span class="section-kicker">特别关注 · 养成追踪</span>
        <h2 id="growth-tracker-title">把下一份资源用在想练的人身上</h2>
        <p>等级、修为、化极的固定需求来自 Wiki 计算规则；五铢钱只展示总量，不参与 ETA。</p>
      </div>
      <button class="tracker-refresh" type="button" :disabled="loading || !accountId" title="刷新库存和流水" @click="loadInventory">
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
      <button type="button" @click="loadInventory">重试</button>
    </div>
    <template v-else>
      <div class="tracker-overview" aria-label="养成追踪概览">
        <div class="overview-cell"><span>特别关注</span><strong>{{ favoriteRows.length }}<small>位</small></strong><em>{{ ownedFavoriteCount }} 位已拥有</em></div>
        <div class="overview-cell"><span>心纸库存</span><strong>{{ formatNumber(totalHeartStock) }}<small>张</small></strong><em>关注密探合计</em></div>
        <div class="overview-cell"><span>本期获得</span><strong>{{ formatNumber(totalHeartAcquired) }}<small>张</small></strong><em>近 {{ rangeDays }} 日</em></div>
        <div class="overview-cell"><span>待补项</span><strong>{{ totalGapCount }}<small>项</small></strong><em>按密探目标合计</em></div>
      </div>

      <div v-if="!favoriteRows.length" class="tracker-state empty">
        <Star :size="18" aria-hidden="true" />
        <span>还没有特别关注的密探。先在图鉴卡片右上角点亮星标。</span>
      </div>

      <template v-else>
        <section class="aggregate-plan" aria-labelledby="aggregate-plan-title">
          <div class="aggregate-head">
            <div><h3 id="aggregate-plan-title">关注目标总账</h3><p>所有关注目标合并计算，共享库存只抵扣一次。</p></div>
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
        </section>

        <div class="tracker-list">
        <article v-for="row in favoriteRows" :key="row.id" class="tracker-row">
          <div class="tracker-row-head">
            <div class="tracker-identity">
              <div class="tracker-avatar" :class="'rarity-r' + (row.rarity || 3)">
                <img v-if="row.avatar" :src="avatarUrl(row.avatar)" :alt="row.name" loading="lazy" />
                <span v-else>{{ monogram(row) }}</span>
              </div>
              <div>
                <h3>{{ row.name || row.id }}</h3>
                <p>
                  <span class="tracker-prof"><img v-if="profIcon(row.prof)" :src="profIcon(row.prof)" alt="" aria-hidden="true" />{{ row.prof || '未知属性' }}</span>
                  <span>{{ firstSubProf(row) || '未标注从属' }}</span>
                  <span>{{ row.owned ? '已拥有' : '未拥有' }}</span>
                </p>
              </div>
            </div>
            <div class="tracker-targets" aria-label="设置养成目标">
              <label>目标等级 <input type="number" :min="row.level" max="100" :value="targetFor(row).level" @change="setTarget(row.id, 'level', $event)" /></label>
              <label>目标修为 <input type="number" :min="row.elite" max="17" :value="targetFor(row).elite" @change="setTarget(row.id, 'elite', $event)" /></label>
              <label>目标节点
                <select :value="targetFor(row).starLevel" @change="setTarget(row.id, 'starLevel', $event)">
                  <option v-for="stage in starStagesFor(row)" :key="stage.value" :value="stage.value">{{ stage.label }}</option>
                </select>
              </label>
            </div>
          </div>

          <div class="tracker-progress-grid">
            <div class="progress-block">
              <div class="progress-title"><span>等级</span><b>Lv{{ row.level }} / {{ targetFor(row).level }}</b></div>
              <div class="progress-track"><i :style="{ width: progress(row.level, targetFor(row).level) + '%' }"></i></div>
              <p>{{ formatNumber(row.calculation.level.experience) }} 经验 · 兵书残卷约 {{ formatNumber(row.calculation.level.books.fragment) }} 卷</p>
            </div>
            <div class="progress-block">
              <div class="progress-title"><span>修为</span><b>{{ row.elite }} / {{ targetFor(row).elite }}</b></div>
              <div class="progress-track mint"><i :style="{ width: progress(row.elite, targetFor(row).elite) + '%' }"></i></div>
              <p>{{ materialSummary(row.calculation.xiuwei) || '无需补充修为材料' }}</p>
            </div>
            <div class="progress-block">
              <div class="progress-title"><span>化极</span><b>{{ starLabel(row.starLevel) }} / {{ starLabel(targetFor(row).starLevel) }}</b></div>
              <div class="progress-track rose"><i :style="{ width: progress(starStage(row.starLevel), starStage(targetFor(row).starLevel)) + '%' }"></i></div>
              <p>持有 {{ formatNumber(row.calculation.heartOwned) }} · 需 {{ formatNumber(row.calculation.star.heart) }} · 缺 <strong>{{ formatNumber(row.calculation.heartGap) }}</strong> · 本期 +{{ formatNumber(row.heartAcquired) }}</p>
            </div>
          </div>

          <div class="tracker-materials">
            <div class="materials-head"><span>单人缺口</span><small>近 {{ rangeDays }} 日流水 · 日均按自然日计算</small></div>
            <div v-if="!row.calculation.gaps.length && !row.calculation.heartGap" class="materials-clear">当前目标材料已备齐</div>
            <div v-else class="material-chips">
              <span v-for="gap in row.calculation.gaps" :key="gap.id" class="material-chip">
                <b>{{ itemName(gap.id) }}</b><em>缺 {{ formatNumber(gap.gap) }}</em><small>{{ rateLabel(gap.id) }}</small>
              </span>
              <span v-if="row.calculation.heartGap" class="material-chip heart-chip">
                <b>心纸</b><em>缺 {{ formatNumber(row.calculation.heartGap) }}</em><small>{{ heartRateLabel(row.id) }}</small>
              </span>
            </div>
            <div class="eta-line">
              <span v-if="row.calculation.etaDays != null">按当前速度，最慢材料约 {{ formatEta(row.calculation.etaDays) }}</span>
              <span v-else>暂无 ETA：没有足够的对应材料流水</span>
              <span class="money-total">五铢钱需求 {{ formatMoney(row.calculation.total.money) }}</span>
            </div>
          </div>
        </article>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Info, RefreshCw, Star } from '@lucide/vue'
import { avatarUrl } from '../../api/request.js'
import { getAcquired, getCurrent } from '../../api/inventory.js'
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
  isLoggedIn: { type: Boolean, default: false }
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
let inventoryLoadSeq = 0

const PROF_ICON_FILES = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }

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

const favoriteRows = computed(function () {
  const ids = props.favoriteIds instanceof Set ? props.favoriteIds : new Set()
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
    const heartGap = Math.max((star.heart || 0) - heartOwned, 0)
    const gaps = net.gaps.slice()
    if (experienceGap) gaps.push({ id: '__experience__', required: level.experience, owned: ownedExperience, gap: experienceGap })
    const etaGaps = gaps.slice()
    if (heartGap) etaGaps.push({ id: '__heart__', agentId: entry.id, required: star.heart, owned: heartOwned, gap: heartGap })
    const etaDays = etaForGaps(etaGaps)
    return Object.assign({}, entry, current, {
      owned: Boolean(current.level || current.elite || current.starLevel),
      level: Number(current.level) || 0,
      elite: Number(current.elite) || 0,
      starLevel: Number(current.starLevel) || 0,
      heartAcquired: Number(acquiredAgents.value[entry.id]) || 0,
      calculation: { level, xiuwei, star, total, net, experienceGap, heartOwned, heartGap, gaps, etaDays }
    })
  })
})

const aggregatePlan = computed(function () {
  const requirements = []
  let experience = 0
  const heartGaps = []
  favoriteRows.value.forEach(function (row) {
    requirements.push(row.calculation.level, row.calculation.xiuwei, row.calculation.star)
    experience += Number(row.calculation.level.experience) || 0
    if (row.calculation.heartGap) {
      heartGaps.push({
        id: '__heart__',
        agentId: row.id,
        required: row.calculation.star.heart,
        owned: row.calculation.heartOwned,
        gap: row.calculation.heartGap
      })
    }
  })
  const total = mergeRequirements(...requirements)
  const net = netRequirement(total, currentItems.value)
  const materialGaps = net.gaps.slice()
  const experienceGap = Math.max(experience - bookExperience(currentItems.value), 0)
  if (experienceGap) materialGaps.push({ id: '__experience__', required: experience, owned: bookExperience(currentItems.value), gap: experienceGap })
  const heartGap = heartGaps.reduce(function (sum, gap) { return sum + gap.gap }, 0)
  return {
    total,
    materialGaps,
    heartGaps,
    heartGap,
    etaDays: etaForGaps(materialGaps.concat(heartGaps))
  }
})

const ownedFavoriteCount = computed(function () { return favoriteRows.value.filter(function (row) { return row.owned }).length })
const totalHeartStock = computed(function () { return favoriteRows.value.reduce(function (sum, row) { return sum + (Number(currentAgents.value[row.id]) || 0) }, 0) })
const totalHeartAcquired = computed(function () { return favoriteRows.value.reduce(function (sum, row) { return sum + (Number(acquiredAgents.value[row.id]) || 0) }, 0) })
const totalGapCount = computed(function () {
  return aggregatePlan.value.materialGaps.length + aggregatePlan.value.heartGaps.length
})
const aggregateEtaLabel = computed(function () {
  if (!aggregatePlan.value.materialGaps.length && !aggregatePlan.value.heartGaps.length) return '当前目标无需等待'
  if (aggregatePlan.value.etaDays == null) return '暂无整体 ETA：至少一项缺口没有对应流水'
  return '按当前速度，最慢材料约 ' + formatEta(aggregatePlan.value.etaDays)
})

function targetStorageKey() { return 'yuanhub:operator-targets:' + props.accountId }

function loadTargets() {
  targets.value = {}
  if (!props.accountId) return
  try {
    const parsed = JSON.parse(localStorage.getItem(targetStorageKey()) || '{}')
    if (parsed && typeof parsed === 'object') targets.value = parsed
  } catch (_) { targets.value = {} }
}

function defaultTarget(row) {
  return { level: 100, elite: 17, starLevel: 31 }
}

function targetFor(row) {
  if (!row || !row.id) return defaultTarget(row)
  const saved = targets.value[row.id] || defaultTarget(row)
  const currentLevel = Number(row.level) || 0
  const currentElite = Number(row.elite) || 0
  const level = Math.max(currentLevel, Math.min(100, Number(saved.level) || 0))
  const eliteLimit = Math.min(17, Math.max(0, Math.floor(level / 5) - 3))
  const elite = Math.max(currentElite, Math.min(eliteLimit, Number(saved.elite) || 0))
  const savedStarLevel = Math.min(31, Math.max(0, Number(saved.starLevel) || 0))
  const currentStarLevel = Number(row.starLevel) || 0
  const starLevel = starStage(savedStarLevel) < starStage(currentStarLevel) ? currentStarLevel : savedStarLevel
  return { level, elite, starLevel }
}

function setTarget(id, field, event) {
  const row = props.catalogEntries.find(function (entry) { return entry.id === id }) || { id }
  const current = currentMap.value[id] || {}
  const target = Object.assign({}, targetFor(row))
  const raw = event && event.target ? event.target.value : 0
  const max = field === 'level' ? 100 : field === 'elite' ? 17 : 31
  const currentValue = Number(current[field]) || 0
  target[field] = Math.min(max, Math.max(currentValue, Number(raw) || 0))
  const eliteLimit = Math.min(17, Math.max(0, Math.floor((target.level || 0) / 5) - 3))
  if (field === 'elite') target[field] = Math.max(Number(current.elite) || 0, Math.min(target[field], eliteLimit))
  if (field === 'level') target.elite = Math.max(Number(current.elite) || 0, Math.min(target.elite, eliteLimit))
  targets.value = Object.assign({}, targets.value, { [id]: target })
  localStorage.setItem(targetStorageKey(), JSON.stringify(targets.value))
}

function starStagesFor(row) {
  const currentStage = starStage(row && row.starLevel)
  return starStages.filter(function (stage) {
    return stage.value === 31 || starStage(stage.value) >= currentStage
  })
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

async function loadInventory() {
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
    const results = await Promise.all([
      getCurrent({ accountId: targetAccount, entityType: 'item' }),
      getCurrent({ accountId: targetAccount, entityType: 'agent' }),
      getAcquired({ accountId: targetAccount, entityType: 'item', from: rangeFrom, to: rangeTo }),
      getAcquired({ accountId: targetAccount, entityType: 'agent', from: rangeFrom, to: rangeTo })
    ])
    if (seq !== inventoryLoadSeq || props.accountId !== targetAccount) return
    currentItems.value = flattenCurrent(results[0])
    currentAgents.value = flattenCurrent(results[1])
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
function starLabel(level) { return Number(level) <= 0 ? '未拥有' : Number(level) >= 25 && Number(level) < 31 ? '五星' : starLabelForStage(starStage(level)) }
function progress(current, target) { const a = Number(current) || 0; const b = Number(target) || 0; return b <= 0 ? 100 : Math.min(100, Math.round(a * 100 / b)) }
function monogram(row) { return Array.from(String(row.name || row.id || '?'))[0] || '?' }
function itemName(id) { return id === '__heart__' ? '心纸' : id === '__experience__' ? '兵书经验' : itemMap.value[id] || id }
function formatNumber(value) { return (Number(value) || 0).toLocaleString('zh-CN') }
function formatMoney(value) { return formatNumber(value) }
function materialSummary(requirement) { return Object.keys(requirement.items || {}).filter(function (id) { return requirement.items[id] > 0 }).slice(0, 3).map(function (id) { return itemName(id) + '×' + formatNumber(requirement.items[id]) }).join('、') }
function bookExperience(stock) {
  return (Number(stock.bingshucanjuan) || 0) * 100 +
    (Number(stock.bingshuquanjuan) || 0) * 1000 +
    (Number(stock.liutaobingshu) || 0) * 10000
}
function rateFor(id) {
  if (id === '__experience__') return bookExperience(acquiredItems.value) / rangeDays
  return (Number(acquiredItems.value[id]) || 0) / rangeDays
}
function rateLabel(id) { const rate = rateFor(id); return rate > 0 ? '日均 ' + rate.toFixed(1) : '暂无速度' }
function heartRateLabel(id) { const rate = (Number(acquiredAgents.value[id]) || 0) / rangeDays; return rate > 0 ? '日均 ' + rate.toFixed(1) : '暂无速度' }
function etaForGaps(gaps) {
  if (!gaps.length) return 0
  const days = gaps.map(function (gap) {
    const rate = gap.id === '__heart__'
      ? (Number(acquiredAgents.value[gap.agentId]) || 0) / rangeDays
      : rateFor(gap.id)
    return rate > 0 ? gap.gap / rate : null
  })
  if (days.some(function (value) { return value == null })) return null
  return Math.max.apply(Math, days)
}
function formatEta(days) { if (days <= 0) return '无需等待'; if (days < 1) return '不足 1 天'; return Math.ceil(days) + ' 天' }

watch(function () { return [props.accountId, props.isLoggedIn] }, function () { loadTargets(); loadInventory() }, { immediate: true })
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
.tracker-list { display: flex; flex-direction: column; gap: 14px; }
.tracker-row { border: 1px solid var(--line); border-radius: 15px; background: var(--paper); padding: 15px; }
.tracker-row-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.tracker-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tracker-avatar { width: 48px; height: 48px; flex: none; overflow: hidden; display: grid; place-items: center; border: 2px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink-35); font: 900 21px var(--font-s); }
.tracker-avatar img { width: 100%; height: 100%; object-fit: cover; }
.tracker-avatar.rarity-r5 { border-color: var(--accent); }
.tracker-avatar.rarity-r4 { border-color: var(--brand-blue); }
.tracker-identity h3 { overflow: hidden; color: var(--ink); font-size: 15px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.tracker-identity p { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 3px; color: var(--ink-60); font-size: 11px; }
.tracker-identity p > span + span::before { margin-right: 4px; content: '·'; }
.tracker-prof { display: inline-flex; align-items: center; gap: 3px; }
.tracker-prof img { width: 17px; height: 17px; object-fit: contain; }
.tracker-targets { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.tracker-targets label { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-60); font-size: 11px; font-weight: 800; }
.tracker-targets input, .tracker-targets select { width: 58px; min-height: 32px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); padding: 4px 6px; font: 800 12px var(--font-d); outline: none; }
.tracker-targets select { width: 92px; font-family: var(--font-b); }
.tracker-targets input:focus, .tracker-targets select:focus { border-color: var(--accent); }
.tracker-targets input:focus-visible, .tracker-targets select:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px; }
.tracker-progress-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 15px; }
.progress-block { min-width: 0; }
.progress-title { display: flex; justify-content: space-between; gap: 8px; color: var(--ink-60); font-size: 11px; font-weight: 800; }
.progress-title b { color: var(--ink); font-family: var(--font-d); white-space: nowrap; }
.progress-track { height: 7px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: var(--cream); }
.progress-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--accent); transition: width .35s var(--ease); }
.progress-track.mint i { background: #BFDCC0; }
.progress-track.rose i { background: var(--rouge); }
.progress-block p { min-height: 32px; margin-top: 6px; color: var(--ink-60); font-size: 10.5px; line-height: 1.55; }
.progress-block p strong { color: var(--rouge); font-family: var(--font-d); }
.tracker-materials { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
.materials-head { display: flex; justify-content: space-between; gap: 8px; color: var(--ink); font-size: 12px; font-weight: 900; }
.materials-head small { color: var(--ink-35); font-size: 10.5px; font-weight: 600; }
.materials-clear { margin-top: 8px; color: var(--ink); font-size: 11px; font-weight: 800; }
.material-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.material-chip { display: inline-flex; align-items: baseline; gap: 5px; min-height: 28px; border: 1px solid rgba(215, 137, 53, .35); border-radius: 8px; background: var(--cream); padding: 5px 8px; }
.material-chip b { color: var(--ink); font-size: 11px; }
.material-chip em { color: var(--rouge); font: 800 11px var(--font-d); font-style: normal; }
.material-chip small { color: var(--ink-35); font-size: 10px; }
.material-chip.heart-chip { border-color: rgba(166, 81, 74, .35); }
.eta-line { display: flex; justify-content: space-between; gap: 10px; margin-top: 9px; color: var(--ink-60); font-size: 10.5px; }
.money-total { color: var(--ink-35); white-space: nowrap; }
@media (max-width: 760px) {
  .growth-tracker { padding: 15px; border-radius: 17px; }
  .tracker-heading { flex-direction: column; }
  .tracker-refresh { width: 100%; justify-content: center; }
  .tracker-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .aggregate-head { flex-direction: column; gap: 6px; }
  .tracker-row-head { flex-direction: column; }
  .tracker-targets { justify-content: flex-start; width: 100%; }
  .tracker-progress-grid { grid-template-columns: 1fr; gap: 8px; }
  .progress-block p { min-height: 0; }
  .eta-line { flex-direction: column; gap: 3px; }
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .progress-track i { transition: none; } }
</style>
