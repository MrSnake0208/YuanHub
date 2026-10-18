<template>
  <div class="page-cart">
    <IslandSidebar />

    <main id="main-content" class="cart-main">
      <CompactToolHeader title="礼包预算" description="作者：binary · 独立创作">
        <template #account>
          <div class="cart-header-context">
            <select class="cart-version-selector" :value="version" aria-label="游戏版本" @change="setVersion($event.target.value)">
              <option value="daihao">代号鸢{{ daihaoCount ? ' · ' + daihaoCount + ' 件' : '' }}</option>
              <option value="ru">如鸢{{ ruCount ? ' · ' + ruCount + ' 件' : '' }}</option>
            </select>
            <span class="cart-currency">· CNY</span>
          </div>
        </template>
        <template #primary-actions>
          <button type="button" class="cart-plan-save tool-utility" @click="openPlanSave"><Save :size="15" aria-hidden="true" />保存方案</button>
        </template>
        <template #actions>
          <button type="button" class="cart-plan-list tool-utility" @click="openPlanList"><FolderOpen :size="15" aria-hidden="true" />我的方案</button>
        </template>
        <template #help>
          <p>搜索并选择礼包，按汇率换算人民币预算，累计积分抽数和累充奖励，保存方案或导出账单图片。两个版本的购物清单独立保留，切换版本不会清空。</p>
          <p>独立创作 · 著作权归作者 binary 所有；数据以游戏内商店为准。</p>
        </template>
      </CompactToolHeader>

      <section>
        <div class="wrap">
          <details v-if="version === 'daihao'" class="cart-rate-settings">
            <summary>1 USD = {{ exchangeRate }} CNY<span class="cart-rate-modify">修改汇率</span></summary>
            <div
              v-if="version === 'daihao'"
              class="rate-bar"
              style="border: none; background: transparent; padding: 0"
            >
              <Calculator :size="16" class="ic" />
              <span class="lb" style="font-size: 12.5px">汇率 USD→CNY</span>
              <input
                type="number"
                step="0.01"
                :value="rateDraft"
                min="0"
                :aria-invalid="rateError ? 'true' : undefined"
                :aria-describedby="rateError ? 'cart-rate-error' : undefined"
                @input="updateRateDraft($event.target.value)"
                aria-label="美元兑人民币汇率"
              />
              <span class="cart-rate-hint">参考汇率，可修改</span>
            </div>
          </details>

          <p v-if="version === 'daihao' && rateError" id="cart-rate-error" class="cart-rate-error" role="alert">{{ rateError }}；当前仍按 {{ exchangeRate }} 换算。</p>

          <div class="cart-catalog-status">
            <p :role="catalogError ? 'alert' : 'status'">{{ catalogLoading ? '正在读取公共目录…' : catalogMessage }}</p>
            <button v-if="catalogError" type="button" class="btn ghost" :disabled="catalogLoading" @click="loadPublicCatalog">重试读取目录</button>
            <p class="cart-draft-hint">清单在本次标签页内保留，切换页面不会清空；刷新、关闭或切换账号前，请先点「保存方案」。</p>
          </div>
          <p v-if="daihaoCount || ruCount" class="cart-version-hint">另一个版本「{{ version === 'daihao' ? '如鸢' : '代号鸢' }}」购物车有 {{ version === 'daihao' ? ruCount : daihaoCount }} 件礼包；切换版本不会清空。</p>
          <p v-if="operationMessage" class="cart-operation-message" :role="operationError ? 'alert' : 'status'">{{ operationMessage }}</p>

          <div class="cart-filters" v-reveal>
            <div class="cart-search-row">
              <label class="cart-search"><input v-model="query" type="search" aria-label="搜索礼包" placeholder="搜索礼包名称" /></label>
              <label class="cart-category">分类<select :value="activeCategory" @change="setCategory($event.target.value)"><option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option></select></label>
              <label class="cart-sort">排序<select v-model="sortMode"><option value="default">默认顺序</option><option value="drawCost">每抽成本从低到高</option><option value="price">价格从低到高</option></select></label>
              <details class="cart-more-filters">
                <summary>更多筛选<span v-if="drawFilter !== 'all' || selectedOnly"> · 已启用</span></summary>
                <div class="cart-advanced-content">
                  <label class="cart-selected"><input v-model="selectedOnly" type="checkbox" />仅看已选</label>
                  <div class="row" role="group" aria-label="礼包抽数筛选">
                    <span class="f-dot"></span>
                    <button
                      v-for="f in drawFilters"
                      :key="f.id"
                      class="chip"
                      :class="{ on: drawFilter === f.id }"
                      @click="drawFilter = f.id"
                    >
                      {{ f.label }}
                    </button>
                  </div>
                </div>
              </details>
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
                <div v-if="filteredPackages.length === 0" class="cart-filter-empty" role="status">
                  <p>{{ selectedOnly ? '当前条件下没有已选礼包。' : '没有符合条件的礼包。' }}</p>
                  <button type="button" class="btn ghost" @click="resetFilters">清除筛选</button>
                </div>
                <button class="pkg-add-card" @click="showCustomForm = true">
                  <span class="ic"><Plus :size="22" /></span>
                  <span>自定义礼包</span>
                </button>
              </div>
            </div>

            <!-- 清单 -->
            <ReceiptWorkspace :open="showReceipt" @close="showReceipt = false">
              <ReceiptPanel
                v-bind="receiptProps"
                :export-busy="exportBusy"
                @clear="clearCart"
                @export="exportReceipt"
                @update-initial="setInitialPoints"
                @save-plan="openPlanSave"
              />
            </ReceiptWorkspace>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵账房<br /><span>精打细算 · 运筹帷幄</span></template>
        <template #fine>
          <b>YuanHub</b> · 礼包计算器<br />
          作者：<b>binary</b> · 著作权归作者所有<br />
          MaaYuan × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建<br />
          数据仅供参考，请以游戏内商店为准
        </template>
      </SiteFooter>
    </main>

    <!-- 移动端底栏 -->
    <div class="cart-mbar">
      <div class="sum" :class="{ 'is-cart-empty': cartItems.length === 0 }">
        <div class="k">合计金额</div>
        <div class="v">¥{{ totalCny.toFixed(2) }}</div>
      </div>
      <div class="btns">
        <button
          class="mbtn ghost icon"
          aria-label="清空购物车"
          :disabled="cartItems.length === 0"
          @click="clearCart"
        >
          <Trash2 :size="17" />
        </button>
        <button
          class="mbtn accent"
          :disabled="cartItems.length === 0 || exportBusy"
          :aria-busy="exportBusy"
          @click="exportReceipt"
        >
          <Download :size="15" /><span class="only-sm">导出</span>
        </button>
        <button class="mbtn primary" :aria-expanded="showReceipt" @click="showReceipt = true">
          <Receipt :size="15" />清单 · {{ version === 'daihao' ? daihaoCount : ruCount }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="exportSnapshot" class="cart-export-view" aria-hidden="true" inert>
        <ReceiptPanel ref="exportPanel" v-bind="exportSnapshot" export-only />
      </div>
    </Teleport>

    <CustomPackageModal
      :show="showCustomForm"
      :version="version"
      @close="showCustomForm = false"
      @submit="addCustomPackage"
    />

    <PlanSaveDialog
      v-if="showPlanSave"
      :name="currentPlan.name"
      :existing="!!currentPlan.id"
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
import { ref, toRefs, computed, watch, onMounted, onBeforeUnmount } from "vue";
import {
  Plus,
  Trash2,
  Receipt,
  Calculator,
  Download,
  Save,
  FolderOpen,
} from "@lucide/vue";
import CompactToolHeader from "../../components/CompactToolHeader.vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import PackageCard from "../../components/cart/PackageCard.vue";
import ReceiptPanel from "../../components/cart/ReceiptPanel.vue";
import ReceiptWorkspace from "../../components/cart/ReceiptWorkspace.vue";
import CustomPackageModal from "../../components/cart/CustomPackageModal.vue";
import PlanSaveDialog from "../../components/cart/PlanSaveDialog.vue";
import PlanListDialog from "../../components/cart/PlanListDialog.vue";
import { useReceiptExport } from "../../composables/useReceiptExport.js";
import { mergePackageSnapshots, parseReferenceRate, displayPackages } from "../../utils/cartBudget.js";
import { getLedgerCatalog } from "../../api/ledgerCatalog.js";
import { bundledLedgerCatalog, normalizeLedgerCatalog, ledgerCampaignProgress, LEDGER_CACHE_KEY } from "../../utils/ledgerCatalog.js";
import {
  createPlan,
  updatePlan,
  getPlan,
  listPlans,
  deletePlan,
} from "../../api/ledger.js";
import { auth } from "../../store/auth.js";
import { useCartDraft } from "../../store/cartDraft.js";
import { dialog } from "../../utils/dialog.js";

const cloudIdentity = () => auth.isLoggedIn ? String(auth.userInfo?.id || "authenticated") : "";
const {
  version, exchangeRate, rateDraft, rateError, rateOwned,
  cartDaihao, cartRu, initialPointsDaihao, initialPointsRu,
  customPackagesDaihao, customPackagesRu, plansByVersion, builtinSnapshots,
} = toRefs(useCartDraft(cloudIdentity()));
const publicCatalog = ref(bundledLedgerCatalog);
const catalogLoading = ref(false);
const catalogMessage = ref("正在更新礼包信息，暂用备用资料，价格可能不是最新。");
const catalogError = ref(false);
let catalogSequence = 0;
let catalogHasLive = false;
const showCustomForm = ref(false);
const activeCategory = ref("全部");
const drawFilter = ref("all");
const query = ref("");
const sortMode = ref("default");
const selectedOnly = ref(false);
const showReceipt = ref(false);
const now = ref(Date.now());
const operationMessage = ref("");
const operationError = ref(false);

// ---- 方案管理状态（广陵账房云存储） ----
const currentPlan = computed(() => plansByVersion.value[version.value]);
const showPlanSave = ref(false); // 保存对话框开关
const showPlanList = ref(false); // 方案列表抽屉/弹层开关
const myPlans = ref([]); // 云端方案列表（PlanListItemDto[]）
const planLoading = ref(false);
const planSaving = ref(false);
const currentBuiltins = computed(() => mergePackageSnapshots(
  publicCatalog.value.packages[version.value],
  builtinSnapshots.value[version.value],
));
const guestPlans = ref([]); // 游客本地暂存（读取见改动点 E5）

let timer = null;
let alive = true;
let planLoadSequence = 0;
let cloudGeneration = 0;
const cloudContext = () => `${cloudGeneration}:${cloudIdentity()}`;
watch(cloudIdentity, () => {
  cloudGeneration++;
  planLoadSequence++;
  myPlans.value = [];
  showPlanList.value = false;
  showPlanSave.value = false;
  useCartDraft(cloudIdentity());
  replaceCatalog(publicCatalog.value);
  showResult("账号已变化，当前草稿已清空；可从「我的方案」重新加载。");
}, { flush: "sync" });
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  loadPublicCatalog();
  guestPlans.value = readGuestPlans(); // 恢复游客本地暂存（改动点 E5）
});
onBeforeUnmount(() => {
  // 已选预算离页后沿用当时汇率，避免新目录默认值悄悄改变合计。
  if (daihaoCount.value) rateOwned.value = true;
  alive = false;
  planLoadSequence++;
  if (timer) clearInterval(timer);
});

