<template>
  <div class="page-cart">
    <IslandSidebar />

    <main id="main-content" class="cart-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">礼包</span>
            <span class="pill">计算器</span>
            <span class="pill">购物车</span>
          </div>
          <h1>广陵账房<span class="small">精打细算 · 运筹帷幄</span></h1>
          <p class="hero-sub">代号鸢 / 如鸢 礼包比价与购物清单：自动换算汇率、累计积分抽数、解锁累充奖励档位，一键导出账单图片。</p>
          <div class="author-badge" v-reveal>
            <span class="ab-mark">©</span>
            <span class="ab-txt">独立创作 · 著作权归作者 <b>swerainy</b> 所有</span>
          </div>
          <div class="hero-stats">
            <div><div class="k">收录礼包</div><div class="v">142<small>份</small></div></div>
            <div><div class="k">覆盖版本</div><div class="v">2<small>代号鸢 / 如鸢</small></div></div>
            <div><div class="k">奖励档位</div><div class="v">28<small>档</small></div></div>
            <div><div class="k">当前合计</div><div class="v">¥{{ totalCny.toFixed(2) }}<small>CNY</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <div class="toolbar" v-reveal>
            <div class="cart-switch">
              <button :class="{ on: version === 'daihao' }" @click="setVersion('daihao')">代号鸢</button>
              <button :class="{ on: version === 'ru' }" @click="setVersion('ru')">如鸢</button>
            </div>
            <div class="sp"></div>
            <button class="btn ghost" style="flex:none" @click="openPlanSave"><Save :size="16" />保存方案</button>
            <button class="btn ghost" style="flex:none" @click="openPlanList"><FolderOpen :size="16" />我的方案</button>
            <div v-if="version === 'daihao'" class="rate-bar" style="border:none;background:transparent;padding:0">
              <Calculator :size="16" class="ic" />
              <span class="lb" style="font-size:12.5px">汇率 USD→CNY</span>
              <input type="number" step="0.01" v-model.number="exchangeRate" aria-label="美元兑人民币汇率" />
              <span class="hint">自动换算人民币</span>
            </div>
          </div>

          <div class="cart-filters" v-reveal>
            <div class="row">
              <Filter :size="15" class="f-ic" />
              <button v-for="cat in categories" :key="cat" class="chip" :class="{ on: activeCategory === cat }" @click="setCategory(cat)">{{ cat }}</button>
            </div>
            <div class="row">
              <span class="f-dot"></span>
              <button v-for="f in drawFilters" :key="f.id" class="chip" :class="{ on: drawFilter === f.id }" @click="drawFilter = f.id">{{ f.label }}</button>
            </div>
          </div>

          <div class="cart-layout">
            <!-- 礼包网格 -->
            <div>
              <div class="pkg-grid">
                <PackageCard
                  v-for="pkg in filteredPackages"
                  :key="pkg.id"
                  :pkg="pkg"
                  :qty="currentCart[pkg.id] || 0"
                  :is-custom="isCustomPkg(pkg.id)"
                  :show-usd="version === 'daihao'"
                  @add="addToCart(pkg)"
                  @remove="removeFromCart(pkg)"
                  @remove-custom="deleteCustom(pkg.id)"
                />
                <button class="pkg-add-card" @click="showCustomForm = true">
                  <span class="ic"><Plus :size="22" /></span>
                  <span>自定义礼包</span>
                </button>
              </div>
            </div>

            <!-- 清单 -->
            <div>
              <div class="sticky" style="top:110px">
                <ReceiptPanel
                  :cart-items="cartItems"
                  :cart="currentCart"
                  :initial-points="currentInitialPoints"
                  :total-draws="totalDraws"
                  :price-for-draws="priceForDraws"
                  :cart-points="cartPoints"
                  :total-points="totalPoints"
                  :total-usd="totalUsd"
                  :total-cny="totalCny"
                  :unlocked1="unlocked1"
                  :unlocked2="unlocked2"
                  :next1="next1"
                  :next2="next2"
                  :track1-cd="track1Cd"
                  :track2-cd="track2Cd"
                  :version="version"
                  @clear="clearCart"
                  @update-initial="setInitialPoints"
                  @save-plan="openPlanSave"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵账房<br><span>精打细算 · 运筹帷幄</span></template>
        <template #fine>
          <b>YuanHub</b> · 礼包计算器<br>
          作者：<b>swerainy</b> · 著作权归作者所有<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内商店为准
        </template>
      </SiteFooter>
    </main>

    <!-- 移动端底栏 -->
    <div class="cart-mbar">
      <div class="sum"><div class="k">合计金额</div><div class="v">¥{{ totalCny.toFixed(2) }}</div></div>
      <div class="btns">
        <button class="mbtn ghost icon" aria-label="清空购物车" :disabled="cartItems.length === 0" @click="clearCart"><Trash2 :size="17" /></button>
        <button class="mbtn accent" :disabled="cartItems.length === 0" @click="exportReceipt"><Download :size="15" /><span class="only-sm">导出</span></button>
        <button class="mbtn primary" @click="scrollToCart"><Receipt :size="15" />清单</button>
      </div>
    </div>

    <CustomPackageModal :show="showCustomForm" :version="version" @close="showCustomForm = false" @submit="addCustomPackage" />

    <PlanSaveDialog
      v-if="showPlanSave"
      :name="planName"
      :existing="!!planId"
      :saving="planSaving"
      :logged-in="auth.isLoggedIn"
      @close="showPlanSave = false"
      @save="onConfirmSave"
    />

    <PlanListDialog
      v-if="showPlanList"
      :plans="myPlans"
      :guest-plans="guestPlans"
      :logged-in="auth.isLoggedIn"
      :loading="planLoading"
      @close="showPlanList = false"
      @load="loadPlan"
      @load-guest="loadGuestPlan"
      @rename="renamePlan"
      @remove="removePlan"
      @remove-guest="removeGuestPlan"
      @login="goLogin"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Plus, Trash2, Receipt, Filter, Calculator, Download, Save, FolderOpen } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import PackageCard from '../../components/cart/PackageCard.vue'
