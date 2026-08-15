<template>
  <div class="page-cart">
    <IslandSidebar />

    <main class="cart-main">
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
            <div v-if="version === 'daihao'" class="rate-bar" style="border:none;background:transparent;padding:0">
              <Calculator :size="16" class="ic" />
              <span class="lb" style="font-size:12.5px">汇率 USD→CNY</span>
              <input type="number" step="0.01" v-model.number="exchangeRate" />
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
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵账房<br><span>精打细算 · 运筹帷幄</span></template>
        <template #fine>
          <b>MaaYuan Share</b> · 礼包计算器<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内商店为准
        </template>
      </SiteFooter>
    </main>

    <!-- 移动端底栏 -->
    <div class="cart-mbar">
      <div class="sum"><div class="k">合计金额</div><div class="v">¥{{ totalCny.toFixed(2) }}</div></div>
      <div class="btns">
        <button class="mbtn ghost icon" :disabled="cartItems.length === 0" @click="clearCart"><Trash2 :size="17" /></button>
        <button class="mbtn accent" :disabled="cartItems.length === 0" @click="exportReceipt"><Download :size="15" /><span class="only-sm">导出</span></button>
        <button class="mbtn primary" @click="scrollToCart"><Receipt :size="15" />清单</button>
      </div>
    </div>

    <CustomPackageModal :show="showCustomForm" :version="version" @close="showCustomForm = false" @submit="addCustomPackage" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Plus, Trash2, Receipt, Filter, Calculator, Download } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import PackageCard from '../../components/cart/PackageCard.vue'
import ReceiptPanel from '../../components/cart/ReceiptPanel.vue'
import CustomPackageModal from '../../components/cart/CustomPackageModal.vue'
import html2canvas from 'html2canvas'
import { packagesDaihao, packagesRu } from '../../data/packages.js'
import { track1, track2 } from '../../data/rewards.js'

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

let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// ---- 版本相关 ----
const currentCart = computed(() => version.value === 'daihao' ? cartDaihao.value : cartRu.value)
const currentInitialPoints = computed(() => version.value === 'daihao' ? initialPointsDaihao.value : initialPointsRu.value)
const currentCustoms = computed(() => version.value === 'daihao' ? customPackagesDaihao.value : customPackagesRu.value)

// ---- 处理后的礼包（排序逻辑忠实移植） ----
const processedPackages = computed(() => {
  const raw = version.value === 'daihao'
    ? [...packagesDaihao, ...customPackagesDaihao.value]
    : [...packagesRu, ...customPackagesRu.value]
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