// ---- 版本相关 ----
const currentCart = computed(() =>
  version.value === "daihao" ? cartDaihao.value : cartRu.value,
);
const daihaoCount = computed(() => Object.values(cartDaihao.value).reduce((sum, qty) => sum + qty, 0));
const ruCount = computed(() => Object.values(cartRu.value).reduce((sum, qty) => sum + qty, 0));
function showResult(message, error = false) {
  operationMessage.value = message;
  operationError.value = error;
}
const currentInitialPoints = computed(() =>
  version.value === "daihao"
    ? initialPointsDaihao.value
    : initialPointsRu.value,
);
const currentCustoms = computed(() =>
  version.value === "daihao"
    ? customPackagesDaihao.value
    : customPackagesRu.value,
);

// ---- 处理后的礼包（排序逻辑忠实移植） ----
const processedPackages = computed(() => {
  const raw = currentBuiltins.value.concat(currentCustoms.value);
  return raw
    .map((pkg) => ({
      ...pkg,
      calculatedPriceCny:
        version.value === "daihao"
          ? pkg.priceUsd
            ? pkg.priceUsd * exchangeRate.value
            : 0
          : pkg.priceCny || 0,
    }))
    .sort((a, b) => {
      if (a.sortId !== undefined && b.sortId !== undefined) {
        if (a.sortId !== b.sortId) return a.sortId - b.sortId;
      } else if (a.sortId !== undefined) {
        return -1;
      } else if (b.sortId !== undefined) {
        return 1;
      }
      const isCustomA = currentCustoms.value.some((p) => p.id === a.id);
      const isCustomB = currentCustoms.value.some((p) => p.id === b.id);
      if (isCustomA !== isCustomB) return isCustomA ? 1 : -1;
      if (a.category === "恋念" && b.category === "恋念") return a.id - b.id;
      const priceA = a.draws > 0 ? a.calculatedPriceCny / a.draws : Infinity;
      const priceB = b.draws > 0 ? b.calculatedPriceCny / b.draws : Infinity;
      if (priceA === priceB) return a.calculatedPriceCny - b.calculatedPriceCny;
      return priceA - priceB;
    });
});