import ReceiptPanel from '../../components/cart/ReceiptPanel.vue'
import CustomPackageModal from '../../components/cart/CustomPackageModal.vue'
import PlanSaveDialog from '../../components/cart/PlanSaveDialog.vue'
import PlanListDialog from '../../components/cart/PlanListDialog.vue'
import html2canvas from 'html2canvas'
import { packagesDaihao, packagesRu } from '../../data/packages.js'
import { track1, track2 } from '../../data/rewards.js'
import { createPlan, updatePlan, getPlan, listPlans, deletePlan } from '../../api/ledger.js'
import { auth } from '../../store/auth.js'

const version = ref('daihao')
const exchangeRate = ref(7.2)
const cartDaihao = ref({})
const cartRu = ref({})
const initialPointsDaihao = ref(0)
const initialPointsRu = ref(0)
const customPackagesDaihao = ref([])
const customPackagesRu = ref([])
const showCustomForm = ref(false)
const activeCategory = ref('全部')
const drawFilter = ref('all')
const now = ref(Date.now())

// ---- 方案管理状态（广陵账房云存储） ----
const planName = ref('')                                       // 保存对话框里的方案名
const planId = ref(null)                                       // 当前已加载方案的 id（null=未保存到云端，新方案）
const planIsLocal = ref(false)                                 // true=当前方案是本地暂存（_localId）；后端云端 id 也是 string，不能用 typeof 判别
const showPlanSave = ref(false)                                // 保存对话框开关
const showPlanList = ref(false)                                // 方案列表抽屉/弹层开关
const myPlans = ref([])                                       // 云端方案列表（PlanListItemDto[]）
const planLoading = ref(false)
const planSaving = ref(false)
const _missingSnap = ref([])                                   // 目录缺失的内置礼包（由快照重建，见 §5.2）
const guestPlans = ref([])                                     // 游客本地暂存（读取见改动点 E5）

let timer = null
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  guestPlans.value = readGuestPlans()          // 恢复游客本地暂存（改动点 E5）
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// ---- 版本相关 ----
const currentCart = computed(() => version.value === 'daihao' ? cartDaihao.value : cartRu.value)
const currentInitialPoints = computed(() => version.value === 'daihao' ? initialPointsDaihao.value : initialPointsRu.value)
const currentCustoms = computed(() => version.value === 'daihao' ? customPackagesDaihao.value : customPackagesRu.value)

