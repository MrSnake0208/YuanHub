<template>
  <div class="demo-page">
    <aside class="demo-side" aria-label="演示导航">
      <div class="demo-side-brand"><span class="demo-side-mark">H</span><span><b>YuanHub</b><small>养成规划预览</small></span></div>
      <nav class="demo-side-nav">
        <router-link to="/demo" class="active"><span>01</span>养成规划演示</router-link>
        <router-link to="/operator"><span>02</span>正式密探页面</router-link>
        <router-link to="/inventory"><span>03</span>正式库存页面</router-link>
      </nav>
      <p class="demo-side-note">本页使用示例存档<br>不会读取真实账号</p>
    </aside>

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
          <nav class="demo-tabs" aria-label="演示视图">
            <button v-for="item in viewItems" :key="item.id" type="button" :class="{ active: view === item.id }" :aria-current="view === item.id ? 'page' : undefined" @click="setView(item.id)">
              <component :is="item.icon" :size="16" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <small>{{ item.note }}</small>
            </button>
          </nav>

          <div v-if="view === 'overview'" class="demo-view" aria-labelledby="overview-title">
            <div class="demo-section-heading">
              <div><span class="demo-kicker">01 · OVERVIEW</span><h2 id="overview-title">今天，先把杨修练完</h2><p>根据你的目标、库存和最近收集速度，当前最值得优先投入的是这一位。</p></div>
              <button type="button" class="demo-primary" @click="setView('targets')">查看养成目标<ArrowRight :size="16" aria-hidden="true" /></button>
            </div>

            <div class="demo-stat-grid">
              <div class="demo-stat"><span>特别关注</span><strong>{{ summary.favoriteCount }}<small>位</small></strong><em>本期关注名单</em></div>
              <div class="demo-stat demo-stat-accent"><span>总体缺口</span><strong>{{ overallGap }}<small>份</small></strong><em>{{ summary.materialCount + 1 }} 种资源正在规划</em></div>
              <div class="demo-stat"><span>本期心纸</span><strong>+{{ summary.acquiredHeartPaper }}<small>张</small></strong><em>近 {{ summary.periodDays }} 日收集</em></div>
              <div class="demo-stat"><span>最慢材料</span><strong>{{ slowestMaterial ? formatEta(slowestMaterial.etaDays) : '—' }}</strong><em>{{ slowestMaterial ? slowestMaterial.name : '暂无数据' }}</em></div>
            </div>

            <div class="demo-overview-grid">
              <article class="demo-priority-panel">
                <div class="demo-panel-head"><div><span class="demo-kicker">NEXT MOVE</span><h3>本周优先</h3></div><span class="demo-priority-tag">{{ priorityOperator.priority }}</span></div>
                <div class="demo-priority-body">
                  <div class="demo-large-avatar"><img :src="priorityOperator.avatar" :alt="priorityOperator.name"></div>
                  <div class="demo-priority-copy"><h4>{{ priorityOperator.name }} <span>{{ priorityOperator.prof }} · {{ priorityOperator.subProf }}</span></h4><p>从 Lv{{ priorityOperator.level }} 到 Lv{{ priorityOperator.targetLevel }}，同时推进修为与化极。</p><div class="demo-progress-line"><i :style="{ width: progressOf(priorityOperator) + '%' }"></i></div><div class="demo-progress-meta"><b>{{ progressOf(priorityOperator) }}%</b><span>当前养成完成度</span><button type="button" @click="openOperator(priorityOperator.id)">查看档案 <ChevronRight :size="14" aria-hidden="true" /></button></div></div>
                </div>
                <div class="demo-priority-foot"><span><PackageOpen :size="15" aria-hidden="true" />还缺 {{ priorityMissingCount }} 项资源</span><span><Clock3 :size="15" aria-hidden="true" />最慢约 {{ priorityEta }}</span></div>
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
                <div class="demo-target-edit"><label>目标等级<input type="number" :min="operator.level" max="100" :value="operator.targetLevel" @change="changeTarget(operator.id, 'level', $event)"></label><label>目标修为<input type="number" :min="operator.elite" max="17" :value="operator.targetElite" @change="changeTarget(operator.id, 'elite', $event)"></label><label>目标化极<input type="number" :min="operator.starLevel" max="31" :value="operator.targetStarLevel" @change="changeTarget(operator.id, 'starLevel', $event)"></label></div>
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
import { DEMO_SCENARIO, calculateDemoSummary, calculateEtaDays, calculateMaterialPlans, calculateOperatorProgress, createDemoState, normalizeDemoView, updateDemoTarget } from '../../data/demoScenario.js'

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
const slowestMaterial = computed(() => materialPlans.value.filter(item => item.etaDays != null).sort((a, b) => b.etaDays - a.etaDays)[0])
const priorityOperator = computed(() => operators.value.find(item => item.priority === '本周优先') || operators.value[0])
const selectedOperator = computed(() => operators.value.find(item => item.id === selectedId.value) || operators.value[0])
const totalHeartOwned = computed(() => operators.value.reduce((total, item) => total + item.heartOwned, 0))
const totalHeartRequired = computed(() => operators.value.reduce((total, item) => total + item.heartRequired, 0))
const totalHeartGap = computed(() => Math.max(totalHeartRequired.value - totalHeartOwned.value, 0))
const overallGap = computed(() => summary.value.totalGap + totalHeartGap.value)
const heartEta = computed(() => {
  const periodDays = Number(summary.value.periodDays)
  const acquired = Number(summary.value.acquiredHeartPaper)
  const acquired30d = periodDays > 0 ? acquired * 30 / periodDays : 0
  return calculateEtaDays(totalHeartGap.value, acquired30d)
})
const priorityMissingCount = computed(() => Object.keys(calculateOperatorProgress(priorityOperator.value).requirements.items).length)
const priorityEta = computed(() => {
  const requirements = calculateOperatorProgress(priorityOperator.value).requirements.items
  const plans = materialPlans.value.filter(item => requirements[item.id])
  const days = plans.map(item => item.etaDays).filter(value => value != null)
  return formatEta(days.length ? Math.max(...days) : null)
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
function starLabel(value) { return Number(value) >= 25 ? (Number(value) >= 31 ? '觉醒' : '五星') : `${Math.max(Number(value) - 1, 0)}阶段` }
function formatEta(days) { return days == null ? '暂无 ETA' : days <= 30 ? `${days} 天` : `${Math.ceil(days / 30)} 个月` }
function formatRate(rate) { return Number(rate).toFixed(1) }
function materialName(id) { return materialPlans.value.find(item => item.id === id)?.name || (id === 'heart-paper' ? '心纸' : id) }
function itemIcon(id) { return id === 'heart-paper' ? '' : `/inventory-icons/items/${id}.png` }
function profIcon(prof) { const files = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }; return `/assets/prof-icons/${files[prof] || 'yang.png'}` }
function hideBrokenImage(event) { event.target.style.display = 'none' }
</script>

<style scoped>
:global(:root){
  --demo-line:rgba(156,122,77,.28);
  --demo-muted:rgba(73,59,44,.64);
  --demo-soft:rgba(255,253,246,.72);
  --demo-shadow:0 22px 50px -30px rgba(73,59,44,.42);
}

.demo-page{min-height:100vh;color:var(--ink);font-family:var(--font-b)}
.demo-main{min-height:100vh;margin-left:292px;overflow:hidden}
.demo-wrap{max-width:1240px}
.demo-hero{position:relative;overflow:hidden;padding:42px 0 34px;background:linear-gradient(154deg,var(--yellow) 0%,#e8c66e 72%,var(--yellow-deep) 130%);border-radius:0 0 38px 38px}
.demo-hero::after{content:'养';position:absolute;right:10px;top:-82px;color:rgba(255,248,236,.2);font-family:var(--font-s);font-size:380px;font-weight:900;line-height:1;pointer-events:none}
.demo-hero .demo-wrap{position:relative;z-index:1}
.demo-hero-top,.demo-account-line,.demo-account,.demo-crumb,.demo-badge,.demo-primary,.demo-secondary,.demo-text-button,.demo-panel-head,.demo-priority-foot,.demo-progress-meta,.demo-ledger-footer,.demo-loadout{display:flex;align-items:center}
.demo-hero-top{justify-content:space-between;gap:18px}
.demo-crumb{gap:9px;flex-wrap:wrap}
.demo-pill{padding:5px 12px;border:1px solid rgba(73,59,44,.55);border-radius:999px;font-size:11px;font-weight:800;line-height:1.2}
.demo-pill-fill{background:var(--tea);border-color:var(--tea);color:var(--cream)}
.demo-badge{gap:7px;padding:6px 11px;background:rgba(255,253,246,.65);border:1px solid rgba(73,59,44,.18);border-radius:999px;font-size:11px;font-weight:800}
.demo-hero h1{display:flex;align-items:flex-end;flex-wrap:wrap;gap:0 20px;margin-top:25px;font-family:var(--font-s);font-size:clamp(52px,6.8vw,92px);font-weight:900;line-height:1.02;letter-spacing:.04em}
.demo-title-note{margin-bottom:10px;padding:9px 14px 10px;background:var(--tea);border-radius:10px;color:var(--cream);font-size:clamp(16px,1.8vw,24px);font-weight:700;letter-spacing:.12em;line-height:1.2}
.demo-hero-sub{max-width:620px;margin-top:18px;color:rgba(73,59,44,.78);font-size:14px;line-height:1.8;font-weight:500}
.demo-account-line{justify-content:space-between;gap:24px;margin-top:27px}
.demo-account{gap:10px;min-width:0}
.demo-account-mark{display:grid;place-items:center;width:34px;height:34px;flex:none;background:rgba(255,253,246,.5);border:1px solid rgba(73,59,44,.18);border-radius:10px}
.demo-account b,.demo-account small{display:block}
.demo-account b{font-size:13px;font-weight:800}
.demo-account small{margin-top:3px;color:rgba(73,59,44,.68);font-size:11px}
.demo-reset{display:flex;align-items:center;gap:7px;flex:none;padding:8px 0;border:0;background:transparent;color:var(--ink);font:700 12px var(--font-b);cursor:pointer}
.demo-reset:hover{text-decoration:underline;text-underline-offset:4px}

.demo-content{padding:37px 0 60px}
.demo-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:34px;padding:6px;background:rgba(255,248,236,.68);border:1px solid var(--demo-line);border-radius:15px;box-shadow:0 12px 30px -24px rgba(73,59,44,.35)}
.demo-tabs button{display:grid;grid-template-columns:20px auto;grid-template-rows:auto auto;align-items:center;justify-content:center;column-gap:8px;row-gap:2px;min-height:56px;padding:9px 10px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--demo-muted);font-family:var(--font-b);cursor:pointer;transition:background-color .2s ease,color .2s ease,border-color .2s ease}
.demo-tabs button svg{grid-row:1 / span 2}
.demo-tabs button span{font-size:13px;font-weight:800;text-align:left}
.demo-tabs button small{font-size:10px;text-align:left;opacity:.75}
.demo-tabs button:hover{color:var(--ink);background:rgba(239,210,142,.3)}
.demo-tabs button.active{background:var(--tea);border-color:var(--tea);color:var(--cream);box-shadow:0 8px 18px -14px rgba(73,59,44,.65)}
.demo-view{animation:demo-in .28s ease-out both}
.demo-section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px}
.demo-kicker{display:block;color:var(--accent-strong);font:800 10px var(--font-d);letter-spacing:.14em;line-height:1.4}
.demo-section-heading h2{margin-top:6px;font-family:var(--font-s);font-size:32px;font-weight:900;line-height:1.25;letter-spacing:.02em}
.demo-section-heading p{max-width:650px;margin-top:7px;color:var(--demo-muted);font-size:13px;line-height:1.75}
.demo-heading-aside{flex:none;color:var(--accent-strong);font:800 12px var(--font-d)}
.demo-primary,.demo-secondary{justify-content:center;gap:8px;flex:none;min-height:40px;padding:9px 15px;border-radius:10px;font:800 12px var(--font-b);cursor:pointer}
.demo-primary{background:var(--tea);border:1px solid var(--tea);color:var(--cream)}
.demo-primary:hover{background:var(--tea-deep)}
.demo-secondary{background:transparent;border:1px solid var(--demo-line);color:var(--ink)}
.demo-secondary:hover{border-color:var(--ink);background:var(--surface)}
.demo-text-button{gap:5px;padding:3px 0;border:0;background:transparent;color:var(--accent-strong);font:800 11px var(--font-b);cursor:pointer}
.demo-text-button:hover{text-decoration:underline;text-underline-offset:4px}