// ---- 分类 ----
const categories = computed(() => {
  const cats = new Set(processedPackages.value.map((p) => p.category));
  if (currentCustoms.value.length > 0) cats.add("自定义");
  return ["全部", ...Array.from(cats)];
});

// ---- 筛选 ----
const filteredPackages = computed(() => displayPackages(processedPackages.value, {
  query: query.value, category: activeCategory.value, drawFilter: drawFilter.value,
  selectedOnly: selectedOnly.value, sortMode: sortMode.value, cart: currentCart.value,
  customIds: new Set(currentCustoms.value.map(pkg => pkg.id)),
}));
watch(categories, values => { if (!values.includes(activeCategory.value)) activeCategory.value = "全部"; });
function resetFilters() {
  query.value = "";
  activeCategory.value = "全部";
  drawFilter.value = "all";
  selectedOnly.value = false;
}
function updateRateDraft(value) {
  rateOwned.value = true;
  rateDraft.value = value;
  const rate = parseReferenceRate(value);
  rateError.value = rate === null ? "请输入有限且不小于 0 的参考汇率" : "";
  if (rate !== null) exchangeRate.value = rate;
}
function validCurrentRate() {
  if (version.value !== "daihao" || !rateError.value) return true;
  showResult("请先填写有效参考汇率，再保存或导出。", true);
  return false;
}