// ---- 处理后的礼包（排序逻辑忠实移植） ----
const processedPackages = computed(() => {
  // _missingSnap：目录缺失的内置礼包（由快照重建的「存档礼包」），与内置/自定义一起参与展示与合计
  const raw = version.value === 'daihao'
    ? packagesDaihao.concat(customPackagesDaihao.value, _missingSnap.value)
    : packagesRu.concat(customPackagesRu.value, _missingSnap.value)
  return raw.map(pkg => ({
    ...pkg,
    calculatedPriceCny: version.value === 'daihao'
      ? (pkg.priceUsd ? pkg.priceUsd * exchangeRate.value : 0)
      : (pkg.priceCny || 0)
  })).sort((a, b) => {
    if (a.sortId !== undefined && b.sortId !== undefined) {
      if (a.sortId !== b.sortId) return a.sortId - b.sortId
    } else if (a.sortId !== undefined) {
      return -1
    } else if (b.sortId !== undefined) {
      return 1
    }
    const isCustomA = currentCustoms.value.some(p => p.id === a.id)
    const isCustomB = currentCustoms.value.some(p => p.id === b.id)
    if (isCustomA !== isCustomB) return isCustomA ? 1 : -1
    if (a.category === '恋念' && b.category === '恋念') return a.id - b.id
    const priceA = a.draws > 0 ? a.calculatedPriceCny / a.draws : Infinity
    const priceB = b.draws > 0 ? b.calculatedPriceCny / b.draws : Infinity
    if (priceA === priceB) return a.calculatedPriceCny - b.calculatedPriceCny
    return priceA - priceB
  })
})

// ---- 分类 ----
const categories = computed(() => {
  const cats = new Set(processedPackages.value.map(p => p.category))
  if (currentCustoms.value.length > 0) cats.add('自定义')
  return ['全部', ...Array.from(cats)]
})

// ---- 筛选 ----
const filteredPackages = computed(() => processedPackages.value.filter(pkg => {
  let catMatch = true
  if (activeCategory.value !== '全部') {
    if (activeCategory.value === '自定义') {
      catMatch = currentCustoms.value.some(p => p.id === pkg.id)
    } else {
      catMatch = pkg.category === activeCategory.value
    }
  }
  if (!catMatch) return false
  if (drawFilter.value === 'hasDraws') return pkg.draws > 0
  if (drawFilter.value === 'noDraws') return pkg.draws === 0
  return true
}))

// ---- 购物车计算 ----
const cartItems = computed(() => processedPackages.value.filter(pkg => currentCart.value[pkg.id] > 0))
const cartPoints = computed(() => cartItems.value.reduce((s, p) => s + p.points * currentCart.value[p.id], 0))
const totalPoints = computed(() => cartPoints.value + currentInitialPoints.value)
const totalDraws = computed(() => cartItems.value.reduce((s, p) => s + p.draws * currentCart.value[p.id], 0))
const totalCny = computed(() => cartItems.value.reduce((s, p) => s + p.calculatedPriceCny * currentCart.value[p.id], 0))
const priceForDraws = computed(() => cartItems.value.reduce((s, p) => p.draws > 0 ? s + p.calculatedPriceCny * currentCart.value[p.id] : s, 0))
const totalUsd = computed(() => version.value === 'daihao'
  ? cartItems.value.reduce((s, p) => s + (p.priceUsd || 0) * currentCart.value[p.id], 0)
  : 0)

// ---- 奖励进度 ----
const unlocked1 = computed(() => track1.filter(m => totalPoints.value >= m.points))
const unlocked2 = computed(() => track2.filter(m => totalPoints.value >= m.points))
const next1 = computed(() => {
  const arr = track1.map(m => m.points).sort((a, b) => a - b)
  return arr.find(p => p > totalPoints.value) ?? null
})
const next2 = computed(() => {
  const arr = track2.map(m => m.points).sort((a, b) => a - b)
  return arr.find(p => p > totalPoints.value) ?? null
})

