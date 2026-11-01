<template>
  <div class="demo-page">
    <IslandSidebar />

    <main id="main-content" class="demo-main">
      <header class="demo-hero">
        <div class="wrap demo-wrap">
          <div class="demo-hero-top">
            <div class="demo-crumb"><span class="demo-pill demo-pill-fill">养成规划</span><span class="demo-pill">预览版</span></div>
            <span class="demo-badge"><Sparkles :size="14" aria-hidden="true" />示例存档</span>
          </div>
          <h1>养成规划<span class="demo-title-note">把资源用在刀刃上</span></h1>
          <p class="demo-hero-sub">从当前进度到下一阶段，YuanHub 帮你看清每一份资源该去哪里。</p>
          <div class="demo-account-line">
            <div class="demo-account">
              <span class="demo-account-mark"><UserRound :size="17" aria-hidden="true" /></span>
              <span><b>{{ state.account.name }}</b><small>{{ state.account.game }} · 数据更新于 {{ state.account.updatedAt }}</small></span>
            </div>
            <button type="button" class="demo-reset" @click="resetDemo"><RotateCcw :size="15" aria-hidden="true" />恢复演示初始状态</button>
          </div>
        </div>
      </header>

      <section class="demo-content">
        <div class="wrap demo-wrap">
          <nav class="demo-tabs" aria-label="演示视图" data-tour="today-overview">
            <button v-for="item in viewItems" :key="item.id" type="button" :class="{ active: view === item.id }" :aria-current="view === item.id ? 'page' : undefined" @click="setView(item.id)">
              <component :is="item.icon" :size="16" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <small>{{ item.note }}</small>
            </button>
          </nav>

          <div v-if="view === 'overview'" class="demo-view" aria-labelledby="overview-title">
            <div class="demo-section-heading">
              <div><span class="demo-kicker">01 · OVERVIEW</span><h2 id="overview-title">今天优先推进杨修</h2><p>以下使用示例目标、库存和收集记录展示规划方式，不代表真实账号的养成建议。</p></div>
              <button type="button" class="demo-primary" @click="setView('targets')">查看养成目标<ArrowRight :size="16" aria-hidden="true" /></button>
            </div>

            <div class="demo-stat-grid">
              <div class="demo-stat"><span>特别关注</span><strong>{{ summary.favoriteCount }}<small>位</small></strong><em>本期关注名单</em></div>
              <div class="demo-stat demo-stat-accent"><span>总体缺口</span><strong>{{ overallGap }}<small>份</small></strong><em>{{ summary.materialCount + 1 }} 种资源正在规划</em></div>
              <div class="demo-stat"><span>本期心纸</span><strong>+{{ summary.acquiredHeartPaper }}<small>张</small></strong><em>近 {{ summary.periodDays }} 日收集</em></div>
              <div class="demo-stat"><span>材料耗时</span><strong>{{ slowestMaterial ? (slowestMaterial.etaDays == null ? '待补记录' : formatEta(slowestMaterial.etaDays)) : '已备齐' }}</strong><em>{{ slowestMaterial ? slowestMaterial.name : '暂无材料缺口' }}</em></div>
            </div>

            <div class="demo-overview-grid">
              <article class="demo-priority-panel">
                <div class="demo-panel-head"><div><span class="demo-kicker">NEXT MOVE</span><h3>本周优先</h3></div><span class="demo-priority-tag">{{ priorityOperator.priority }}</span></div>
                <div class="demo-priority-body">
                  <div class="demo-large-avatar"><img :src="priorityOperator.avatar" :alt="priorityOperator.name"></div>
                  <div class="demo-priority-copy"><h4>{{ priorityOperator.name }} <span>{{ priorityOperator.prof }} · {{ priorityOperator.subProf }}</span></h4><p>从 Lv{{ priorityOperator.level }} 到 Lv{{ priorityOperator.targetLevel }}，同时推进修为与化极。</p><div class="demo-progress-line"><i :style="{ width: progressOf(priorityOperator) + '%' }"></i></div><div class="demo-progress-meta"><b>{{ progressOf(priorityOperator) }}%</b><span>当前养成完成度</span><button type="button" @click="openOperator(priorityOperator.id)">查看档案 <ChevronRight :size="14" aria-hidden="true" /></button></div></div>
                </div>
                <div class="demo-priority-foot"><span><PackageOpen :size="15" aria-hidden="true" />{{ priorityEstimate.missingCount ? '还缺 ' + priorityEstimate.missingCount + ' 项资源' : '所需资源已备齐' }}</span><span><Clock3 :size="15" aria-hidden="true" />{{ priorityEta }}</span></div>
                <p class="demo-estimate-note">{{ priorityEstimate.unknownMaterials.length ? priorityEstimate.unknownMaterials.join('、') + '缺少收集记录，暂无法估算完整耗时。' : '按示例近 30 日速度估算；心纸按密探分别核算，实际耗时会随收集方式变化。' }}</p>
              </article>

              <article class="demo-mini-plan">
                <div class="demo-panel-head"><div><span class="demo-kicker">RESOURCE MAP</span><h3>资源总账</h3></div><button type="button" class="demo-text-button" @click="setView('materials')">展开总账 <ArrowRight :size="14" aria-hidden="true" /></button></div>
                <div class="demo-material-preview"><div v-for="material in previewMaterials" :key="material.id" class="demo-material-row"><span class="demo-material-icon"><img :src="itemIcon(material.id)" alt="" @error="hideBrokenImage"></span><span class="demo-material-name"><b>{{ material.name }}</b><small>{{ material.category }}</small></span><span class="demo-material-values"><b v-if="material.gap">缺 {{ material.gap }}</b><b v-else class="is-ready"><CircleCheck :size="14" aria-hidden="true" />已备齐</b><small>{{ material.etaDays ? formatEta(material.etaDays) : '暂无速度样本' }}</small></span></div></div>
              </article>
            </div>
          </div>

          <div v-else-if="view === 'targets'" class="demo-view" aria-labelledby="targets-title">
            <div class="demo-section-heading"><div><span class="demo-kicker">02 · TARGETS</span><h2 id="targets-title">你的养成目标</h2><p>目标不是愿望清单，而是可以被库存和流水验证的下一步。</p></div><span class="demo-heading-aside">{{ operators.length }} 位特别关注</span></div>
            <div class="demo-target-list">
              <article v-for="operator in operators" :key="operator.id" class="demo-target-row" :class="{ featured: operator.id === priorityOperator.id }">
                <div class="demo-target-identity"><div class="demo-avatar"><img :src="operator.avatar" :alt="operator.name"></div><div><div class="demo-name-line"><h3>{{ operator.name }}</h3><span class="demo-prof"><img :src="profIcon(operator.prof)" alt="">{{ operator.prof }}</span></div><p>{{ operator.subProf }} · {{ operator.priority }}</p></div></div>
                <div class="demo-target-progress"><div class="demo-target-progress-head"><b>{{ progressOf(operator) }}%</b><span>养成完成度</span></div><div class="demo-progress-line"><i :style="{ width: progressOf(operator) + '%' }"></i></div><div class="demo-target-values"><span>Lv{{ operator.level }} <small>/ Lv{{ operator.targetLevel }}</small></span><span>修为 {{ operator.elite }} <small>/ {{ operator.targetElite }}</small></span><span>化极 {{ starLabel(operator.starLevel) }} <small>/ {{ starLabel(operator.targetStarLevel) }}</small></span></div></div>
                <div class="demo-target-edit"><label>目标等级<input type="number" :min="operator.level" max="100" :value="operator.targetLevel" @change="changeTarget(operator.id, 'level', $event)"></label><label>目标修为<input type="number" :min="operator.elite" max="17" :value="operator.targetElite" @change="changeTarget(operator.id, 'elite', $event)"></label><label>目标化极<select :value="operator.targetStarLevel" @change="changeTarget(operator.id, 'starLevel', $event)"><option v-for="level in 25" :key="level" :value="level" :disabled="level < operator.starLevel">{{ starLabel(level) }}</option></select></label></div>
                <button type="button" class="demo-icon-button" :aria-label="'查看' + operator.name + '档案'" title="查看密探档案" @click="openOperator(operator.id)"><ChevronRight :size="18" aria-hidden="true" /></button>
              </article>
            </div>
            <div class="demo-callout"><Info :size="17" aria-hidden="true" /><span>调整任意目标后，资源总账和完成时间会即时重算。演示中的修改只保存在当前页面。</span></div>
          </div>

          <div v-else-if="view === 'materials'" class="demo-view" aria-labelledby="materials-title">
            <div class="demo-section-heading"><div><span class="demo-kicker">03 · MATERIALS</span><h2 id="materials-title">资源缺口总账</h2><p>共享材料只抵扣一次；心纸按密探分别计算，避免把同一份库存重复使用。</p></div><div class="demo-periods" role="group" aria-label="流水统计周期"><span class="active">近 30 日</span><span>近 7 日</span></div></div>
            <div class="demo-ledger-head"><span>资源</span><span>当前拥有</span><span>目标需求</span><span>实际缺口</span><span>收集速度</span><span>预计完成</span></div>
            <div class="demo-ledger">
              <div v-for="material in materialPlans" :key="material.id" class="demo-ledger-row"><div class="demo-ledger-name"><span class="demo-material-icon"><img :src="itemIcon(material.id)" alt="" @error="hideBrokenImage"></span><span><b>{{ material.name }}</b><small>{{ material.category }}</small></span></div><strong>{{ material.owned }}</strong><strong>{{ material.required }}</strong><strong :class="{ 'is-ready': !material.gap }">{{ material.gap ? '−' + material.gap : '已备齐' }}</strong><span class="demo-rate"><b>{{ material.rate30d ? formatRate(material.rate30d) : '—' }}</b><small>{{ material.rate30d ? '份/日' : '无流水' }}</small></span><span class="demo-eta" :class="{ ready: !material.gap }">{{ material.gap ? formatEta(material.etaDays) : '已完成' }}</span></div>
              <div class="demo-ledger-row demo-heart-row"><div class="demo-ledger-name"><span class="demo-material-icon demo-heart-icon"><HeartIcon :size="17" aria-hidden="true" /></span><span><b>心纸</b><small>按密探分别核算</small></span></div><strong>{{ totalHeartOwned }}</strong><strong>{{ totalHeartRequired }}</strong><strong>−{{ totalHeartGap }}</strong><span class="demo-rate"><b>{{ formatRate(summary.acquiredHeartPaper / summary.periodDays) }}</b><small>张/日</small></span><span class="demo-eta">{{ formatEta(heartEta) }}</span></div>
            </div>
            <div class="demo-ledger-footer"><span><TrendingUp :size="16" aria-hidden="true" />总缺口 {{ summary.totalGap + totalHeartGap }} 份</span><span>五铢钱需求仅展示，不参与 ETA</span></div>
          </div>

          <div v-else class="demo-view" aria-labelledby="operator-title">
            <div class="demo-section-heading"><div><span class="demo-kicker">04 · OPERATOR FILE</span><h2 id="operator-title">密探养成档案</h2><p>把等级、修为、化极、命盘和星石放回同一个上下文。</p></div><button type="button" class="demo-secondary" @click="setView('targets')"><ArrowRight :size="15" aria-hidden="true" />返回养成目标</button></div>
            <div class="demo-operator-hero"><div class="demo-operator-avatar"><img :src="selectedOperator.avatar" :alt="selectedOperator.name"></div><div class="demo-operator-copy"><span class="demo-kicker">{{ selectedOperator.priority }}</span><h3>{{ selectedOperator.name }} <span class="demo-prof"><img :src="profIcon(selectedOperator.prof)" alt="">{{ selectedOperator.prof }} · {{ selectedOperator.subProf }}</span></h3><p>{{ selectedOperator.loadout }} · {{ state.account.name }}</p></div><div class="demo-operator-score"><strong>{{ progressOf(selectedOperator) }}%</strong><span>养成完成度</span></div></div>
            <div class="demo-operator-grid"><section class="demo-detail-panel"><div class="demo-panel-head"><div><span class="demo-kicker">GROWTH STATUS</span><h3>当前进度</h3></div><Target :size="20" aria-hidden="true" /></div><div class="demo-detail-stat"><span>等级</span><b>Lv{{ selectedOperator.level }} <small>/ Lv{{ selectedOperator.targetLevel }}</small></b><i><em :style="{ width: percentage(selectedOperator.level, selectedOperator.targetLevel) + '%' }"></em></i></div><div class="demo-detail-stat"><span>修为</span><b>{{ selectedOperator.elite }} <small>/ {{ selectedOperator.targetElite }}</small></b><i class="mint"><em :style="{ width: percentage(selectedOperator.elite, selectedOperator.targetElite) + '%' }"></em></i></div><div class="demo-detail-stat"><span>化极</span><b>{{ starLabel(selectedOperator.starLevel) }} <small>/ {{ starLabel(selectedOperator.targetStarLevel) }}</small></b><i class="rose"><em :style="{ width: percentage(selectedOperator.starLevel, selectedOperator.targetStarLevel) + '%' }"></em></i></div></section><section class="demo-detail-panel"><div class="demo-panel-head"><div><span class="demo-kicker">BATTLE SNAPSHOT</span><h3>战斗属性</h3></div><Zap :size="20" aria-hidden="true" /></div><div class="demo-combat-grid"><div><span>攻击力</span><b>{{ selectedOperator.combat.attack.toLocaleString() }}</b><small>来自等级 · 修为 · 星石</small></div><div><span>生命力</span><b>{{ selectedOperator.combat.hp.toLocaleString() }}</b><small>已装备当前快照</small></div></div><div class="demo-loadout"><BookOpen :size="16" aria-hidden="true" /><span>{{ selectedOperator.loadout }}</span><small>双命盘与当前星石</small></div></section></div>
            <div class="demo-operator-next"><div><span class="demo-kicker">NEXT MATERIALS</span><h3>完成这位密探还需要</h3></div><div class="demo-next-chips"><span v-for="item in selectedRequirements" :key="item.id"><b>{{ item.name }}</b><strong>缺 {{ item.gap }}</strong></span></div><button type="button" class="demo-primary" @click="setView('materials')">查看资源来源 <ArrowRight :size="16" aria-hidden="true" /></button></div>
          </div>
        </div>
      </section>

      <footer class="demo-footer"><div class="wrap demo-wrap"><span>YuanHub · 养成规划演示</span><span>数据来自示例存档，仅用于产品预览</span></div></footer>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, BookOpen, ChevronRight, CircleCheck, Clock3, Heart as HeartIcon, Info, PackageOpen, RotateCcw, Sparkles, Target, TrendingUp, UserRound, Zap } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { DEMO_SCENARIO, calculateDemoPriorityEstimate, calculateDemoSummary, calculateEtaDays, calculateMaterialPlans, calculateOperatorProgress, createDemoState, normalizeDemoView, updateDemoTarget } from '../../data/demoScenario.js'