// ---- 购物车计算 ----
const cartItems = computed(() =>
  processedPackages.value.filter((pkg) => currentCart.value[pkg.id] > 0),
);
const cartPoints = computed(() =>
  cartItems.value.reduce((s, p) => s + p.points * currentCart.value[p.id], 0),
);
const totalPoints = computed(
  () => cartPoints.value + currentInitialPoints.value,
);
const totalDraws = computed(() =>
  cartItems.value.reduce((s, p) => s + p.draws * currentCart.value[p.id], 0),
);
const totalCny = computed(() =>
  cartItems.value.reduce(
    (s, p) => s + p.calculatedPriceCny * currentCart.value[p.id],
    0,
  ),
);
const priceForDraws = computed(() =>
  cartItems.value.reduce(
    (s, p) =>
      p.draws > 0 ? s + p.calculatedPriceCny * currentCart.value[p.id] : s,
    0,
  ),
);
const totalUsd = computed(() =>
  version.value === "daihao"
    ? cartItems.value.reduce(
        (s, p) => s + (p.priceUsd || 0) * currentCart.value[p.id],
        0,
      )
    : 0,
);

// ---- 公共目录 / 动态奖励进度 ----
const campaigns = computed(() => ledgerCampaignProgress(publicCatalog.value.campaigns, version.value, totalPoints.value, now.value));
function replaceCatalog(next) {
  for (const game of ["daihao", "ru"]) {
    const cart = game === "daihao" ? cartDaihao.value : cartRu.value;
    const selected = mergePackageSnapshots(publicCatalog.value.packages[game], builtinSnapshots.value[game]).filter(p => cart[p.id] > 0);
    builtinSnapshots.value[game] = mergePackageSnapshots(builtinSnapshots.value[game], selected);
  }
  publicCatalog.value = next;
  if (!rateOwned.value) {
    exchangeRate.value = next.exchangeRate;
    rateDraft.value = String(next.exchangeRate);
  }
}
async function loadPublicCatalog() {
  const sequence = ++catalogSequence;
  catalogLoading.value = true;
  try {
    const raw = await getLedgerCatalog();
    const next = normalizeLedgerCatalog(raw);
    if (!alive || sequence !== catalogSequence) return;
    replaceCatalog(next);
    catalogHasLive = true;
    catalogError.value = false;
    catalogMessage.value = next.packages.daihao.length || next.packages.ru.length ? "礼包信息已更新；已选礼包保持原信息。" : "管理员尚未发布可售礼包；已选礼包和私人方案仍保留。";
    try { localStorage.setItem(LEDGER_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: raw })); } catch { /* Catalog remains usable when browser storage is full. */ }
  } catch (error) {
    if (!alive || sequence !== catalogSequence) return;
    catalogError.value = true;
    let fallback = catalogHasLive ? "沿用本页已加载的礼包资料" : "使用备用礼包资料，价格可能不是最新";
    if (!catalogHasLive) {
      try {
        const cache = JSON.parse(localStorage.getItem(LEDGER_CACHE_KEY));
        if (cache && Number.isFinite(Date.parse(cache.savedAt))) {
          replaceCatalog(normalizeLedgerCatalog(cache.data));
          fallback = `使用上次加载的礼包资料（${new Date(cache.savedAt).toLocaleString()}，价格可能不是最新）`;
        }
      } catch { /* Invalid cache falls back to the bundled migration data. */ }
    }
    catalogMessage.value = `礼包信息更新失败：${error.message || "网络异常"}；${fallback}。购物车已保留。`;
  } finally {
    if (alive && sequence === catalogSequence) catalogLoading.value = false;
  }
}

const receiptProps = computed(() => ({
  cartItems: cartItems.value, cart: currentCart.value, initialPoints: currentInitialPoints.value,
  totalDraws: totalDraws.value, priceForDraws: priceForDraws.value,
  cartPoints: cartPoints.value, totalPoints: totalPoints.value,
  totalUsd: totalUsd.value, totalCny: totalCny.value,
  campaigns: campaigns.value,
  version: version.value, exchangeRate: exchangeRate.value,
}));
const { exportReceipt: captureReceipt, exportBusy, exportSnapshot, exportPanel } = useReceiptExport(receiptProps, showResult);
function exportReceipt() { if (validCurrentRate()) return captureReceipt(); }

// ---- 操作 ----
const drawFilters = [
  { id: "all", label: "全部" },
  { id: "hasDraws", label: "含抽数" },
  { id: "noDraws", label: "无抽数" },
];

function setVersion(v) {
  planLoadSequence++;
  version.value = v;
}
function setCategory(c) {
  activeCategory.value = c;
}
function isCustomPkg(id) {
  return currentCustoms.value.some((p) => p.id === id);
}

function addToCart(pkg) {
  const cart = version.value === "daihao" ? cartDaihao : cartRu;
  const cur = cart.value[pkg.id] || 0;
  if (cur < pkg.limit) {
    if (!isCustomPkg(pkg.id) && !builtinSnapshots.value[version.value].some(p => p.id === pkg.id)) {
      const { calculatedPriceCny, ...snapshot } = pkg;
      builtinSnapshots.value[version.value].push(snapshot);
    }
    cart.value = { ...cart.value, [pkg.id]: cur + 1 };
  }
}