// ---- 倒计时 ----
function formatCountdown(endStr) {
  const end = new Date(endStr).getTime()
  const diff = end - now.value
  if (diff <= 0) return '已结束'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  if (days > 0) return days + '天 ' + hours + '小时'
  return hours + '小时 ' + minutes + '分 ' + seconds + '秒'
}
const track1Cd = computed(() => formatCountdown('2026-04-29T23:59:59+08:00'))
const track2Cd = computed(() => formatCountdown('2026-05-13T23:59:59+08:00'))

// ---- 操作 ----
const drawFilters = [
  { id: 'all', label: '全部' },
  { id: 'hasDraws', label: '含抽数' },
  { id: 'noDraws', label: '无抽数' }
]

function setVersion(v) { version.value = v }
function setCategory(c) { activeCategory.value = c }
function isCustomPkg(id) { return currentCustoms.value.some(p => p.id === id) }

function addToCart(pkg) {
  const cart = version.value === 'daihao' ? cartDaihao : cartRu
  const cur = cart.value[pkg.id] || 0
  if (cur < pkg.limit) cart.value = { ...cart.value, [pkg.id]: cur + 1 }
}

function removeFromCart(pkg) {
  const cart = version.value === 'daihao' ? cartDaihao : cartRu
  const cur = cart.value[pkg.id] || 0
  if (cur > 1) {
    cart.value = { ...cart.value, [pkg.id]: cur - 1 }
  } else {
    const next = { ...cart.value }
    delete next[pkg.id]
    cart.value = next
  }
}

function clearCart() {
  if (version.value === 'daihao') cartDaihao.value = {}
  else cartRu.value = {}
}

function setInitialPoints(v) {
  if (version.value === 'daihao') initialPointsDaihao.value = v
  else initialPointsRu.value = v
}

function addCustomPackage(form) {
  const newPkg = {
    id: Date.now(),
    name: form.name,
    category: form.category || '自定义',
    points: parseInt(form.points) || 0,
    draws: parseInt(form.draws) || 0,
    limit: parseInt(form.limit) || 999,
    extra: form.extra || undefined,
    sortId: form.sortId ? parseInt(form.sortId) : undefined
  }
  if (version.value === 'daihao') {
    newPkg.priceUsd = parseFloat(form.price)
    customPackagesDaihao.value = [...customPackagesDaihao.value, newPkg]
  } else {
    newPkg.priceCny = parseFloat(form.price)
    customPackagesRu.value = [...customPackagesRu.value, newPkg]
  }
  showCustomForm.value = false
}

function deleteCustom(id) {
  if (version.value === 'daihao') {
    customPackagesDaihao.value = customPackagesDaihao.value.filter(p => p.id !== id)
    const next = { ...cartDaihao.value }
    delete next[id]
    cartDaihao.value = next
  } else {
    customPackagesRu.value = customPackagesRu.value.filter(p => p.id !== id)
    const next = { ...cartRu.value }
    delete next[id]
    cartRu.value = next
  }
}