import { operatorShareStarLabel } from '../../utils/operatorShare.js'

const route = useRoute()
const router = useRouter()
const state = ref(createDemoState())
const selectedId = ref(DEMO_SCENARIO.operators[0].id)
const view = ref(normalizeDemoView(route.query.view))

const viewItems = [
  { id: 'overview', label: '总览', note: '先看优先级', icon: Target },
  { id: 'targets', label: '养成目标', note: '编辑目标', icon: TrendingUp },
  { id: 'materials', label: '资源缺口', note: '看总账', icon: PackageOpen },
  { id: 'operator', label: '密探档案', note: '看详情', icon: BookOpen }
]

const operators = computed(() => state.value.operators)
const summary = computed(() => calculateDemoSummary(state.value))
const materialPlans = computed(() => calculateMaterialPlans(state.value))
const previewMaterials = computed(() => materialPlans.value.filter(item => item.gap).slice(0, 3))
const slowestMaterial = computed(() => materialPlans.value.find(item => item.gap && item.etaDays == null) || materialPlans.value.filter(item => item.etaDays != null).sort((a, b) => b.etaDays - a.etaDays)[0])
const priorityOperator = computed(() => operators.value.find(item => item.priority === '本周优先') || operators.value[0])
const selectedOperator = computed(() => operators.value.find(item => item.id === selectedId.value) || operators.value[0])
const totalHeartOwned = computed(() => operators.value.reduce((total, item) => total + item.heartOwned, 0))
const totalHeartRequired = computed(() => operators.value.reduce((total, item) => total + item.heartRequired, 0))
const totalHeartGap = computed(() => operators.value.reduce((total, item) => total + Math.max(item.heartRequired - item.heartOwned, 0), 0))
const overallGap = computed(() => summary.value.totalGap + totalHeartGap.value)
const heartEta = computed(() => {
  const estimates = operators.value.filter(item => item.heartRequired > item.heartOwned)
    .map(item => calculateEtaDays(item.heartRequired - item.heartOwned, item.heartAcquired30d))
  return estimates.includes(null) ? null : Math.max(0, ...estimates)
})
const priorityEstimate = computed(() => calculateDemoPriorityEstimate(state.value, priorityOperator.value))
const priorityEta = computed(() => {
  const estimate = priorityEstimate.value
  if (!estimate.missingCount) return '无需等待材料'
  return estimate.etaDays == null ? '完整耗时暂无法估算' : '预计约 ' + formatEta(estimate.etaDays)
})
const selectedRequirements = computed(() => {
  const requirements = calculateOperatorProgress(selectedOperator.value).requirements.items
  return Object.entries(requirements).map(([id, gap]) => ({ id, name: materialName(id), gap })).filter(item => item.gap > 0)
})