function removeFromCart(pkg) {
  const cart = version.value === "daihao" ? cartDaihao : cartRu;
  const cur = cart.value[pkg.id] || 0;
  if (cur > 1) {
    cart.value = { ...cart.value, [pkg.id]: cur - 1 };
  } else {
    const next = { ...cart.value };
    delete next[pkg.id];
    cart.value = next;
  }
}

async function clearCart() {
  if (cartItems.value.length === 0) return;
  const identity = cloudContext();
  const selectedVersion = version.value;
  const name = selectedVersion === "daihao" ? "代号鸢" : "如鸢";
  if (!await dialog.confirm({ title: "清空购物车", message: `确定清空「${name}」购物车中的 ${selectedVersion === "daihao" ? daihaoCount.value : ruCount.value} 件礼包吗？`, type: "danger", confirmText: "清空" })) return;
  if (!alive || identity !== cloudContext()) return;
  if (selectedVersion === "daihao") cartDaihao.value = {};
  else cartRu.value = {};
  showResult(`已清空「${name}」购物车。`);
}

function setInitialPoints(v) {
  if (version.value === "daihao") initialPointsDaihao.value = v;
  else initialPointsRu.value = v;
}

function addCustomPackage(form) {
  const newPkg = {
    id: Date.now(),
    name: form.name,
    category: form.category || "自定义",
    points: parseInt(form.points) || 0,
    draws: parseFloat(form.draws) || 0,
    limit: parseInt(form.limit) || 999,
    extra: form.extra || undefined,
    sortId: form.sortId ? parseInt(form.sortId) : undefined,
  };
  if (version.value === "daihao") {
    newPkg.priceUsd = parseFloat(form.price);
    customPackagesDaihao.value = [...customPackagesDaihao.value, newPkg];
  } else {
    newPkg.priceCny = parseFloat(form.price);
    customPackagesRu.value = [...customPackagesRu.value, newPkg];
  }
  showCustomForm.value = false;
}

async function deleteCustom(id) {
  const identity = cloudContext();
  const selectedVersion = version.value;
  const pkg = currentCustoms.value.find((item) => item.id === id);
  if (!pkg) return;
  const qty = currentCart.value[id] || 0;
  if (!await dialog.confirm({ title: "删除自定义礼包", message: `确定删除「${pkg.name}」吗？${qty ? `购物车中的 ${qty} 件也会移除。` : ""}`, type: "danger", confirmText: "删除" })) return;
  if (!alive || identity !== cloudContext()) return;
  if (selectedVersion === "daihao") {
    customPackagesDaihao.value = customPackagesDaihao.value.filter(
      (p) => p.id !== id,
    );
    const next = { ...cartDaihao.value };
    delete next[id];
    cartDaihao.value = next;
  } else {
    customPackagesRu.value = customPackagesRu.value.filter((p) => p.id !== id);
    const next = { ...cartRu.value };
    delete next[id];
    cartRu.value = next;
  }
  showResult(`已删除自定义礼包「${pkg.name}」。`);
}

// ================= 方案管理（广陵账房云存储，对照 T3 前端接入指南 改动点 E） =================

// 统一归一化错误信息：message 缺省 / 网络失败 → 友好文案（§3.2）
function humanErr(err, fallback) {
  if (fallback === undefined) fallback = "操作失败，请稍后重试";
  if (!err) return fallback;
  const msg = err.message;
  if (!msg) return fallback; // message 缺省（后端列表/详情 message=null）
  if (/Failed to fetch|NetworkError|fetch/i.test(msg))
    return "暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。";
  return msg;
}

// ---- E1：打包当前「源状态」→ payload（派生量不参与） ----
function snapshotOf(src, isDaihao) {
  return {
    name: src.name,
    category: src.category || "自定义",
    points: src.points,
    draws: src.draws,
    limit: src.limit,
    sort_id: src.sortId,
    extra: src.extra || undefined,
    ...(isDaihao ? { price_usd: src.priceUsd } : { price_cny: src.priceCny }),
  };
}