function scrollToCart() {
  document.querySelector('.cart-layout .receipt')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
// ================= 方案管理（广陵账房云存储，对照 T3 前端接入指南 改动点 E） =================

// 统一归一化错误信息：message 缺省 / 网络失败 → 友好文案（§3.2）
function humanErr(err, fallback) {
  if (fallback === undefined) fallback = '操作失败，请稍后重试'
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback                       // message 缺省（后端列表/详情 message=null）
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

// ---- E1：打包当前「源状态」→ payload（派生量不参与） ----
function snapshotOf(src, isDaihao) {
  return {
    name: src.name,
    category: src.category || '自定义',
    points: src.points,
    draws: src.draws,
    limit: src.limit,
    sort_id: src.sortId,
    extra: src.extra || undefined,
    ...(isDaihao ? { price_usd: src.priceUsd } : { price_cny: src.priceCny })
  }
}

function buildPayload(name) {
  const isDaihao = version.value === 'daihao'
  const cart = isDaihao ? cartDaihao.value : cartRu.value
  const customs = isDaihao ? customPackagesDaihao.value : customPackagesRu.value
  const builtin = isDaihao ? packagesDaihao : packagesRu
  const builtinIndex = new Map(builtin.map(function (p) { return [p.id, p] }))
  // 存档礼包（快照重建的缺失内置礼包）同样参与打包，再次保存时不丢失（§5.2）
  _missingSnap.value.forEach(function (p) { builtinIndex.set(p.id, p) })

  const cartItems = Object.entries(cart)
    .filter(function (e) { return e[1] > 0 })
    .map(function (e) {
      const contentId = Number(e[0])
      const quantity = e[1]
      const custom = customs.some(function (p) { return p.id === contentId })
      const src = custom
        ? customs.find(function (p) { return p.id === contentId })
        : builtinIndex.get(contentId)
      if (!src) return null          // 目录缺失且无快照 → 跳过（理论不出现）
      return { content_id: contentId, quantity, package_snapshot: snapshotOf(src, isDaihao) }
    })
    .filter(Boolean)

  const customPackages = customs.map(function (p) {
    return {
      id: p.id, name: p.name, category: p.category || '自定义',
      points: p.points, draws: p.draws, limit: p.limit,
      sort_id: p.sortId, extra: p.extra || undefined,
      ...(isDaihao ? { price_usd: p.priceUsd } : { price_cny: p.priceCny })
    }
  })

  return {
    name,                                                    // 必填 ≤50（对话框里校验非空）
    version: version.value,
    exchange_rate: isDaihao ? exchangeRate.value : null,     // 汇率仅 daihao 生效
    initial_points: isDaihao ? initialPointsDaihao.value : initialPointsRu.value,
    cart_items: cartItems,
    custom_packages: customPackages
  }
}

// buildPayload/payloadFromDto 输出 snake_case（与后端 DTO 同形）；ledger.js 门面按指南 §2 约定
// 接收 camelCase 入参。调用前做一次顶层 key 转换，避免把 exchangeRate 等解构成 undefined 导致数据丢失。
function toLedgerArgs(body) {
  return {
    name: body.name,
    version: body.version,
    exchangeRate: body.exchange_rate,
    initialPoints: body.initial_points,
    cartItems: body.cart_items,
    customPackages: body.custom_packages
  }
}

// ---- E2：保存（命名 / 另存为 / 覆盖） ----
async function onConfirmSave(payload) {
  const name = payload.name || ''
  if (!name || !name.trim()) { alert('请填写方案名（最长 50 字）'); return }
  if (name.trim().length > 50) { alert('方案名最长 50 字'); return }
  planName.value = name.trim()
  const body = buildPayload(planName.value)
  const overwrite = payload.overwrite

  // 游客：本地暂存兜底（§5.3），不调接口
  if (!auth.isLoggedIn) {
    upsertGuestPlan(body, overwrite)
    showPlanSave.value = false
    return
  }

  planSaving.value = true
  try {
    // 本地方案（_localId）：覆盖时不能打 PUT（后端云端 id 也为 string，须用 planIsLocal 判别），走 POST 上传为新云端方案
    const args = toLedgerArgs(body)
    const saved = (planId.value && overwrite && !planIsLocal.value)
      ? await updatePlan(planId.value, args)   // 覆盖：PUT {id}
      : await createPlan(args)                 // 新方案 / 另存为 / 本地上传：POST
    planId.value = saved.id                    // 用响应 id 记录当前方案（后端为 string）
    planIsLocal.value = false
    applyPlan(saved)                           // ★ 用响应快照覆盖本地（自定义 id 回写）
    showPlanSave.value = false
    alert('保存成功')
  } catch (err) {
    alert(humanErr(err, '保存失败'))
  } finally {
    planSaving.value = false
  }
}

// ---- E3：加载详情 → 复原页面（核心 applyPlan，只写「源状态」，派生量由 computed 重算） ----
function applyPlan(plan) {
  const isDaihao = plan.version === 'daihao'

  // ① 版本（方案绑定单一 version）
  version.value = plan.version

  // ② 汇率：仅在 daihao 生效；缺省回退 7.2
  if (isDaihao) exchangeRate.value = plan.exchange_rate == null ? 7.2 : plan.exchange_rate

  // ③ 自定义礼包：id 以响应为准（服务端已重生成 + 回写引用）
  const customs = (plan.custom_packages || []).map(function (p) {
    const o = {
      id: p.id, name: p.name, category: p.category || '自定义',
      points: p.points, draws: p.draws, limit: p.limit,
      sortId: p.sort_id, extra: p.extra
    }
    if (isDaihao) o.priceUsd = p.price_usd; else o.priceCny = p.price_cny
    return o
  })
  if (isDaihao) customPackagesDaihao.value = customs
  else customPackagesRu.value = customs

  // ④ 内置目录索引（把 content_id 对到快照，并探测缺失项）
  const builtin = isDaihao ? packagesDaihao : packagesRu
  const builtinIndex = new Map(builtin.map(function (p) { return [p.id, p] }))
  const customIndex = new Map(customs.map(function (p) { return [p.id, p] }))

  // ⑤ 购物车数量 + 缺失内置礼包快照重建（snake_case 快照 → 组件使用的 camelCase 字段）
  const cart = {}
  const missing = []
  ;(plan.cart_items || []).forEach(function (item) {
    const cid = item.content_id
    const snap = item.package_snapshot || {}
    cart[cid] = item.quantity
    // 内置：若当前目录无此 id，用快照重建一个「存档礼包」保证可展示（§5.2）
    if (!customIndex.has(cid) && !builtinIndex.has(cid)) {
      missing.push({
        id: cid,
        name: snap.name,
        category: snap.category || '存档',
        points: snap.points || 0,
        draws: snap.draws || 0,
        limit: snap.limit != null ? snap.limit : 999,
        extra: snap.extra,
        sortId: snap.sort_id,
        priceUsd: snap.price_usd,
        priceCny: snap.price_cny,
        _fromSnapshot: true
      })
    }
  })
  _missingSnap.value = missing

  // ⑥ 初始积分（按版本）
  if (isDaihao) initialPointsDaihao.value = plan.initial_points || 0
  else initialPointsRu.value = plan.initial_points || 0

  // ⑦ 购物车写回对应版本
  if (isDaihao) cartDaihao.value = cart
  else cartRu.value = cart

  // ⑧ 派生量全部由前端 computed 自动重算（cartItems/points/draws/cny/usd/奖档次），无需设置
}

// ---- E3b：响应 DTO → 请求体（供重命名等整体回写） ----
function payloadFromDto(dto) {
  const isDaihao = dto.version === 'daihao'
  return {
    name: dto.name,
    version: dto.version,
    exchange_rate: isDaihao ? dto.exchange_rate : null,
    initial_points: dto.initial_points,
    cart_items: (dto.cart_items || []).map(function (it) {
      // 响应快照带 custom 标记（PackageSnapshotDto 独有），回写请求体时剥离，避免未知字段
      const snap = Object.assign({}, it.package_snapshot || {})
      delete snap.custom
      return { content_id: it.content_id, quantity: it.quantity, package_snapshot: snap }
    }),
    custom_packages: dto.custom_packages || []
  }
}

// ---- E4：列表加载 / 加载详情 / 重命名 / 删除 ----
async function openPlanList() {
  showPlanList.value = true
  if (!auth.isLoggedIn) return                 // 游客：列表只显示本地暂存
  planLoading.value = true
  try {
    myPlans.value = await listPlans()          // 轻量 PlanListItemDto[]
  } catch (err) {
    alert(humanErr(err, '加载方案列表失败'))
  } finally {
    planLoading.value = false
  }
}

async function loadPlan(plan) {
  try {
    const full = await getPlan(plan.id)        // 列表是轻量，需再取详情
    planId.value = full.id
    planIsLocal.value = false
    planName.value = full.name
    applyPlan(full)                            // 复原页面
    showPlanList.value = false
  } catch (err) {
    alert(humanErr(err, '加载方案失败'))
  }
}

// 加载本地暂存方案（本地记录即 payload 形状，直接喂给 applyPlan 同一套复原逻辑）
function loadGuestPlan(rec) {
  planId.value = rec._localId
  planIsLocal.value = true
  planName.value = rec.name
  applyPlan({
    id: rec._localId,
    name: rec.name,
    version: rec.version,
    exchange_rate: rec.exchange_rate,
    initial_points: rec.initial_points,
    cart_items: rec.cart_items || [],
    custom_packages: rec.custom_packages || [],
    created_at: rec.created_at,
    updated_at: rec.updated_at
  })
  showPlanList.value = false
}

// 重命名：本质 = 读取当前云端方案 → 改名 → PUT 整体替换
async function renamePlan(plan, newName) {
  if (!newName || !newName.trim()) return
  try {
    const full = await getPlan(plan.id)
    const payload = payloadFromDto(full)       // DTO → 请求体
    payload.name = newName.trim()
    await updatePlan(full.id, toLedgerArgs(payload))         // 整体替换
    myPlans.value = await listPlans()
    if (planId.value === full.id) planName.value = newName.trim()
  } catch (err) {
    alert(humanErr(err, '重命名失败'))
  }
}

async function removePlan(plan) {
  if (!confirm('删除方案「' + plan.name + '」？此操作不可恢复')) return
  try {
    await deletePlan(plan.id)
    myPlans.value = myPlans.value.filter(function (p) { return p.id !== plan.id })
    if (planId.value === plan.id) {
      planId.value = null
      planIsLocal.value = false
      planName.value = ''
    }
  } catch (err) {
    alert(humanErr(err, '删除失败'))
  }
}

function goLogin() { location.href = '/login' }

// ---- E5：游客本地暂存兜底（localStorage key yh_ledger_plans，与云端彻底隔离） ----
const GUEST_KEY = 'yh_ledger_plans'
function readGuestPlans() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || [] } catch (_e) { return [] }
}
function writeGuestPlans(list) {
  guestPlans.value = list
  localStorage.setItem(GUEST_KEY, JSON.stringify(list))
}