watch(() => route.query.view, value => { view.value = normalizeDemoView(value) })

function setView(nextView) {
  const normalized = normalizeDemoView(nextView)
  view.value = normalized
  router.replace({ query: { ...route.query, view: normalized === 'overview' ? undefined : normalized } })
}

function openOperator(id) {
  selectedId.value = id
  setView('operator')
}

function changeTarget(id, field, event) {
  state.value = updateDemoTarget(state.value, id, field, event.target.value)
}

function resetDemo() {
  state.value = createDemoState()
  selectedId.value = DEMO_SCENARIO.operators[0].id
  setView('overview')
}

function percentage(current, target) {
  if (!target) return 100
  return Math.min(Math.round(Number(current) / Number(target) * 100), 100)
}

function progressOf(operator) { return calculateOperatorProgress(operator).percent }
function starLabel(value) { return operatorShareStarLabel(value, false) }
function formatEta(days) { return days == null ? '暂无收集记录，无法估算' : days <= 30 ? `${days} 天` : `${Math.ceil(days / 30)} 个月` }
function formatRate(rate) { return Number(rate).toFixed(1) }
function materialName(id) { return materialPlans.value.find(item => item.id === id)?.name || (id === 'heart-paper' ? '心纸' : id) }
function itemIcon(id) { return id === 'heart-paper' ? '' : `/inventory-icons/items/${id}.png` }
function profIcon(prof) { const files = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }; return `/assets/prof-icons/${files[prof] || 'yang.png'}` }
function hideBrokenImage(event) { event.target.style.display = 'none' }
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.demo-page{color:var(--ink)}
.demo-hero{background:linear-gradient(154deg,var(--yellow) 0%,var(--theme-highlight, #e8c66e) 72%,var(--yellow-deep) 130%);border-radius:0 0 38px 38px}
.demo-hero::before{content:'';pointer-events:none;background:linear-gradient(90deg,var(--theme-wash-strong, rgba(255,253,246,.18)),var(--theme-wash, rgba(255,253,246,.06)) 52%,var(--theme-wash, rgba(255,253,246,.12)))}
.demo-hero::after{content:'养';color:rgba(255,248,236,.2);pointer-events:none}
.demo-pill{border:1px solid var(--theme-line, rgba(73,59,44,.55));border-radius:999px}
.demo-pill-fill{background:var(--tea);border-color:var(--tea);color:var(--on-strong)}
.demo-badge{background:var(--theme-surface, rgba(255,253,246,.65));border:1px solid var(--theme-line, rgba(73,59,44,.18));border-radius:999px}
.demo-title-note{background:var(--tea);border-radius:10px;color:var(--on-strong)}
.demo-hero-sub{color:var(--theme-muted, rgba(73,59,44,.78))}
.demo-account-mark{background:var(--theme-wash-strong, rgba(255,253,246,.5));border:1px solid var(--theme-line, rgba(73,59,44,.18));border-radius:10px}
.demo-account small{color:var(--theme-muted, rgba(73,59,44,.68))}
.demo-reset{border:0;background:transparent;color:var(--ink);cursor:pointer}
.demo-reset:hover{text-decoration:underline;text-underline-offset:4px}
.demo-tabs{background:var(--theme-surface, rgba(255,248,236,.68));border:1px solid var(--demo-line);border-radius:15px;box-shadow:0 12px 30px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.35)}
.demo-tabs button{border:1px solid transparent;border-radius:10px;background:transparent;color:var(--demo-muted);cursor:pointer;transition:background-color .2s ease,color .2s ease,border-color .2s ease}
.demo-tabs button small{opacity:.75}
.demo-tabs button:hover{color:var(--ink);background:var(--theme-wash-strong, rgba(239,210,142,.3))}
.demo-tabs button.active{background:var(--tea);border-color:var(--tea);color:var(--on-strong);box-shadow:0 8px 18px -14px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.65)}
.demo-view{animation:demo-in .28s ease-out both}
.demo-kicker{color:var(--theme-accent-text, var(--accent-strong))}
.demo-section-heading p{color:var(--demo-muted)}
.demo-heading-aside{color:var(--theme-accent-text, var(--accent-strong))}
.demo-primary,.demo-secondary{border-radius:10px;cursor:pointer}
.demo-primary{background:var(--tea);border:1px solid var(--tea);color:var(--on-strong)}
.demo-primary:hover{background:var(--tea-deep)}
.demo-secondary{background:transparent;border:1px solid var(--demo-line);color:var(--ink)}
.demo-secondary:hover{border-color:var(--ink);background:var(--surface)}
.demo-text-button{border:0;background:transparent;color:var(--theme-accent-text, var(--accent-strong));cursor:pointer}
.demo-text-button:hover{text-decoration:underline;text-underline-offset:4px}

.demo-stat-grid{background:var(--theme-wash-strong, rgba(255,253,246,.64));border:1px solid var(--demo-line);border-radius:16px}
.demo-stat{border-right:1px solid var(--demo-line)}
.demo-stat:last-child{border-right:0}
.demo-stat>span{color:var(--demo-muted)}
.demo-stat strong{color:var(--ink)}
.demo-stat em{color:var(--demo-muted)}
.demo-stat-accent{background:var(--theme-wash-strong, rgba(239,210,142,.38))}
.demo-stat-accent strong{color:var(--theme-accent-text, var(--accent-strong))}
.demo-priority-panel,.demo-mini-plan,.demo-target-row,.demo-detail-panel,.demo-operator-next{background:var(--surface);border:1px solid var(--demo-line);box-shadow:var(--demo-shadow)}
.demo-priority-panel,.demo-mini-plan{border-radius:18px}
.demo-priority-tag{background:var(--yellow);border-radius:6px;color:var(--ink)}
.demo-large-avatar{background:linear-gradient(180deg,var(--theme-surface, #fbf3dc),var(--theme-highlight, #f1dfae));border:1px solid var(--demo-line);border-radius:15px}
.demo-priority-copy h4 span{color:var(--demo-muted)}
.demo-priority-copy p{color:var(--demo-muted)}
.demo-progress-line{background:var(--theme-wash, rgba(73,59,44,.1));border-radius:99px}
.demo-progress-line i{background:var(--accent);border-radius:inherit;transition:width .3s ease}
.demo-progress-meta{color:var(--demo-muted)}
.demo-progress-meta b{color:var(--theme-accent-text, var(--accent-strong))}
.demo-progress-meta button{border:0;background:transparent;color:var(--ink);cursor:pointer}
.demo-progress-meta button:hover{text-decoration:underline;text-underline-offset:3px}
.demo-priority-foot{border-top:1px dashed var(--demo-line);color:var(--demo-muted)}
.demo-estimate-note{color:var(--demo-muted)}
.demo-material-row{border-bottom:1px dashed var(--demo-line)}
.demo-material-row:last-child{border-bottom:0}
.demo-material-icon{background:var(--theme-wash-strong, rgba(239,210,142,.34));border-radius:8px;color:var(--theme-accent-text, var(--accent-strong))}
.demo-material-name b{color:var(--ink)}
.demo-material-name small,.demo-material-values small{color:var(--demo-muted)}
.demo-material-values b{color:var(--theme-accent-text, var(--accent-strong))}
.demo-material-values b.is-ready{color:var(--theme-success-text, #5b805d)}
.demo-target-row{border-radius:15px}
.demo-target-row.featured{border-color:var(--theme-line, rgba(215,137,53,.55));box-shadow:0 18px 40px -27px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.65)}
.demo-avatar{background:linear-gradient(180deg,var(--theme-surface, #fbf3dc),var(--theme-highlight, #f1dfae));border:1px solid var(--demo-line);border-radius:11px}
.demo-prof{color:var(--demo-muted)}
.demo-target-identity p{color:var(--demo-muted)}
.demo-target-progress-head b{color:var(--theme-accent-text, var(--accent-strong))}
.demo-target-progress-head span{color:var(--demo-muted)}
.demo-target-values{color:var(--ink)}
.demo-target-values small{color:var(--demo-muted)}
.demo-target-edit label{color:var(--demo-muted)}
.demo-target-edit input,.demo-target-edit select{border:1px solid var(--demo-line);border-radius:7px;background:var(--paper);color:var(--ink);outline:none}
.demo-target-edit input:focus,.demo-target-edit select:focus{border-color:var(--theme-focus, var(--accent));background:var(--surface);box-shadow:0 0 0 3px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.13)}
.demo-icon-button{border:1px solid var(--demo-line);border-radius:9px;background:transparent;color:var(--ink);cursor:pointer}
.demo-icon-button:hover{border-color:var(--accent);background:var(--yellow)}
.demo-callout{border:1px dashed var(--theme-line, rgba(215,137,53,.55));border-radius:10px;background:var(--theme-wash-strong, rgba(239,210,142,.17));color:var(--demo-muted)}
.demo-callout svg{color:var(--theme-accent-text, var(--accent-strong))}

.demo-periods{background:var(--theme-wash, rgba(73,59,44,.07));border-radius:8px}
.demo-periods span{border-radius:6px;color:var(--demo-muted)}
.demo-periods span.active{background:var(--tea);color:var(--on-strong)}
.demo-ledger{border:1px solid var(--demo-line);border-radius:15px;background:var(--surface);box-shadow:var(--demo-shadow)}
.demo-ledger-head{background:var(--tea);color:rgba(255,248,236,.74)}
.demo-ledger-row{border-bottom:1px solid var(--demo-line)}
.demo-ledger-row:last-child{border-bottom:0}
.demo-ledger-row>strong:nth-child(4){color:var(--theme-accent-text, var(--accent-strong))}
.demo-ledger-row>strong.is-ready{color:var(--theme-success-text, #5b805d)}
.demo-ledger-name small{color:var(--demo-muted)}
.demo-rate small{color:var(--demo-muted)}
.demo-eta{color:var(--theme-accent-text, var(--accent-strong))}
.demo-eta.ready{color:var(--theme-success-text, #5b805d)}
.demo-heart-row{background:var(--theme-wash, rgba(239,210,142,.12))}
.demo-heart-icon{background:var(--theme-danger-wash, rgba(166,81,74,.12));color:var(--theme-danger-text, var(--rouge))}
.demo-ledger-footer{color:var(--demo-muted)}
.demo-ledger-footer span:first-child{color:var(--theme-accent-text, var(--accent-strong))}

.demo-operator-hero{background:var(--tea);border-radius:16px;color:var(--on-strong);box-shadow:var(--demo-shadow)}
.demo-operator-avatar{background:linear-gradient(180deg,var(--theme-surface, #fbf3dc),var(--theme-highlight, #f1dfae));border:1px solid var(--theme-line, rgba(255,248,236,.35));border-radius:12px}
.demo-operator-copy .demo-kicker{color:var(--theme-accent-text, var(--yellow))}
.demo-operator-copy h3 .demo-prof{color:rgba(255,248,236,.7)}
.demo-operator-copy p{color:rgba(255,248,236,.68)}
.demo-operator-score{border-left:1px solid var(--theme-line, rgba(255,248,236,.22))}
.demo-operator-score strong{color:var(--theme-accent-text, var(--yellow))}
.demo-operator-score span{color:rgba(255,248,236,.72)}
.demo-detail-panel{border-radius:16px}
.demo-detail-stat>span{color:var(--demo-muted)}
.demo-detail-stat b small{color:var(--demo-muted)}
.demo-detail-stat>i{background:var(--theme-wash, rgba(73,59,44,.1));border-radius:99px}
.demo-detail-stat>i em{background:var(--accent);border-radius:inherit}
.demo-detail-stat>i.mint em{background:var(--theme-success-bg, #7bab82)}
.demo-detail-stat>i.rose em{background:var(--rouge)}
.demo-combat-grid>div{border-bottom:1px dashed var(--demo-line)}
.demo-combat-grid span{color:var(--demo-muted)}
.demo-combat-grid small{color:var(--demo-muted)}
.demo-loadout{color:var(--theme-accent-text, var(--accent-strong))}
.demo-loadout small{color:var(--demo-muted)}
.demo-operator-next{border-radius:16px}
.demo-next-chips span{border:1px solid var(--demo-line);border-radius:8px;background:var(--theme-wash-strong, rgba(239,210,142,.18))}
.demo-next-chips strong{color:var(--theme-accent-text, var(--accent-strong))}
.demo-footer{border-top:1px solid var(--demo-line);color:var(--demo-muted)}

@keyframes demo-in{from{opacity:.2;transform:translateY(5px)}to{opacity:1;transform:none}}
@media (max-width:767px){
  .demo-hero{border-radius:0 0 24px 24px}
  .demo-stat:nth-child(2n){border-right:0}
  .demo-priority-panel,.demo-mini-plan,.demo-detail-panel,.demo-operator-next{border-radius:14px}
  .demo-ledger-row>strong:nth-child(2)::before{content:'拥有 ';color:var(--demo-muted)}
  .demo-ledger-row>strong:nth-child(3)::before{content:'需求 ';color:var(--demo-muted)}
  .demo-ledger-row>strong:nth-child(4)::before{content:'缺口 ';color:var(--demo-muted)}
  .demo-rate::before{content:'速度 ';color:var(--demo-muted)}
  .demo-eta::before{content:'完成 ';color:var(--demo-muted)}
  .demo-operator-score{border-top:1px solid var(--theme-line, rgba(255,248,236,.18));border-left:0}
}
</style>
<style scoped src="./demoPageDesktop.css"></style>
<style scoped src="./demoPageMobile.css"></style>