function buildPayload(name) {
  const isDaihao = version.value === "daihao";
  const cart = isDaihao ? cartDaihao.value : cartRu.value;
  const customs = isDaihao
    ? customPackagesDaihao.value
    : customPackagesRu.value;
  const builtin = currentBuiltins.value;
  const builtinIndex = new Map(
    builtin.map(function (p) {
      return [p.id, p];
    }),
  );
  const cartItems = Object.entries(cart)
    .filter(function (e) {
      return e[1] > 0;
    })
    .map(function (e) {
      const contentId = Number(e[0]);
      const quantity = e[1];
      const custom = customs.some(function (p) {
        return p.id === contentId;
      });
      const src = custom
        ? customs.find(function (p) {
            return p.id === contentId;
          })
        : builtinIndex.get(contentId);
      if (!src) return null; // 目录缺失且无快照 → 跳过（理论不出现）
      return {
        content_id: contentId,
        quantity,
        package_snapshot: snapshotOf(src, isDaihao),
      };
    })
    .filter(Boolean);

  const customPackages = customs.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      category: p.category || "自定义",
      points: p.points,
      draws: p.draws,
      limit: p.limit,
      sort_id: p.sortId,
      extra: p.extra || undefined,
      ...(isDaihao ? { price_usd: p.priceUsd } : { price_cny: p.priceCny }),
    };
  });

  return {
    name, // 必填 ≤50（对话框里校验非空）
    version: version.value,
    exchange_rate: isDaihao ? exchangeRate.value : null, // 汇率仅 daihao 生效
    initial_points: isDaihao
      ? initialPointsDaihao.value
      : initialPointsRu.value,
    cart_items: cartItems,
    custom_packages: customPackages,
  };
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
    customPackages: body.custom_packages,
  };
}

// ---- E2：保存（命名 / 另存为 / 覆盖） ----
async function onConfirmSave(payload) {
  if (planSaving.value || !validCurrentRate()) return;
  const name = payload.name || "";
  if (!name || !name.trim()) {
    alert("请填写方案名（最长 50 字）");
    return;
  }
  if (name.trim().length > 50) {
    alert("方案名最长 50 字");
    return;
  }
  const savingVersion = version.value;
  const savingPlan = plansByVersion.value[savingVersion];
  const body = buildPayload(name.trim());
  const overwrite = payload.overwrite;

  // 游客：本地暂存兜底（§5.3），不调接口
  if (!auth.isLoggedIn) {
    try {
      upsertGuestPlan(body, overwrite);
      savingPlan.name = body.name;
      showPlanSave.value = false;
      showResult(`方案「${body.name}」已暂存在本机浏览器。`);
    } catch (_err) {
      showResult("本机浏览器保存失败，请检查存储空间后重试。", true);
    }
    return;
  }

  planSaving.value = true;
  const identity = cloudContext();
  const savedPlanId = savingPlan.id;
  const sourceState = JSON.stringify(body);
  try {
    // 本地和云端 id 都是 string；用 isLocal 区分，上传本机方案走 POST。
    const args = toLedgerArgs(body);
    const saved =
      savingPlan.id && overwrite && !savingPlan.isLocal
        ? await updatePlan(savingPlan.id, args) // 覆盖：PUT {id}
        : await createPlan(args); // 新方案 / 另存为 / 本地上传：POST
    if (!alive || cloudContext() !== identity) return;
    // The request succeeded remotely, but a later load/edit must not be replaced
    // by the old response. Unchanged views receive canonical custom IDs.
    if (version.value !== savingVersion || savingPlan.id !== savedPlanId || JSON.stringify(buildPayload(body.name)) !== sourceState) {
      showResult(`方案「${body.name}」已保存到云端；当前编辑内容已保留，请从我的方案加载已保存版本。`);
      return;
    }
    Object.assign(savingPlan, { id: saved.id, isLocal: false, name: saved.name });
    applyPlan(saved);
    showPlanSave.value = false;
    showResult(`方案「${saved.name}」已保存到云端。`);
  } catch (err) {
    if (alive && cloudContext() === identity) showResult(humanErr(err, "保存失败"), true);
  } finally {
    planSaving.value = false;
  }
}

// ---- E3：加载详情 → 复原页面（核心 applyPlan，只写「源状态」，派生量由 computed 重算） ----
function applyPlan(plan) {
  const isDaihao = plan.version === "daihao";

  // ① 版本（方案绑定单一 version）
  version.value = plan.version;

  // ② 汇率：仅在 daihao 生效；缺省回退 6.7
  if (isDaihao)
    updateRateDraft(plan.exchange_rate == null ? bundledLedgerCatalog.exchangeRate : plan.exchange_rate);

  // ③ 自定义礼包：id 以响应为准（服务端已重生成 + 回写引用）
  const customs = (plan.custom_packages || []).map(function (p) {
    const o = {
      id: p.id,
      name: p.name,
      category: p.category || "自定义",
      points: p.points,
      draws: p.draws,
      limit: p.limit,
      sortId: p.sort_id,
      extra: p.extra,
    };
    if (isDaihao) o.priceUsd = p.price_usd;
    else o.priceCny = p.price_cny;
    return o;
  });
  if (isDaihao) customPackagesDaihao.value = customs;
  else customPackagesRu.value = customs;

  // ④ 内置目录索引（把 content_id 对到快照，并探测缺失项）
  const builtin = publicCatalog.value.packages[plan.version];
  const builtinIndex = new Map(
    builtin.map(function (p) {
      return [p.id, p];
    }),
  );
  const customIndex = new Map(
    customs.map(function (p) {
      return [p.id, p];
    }),
  );

  // ⑤ Saved built-in snapshots remain authoritative even while catalog IDs exist.
  const cart = {};
  const snapshots = [];
  (plan.cart_items || []).forEach(function (item) {
    const cid = item.content_id;
    const snap = item.package_snapshot || {};
    cart[cid] = item.quantity;
    // 内置礼包按快照恢复，兼容下架 ID 与同 ID 已调价的目录。
    if (!customIndex.has(cid)) {
      const builtin = builtinIndex.get(cid);
      snapshots.push({
        id: cid,
        name: snap.name ?? builtin?.name ?? "存档礼包",
        category: snap.category || builtin?.category || "存档",
        points: snap.points ?? builtin?.points ?? 0,
        draws: snap.draws ?? builtin?.draws ?? 0,
        limit: snap.limit ?? builtin?.limit ?? 999,
        extra: snap.extra ?? builtin?.extra,
        sortId: snap.sort_id ?? builtin?.sortId,
        priceUsd: snap.price_usd ?? builtin?.priceUsd,
        priceCny: snap.price_cny ?? builtin?.priceCny,
        _fromSnapshot: true,
      });
    }
  });
  builtinSnapshots.value[plan.version] = snapshots;

  // ⑥ 初始积分（按版本）
  if (isDaihao) initialPointsDaihao.value = plan.initial_points || 0;
  else initialPointsRu.value = plan.initial_points || 0;

  // ⑦ 购物车写回对应版本
  if (isDaihao) cartDaihao.value = cart;
  else cartRu.value = cart;

  // ⑧ 派生量全部由前端 computed 自动重算（cartItems/points/draws/cny/usd/奖档次），无需设置
}