function upsertGuestPlan(payload, overwrite) {
  const list = readGuestPlans()
  if (overwrite && planId.value && planIsLocal.value) {           // 覆盖：按 _localId 匹配（仅本地方案）
    const localId = String(planId.value)
    const idx = list.findIndex(function (p) { return String(p._localId) === localId })
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], payload, { updated_at: new Date().toISOString() })
      writeGuestPlans(list)
      return
    }
  }
  const rec = Object.assign({}, payload, {
    _localId: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  list.unshift(rec)
  writeGuestPlans(list)
  planId.value = rec._localId                // 本地方案也记录 id，便于覆盖
  planIsLocal.value = true
}

function removeGuestPlan(rec) {
  if (!confirm('删除本地方案「' + rec.name + '」？此操作不可恢复')) return
  writeGuestPlans(readGuestPlans().filter(function (p) { return String(p._localId) !== String(rec._localId) }))
  if (String(planId.value) === String(rec._localId)) {
    planId.value = null
    planIsLocal.value = false
    planName.value = ''
  }
}

// ---- G：打开保存对话框（游客时对话框内提示登录 + 本地暂存兜底） ----
function openPlanSave() {
  showPlanSave.value = true
}


function exportReceipt() {
  const rp = document.querySelector('.cart-layout .receipt')
  if (!rp) return
  rp.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(async () => {
    try {
      const canvas = await html2canvas(rp, { scale: 3, backgroundColor: '#FFFDF6', useCORS: true })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = 'shopping-receipt.png'
      link.click()
    } catch (err) { console.error('Failed to export image', err) }
  }, 500)
}
</script>

<style scoped>
/* ---- 作者版权醒目标识（广陵账房 · swerainy） ---- */
.author-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
  background: var(--tea);
  color: var(--cream);
  border-radius: 999px;
  padding: 9px 18px 9px 10px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: .05em;
  box-shadow: 0 12px 26px -14px rgba(73,59,44,.5);
}
.ab-mark {
  width: 28px; height: 28px;
  border-radius: 50%;
  flex: none;
  background: var(--yellow);
  color: var(--ink);
  display: grid;
  place-items: center;
  font-family: var(--font-d);
  font-weight: 900;
  font-size: 15px;
}
.author-badge b {
  color: var(--yellow);
  font-weight: 900;
}
</style>