.demo-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:25px;background:rgba(255,253,246,.64);border:1px solid var(--demo-line);border-radius:16px;overflow:hidden}
.demo-stat{min-width:0;min-height:122px;padding:20px 20px 17px;border-right:1px solid var(--demo-line)}
.demo-stat:last-child{border-right:0}
.demo-stat>span{display:block;color:var(--demo-muted);font-size:11px;font-weight:800}
.demo-stat strong{display:block;margin-top:8px;color:var(--ink);font:900 30px/1.15 var(--font-d);font-variant-numeric:tabular-nums;white-space:nowrap}
.demo-stat strong small{margin-left:4px;font:700 12px var(--font-b)}
.demo-stat em{display:block;margin-top:8px;color:var(--demo-muted);font-size:10px;font-style:normal;line-height:1.35}
.demo-stat-accent{background:rgba(239,210,142,.38)}
.demo-stat-accent strong{color:var(--accent-strong)}
.demo-overview-grid{display:grid;grid-template-columns:minmax(0,1.17fr) minmax(300px,.83fr);gap:16px}
.demo-priority-panel,.demo-mini-plan,.demo-target-row,.demo-detail-panel,.demo-operator-next{background:var(--surface);border:1px solid var(--demo-line);box-shadow:var(--demo-shadow)}
.demo-priority-panel,.demo-mini-plan{min-width:0;padding:22px 24px;border-radius:18px}
.demo-panel-head{justify-content:space-between;gap:15px;margin-bottom:20px}
.demo-panel-head h3{margin-top:4px;font-family:var(--font-s);font-size:19px;font-weight:900}
.demo-priority-tag{padding:5px 9px;background:var(--yellow);border-radius:6px;color:var(--ink);font-size:10px;font-weight:800}
.demo-priority-body{display:flex;align-items:center;gap:18px;min-width:0}
.demo-large-avatar{width:100px;height:120px;flex:none;overflow:hidden;background:linear-gradient(180deg,#fbf3dc,#f1dfae);border:1px solid var(--demo-line);border-radius:15px}
.demo-large-avatar img,.demo-avatar img,.demo-operator-avatar img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.demo-priority-copy{min-width:0;flex:1}
.demo-priority-copy h4{font-family:var(--font-s);font-size:21px;font-weight:900;line-height:1.35}
.demo-priority-copy h4 span{margin-left:7px;color:var(--demo-muted);font:700 11px var(--font-b)}
.demo-priority-copy p{margin:9px 0 15px;color:var(--demo-muted);font-size:12px;line-height:1.7}
.demo-progress-line{height:7px;overflow:hidden;background:rgba(73,59,44,.1);border-radius:99px}
.demo-progress-line i{display:block;width:0;height:100%;background:var(--accent);border-radius:inherit;transition:width .3s ease}
.demo-progress-meta{gap:8px;margin-top:8px;color:var(--demo-muted);font-size:10px}
.demo-progress-meta b{color:var(--accent-strong);font:900 14px var(--font-d)}
.demo-progress-meta button{display:flex;align-items:center;gap:2px;margin-left:auto;padding:0;border:0;background:transparent;color:var(--ink);font:800 11px var(--font-b);cursor:pointer}
.demo-progress-meta button:hover{text-decoration:underline;text-underline-offset:3px}
.demo-priority-foot{justify-content:space-between;gap:12px;margin-top:21px;padding-top:15px;border-top:1px dashed var(--demo-line);color:var(--demo-muted);font-size:11px}
.demo-priority-foot span{display:flex;align-items:center;gap:6px}
.demo-mini-plan .demo-panel-head{margin-bottom:10px}
.demo-material-preview{display:flex;flex-direction:column}
.demo-material-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px dashed var(--demo-line)}
.demo-material-row:last-child{border-bottom:0}
.demo-material-icon{display:grid;place-items:center;width:30px;height:30px;flex:none;overflow:hidden;background:rgba(239,210,142,.34);border-radius:8px;color:var(--accent-strong)}
.demo-material-icon img{display:block;width:25px;height:25px;object-fit:contain}
.demo-material-name,.demo-material-values{min-width:0}
.demo-material-name b,.demo-material-name small,.demo-material-values b,.demo-material-values small{display:block}
.demo-material-name b{overflow:hidden;color:var(--ink);font-size:12px;white-space:nowrap;text-overflow:ellipsis}
.demo-material-name small,.demo-material-values small{margin-top:3px;color:var(--demo-muted);font-size:10px}
.demo-material-values{text-align:right}
.demo-material-values b{color:var(--accent-strong);font:800 12px var(--font-d)}
.demo-material-values b.is-ready{display:flex;align-items:center;gap:3px;color:#5b805d}

.demo-target-list{display:flex;flex-direction:column;gap:12px}
.demo-target-row{display:grid;grid-template-columns:minmax(190px,1.05fr) minmax(230px,1.35fr) minmax(240px,1fr) 36px;align-items:center;gap:18px;padding:18px 20px;border-radius:15px}
.demo-target-row.featured{border-color:rgba(215,137,53,.55);box-shadow:0 18px 40px -27px rgba(215,137,53,.65)}
.demo-target-identity{display:flex;align-items:center;gap:12px;min-width:0}
.demo-avatar{width:54px;height:66px;flex:none;overflow:hidden;background:linear-gradient(180deg,#fbf3dc,#f1dfae);border:1px solid var(--demo-line);border-radius:11px}
.demo-name-line{display:flex;align-items:center;gap:7px;min-width:0}
.demo-name-line h3{font-family:var(--font-s);font-size:17px;font-weight:900;white-space:nowrap}
.demo-prof{display:inline-flex;align-items:center;gap:3px;color:var(--demo-muted);font-size:10px;font-weight:800;white-space:nowrap}
.demo-prof img{width:15px;height:15px;object-fit:contain}
.demo-target-identity>div:last-child{min-width:0}
.demo-target-identity p{margin-top:6px;overflow:hidden;color:var(--demo-muted);font-size:10px;white-space:nowrap;text-overflow:ellipsis}
.demo-target-progress{min-width:0}
.demo-target-progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
.demo-target-progress-head b{color:var(--accent-strong);font:900 18px var(--font-d)}
.demo-target-progress-head span{color:var(--demo-muted);font-size:10px}
.demo-target-values{display:flex;gap:10px;margin-top:9px;color:var(--ink);font:800 10px var(--font-d);white-space:nowrap}
.demo-target-values small{color:var(--demo-muted);font:600 10px var(--font-d)}
.demo-target-edit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;min-width:0}
.demo-target-edit label{display:flex;flex-direction:column;gap:5px;color:var(--demo-muted);font-size:9px;font-weight:700}
.demo-target-edit input{width:100%;min-width:0;min-height:34px;padding:5px 7px;border:1px solid var(--demo-line);border-radius:7px;background:var(--paper);color:var(--ink);font:800 12px var(--font-d);outline:none}
.demo-target-edit input:focus{border-color:var(--accent);background:var(--surface);box-shadow:0 0 0 3px rgba(215,137,53,.13)}
.demo-icon-button{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--demo-line);border-radius:9px;background:transparent;color:var(--ink);cursor:pointer}
.demo-icon-button:hover{border-color:var(--accent);background:var(--yellow)}
.demo-callout{display:flex;align-items:flex-start;gap:9px;margin-top:16px;padding:13px 15px;border:1px dashed rgba(215,137,53,.55);border-radius:10px;background:rgba(239,210,142,.17);color:var(--demo-muted);font-size:11px;line-height:1.65}
.demo-callout svg{flex:none;margin-top:2px;color:var(--accent-strong)}

.demo-periods{display:flex;gap:3px;padding:3px;background:rgba(73,59,44,.07);border-radius:8px}
.demo-periods span{padding:6px 10px;border-radius:6px;color:var(--demo-muted);font-size:10px;font-weight:800}
.demo-periods span.active{background:var(--tea);color:var(--cream)}
.demo-ledger{overflow:hidden;border:1px solid var(--demo-line);border-radius:15px;background:var(--surface);box-shadow:var(--demo-shadow)}
.demo-ledger-head,.demo-ledger-row{display:grid;grid-template-columns:minmax(180px,2fr) repeat(3,minmax(70px,.75fr)) minmax(85px,1fr) minmax(85px,1fr);align-items:center;gap:14px}
.demo-ledger-head{padding:13px 17px;background:var(--tea);color:rgba(255,248,236,.74);font-size:10px;font-weight:800}
.demo-ledger-row{min-height:67px;padding:11px 17px;border-bottom:1px solid var(--demo-line);font:800 12px var(--font-d);font-variant-numeric:tabular-nums}
.demo-ledger-row:last-child{border-bottom:0}
.demo-ledger-row>strong{text-align:right}
.demo-ledger-row>strong:nth-child(4){color:var(--accent-strong)}
.demo-ledger-row>strong.is-ready{color:#5b805d}
.demo-ledger-name{display:flex;align-items:center;gap:10px;min-width:0}
.demo-ledger-name>span:last-child{min-width:0}
.demo-ledger-name b,.demo-ledger-name small{display:block}
.demo-ledger-name b{overflow:hidden;font:800 12px var(--font-b);white-space:nowrap;text-overflow:ellipsis}
.demo-ledger-name small{margin-top:3px;color:var(--demo-muted);font:500 10px var(--font-b)}
.demo-rate,.demo-eta{min-width:0;text-align:right}
.demo-rate b,.demo-rate small{display:block}
.demo-rate b{font-size:12px}
.demo-rate small{margin-top:3px;color:var(--demo-muted);font:500 10px var(--font-b)}
.demo-eta{color:var(--accent-strong);font:800 11px var(--font-b)}
.demo-eta.ready{color:#5b805d}
.demo-heart-row{background:rgba(239,210,142,.12)}
.demo-heart-icon{background:rgba(166,81,74,.12);color:var(--rouge)}
.demo-ledger-footer{justify-content:space-between;gap:14px;margin-top:14px;color:var(--demo-muted);font-size:10px}
.demo-ledger-footer span:first-child{display:flex;align-items:center;gap:6px;color:var(--accent-strong);font-weight:800}

.demo-operator-hero{display:flex;align-items:center;gap:17px;padding:19px 22px;background:var(--tea);border-radius:16px;color:var(--cream);box-shadow:var(--demo-shadow)}
.demo-operator-avatar{width:80px;height:98px;flex:none;overflow:hidden;background:linear-gradient(180deg,#fbf3dc,#f1dfae);border:1px solid rgba(255,248,236,.35);border-radius:12px}
.demo-operator-copy{min-width:0;flex:1}
.demo-operator-copy .demo-kicker{color:var(--yellow)}
.demo-operator-copy h3{display:flex;align-items:baseline;gap:10px;margin-top:4px;font-family:var(--font-s);font-size:29px;font-weight:900}
.demo-operator-copy h3 .demo-prof{color:rgba(255,248,236,.7);font:700 11px var(--font-b)}
.demo-operator-copy p{margin-top:8px;color:rgba(255,248,236,.68);font-size:11px}
.demo-operator-score{flex:none;padding-left:24px;border-left:1px solid rgba(255,248,236,.22);text-align:right}
.demo-operator-score strong{display:block;color:var(--yellow);font:900 35px var(--font-d)}
.demo-operator-score span{font-size:10px;color:rgba(255,248,236,.72)}
.demo-operator-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.demo-detail-panel{min-width:0;padding:22px 24px;border-radius:16px}
.demo-detail-panel .demo-panel-head{margin-bottom:18px}
.demo-detail-stat{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:9px;margin-top:15px}
.demo-detail-stat>span{color:var(--demo-muted);font-size:11px;font-weight:700}
.demo-detail-stat>b{justify-self:end;font:900 13px var(--font-d)}
.demo-detail-stat b small{color:var(--demo-muted);font:600 10px var(--font-d)}
.demo-detail-stat>i{grid-column:1/-1;height:7px;overflow:hidden;background:rgba(73,59,44,.1);border-radius:99px}
.demo-detail-stat>i em{display:block;height:100%;width:0;background:var(--accent);border-radius:inherit}
.demo-detail-stat>i.mint em{background:#7bab82}
.demo-detail-stat>i.rose em{background:var(--rouge)}
.demo-combat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.demo-combat-grid>div{min-width:0;padding:14px 0;border-bottom:1px dashed var(--demo-line)}
.demo-combat-grid span,.demo-combat-grid b,.demo-combat-grid small{display:block}
.demo-combat-grid span{color:var(--demo-muted);font-size:11px}
.demo-combat-grid b{margin-top:7px;font:900 25px var(--font-d);white-space:nowrap}
.demo-combat-grid small{margin-top:4px;color:var(--demo-muted);font-size:9px;white-space:nowrap}
.demo-loadout{gap:7px;margin-top:18px;color:var(--accent-strong);font-size:11px;font-weight:800}
.demo-loadout small{margin-left:auto;color:var(--demo-muted);font-size:10px;font-weight:500}
.demo-operator-next{display:flex;align-items:center;gap:22px;margin-top:16px;padding:19px 22px;border-radius:16px}
.demo-operator-next h3{margin-top:4px;font-family:var(--font-s);font-size:18px;font-weight:900}
.demo-next-chips{display:flex;flex:1;gap:7px;min-width:0;overflow:auto}
.demo-next-chips span{display:flex;flex-direction:column;gap:4px;flex:none;padding:8px 10px;border:1px solid var(--demo-line);border-radius:8px;background:rgba(239,210,142,.18)}
.demo-next-chips b{font-size:10px;white-space:nowrap}
.demo-next-chips strong{color:var(--accent-strong);font:800 10px var(--font-d)}
.demo-footer{padding:23px 0 30px;border-top:1px solid var(--demo-line);color:var(--demo-muted);font-size:10px}
.demo-footer .wrap{display:flex;justify-content:space-between;gap:18px}

.demo-side{position:fixed;left:28px;top:28px;bottom:28px;width:236px;z-index:50;display:flex;flex-direction:column;padding:30px 26px 24px;background:var(--cream);border:1px solid var(--demo-line);border-radius:26px;box-shadow:0 24px 60px -24px rgba(73,59,44,.28),0 2px 8px rgba(73,59,44,.05)}
.demo-side-brand{display:flex;align-items:center;gap:10px;padding-bottom:24px;border-bottom:1px dashed var(--demo-line)}
.demo-side-mark{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:10px;background:var(--tea);color:var(--cream);font:900 15px var(--font-d)}
.demo-side-brand b,.demo-side-brand small{display:block}
.demo-side-brand b{font:800 14px var(--font-d)}
.demo-side-brand small{margin-top:3px;color:var(--demo-muted);font-size:11px}
.demo-side-nav{display:flex;flex-direction:column;gap:5px;margin-top:28px}
.demo-side-nav a{display:flex;align-items:center;gap:10px;padding:11px 10px;border-radius:11px;color:var(--demo-muted);font-size:13px;font-weight:700;text-decoration:none;transition:background-color .2s ease,color .2s ease}
.demo-side-nav a span{color:var(--demo-muted);font:800 10px var(--font-d)}
.demo-side-nav a.active,.demo-side-nav a:hover{background:var(--yellow);color:var(--ink)}
.demo-side-nav a.active span,.demo-side-nav a:hover span{color:var(--ink)}
.demo-side-note{margin-top:auto;padding-top:18px;border-top:1px dashed var(--demo-line);color:var(--demo-muted);font-size:11px;line-height:1.8}

@keyframes demo-in{from{opacity:.2;transform:translateY(5px)}to{opacity:1;transform:none}}

@media (max-width:1100px){
  .demo-side{display:none}
  .demo-main{margin-left:0}
  .demo-overview-grid,.demo-operator-grid{grid-template-columns:1fr}
  .demo-target-row{grid-template-columns:minmax(180px,1fr) minmax(220px,1.2fr) 36px}
  .demo-target-progress{grid-column:2}
  .demo-target-edit{grid-column:1 / -1}
  .demo-icon-button{grid-column:3;grid-row:1;justify-self:end}
}
@media (max-width:767px){
  .demo-side{display:none}
  .demo-main{margin-left:0}
  .demo-hero{padding-top:27px;border-radius:0 0 24px 24px}
  .demo-hero::after{top:-3px;right:-16px;font-size:160px}
  .demo-hero h1{display:block;margin-top:25px;font-size:42px}
  .demo-title-note{display:table;margin-top:10px;font-size:15px}
  .demo-hero-sub{max-width:300px}
  .demo-account-line{align-items:flex-start;gap:15px;flex-direction:column}
  .demo-content{padding:22px 0 44px}
  .demo-tabs{gap:5px;margin-bottom:27px}
  .demo-tabs button{min-height:74px;padding:10px 8px;grid-template-columns:1fr;grid-template-rows:auto auto auto;justify-items:center;text-align:center}
  .demo-tabs button svg{grid-row:auto}
  .demo-tabs button span{font-size:12px}
  .demo-tabs button small{font-size:9px}
  .demo-section-heading{align-items:flex-start;flex-direction:column;margin-bottom:18px}
  .demo-section-heading h2{font-size:30px}
  .demo-section-heading p{font-size:13px}
  .demo-heading-aside{align-self:flex-end}
  .demo-stat-grid{grid-template-columns:1fr 1fr}
  .demo-stat{min-height:100px;padding:15px 12px}
  .demo-stat:nth-child(2n){border-right:0}
  .demo-stat strong{font-size:25px}
  .demo-stat em{line-height:1.45}
  .demo-priority-panel,.demo-mini-plan,.demo-detail-panel,.demo-operator-next{padding:17px;border-radius:14px}
  .demo-priority-body{align-items:flex-start;gap:12px}
  .demo-large-avatar{width:78px;height:94px}
  .demo-priority-copy h4{font-size:18px}
  .demo-priority-copy h4 span{display:block;margin:4px 0 0;font-size:10px}
  .demo-priority-copy p{font-size:12px}
  .demo-priority-foot{align-items:flex-start;flex-direction:column;gap:8px}
  .demo-target-row{grid-template-columns:1fr 40px;gap:13px;padding:15px}
  .demo-target-identity{grid-column:1}
  .demo-target-progress{grid-column:1/-1;grid-row:auto}
  .demo-target-edit{grid-column:1/-1;grid-row:auto}
  .demo-icon-button{grid-column:2;grid-row:1;order:2;justify-self:end}
  .demo-target-edit input{min-height:40px;font-size:16px}
  .demo-target-values{gap:6px;flex-wrap:wrap}
  .demo-ledger-head{display:none}
  .demo-ledger-row{grid-template-columns:1fr 1fr;gap:9px;padding:14px}
  .demo-ledger-name{grid-column:1/-1}
  .demo-ledger-row>strong:nth-child(2)::before{content:'拥有 ';color:var(--demo-muted);font:500 10px var(--font-b)}
  .demo-ledger-row>strong:nth-child(3)::before{content:'需求 ';color:var(--demo-muted);font:500 10px var(--font-b)}
  .demo-ledger-row>strong:nth-child(4)::before{content:'缺口 ';color:var(--demo-muted);font:500 10px var(--font-b)}
  .demo-rate::before{content:'速度 ';color:var(--demo-muted);font-size:10px;font-weight:500}
  .demo-eta::before{content:'完成 ';color:var(--demo-muted);font:500 10px var(--font-b)}
  .demo-ledger-footer{align-items:flex-start;flex-direction:column;gap:7px}
  .demo-periods{align-self:flex-end}
  .demo-operator-hero{align-items:flex-start;gap:12px;padding:17px;flex-wrap:wrap}
  .demo-operator-avatar{width:75px;height:91px}
  .demo-operator-copy{flex-basis:calc(100% - 90px)}
  .demo-operator-copy h3{font-size:25px}
  .demo-operator-copy .demo-prof{display:flex;margin:5px 0 0}
  .demo-operator-score{display:flex;align-items:baseline;gap:7px;width:100%;text-align:left;border-top:1px solid rgba(255,248,236,.18);border-left:0;padding:12px 0 0}
  .demo-operator-score strong{font-size:30px}
  .demo-combat-grid{gap:7px}
  .demo-combat-grid b{font-size:20px}
  .demo-loadout small{display:none}
  .demo-operator-next{align-items:flex-start;gap:14px;flex-wrap:wrap}
  .demo-operator-next .demo-next-chips{order:3;flex-basis:100%}
  .demo-operator-next .demo-primary{width:100%;justify-content:center}
  .demo-footer .wrap{align-items:flex-start;gap:7px;flex-direction:column}
}
</style>