// ---- E3b：响应 DTO → 请求体（供重命名等整体回写） ----
function payloadFromDto(dto) {
  const isDaihao = dto.version === "daihao";
  return {
    name: dto.name,
    version: dto.version,
    exchange_rate: isDaihao ? dto.exchange_rate : null,
    initial_points: dto.initial_points,
    cart_items: (dto.cart_items || []).map(function (it) {
      // 响应快照带 custom 标记（PackageSnapshotDto 独有），回写请求体时剥离，避免未知字段
      const snap = Object.assign({}, it.package_snapshot || {});
      delete snap.custom;
      return {
        content_id: it.content_id,
        quantity: it.quantity,
        package_snapshot: snap,
      };
    }),
    custom_packages: dto.custom_packages || [],
  };
}

// ---- E4：列表加载 / 加载详情 / 重命名 / 删除 ----
async function openPlanList() {
  showPlanList.value = true;
  if (!auth.isLoggedIn) return; // 游客：列表只显示本地暂存
  if (planLoading.value) return;
  planLoading.value = true;
  const identity = cloudContext();
  try {
    const plans = await listPlans();
    if (alive && cloudContext() === identity) myPlans.value = plans;
  } catch (err) {
    if (alive && cloudContext() === identity) showResult(humanErr(err, "加载方案列表失败"), true);
  } finally {
    planLoading.value = false;
  }
}

async function loadPlan(plan) {
  const identity = cloudContext();
  const sequence = ++planLoadSequence;
  const requestedVersion = version.value;
  try {
    const full = await getPlan(plan.id); // 列表是轻量，需再取详情
    if (!alive || identity !== cloudContext() || sequence !== planLoadSequence || version.value !== requestedVersion) return;
    applyPlan(full);
    Object.assign(plansByVersion.value[full.version], { id: full.id, isLocal: false, name: full.name });
    showPlanList.value = false;
  } catch (err) {
    if (alive && identity === cloudContext() && sequence === planLoadSequence) showResult(humanErr(err, "加载方案失败"), true);
  }
}

// 加载本地暂存方案（本地记录即 payload 形状，直接喂给 applyPlan 同一套复原逻辑）
function loadGuestPlan(rec) {
  planLoadSequence++;
  applyPlan({
    id: rec._localId,
    name: rec.name,
    version: rec.version,
    exchange_rate: rec.exchange_rate,
    initial_points: rec.initial_points,
    cart_items: rec.cart_items || [],
    custom_packages: rec.custom_packages || [],
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  });
  Object.assign(plansByVersion.value[rec.version], { id: rec._localId, isLocal: true, name: rec.name });
  showPlanList.value = false;
}

// 重命名：本质 = 读取当前云端方案 → 改名 → PUT 整体替换
async function renamePlan(plan, newName) {
  if (!newName || !newName.trim()) return;
  const identity = cloudContext();
  try {
    const full = await getPlan(plan.id);
    if (!alive || identity !== cloudContext()) return;
    const payload = payloadFromDto(full); // DTO → 请求体
    payload.name = newName.trim();
    await updatePlan(full.id, toLedgerArgs(payload)); // 整体替换
    if (!alive || identity !== cloudContext()) return;
    const plans = await listPlans();
    if (!alive || identity !== cloudContext()) return;
    myPlans.value = plans;
    const state = plansByVersion.value[full.version];
    if (!state.isLocal && state.id === full.id) state.name = newName.trim();
  } catch (err) {
    if (alive && identity === cloudContext()) showResult(humanErr(err, "重命名失败"), true);
  }
}

async function removePlan(plan) {
  const identity = cloudContext();
  if (!confirm("删除方案「" + plan.name + "」？此操作不可恢复")) return;
  if (identity !== cloudContext()) return;
  try {
    await deletePlan(plan.id);
    if (!alive || identity !== cloudContext()) return;
    myPlans.value = myPlans.value.filter(function (p) {
      return p.id !== plan.id;
    });
    const state = plansByVersion.value[plan.version];
    if (!state.isLocal && state.id === plan.id) Object.assign(state, { id: null, name: "", isLocal: false });
  } catch (err) {
    if (alive && identity === cloudContext()) showResult(humanErr(err, "删除失败"), true);
  }
}

function goLogin() {
  location.href = "/login";
}

// ---- E5：游客本地暂存兜底（localStorage key yh_ledger_plans，与云端彻底隔离） ----
const GUEST_KEY = "yh_ledger_plans";
function readGuestPlans() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY)) || [];
  } catch (_e) {
    return [];
  }
}
function writeGuestPlans(list) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(list));
  guestPlans.value = list;
}

function upsertGuestPlan(payload, overwrite) {
  const list = readGuestPlans();
  const state = plansByVersion.value[payload.version];
  if (overwrite && state.id && state.isLocal) {
    // 覆盖：按 _localId 匹配（仅本地方案）
    const localId = String(state.id);
    const idx = list.findIndex(function (p) {
      return String(p._localId) === localId;
    });
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], payload, {
        updated_at: new Date().toISOString(),
      });
      writeGuestPlans(list);
      return;
    }
  }
  const rec = Object.assign({}, payload, {
    _localId: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  list.unshift(rec);
  writeGuestPlans(list);
  Object.assign(state, { id: rec._localId, isLocal: true });
}

function removeGuestPlan(rec) {
  if (!confirm("删除本地方案「" + rec.name + "」？此操作不可恢复")) return;
  writeGuestPlans(
    readGuestPlans().filter(function (p) {
      return String(p._localId) !== String(rec._localId);
    }),
  );
  const state = plansByVersion.value[rec.version];
  if (state.isLocal && String(state.id) === String(rec._localId)) Object.assign(state, { id: null, name: "", isLocal: false });
}

// ---- G：打开保存对话框（游客时对话框内提示登录 + 本地暂存兜底） ----
function openPlanSave() {
  if (!validCurrentRate()) return;
  showPlanSave.value = true;
}
</script>

<style src="../../styles/cart-workspace.css"></style>
<style src="../../styles/cart-workspaceDesktop.css"></style>
<style src="../../styles/cart-workspaceMobile.css"></style>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.cart-main :deep(.compact-tool-description) { color: var(--ink); }
.cart-search,.cart-sort,.cart-selected{color:var(--ink)}
.cart-search input,.cart-sort select{border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)}
.cart-selected{cursor:pointer}
.cart-selected input{accent-color:var(--tea)}
.cart-rate-hint{color:var(--ink-60)}
.cart-rate-error{color:var(--rouge)}
.cart-filter-empty{border:1px dashed var(--line);border-radius:18px;background:var(--surface)}
.cart-export-view{pointer-events:none}
.cart-version-hint{color:var(--ink-60)}
.cart-operation-message{border-radius:10px;background:var(--yellow);color:var(--ink);box-shadow:0 8px 24px rgba(73,59,44,.2)}
.cart-operation-message[role="alert"]{background:var(--surface);color:var(--rouge);border:1px solid var(--rouge)}
.tool-utility { border: 0; background: transparent; color: var(--ink-60); cursor: pointer; }
.tool-utility:hover { color: var(--tea); }
.tool-utility:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cart-version-selector { border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--cream) 65%, transparent); color: var(--ink-60); cursor: pointer; }
.cart-version-selector:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cart-currency { color: var(--ink-60); }
.cart-rate-settings { color: var(--ink-60); }
.cart-rate-settings > summary, .cart-more-filters > summary { cursor: pointer; }
.cart-rate-modify { text-decoration: underline; text-underline-offset: 3px; }
.cart-more-filters > summary::after { content: '⌄'; }
.cart-rate-settings > summary:focus-visible, .cart-more-filters > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cart-category select { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); }
.cart-advanced-content { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--tea) 12%, transparent); }
.cart-layout :deep(.receipt) { border-radius: 14px; box-shadow: none; }
.cart-layout :deep(.receipt-head) { border-bottom: 1px solid var(--line); background: var(--cream); color: var(--tea); }
.cart-layout :deep(.receipt-head .en) { color: var(--ink-60); }
.cart-layout :deep(.cart-actions .btn) { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--tea); }
.cart-layout :deep(.cart-actions .btn:hover:not(:disabled)) { border-color: var(--accent); background: var(--surface); }
</style>
<style scoped src="./cartPageDesktop.css"></style>
<style scoped src="./cartPageMobile.css"></style>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.cart-catalog-status{color:var(--ink-60)}.cart-catalog-status [role="alert"]{color:var(--rouge)}
</style>
<style scoped src="./cartPageOverrides1Desktop.css"></style>
<style scoped src="./cartPageOverrides1Mobile.css"></style>
