<template>
  <div class="page-inventory">
    <IslandSidebar />

    <main id="main-content" class="inventory-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">库存</span>
            <span class="pill">追踪</span>
            <span class="pill">统计</span>
          </div>
          <h1>广陵库房<span class="small">清点 · 归档 · 溯源</span></h1>
          <p class="hero-sub">代号鸢 / 如鸢 库存与奖励台账：支持多子账号分别清点，同步当前背包数量，按月按周统计各类物品与角色碎片获得量，支持导入导出完整交换档案（v2）。</p>
          <div class="hero-stats">
            <div>
              <div class="k">追踪目录更新日期</div>
              <div class="v catalog-date"><time :datetime="CATALOG_VERSION">{{ CATALOG_VERSION }}</time></div>
            </div>
            <div><div class="k">背包道具</div><div class="v">{{ itemCatalogCount }}<small>种</small></div></div>
            <div><div class="k">密探心纸</div><div class="v">{{ agentCatalogCount }}<small>种</small></div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">已同步</div><div class="v">云端<small>可导入导出</small></div></div>
            <div v-else class="is-authed"><div class="k">未登录</div><div class="v">只读<small><router-link to="/login">去登录</router-link></small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 库存子账号 -->
          <div class="account-bar" v-reveal>
            <div class="ac-sel">
              <label class="ac-label" for="inventory-account">当前库存子账号</label>
              <select id="inventory-account" v-model="accountId" :disabled="!auth.isLoggedIn || accountsLoading || editingStock" @change="onAccountChange">
                <option v-if="!accounts.length" value="">（未创建）</option>
                <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span v-if="accountError" class="ac-warn">{{ accountError }}</span>
            </div>
            <span class="sp"></span>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn || editingStock" @click="showAccounts = !showAccounts">{{ showAccounts ? '收起管理' : '管理账号' }}</button>
          </div>

          <!-- 账号管理 -->
          <div v-if="showAccounts && !editingStock" class="account-mgr" v-reveal>
            <div class="ac-new">
              <input v-model.trim="newAccountName" aria-label="新子账号名称" autocomplete="off" placeholder="新子账号名称（1~64 字）" @keyup.enter="onCreateAccount" />
              <button class="btn ghost" :disabled="accountBusy || !newAccountName" @click="onCreateAccount">新建账号</button>
            </div>
            <ul v-if="accounts.length" class="ac-list">
              <li v-for="a in accounts" :key="a.id" class="ac-item">
                <span class="ac-dot"></span>
                <div class="ac-meta">
                  <span class="ac-name">{{ a.name }}</span>
                  <code class="ac-id">{{ a.id }}</code>
                </div>
                <button class="ac-btn" :disabled="accountBusy" @click="onRenameAccount(a)">改名</button>
                <button class="ac-btn danger" :disabled="accountBusy" @click="onDeleteAccount(a)">删除</button>
              </li>
            </ul>
            <p v-else class="ac-empty">暂无子账号，请在上方输入名称创建第一个子账号</p>
          </div>

          <!-- TABS：追踪目录 / 时段获得量 / 导入记录 -->
          <div class="inventory-tabs" v-reveal>
            <button :class="{ on: activeTab === 'manifest' }" @click="setTab('manifest')">追踪清单</button>
            <button :class="{ on: activeTab === 'acquired' }" @click="setTab('acquired')">时段获得量</button>
            <button :class="{ on: activeTab === 'records' }" @click="setTab('records')">导入记录</button>
            <span class="sp"></span>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn || editingStock" @click="showImport = !showImport">导入档案</button>
            <label v-if="accounts.length > 1" class="export-all"><input type="checkbox" v-model="exportAll" /> 全部账号</label>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="doExport">导出档案</button>
          </div>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <p class="tip">粘贴符合《库存数据交换协议 v2》的 JSON 文档，或选择文件上传；导入结果会在下方展示。</p>
            <textarea v-model="importText" aria-label="库存交换档案 JSON" autocomplete="off" placeholder='{"format":"myshare-inventory-exchange","version":2,"accounts":[{"id":"acc_xxx","name":"大号"}],"records":[]}'></textarea>
            <div class="import-actions">
              <label class="btn ghost file-label">
                选择 JSON 文件
                <input type="file" accept=".json,application/json" @change="onFilePick" />
              </label>
              <button class="btn ghost" :disabled="loadingExample" @click="fillExample">{{ loadingExample ? '加载中…' : '示例导入' }}</button>
              <button class="btn primary" :disabled="importing || !importText.trim()" @click="doImport">导入</button>
            </div>
            <div v-if="importResult" class="import-result">
              导入完成：接受 {{ importResult.accepted }} 条 · 重复 {{ importResult.duplicates }} 条
              <span v-if="importResult.history_only"> · 仅历史 {{ importResult.history_only }} 条</span>
              <span v-if="importResult.superseded"> · 已归档 {{ importResult.superseded }} 条</span>
              <button class="ok" @click="afterImport">刷新库存</button>
            </div>
          </div>

          <!-- 追踪目录（YuanHub 当前支持的追踪范围，登录后叠加云端库存） -->
          <div v-show="activeTab === 'manifest'" ref="manifestPanel" class="panel">
            <div class="manifest-intro" :class="{ 'is-editing': editingStock }" v-reveal>
              <div class="type-switch">
                <button :disabled="editingStock" :class="{ on: entityType === 'item' }" @click="setEntityType('item')">背包道具</button>
                <button :disabled="editingStock" :class="{ on: entityType === 'agent' }" @click="setEntityType('agent')">密探心纸</button>
                <span class="sp"></span>
              </div>

              <aside class="manifest-scope" :class="{ 'is-editing': editingStock }">
                <Pencil v-if="editingStock" :size="16" aria-hidden="true" />
                <Info v-else :size="16" aria-hidden="true" />
                <p v-if="editingStock">正在编辑「{{ currentAccountName }}」的{{ stockEditScopeName ? '「' + stockEditScopeName + '」库存' : '背包库存' }} · 已修改 <b>{{ stockChangedCount }}</b> 项</p>
                <p v-else-if="entityType === 'item'" class="scope-guidance">库存数量有误？点击标题旁的 <Pencil :size="13" aria-hidden="true" /> 进入编辑模式</p>
                <p v-else>密探心纸目前仅供查看，编辑方式后续补充。</p>
                <div v-if="editingStock" class="manifest-edit-actions">
                  <button type="button" :disabled="savingStock" @click="cancelStockEdit"><X :size="14" />取消</button>
                  <button type="button" class="primary" :disabled="savingStock || !!stockDraftError || !stockChangedCount" @click="saveStockEdit">
                    <Save :size="14" />{{ savingStock ? '保存中…' : '保存库存' }}
                  </button>
                </div>
                <span v-if="stockSaveNotice && !editingStock" class="stock-save-notice" role="status" aria-live="polite">{{ stockSaveNotice }}</span>
              </aside>
            </div>

            <div v-if="!editingStock" class="manifest-bar" v-reveal>
              <div class="mf-stats">
                <div class="mf-stat"><b class="mf-num">{{ manifestTotal }}</b><span class="mf-k">可追踪</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestOwned }}</b><span class="mf-k">已持有</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestPercent }}</b><span class="mf-k">持有率</span></div>
              </div>
              <div class="mf-progress" title="当前追踪目录持有率"><i :style="{ '--progress': manifestProgressScale }"></i></div>
              <span class="sp"></span>
              <input v-model.trim="manifestSearch" class="mf-search" type="search" aria-label="搜索库存名称或 ID" placeholder="搜索名称 / id" />
              <div class="mf-filter">
                <button :class="{ on: manifestFilter === 'all' }" @click="manifestFilter = 'all'">全部</button>
                <button :class="{ on: manifestFilter === 'owned' }" @click="manifestFilter = 'owned'">已持有</button>
                <button :class="{ on: manifestFilter === 'missing' }" @click="manifestFilter = 'missing'">未持有</button>
              </div>
              <span v-if="error" class="mf-sync-error" role="status">云端库存同步失败：{{ error }}（数量按 0 显示）</span>
            </div>

            <div v-if="loading" class="state">正在加载追踪目录…</div>
            <div v-else-if="editingStock" class="backpack stock-editor">
              <p v-if="stockDraftError || stockEditError" class="stock-edit-error">{{ stockDraftError || stockEditError }}</p>
              <ul class="slot-grid stock-edit-grid">
                <li v-for="e in stockEditorEntries" :key="e.id" class="slot stock-edit-slot" :title="e.name || e.id">
                  <div class="slot-ic">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                  </div>
                  <InventoryItemName :entry="e" />
                  <div class="stock-stepper" :class="{ invalid: !isValidStockCount(stockDraft[e.id]) }">
                    <button
                      type="button"
                      :disabled="!isValidStockCount(stockDraft[e.id]) || Number(stockDraft[e.id]) <= 0"
                      :aria-label="'减少' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, -1)"
                    ><Minus :size="16" /></button>
                    <input
                      v-model="stockDraft[e.id]"
                      class="stock-count-input"
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="2147483647"
                      step="1"
                      :aria-label="(e.name || e.id) + '当前库存'"
                      @focus="$event.target.select()"
                    />
                    <button
                      type="button"
                      :disabled="!isValidStockCount(stockDraft[e.id]) || Number(stockDraft[e.id]) >= 2147483647"
                      :aria-label="'增加' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, 1)"
                    ><Plus :size="16" /></button>
                  </div>
                </li>
              </ul>
            </div>
            <div v-else class="backpack" :class="{ 'manifest-items': entityType === 'item' }" v-reveal>
              <div v-if="manifestEntries.length === 0" class="state slim">没有匹配「{{ manifestSearch }}」的对象</div>
              <div v-else-if="entityType === 'item'" class="item-sections">
                <section v-for="section in manifestCategorySections" :key="section.id" class="item-section">
                  <div class="section-head">
                    <h2>{{ section.name }}</h2>
                    <span>{{ section.entries.length }} 种</span>
                  </div>
                  <ul v-if="!section.subsections || section.primaryEntries.length" class="slot-grid">
                    <li v-for="e in section.subsections ? section.primaryEntries : section.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                      <div class="slot-ic">
                        <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                        <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                        <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                      </div>
                      <InventoryItemName :entry="e" />
                    </li>
                  </ul>
                  <template v-if="section.subsections && section.subsections.length">
                    <div class="subsection-columns" :class="{ 'subsection-rows': section.subsectionLayout === 'rows', 'subsection-shelves': section.subsectionLayout === 'shelves' }">
                      <div
                        v-for="subcategory in section.subsections"
                        :key="subcategory.id"
                        class="item-subsection"
                        :class="{
                          'is-divination-stone': subcategory.id === 'divination-stone',
                          'is-level-breakthrough': subcategory.id === 'level-breakthrough'
                        }"
                      >
                        <div class="subsection-head">
                          <h3>{{ subcategory.name }}</h3>
                          <span>{{ subcategory.entries.length }} 种</span>
                          <button
                            type="button"
                            class="subsection-edit"
                            :disabled="loading || !!error"
                            :aria-label="'编辑' + subcategory.name + '的库存'"
                            :data-tooltip="'编辑「' + subcategory.name + '」的库存'"
                            @click="startSubsectionStockEdit(subcategory)"
                          ><Pencil :size="14" aria-hidden="true" /></button>
                        </div>
                        <div v-if="subcategory.subgroups" class="cultivation-groups">
                          <div v-for="group in subcategory.subgroups" :key="group.id" class="cultivation-group">
                            <div class="cultivation-group-head"><h4>{{ group.name }}</h4><span>{{ group.entries.length }} 种</span></div>
                            <ul class="slot-grid">
                              <li v-for="e in group.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                                <div class="slot-ic">
                                  <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                                  <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                                  <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                                </div>
                                <InventoryItemName :entry="e" />
                              </li>
                            </ul>
                          </div>
                        </div>
                        <ul v-else class="slot-grid">
                          <li v-for="e in subcategory.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                            <div class="slot-ic">
                              <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                              <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                              <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                            </div>
                            <InventoryItemName :entry="e" />
                          </li>
                        </ul>
                      </div>
                    </div>
                  </template>
                </section>
              </div>
              <ul v-else class="slot-grid">
                <li v-for="e in manifestEntries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                  <div class="slot-ic is-agent">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                    <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                  </div>
                  <InventoryItemName :entry="e" />
                  <span class="slot-tag star" :class="'s' + e.rarity">{{ e.rarity }}★ · {{ e.prof }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 时段获得量 -->
          <div v-show="activeTab === 'acquired'" class="panel">
            <div class="acquired-bar" v-reveal>
              <div class="type-switch">
                <button :class="{ on: entityType === 'item' }" @click="setEntityType('item')">背包道具</button>
                <button :class="{ on: entityType === 'agent' }" @click="setEntityType('agent')">密探心纸</button>
              </div>
              <div class="range">
                <label>
                  <span class="lb">起</span>
                  <input type="date" v-model="rangeFrom" />
                </label>
                <label>
                  <span class="lb">止</span>
                  <input type="date" v-model="rangeTo" />
                </label>
                <button class="btn ghost" :disabled="loading" @click="loadAcquired">统计</button>
              </div>
            </div>

            <div v-if="loading" class="state">正在统计获得量…</div>
            <div v-else-if="error" class="state err">{{ error }}</div>
            <div v-else-if="acquiredEntries.length === 0" class="state">
              <template v-if="entityType === 'item'">该时段暂无物品获得记录 · 物品获得量仅来自奖励流水（派遣/寿春等），背包快照不计入</template>
              <template v-else>该时段暂无获得记录</template>
            </div>
            <div v-else class="backpack" v-reveal>
              <div class="bp-head">
                <span class="bp-tip">本时段获得 <b class="bp-num">{{ acquiredEntries.length }}</b> 种 · 图标与「追踪目录」一致，金橙角标为获得量</span>
              </div>
              <ul class="slot-grid">
                <li v-for="e in acquiredEntries" :key="e.id" class="slot" :title="e.name || e.id">
                  <div class="slot-ic" :class="{ 'is-agent': entityType === 'agent' }">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                    <span class="slot-count gained">+{{ fmtCount(e.count) }}</span>
                  </div>
                  <InventoryItemName :entry="e" />
                </li>
              </ul>
            </div>
          </div>

          <!-- 导入记录 -->
          <div v-show="activeTab === 'records'" class="panel">
            <div class="records-head" v-reveal>
              <span class="hint">已加载 {{ recordsList.length }} 条导入记录 · 删除单条后自动重放剩余记录重建库存</span>
              <span class="sp"></span>
              <button class="act-btn ghost" :disabled="recordsLoading" @click="loadRecords(true)">刷新</button>
            </div>

            <div v-if="recordsLoading && recordsList.length === 0" class="state">正在加载记录…</div>
            <div v-else-if="recordsError" class="state err">{{ recordsError }}</div>
            <div v-else-if="recordsList.length === 0" class="state">暂无导入记录</div>
            <template v-else>
              <ul class="record-list" v-reveal>
                <li v-for="r in recordsList" :key="r.record_id" class="record">
                  <div class="record-main">
                    <div class="record-top">
                      <span class="rtag" :class="r.record_type === 'reward_delta' ? 'rtag-reward' : 'rtag-snapshot'">{{ r.record_type === 'reward_delta' ? '奖励' : '快照' }}</span>
                      <span class="rtag rtag-type" :class="r.entity_type === 'agent' ? 'rtag-agent' : 'rtag-item'">{{ r.entity_type === 'agent' ? '角色' : '物品' }}</span>
                      <span v-if="r.acquisition_channel" class="rtag rtag-type">{{ r.acquisition_channel }}</span>
                      <span class="rtag effect" :class="'eff-' + r.stock_effect">{{ stockEffectLabel(r.stock_effect) }}</span>
                      <span class="record-time">{{ fmtTime(r.effective_at) }}</span>
                    </div>
                    <div class="record-entries">{{ entrySummary(r.entries, r.record_type) }}</div>
                    <div class="record-id" :title="r.record_id">{{ r.record_id }}</div>
                  </div>
                  <button class="record-del" @click="onDeleteRecord(r)">删除</button>
                </li>
              </ul>
              <button v-if="recordsNextCursor" class="load-more" :disabled="recordsLoading" @click="loadRecords(false)">加载更多</button>
            </template>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵库房<br><span>清点 · 归档 · 溯源</span></template>
        <template #fine>
          <b>YuanHub</b> · 库存与奖励台账<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际库存为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { Info, Minus, Pencil, Plus, Save, X } from '@lucide/vue'
import InventoryItemName from '../../components/inventory/InventoryItemName.vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { getCatalog, getCurrent, getAcquired, exportInventory, importInventory, listRecords, deleteRecord, listAccounts, createAccount, renameAccount, deleteAccount } from '../../api/inventory.js'
import { auth } from '../../store/auth.js'
import { CATALOG_VERSION, ITEM_CATALOG, AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { FRONTEND_HIDDEN_ITEM_IDS, buildItemCategorySections, sortItemsByGameOrder, sortStockEditItems, visibleInventoryItems } from '../../data/inventory/itemSections.js'
import { buildManualStockSnapshot, nextManualSnapshotTime, preserveHiddenStockEntries } from '../../data/inventory/manualStock.js'

const activeTab = ref('manifest')
const manifestPanel = ref(null)
const entityType = ref('item')
const manifestSearch = ref('')
const manifestFilter = ref('all')
const loading = ref(false)
const error = ref('')
const catalog = ref({ entities: [] })
const currentEntries = ref([])
const acquiredEntries = ref([])
const rangeFrom = ref(localDate(new Date(Date.now() - 30 * 86400000)))
const rangeTo = ref(localDate(new Date()))
const showImport = ref(false)
const importText = ref('')
const importing = ref(false)
const importResult = ref(null)
const loadingExample = ref(false)
const editingStock = ref(false)
const savingStock = ref(false)
const stockDraft = ref({})
const stockOriginal = ref({})
const stockEditError = ref('')
const stockSaveNotice = ref('')
const stockEditScopeIds = ref(null)
const stockEditScopeName = ref('')
const currentFullBaselineAt = ref(null)

// —— 库存子账号 ——
const accounts = ref([])
const accountId = ref('')
const accountsLoading = ref(false)
const accountBusy = ref(false)
const accountError = ref('')
const showAccounts = ref(false)
const newAccountName = ref('')
const exportAll = ref(false)
const currentAccountName = computed(function () {
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? account.name : '当前账号'
})

// —— 导入记录（游标分页） ——
const recordsList = ref([])
const recordsNextCursor = ref(null)
const recordsLoading = ref(false)
const recordsError = ref('')

function setTab(t) {
  if (editingStock.value && t !== 'manifest') {
    if (stockChangedCount.value && !confirm('当前库存修改尚未保存，放弃修改并离开？')) return
    cancelStockEdit()
  }
  activeTab.value = t
  if (t === 'manifest' && currentEntries.value.length === 0) reloadCurrent()
  if (t === 'acquired' && acquiredEntries.value.length === 0) loadAcquired()
  if (t === 'records') loadRecords(true)
}
function setEntityType(t) {
  if (editingStock.value) return
  if (t === entityType.value) return
  entityType.value = t
  // 切换对象类型后,旧的时段获得量结果属于另一类型:清空避免张冠李戴;
  // 当前库存立即刷新;若正处于"时段获得量"页签则按新类型自动重新统计。
  currentEntries.value = []
  currentFullBaselineAt.value = null
  acquiredEntries.value = []
  error.value = ''
  reloadCurrent()
  if (activeTab.value === 'acquired') loadAcquired()
}

// —— 库存子账号 ——
async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; accountId.value = ''; return }
  accountsLoading.value = true
  accountError.value = ''
  try {
    const list = await listAccounts()
    accounts.value = Array.isArray(list) ? list : []
    const still = accounts.value.some(function (a) { return a.id === accountId.value })
    if (!still) accountId.value = accounts.value.length ? accounts.value[0].id : ''
  } catch (err) {
    accountError.value = humanErr(err, '子账号加载失败')
  } finally {
    accountsLoading.value = false
  }
}

function onAccountChange() {
  // 切换账号：清空旧账号数据并按需重载
  cancelStockEdit()
  stockSaveNotice.value = ''
  currentEntries.value = []
  currentFullBaselineAt.value = null
  acquiredEntries.value = []
  recordsList.value = []
  recordsNextCursor.value = null
  recordsError.value = ''
  error.value = ''
  reloadCurrent()
  if (activeTab.value === 'acquired') loadAcquired()
  if (activeTab.value === 'records') loadRecords(true)
}

async function onCreateAccount() {
  const name = newAccountName.value.trim()
  if (!name) return
  accountBusy.value = true
  accountError.value = ''
  try {
    const created = await createAccount(name)
    newAccountName.value = ''
    await loadAccounts()
    if (created && created.id) accountId.value = created.id
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '创建账号失败')
  } finally {
    accountBusy.value = false
  }
}

async function onRenameAccount(acc) {
  const name = prompt('修改子账号名称（1~64 字）：', acc.name || '')
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed) { accountError.value = '名称不能为空'; return }
  accountBusy.value = true
  accountError.value = ''
  try {
    await renameAccount(acc.id, trimmed)
    await loadAccounts()
  } catch (err) {
    accountError.value = humanErr(err, '改名失败')
  } finally {
    accountBusy.value = false
  }
}

async function onDeleteAccount(acc) {
  if (!confirm('删除子账号「' + acc.name + '」？将级联清除该账号的库存、流水与相关 Token，且不可恢复。')) return
  accountBusy.value = true
  accountError.value = ''
  try {
    await deleteAccount(acc.id)
    await loadAccounts()
    const still = accounts.value.some(function (a) { return a.id === accountId.value })
    if (!still) accountId.value = accounts.value.length ? accounts.value[0].id : ''
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '删除账号失败')
  } finally {
    accountBusy.value = false
  }
}

// ISO 日期（本地时区 YYYY-MM-DD），供 <input type=date> 与后端 [from,to) 区间
function localDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function fmtCount(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN')
}

// —— 背包格图标约定 ——
const ICON_EXT = 'png'

function iconSrc(e) {
  const kind = entityType.value === 'agent' ? 'agents' : 'items'
  return import.meta.env.BASE_URL + 'inventory-icons/' + kind + '/' + encodeURIComponent(e.id) + '.' + ICON_EXT
}

function onImgLoad(ev) {
  const img = ev && ev.currentTarget
  if (!img) return
  img.hidden = false
  if (img.parentElement) img.parentElement.classList.remove('has-icon-error')
}

function onImgError(ev) {
  const img = ev && ev.currentTarget
  if (!img) return
  img.hidden = true
  if (img.parentElement) img.parentElement.classList.add('has-icon-error')
}

function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

function nameOf(id, name) {
  const local = LOCAL_NAME[entityType.value] ? LOCAL_NAME[entityType.value].get(id) : null
  if (local) return local
  if (name) return name
  if (!catalog.value.entities.length) return id
  const hit = catalog.value.entities.find(function (e) { return e.id === id && e.entity_type === entityType.value })
  return (hit && hit.name) ? hit.name : id
}

const visibleItemCatalog = visibleInventoryItems(ITEM_CATALOG)
const stockCatalogSections = buildItemCategorySections(sortItemsByGameOrder(visibleItemCatalog))
const stockCatalogSubsections = new Map(
  stockCatalogSections.flatMap(function (section) { return section.subsections || [] })
    .map(function (subsection) { return [subsection.id, subsection] })
)
const itemCatalogCount = visibleItemCatalog.length
const agentCatalogCount = AGENT_CATALOG.length

const LOCAL_NAME = {
  item: new Map(ITEM_CATALOG.map(function (e) { return [e.id, e.name] })),
  agent: new Map(AGENT_CATALOG.map(function (e) { return [e.id, e.name] }))
}
const LOCAL_ITEM = new Map(ITEM_CATALOG.map(function (e) { return [e.id, e] }))
const localCatalog = computed(function () { return entityType.value === 'agent' ? AGENT_CATALOG : visibleItemCatalog })
const visibleCurrentEntries = computed(function () {
  return entityType.value === 'item' ? visibleInventoryItems(currentEntries.value) : currentEntries.value
})
const currentMap = computed(function () {
  const m = {}
  currentEntries.value.forEach(function (e) { m[e.id] = Number(e.count) || 0 })
  return m
})
const manifestEntries = computed(function () {
  const stock = currentMap.value
  const q = manifestSearch.value.toLowerCase()
  const f = manifestFilter.value
  return localCatalog.value
    .map(function (e) {
      const count = stock[e.id] != null ? stock[e.id] : 0
      return Object.assign({}, e, { count: count, owned: count > 0 })
    })
    .filter(function (e) {
      if (f === 'owned' && !e.owned) return false
      if (f === 'missing' && e.owned) return false
      if (q) {
        const hay = [e.name, e.id, e.category, e.prof, e.subProf].filter(Boolean).join(' ').toLowerCase()
        if (hay.indexOf(q) === -1) return false
      }
      return true
    })
})
const manifestGameEntries = computed(function () { return sortItemsByGameOrder(manifestEntries.value) })
const manifestCategorySections = computed(function () { return buildItemCategorySections(manifestGameEntries.value) })
const stockEditEntries = computed(function () {
  const ids = new Set(visibleItemCatalog.map(function (item) { return item.id }))
  const entries = visibleItemCatalog.slice()
  visibleCurrentEntries.value.forEach(function (item) {
    if (!ids.has(item.id)) entries.push(item)
  })
  return sortStockEditItems(entries)
})
const stockEditorEntries = computed(function () {
  if (!stockEditScopeIds.value) return stockEditEntries.value
  const scopeIds = new Set(stockEditScopeIds.value)
  return stockEditEntries.value.filter(function (item) { return scopeIds.has(item.id) })
})
const stockDraftError = computed(function () {
  const invalid = stockEditorEntries.value.find(function (item) { return !isValidStockCount(stockDraft.value[item.id]) })
  return invalid ? (invalid.name || invalid.id) + '的库存必须是 0 至 2,147,483,647 之间的整数' : ''
})
const stockChangedCount = computed(function () {
  return stockEditorEntries.value.filter(function (item) {
    const value = stockDraft.value[item.id]
    return isValidStockCount(value) && Number(value) !== Number(stockOriginal.value[item.id] || 0)
  }).length
})
const manifestTotal = computed(function () { return localCatalog.value.length })
const manifestOwned = computed(function () {
  const stock = currentMap.value
  return localCatalog.value.filter(function (e) { return (stock[e.id] || 0) > 0 }).length
})
const manifestPercent = computed(function () {
  if (!manifestTotal.value) return '0%'
  return Math.round(manifestOwned.value * 100 / manifestTotal.value) + '%'
})
const manifestProgressScale = computed(function () {
  if (!manifestTotal.value) return 0
  return manifestOwned.value / manifestTotal.value
})

function slotTitle(e) {
  const parts = [e.name || e.id]
  if (entityType.value === 'item' && e.category) parts.push(e.category)
  if (entityType.value === 'agent') {
    let line = (e.rarity != null ? e.rarity + '★' : '')
    if (e.prof) line = line ? line + ' · ' + e.prof : e.prof
    if (e.subProf) line = line ? line + ' · ' + e.subProf : e.subProf
    parts.push(line)
  }
  parts.push('× ' + fmtCount(e.count))
  return parts.join(' ｜ ')
}

function isValidStockCount(value) {
  if (value === '' || value == null) return false
  const count = Number(value)
  return Number.isInteger(count) && count >= 0 && count <= 2147483647
}

function adjustStockCount(id, delta) {
  const current = Number(stockDraft.value[id])
  if (!Number.isInteger(current)) return
  stockDraft.value[id] = Math.min(2147483647, Math.max(0, current + delta))
}

function startSubsectionStockEdit(subcategory) {
  const subsection = stockCatalogSubsections.get(subcategory.id)
  startStockEdit(subsection ? subsection.entries : subcategory.entries, subcategory.name)
}

function scrollToStockEditor() {
  nextTick(function () {
    if (!manifestPanel.value) return
    const offset = window.matchMedia('(max-width: 640px)').matches ? 64 : 16
    const top = window.scrollY + manifestPanel.value.getBoundingClientRect().top - offset
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    window.scrollTo({ top: Math.max(0, top), behavior: behavior })
  })
}

function startStockEdit(scopeEntries, scopeName) {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { alert('请先创建并选择一个子账号'); return }
  const draft = {}
  stockEditEntries.value.forEach(function (item) { draft[item.id] = Number(currentMap.value[item.id]) || 0 })
  stockDraft.value = Object.assign({}, draft)
  stockOriginal.value = Object.assign({}, draft)
  stockEditScopeIds.value = Array.isArray(scopeEntries) ? scopeEntries.map(function (item) { return item.id }) : null
  stockEditScopeName.value = stockEditScopeIds.value ? String(scopeName || '') : ''
  stockEditError.value = ''
  stockSaveNotice.value = ''
  showImport.value = false
  editingStock.value = true
  scrollToStockEditor()
}

function cancelStockEdit() {
  editingStock.value = false
  savingStock.value = false
  stockDraft.value = {}
  stockOriginal.value = {}
  stockEditScopeIds.value = null
  stockEditScopeName.value = ''
  stockEditError.value = ''
}

function manualSnapshotTime() {
  return nextManualSnapshotTime(
    currentFullBaselineAt.value,
    currentEntries.value.map(function (item) { return item.listedBaselineAt })
  )
}

function manualRecordId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return 'yuanhub:manual:' + globalThis.crypto.randomUUID()
  }
  return 'yuanhub:manual:' + Date.now() + ':' + Math.random().toString(16).slice(2)
}

async function saveStockEdit() {
  stockEditError.value = stockDraftError.value
  if (stockEditError.value || !stockChangedCount.value || savingStock.value) return
  savingStock.value = true
  const effectiveAt = manualSnapshotTime()
  const visibleDraftEntries = stockEditEntries.value.map(function (item) {
    return { id: item.id, name: item.name || item.id, count: Number(stockDraft.value[item.id]) }
  })
  const draftEntries = preserveHiddenStockEntries(visibleDraftEntries, currentEntries.value, FRONTEND_HIDDEN_ITEM_IDS)
  const doc = buildManualStockSnapshot({
    accountId: accountId.value,
    catalogVersion: CATALOG_VERSION,
    effectiveAt: effectiveAt,
    recordId: manualRecordId(),
    entries: draftEntries
  })
  try {
    const result = await importInventory(doc)
    if (result && result.superseded) throw new Error('快照时间早于现有库存，未能生效')
    editingStock.value = false
    stockSaveNotice.value = '库存已更新'
    stockDraft.value = {}
    stockOriginal.value = {}
    stockEditScopeIds.value = null
    stockEditScopeName.value = ''
    await reloadCurrent()
  } catch (err) {
    stockEditError.value = humanErr(err, '库存保存失败')
  } finally {
    savingStock.value = false
  }
}

async function safeLoad(fn, quiet) {
  loading.value = true
  if (!quiet) error.value = ''
  try { await fn() } catch (err) {
    if (!quiet) error.value = humanErr(err, '加载失败，请稍后重试')
  } finally { loading.value = false }
}

async function reloadCurrent(quiet) {
  // 未登录时不请求云端库存（避免 401 触发自动跳转登录页），数量保持初始 0
  if (!auth.isLoggedIn) {
    currentEntries.value = []
    currentFullBaselineAt.value = null
    error.value = ''
    loading.value = false
    return
  }
  // 未选择账号时不请求（后端 /current 需要 account_id）
  if (!accountId.value) {
    currentEntries.value = []
    currentFullBaselineAt.value = null
    error.value = ''
    loading.value = false
    return
  }
  await safeLoad(async function () {
    const data = await getCurrent({ accountId: accountId.value, entityType: entityType.value })
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const doc = list[0]
    const entriesObj = (doc && doc.entries) ? doc.entries : {}
    currentFullBaselineAt.value = doc ? doc.full_baseline_at : null
    currentEntries.value = Object.keys(entriesObj).map(function (id) {
      const se = entriesObj[id] || {}
      const item = entityType.value === 'item' ? LOCAL_ITEM.get(id) : null
      return { id: id, name: nameOf(id, se.name), count: Number(se.count) || 0, category: item ? item.category : '', listedBaselineAt: se.listed_baseline_at || null }
    }).sort(function (a, b) { return b.count - a.count })
  }, quiet)
}

function dayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2]).toISOString()
}

function nextDayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2] + 1).toISOString()
}

let acquiredSeq = 0

async function loadAcquired() {
  const seq = ++acquiredSeq
  await safeLoad(async function () {
    if (!accountId.value) { error.value = '请先创建并选择一个子账号'; return }
    const from = dayStartIso(rangeFrom.value)
    const to = nextDayStartIso(rangeTo.value)
    if (!from || !to) { error.value = '请选择有效的起止日期'; return }
    const data = await getAcquired({ accountId: accountId.value, entityType: entityType.value, from: from, to: to })
    if (seq !== acquiredSeq) return
    const acquiredObj = (data && data.acquired) ? data.acquired : {}
    acquiredEntries.value = Object.keys(acquiredObj).map(function (id) {
      return { id: id, name: nameOf(id, null), count: Number(acquiredObj[id]) || 0 }
    }).sort(function (a, b) { return b.count - a.count })
  })
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

function goLogin() { location.href = '/login' }

// ---- 导入记录（游标分页） ----
async function loadRecords(reset) {
  if (!accountId.value) {
    recordsList.value = []
    recordsError.value = '请先创建并选择一个子账号'
    recordsLoading.value = false
    return
  }
  recordsLoading.value = true
  if (reset) recordsError.value = ''
  try {
    const cursor = reset ? null : recordsNextCursor.value
    const page = await listRecords({
      accountId: accountId.value,
      entityType: entityType.value,
      cursor: cursor,
      limit: 50
    })
    const items = (page && Array.isArray(page.items)) ? page.items : []
    recordsList.value = reset ? items : recordsList.value.concat(items)
    recordsNextCursor.value = (page && page.next_cursor) ? page.next_cursor : null
  } catch (err) {
    recordsError.value = humanErr(err, '加载记录失败')
  } finally {
    recordsLoading.value = false
  }
}

async function onDeleteRecord(rec) {
  const rid = rec && rec.record_id
  if (!rid) return
  if (!confirm('删除记录「' + rid + '」？删除后将重放剩余记录重建库存，此操作不可恢复。')) return
  try {
    await deleteRecord(rid, accountId.value)
    await loadRecords(true)
    await reloadCurrent()
  } catch (err) {
    alert(humanErr(err, '删除失败'))
  }
}

function stockEffectLabel(eff) {
  if (eff === 'applied') return '已生效'
  if (eff === 'history_only') return '仅历史'
  if (eff === 'superseded') return '已归档'
  return eff || '未知'
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function entrySummary(entries, recordType) {
  const list = entries || []
  const sign = recordType === 'reward_delta' ? '+' : '='
  return list.map(function (e) { return (e.name || e.id) + sign + e.count }).join('、')
}

// ---- 导入档案 ----
async function doImport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!importText.value.trim()) { alert('请粘贴交换协议 JSON 或选择文件'); return }
  let doc = null
  try {
    doc = JSON.parse(importText.value)
  } catch (_e) {
    alert('JSON 解析失败，请检查格式')
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const res = await importInventory(doc)
    importResult.value = res || {}
  } catch (err) {
    alert(humanErr(err, '导入失败'))
  } finally {
    importing.value = false
  }
}

function onFilePick(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = function () {
    importText.value = String(reader.result || '')
  }
  reader.readAsText(file, 'utf-8')
}

async function fillExample() {
  if (loadingExample.value) return
  loadingExample.value = true
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'inventory-import-example.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    // 示例文档里的 account_id 为占位符 acc_demo_main：若已选择子账号，则替换为当前账号，
    // 使示例可以直接导入（后端要求 records 引用的 account_id 必须归属当前用户）。
    if (accountId.value) {
      try {
        const doc = JSON.parse(text)
        if (doc && doc.accounts && Array.isArray(doc.accounts)) {
          doc.accounts = doc.accounts.map(function (a) { return Object.assign({}, a, { id: accountId.value }) })
        }
        if (doc && Array.isArray(doc.records)) {
          doc.records = doc.records.map(function (r) { return Object.assign({}, r, { account_id: accountId.value }) })
        }
        importText.value = JSON.stringify(doc, null, 2)
      } catch (_e) {
        importText.value = text
      }
    } else {
      importText.value = text
    }
  } catch (err) {
    alert(humanErr(err, '加载示例失败'))
  } finally {
    loadingExample.value = false
  }
}

function afterImport() {
  importResult.value = null
  importText.value = ''
  showImport.value = false
  reloadCurrent()
}

// ---- 导出档案 ----
async function doExport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { alert('请先创建并选择一个子账号'); return }
  try {
    const opts = {
      include: 'current,rewards',
      from: dayStartIso(rangeFrom.value),
      to: nextDayStartIso(rangeTo.value)
    }
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = 'all'
    } else {
      opts.accountId = accountId.value
    }
    const data = await exportInventory(opts)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'inventory-export.json'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (err) {
    alert(humanErr(err, '导出失败'))
  }
}

onMounted(async function () {
  try {
    const data = await getCatalog()
    if (data && data.entities) catalog.value = { entities: data.entities }
  } catch (_e) {
    catalog.value = { entities: [] }
  }
  await loadAccounts()
  reloadCurrent()
})
</script>

<style scoped>
/* ---- 库存子账号 ---- */
.account-bar { display: flex; align-items: center; gap: 16px; margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; flex-wrap: wrap }
.account-bar .sp { flex: 1 }
.ac-sel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.ac-label { font-size: 13px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }
.ac-sel select { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; min-width: 160px; cursor: pointer; transition: border-color .3s }
.ac-sel select:focus { border-color: var(--accent) }
.ac-warn { font-size: 12px; color: var(--rouge); font-weight: 700 }
.account-mgr { margin-top: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px 18px }
.ac-new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.ac-new input { flex: 1; min-width: 200px; border: 1.5px solid var(--line); border-radius: 10px; padding: 9px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.ac-new input:focus { border-color: var(--accent) }
.ac-list { list-style: none; margin-top: 14px; display: flex; flex-direction: column; gap: 8px }
.ac-item { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; background: var(--paper) }
.ac-item .ac-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--yellow-deep); flex: none }
.ac-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.ac-name { font-size: 13.5px; font-weight: 800; color: var(--ink) }
.ac-id { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ac-btn { flex: none; border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .25s, background-color .25s, border-color .25s }
.ac-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.ac-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ac-btn.danger:hover:not(:disabled) { background: rgba(166, 81, 74, .1) }
.ac-btn:disabled { opacity: .45; cursor: not-allowed }
.ac-empty { margin-top: 12px; font-size: 12.5px; color: var(--ink-35); font-weight: 600 }
.export-all { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ink-60); cursor: pointer; white-space: nowrap }
.export-all input { accent-color: var(--accent); cursor: pointer }
.load-more { display: block; margin: 16px auto 0; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 10px 26px; font-size: 13px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease) }
.load-more:hover:not(:disabled) { border-color: var(--ink); background: var(--cream) }
.load-more:disabled { opacity: .45; cursor: not-allowed }

/* —— 复用全局 CSS 变量（不新增色值），对齐广陵账房（cart.vue）版式 —— */
.page-inventory .hero::after { content: '库存' }

.inventory-tabs { display: flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 14px; padding: 4px; margin-top: 40px }
.inventory-tabs button {
  border: none; background: transparent; font-family: var(--font-b); font-weight: 700;
  font-size: 14px; padding: 10px 26px; border-radius: 10px; cursor: pointer; color: var(--ink-60);
  transition: color .3s var(--ease), background-color .3s var(--ease);
}
.inventory-tabs button.on { background: var(--tea); color: var(--cream) }
.inventory-tabs button:hover:not(.on) { color: var(--ink) }
.inventory-tabs .sp { flex: 1 }
.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease); white-space: nowrap }
.act-btn.ghost:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }

.import-box { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px }
.import-box .tip { font-size: 12.5px; color: var(--ink-60); line-height: 1.8; margin-bottom: 12px }
.import-box textarea { width: 100%; min-height: 140px; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; font-family: var(--font-b); font-size: 12.5px; color: var(--ink); background: var(--paper); outline: none; resize: vertical; transition: border-color .3s }
.import-box textarea:focus { border-color: var(--accent) }
.import-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px }
.file-label { cursor: pointer }
.file-label input { display: none }
.import-result { margin-top: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 12.5px; color: var(--ink); display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.import-result .ok { margin-left: auto; border: none; background: var(--tea); color: var(--cream); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b) }

.panel { margin-top: 20px }

.type-switch { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 12px; padding: 4px; align-items: center }
.type-switch button {
  border: none; background: transparent; font-family: var(--font-b); font-weight: 700;
  font-size: 13px; padding: 8px 18px; border-radius: 9px; cursor: pointer; color: var(--ink-60);
  transition: color .3s var(--ease), background-color .3s var(--ease);
}
.type-switch button.on { background: var(--yellow); color: var(--ink) }
.type-switch button:hover:not(.on) { color: var(--ink) }
.type-switch button:disabled { opacity: .45; cursor: not-allowed }
.type-switch .sp { flex: 1 }
.type-switch .hint { font-size: 12px; color: var(--ink-35); font-weight: 600; margin-right: 6px }
.stock-save-notice { color: var(--accent-strong); font-size: 12px; font-weight: 800 }

/* ---- 追踪目录工具条 ---- */
.manifest-intro { display: flex; align-items: center; gap: 14px }
.manifest-intro .type-switch { flex: none }
.manifest-scope { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 4px 0 4px 14px; border-left: 1px dashed var(--line); color: var(--ink-60) }
.manifest-scope > svg { flex: none; color: var(--accent-strong) }
.manifest-scope p { flex: 0 1 auto; margin: 0; font-size: 12px; font-weight: 600; line-height: 1.65 }
.manifest-scope p b { color: var(--accent-strong); font-family: var(--font-d); font-weight: 900 }
.scope-guidance svg { display: inline; margin-inline: 2px; color: var(--accent-strong); vertical-align: -2px }
.manifest-scope button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: none; min-height: 36px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; color: var(--accent-strong); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer }
.manifest-scope button:hover:not(:disabled) { background: var(--yellow); color: var(--ink) }
.manifest-scope button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.manifest-scope button:disabled { opacity: .45; cursor: not-allowed }
.manifest-scope .manifest-edit-actions { display: flex; align-items: center; gap: 6px; flex: none }
.manifest-scope .manifest-edit-actions .primary { background: var(--tea); color: var(--cream); padding-inline: 12px }
.manifest-scope .manifest-edit-actions .primary:hover:not(:disabled) { background: var(--ink); color: var(--cream) }
.manifest-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px }
.mf-stats { display: flex; gap: 24px; align-items: baseline }
.mf-stat { display: flex; align-items: baseline; gap: 6px }
.mf-num { font-family: var(--font-d); font-weight: 900; font-size: 20px; color: var(--accent-strong); letter-spacing: -.01em }
.mf-k { font-size: 12px; color: var(--ink-60); font-weight: 700 }
.mf-progress { flex: none; width: 120px; height: 8px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); overflow: hidden }
.mf-progress i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--accent); transform: scaleX(var(--progress, 0)); transform-origin: left; transition: transform .45s var(--ease) }
.manifest-bar .sp { flex: 1 }
.mf-search { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 180px; transition: border-color .3s }
.mf-search:focus { border-color: var(--accent) }
.mf-filter { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 10px; padding: 4px }
.mf-filter button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; color: var(--ink-60); transition: color .3s var(--ease), background-color .3s var(--ease), box-shadow .3s var(--ease) }
.mf-filter button.on { background: var(--surface); color: var(--accent-strong); box-shadow: 0 1px 4px rgba(73, 59, 44, .16) }
.mf-filter button:hover:not(.on) { color: var(--ink) }
.mf-sync-error { flex-basis: 100%; color: var(--rouge); font-size: 12px; font-weight: 700; line-height: 1.6 }
.state.slim { padding: 26px 20px; margin-top: 14px; border-radius: 14px }

.acquired-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap }
.range { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.range label { display: flex; align-items: center; gap: 6px }
.range .lb { font-size: 12px; font-weight: 700; color: var(--ink-60) }
.range input {
  border: 1.5px solid var(--line); border-radius: 10px; padding: 7px 10px; font-size: 13px;
  font-family: var(--font-b); color: var(--ink); background: var(--surface); outline: none; transition: border-color .3s;
}
.range input:focus { border-color: var(--accent) }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: color .35s var(--ease), background-color .35s var(--ease), border-color .35s var(--ease), transform .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }

/* ---- 背包格（游戏背包样式）---- */
.backpack { margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 18px 18px 20px }
.bp-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); flex-wrap: wrap }
.bp-head .sp { flex: 1 }
.bp-tip { font-size: 12px; color: var(--ink-60); font-weight: 600; line-height: 1.8 }
.bp-tip code { font-family: var(--font-d); font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; color: var(--ink-60); margin: 0 2px; word-break: break-all }
.bp-num { font-family: var(--font-d); font-weight: 900; color: var(--accent-strong); font-size: 13px }

.slot-grid { list-style: none; margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fill, 104px); justify-content: start; gap: 18px 16px }
.item-sections { display: flex; flex-direction: column }
.item-section { padding: 22px 0 0px }
.item-section + .item-section { border-top: 1.5px dashed var(--line) }
.section-head { display: flex; align-items: baseline; gap: 10px }
.section-head h2 { margin: 0; color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900; letter-spacing: 0 }
.section-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 11px; font-weight: 800 }
.item-section .slot-grid { margin-top: 20px }
.subsection-columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 16px }
.subsection-columns.subsection-rows { grid-template-columns: minmax(0, 1fr) }
.subsection-columns.subsection-shelves { grid-template-columns: minmax(0, 1fr) }
.item-subsection { min-width: 0; padding: 18px 0; display: flex; flex-direction: column }
.item-subsection + .item-subsection { border-top: 1.5px dashed var(--line) }
.subsection-head { position: relative; display: flex; align-items: center; gap: 8px; min-height: 30px; padding-left: 10px }
.subsection-head::before { content: ''; position: absolute; left: 0; top: 50%; width: 3px; height: 20px; border-radius: 2px; background: var(--accent); transform: translateY(-50%) }
.subsection-head h3 { margin: 0; color: var(--ink); font-family: var(--font-b); font-size: 13px; font-weight: 900; letter-spacing: 0 }
.subsection-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.subsection-edit { position: relative; flex: none; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--accent-strong); cursor: pointer; transition: color .18s var(--ease) }
.subsection-edit svg { transition: transform .18s var(--ease) }
.subsection-edit:hover:not(:disabled) { color: var(--tea) }
.subsection-edit:hover:not(:disabled) svg { transform: translateY(-1px) rotate(-10deg) }
.subsection-edit:disabled { opacity: .4; cursor: not-allowed }
.subsection-edit::after { content: attr(data-tooltip); position: absolute; left: calc(100% + 8px); top: 50%; z-index: 20; width: max-content; max-width: 220px; padding: 6px 9px; border-radius: 6px; background: var(--tea); color: var(--cream); font-family: var(--font-b); font-size: 11px; font-weight: 700; line-height: 1.4; white-space: nowrap; opacity: 0; pointer-events: none; transform: translate(-3px, -50%); transition: opacity .16s var(--ease), transform .16s var(--ease) }
.subsection-edit:hover::after, .subsection-edit:focus-visible::after { opacity: 1; transform: translate(0, -50%) }
.item-subsection > .slot-grid { flex: 1; grid-template-columns: repeat(3, minmax(0, 104px)); align-content: center; justify-content: center; gap: 18px 16px; margin-top: 20px }
.subsection-rows .item-subsection > .slot-grid { grid-template-columns: repeat(auto-fill, 104px); align-content: start; justify-content: start }
.subsection-shelves .item-subsection { display: grid; grid-template-columns: 112px minmax(0, 1fr); column-gap: 20px }
.subsection-shelves .subsection-head { align-self: start }
.subsection-shelves .item-subsection > .slot-grid { grid-template-columns: repeat(auto-fill, 104px); align-content: start; justify-content: start; margin-top: 8px }
.item-subsection > .slot-grid .slot-name { height: auto; min-height: 1.45em }
.cultivation-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 20px }
.cultivation-group { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.cultivation-group-head { display: flex; align-items: baseline; gap: 8px }
.cultivation-group-head h4 { margin: 0; color: var(--ink); font-family: var(--font-b); font-size: 12.5px; font-weight: 900; letter-spacing: 0 }
.cultivation-group-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.cultivation-group > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); align-content: start; justify-content: center; gap: 12px 9px; margin-top: 16px }
.cultivation-group .slot-name { height: auto; min-height: 1.45em }
.stock-edit-error { margin-top: 14px; border: 1px solid rgba(166, 81, 74, .35); border-radius: 8px; background: rgba(166, 81, 74, .06); color: var(--rouge); padding: 9px 12px; font-size: 12px; font-weight: 700 }
.stock-edit-grid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 22px 16px }
.stock-edit-slot { align-items: center }
.stock-edit-slot:hover { transform: none }
.stock-edit-slot .slot-name { height: auto; min-height: calc(2 * 1.45em) }
.stock-stepper { width: min(100%, 132px); height: 40px; margin-top: 6px; display: grid; grid-template-columns: 40px minmax(0, 1fr) 40px; align-items: stretch; border: 1.5px solid var(--accent); border-radius: 8px; overflow: hidden; background: var(--surface); box-shadow: 0 3px 8px rgba(73, 59, 44, .14) }
.stock-stepper:focus-within { border-color: var(--tea); box-shadow: 0 0 0 2px var(--yellow) }
.stock-stepper.invalid { border-color: var(--rouge) }
.stock-stepper button { display: grid; place-items: center; min-width: 0; padding: 0; border: 0; border-radius: 0; background: var(--paper); color: var(--ink); cursor: pointer }
.stock-stepper button:first-child { border-right: 1px solid var(--line) }
.stock-stepper button:last-child { border-left: 1px solid var(--line) }
.stock-stepper button:hover:not(:disabled) { background: var(--yellow) }
.stock-stepper button:disabled { color: var(--ink-35); cursor: not-allowed; opacity: .55 }
.stock-count-input { min-width: 0; width: 100%; height: 100%; padding: 0 2px; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); font-family: var(--font-d); font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; text-align: center; outline: none; appearance: textfield; -moz-appearance: textfield }
.stock-count-input::-webkit-inner-spin-button, .stock-count-input::-webkit-outer-spin-button { margin: 0; appearance: none; -webkit-appearance: none }
.stock-stepper.invalid .stock-count-input { color: var(--rouge) }
.slot { display: flex; flex-direction: column; min-width: 0; transition: transform .22s var(--ease) }
.slot:hover { transform: translateY(-2px) }
.slot-ic {
  position: relative; width: min(100%, 100px); aspect-ratio: 1 / 1; margin: 0 auto; border-radius: 17px;
  transition: border-color .22s, box-shadow .22s var(--ease), filter .22s;
}
.slot-ic.is-agent { overflow: hidden; border: 1.5px solid rgba(215, 137, 53, .38); background: var(--cream); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(215, 137, 53, .22) }
.slot:hover .slot-ic:not(.is-agent) { filter: brightness(1.035) }
.slot:hover .slot-ic.is-agent { border-color: var(--accent); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), 0 14px 26px -14px rgba(73, 59, 44, .4) }
.slot-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; visibility: hidden; opacity: 0; border-radius: inherit; background: linear-gradient(168deg, var(--surface) 0%, var(--cream) 62%, var(--paper) 100%); pointer-events: none }
.slot-ic.has-icon-error .slot-ph { visibility: visible; opacity: 1 }
.slot-ph .ph-seal {
  position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border: 1.5px solid var(--brand-blue);
  border-radius: 6px; color: var(--brand-blue); font-size: 11px; font-weight: 800; display: grid; place-items: center;
  opacity: .8; font-family: var(--font-b); line-height: 1;
}
.slot-ph .ph-mono { font-family: var(--font-s); font-weight: 900; font-size: clamp(26px, 4vw, 34px); color: var(--ink-35); user-select: none }
.slot-img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; object-fit: cover; transition: filter .22s, opacity .22s }
.slot-count {
  position: absolute; right: 3px; bottom: 6px; display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 26px; padding: 2px 9px 0; border: 1px solid rgba(255, 248, 236, .82); border-radius: 999px;
  background: rgba(90, 70, 51, .94); color: var(--cream); font-family: var(--font-d); font-weight: 900; font-size: 14px;
  line-height: 1; text-align: center; white-space: nowrap; box-shadow: 0 3px 8px rgba(73, 59, 44, .24);
}
.slot-count.gained { background: var(--accent); color: var(--cream) }
.slot-name {
  margin-top: 5px; font-size: 12px; font-weight: 800; color: var(--ink); text-align: center; line-height: 1.45;
  height: calc(2 * 1.45em); display: flex; align-items: center; justify-content: center;
  overflow: hidden; word-break: break-all; transition: color .3s;
}
.slot:hover .slot-name { color: var(--accent-strong) }

/* ---- 清单格状态：未持有（数量 0）仅淡化图片，数量角标保持可读 ---- */
.slot.is-missing .slot-img { filter: grayscale(.28) saturate(.5); opacity: .68 }
.slot.is-missing:hover .slot-ic:not(.is-agent) .slot-img { filter: grayscale(.16) saturate(.68); opacity: .8 }
.slot.is-missing .slot-ic.is-agent { opacity: .55; border-style: dashed }
.slot.is-missing:hover .slot-ic.is-agent { opacity: .8 }
.slot.is-missing .slot-name { color: var(--ink-35) }
.slot.is-missing:hover .slot-name { color: var(--ink-60) }
.slot-count.zero { background: rgba(255, 253, 246, .86); border: 1.5px dashed var(--line); color: var(--ink-60); box-shadow: none }
.slot-tag {
  margin-top: 5px; align-self: center; font-size: 10.5px; font-weight: 700; color: var(--ink-60);
  background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; line-height: 1.5;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.slot-tag.star.s5 { background: var(--yellow); border-color: transparent; color: var(--ink) }
.slot-tag.star.s4 { background: transparent; border: 1.5px solid rgba(91, 106, 140, .45); color: var(--slate-deep) }
.slot-tag.star.s3 { background: transparent; border: 1.5px solid var(--line); color: var(--ink-60) }

/* ---- 背包道具追踪目录：盘点簿式紧凑清单 ---- */
.backpack.manifest-items { padding: 14px 16px 18px; border-radius: 16px }
.manifest-items .item-section { padding-top: 15px }
.manifest-items .item-section + .item-section { margin-top: 4px }
.manifest-items .section-head { gap: 8px }
.manifest-items .section-head h2 { font-size: 16px }
.manifest-items .section-head span { font-size: 10.5px }
.manifest-items .slot-grid,
.manifest-items .item-subsection > .slot-grid,
.manifest-items .subsection-rows .item-subsection > .slot-grid,
.manifest-items .subsection-shelves .item-subsection > .slot-grid,
.manifest-items .cultivation-group > .slot-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); justify-content: stretch; gap: 12px 8px; margin-top: 12px }
.manifest-items .slot:hover { transform: none }
.manifest-items .slot-ic:not(.is-agent) { width: 68px; border-radius: 11px }
.manifest-items .slot-name { height: 2.6em; min-height: 0; margin-top: 3px; font-size: 11.5px; line-height: 1.3 }
.manifest-items .slot-count { right: 0; bottom: 2px; min-width: 27px; height: 20px; padding: 1px 6px 0; border-width: 1px; font-size: 11.5px; box-shadow: 0 2px 5px rgba(73, 59, 44, .2) }
.manifest-items .slot-count.zero { border-width: 1px }
.manifest-items .slot-ph .ph-seal { top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 4px; font-size: 9px }
.manifest-items .slot-ph .ph-mono { font-size: 24px }
.manifest-items .subsection-columns { margin-top: 9px }
.manifest-items .item-subsection { padding: 11px 0 }
.manifest-items .subsection-head { gap: 6px; padding-left: 8px }
.manifest-items .subsection-head::before { width: 2px; height: 18px }
.manifest-items .subsection-head h3 { font-size: 12.5px }
.manifest-items .subsection-head span { font-size: 10px }
.manifest-items .subsection-shelves .item-subsection { grid-template-columns: 132px minmax(0, 1fr); column-gap: 12px }
.manifest-items .subsection-shelves .item-subsection > .slot-grid { margin-top: 0 }
.manifest-items .cultivation-groups { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 10px; margin-top: 11px }
.manifest-items .cultivation-group { padding: 10px; border-radius: 7px }
.manifest-items .cultivation-group-head h4 { font-size: 12px }
.manifest-items .cultivation-group-head span { font-size: 10px }

@media (min-width: 641px) {
  .manifest-items .item-subsection.is-level-breakthrough > .slot-grid > .slot:nth-child(12) { grid-column: 1 }
}

/* ---- 导入记录 ---- */
.records-head { display: flex; align-items: center; gap: 12px }
.records-head .hint { font-size: 12.5px; color: var(--ink-60); font-weight: 600 }
.records-head .sp { flex: 1 }
.record-list { list-style: none; margin-top: 16px; display: flex; flex-direction: column; gap: 10px }
.record {
  display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; padding: 14px 18px; transition: transform .45s var(--ease), box-shadow .45s var(--ease), border-color .3s;
}
.record:hover { transform: translateY(-3px); box-shadow: 0 18px 36px -20px rgba(73, 59, 44, .26); border-color: rgba(73, 59, 44, .22) }
.record-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px }
.record-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.rtag { font-size: 11px; font-weight: 700; border-radius: 7px; padding: 2px 10px; letter-spacing: .03em; white-space: nowrap }
.rtag.rtag-reward { background: var(--yellow); color: var(--ink) }
.rtag.rtag-snapshot { border: 1.5px solid var(--brand-blue); color: var(--brand-blue); background: transparent }
.rtag.rtag-type { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60) }
.rtag.rtag-agent { background: rgba(215, 137, 53, .08); border: 1.5px solid rgba(215, 137, 53, .4); color: var(--accent-strong) }
.rtag.rtag-item { background: rgba(91, 106, 140, .07); border: 1.5px solid rgba(91, 106, 140, .35); color: var(--slate-deep) }
.rtag.effect { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60) }
.rtag.effect.eff-history_only { color: var(--slate-deep); border-color: rgba(91, 106, 140, .35) }
.rtag.effect.eff-superseded { color: var(--rouge); border-color: rgba(166, 81, 74, .4) }
.record-time { font-family: var(--font-d); font-size: 11.5px; color: var(--ink-35); margin-left: auto }
.record-entries { font-size: 13px; color: var(--ink); line-height: 1.7 }
.record-id { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.record-del { flex: none; border: 1.5px solid rgba(166, 81, 74, .35); background: rgba(166, 81, 74, .06); color: var(--rouge); border-radius: 10px; padding: 7px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .25s, background-color .25s, border-color .25s }
.record-del:hover { background: rgba(166, 81, 74, .16) }

/* Hero 目录日期与深色块文字 */
.hero-stats .catalog-date { font-size: 34px; line-height: normal; letter-spacing: 0 }
.hero-stats .catalog-date time { font-family: var(--font-d); font-weight: 900; white-space: nowrap }
.hero-stats div.is-authed .v small a { color: var(--cream); text-decoration: underline; text-underline-offset: 3px }

@media (max-width: 640px) {
  .hero-stats .catalog-date { font-size: 19px; line-height: 1.3 }
  .hero-stats .catalog-date time { white-space: nowrap }
  .account-bar { align-items: stretch; flex-direction: column; gap: 10px }
  .account-bar .sp { display: none }
  .ac-sel { display: grid; grid-template-columns: 1fr; gap: 6px }
  .ac-sel select { width: 100%; min-width: 0; min-height: 44px; font-size: 16px }
  .account-bar > .act-btn { width: 100%; min-height: 44px }
  .account-mgr { padding: 14px; border-radius: 14px }
  .ac-new { align-items: stretch; flex-direction: column }
  .ac-new input { width: 100%; min-width: 0; min-height: 44px; font-size: 16px }
  .ac-new .btn { width: 100% }
  .ac-item { align-items: flex-start; gap: 8px; padding: 12px; flex-wrap: wrap }
  .ac-meta { flex-basis: calc(100% - 24px) }
  .ac-btn { min-height: 40px; flex: 1 }
  .inventory-tabs { margin-top: 24px; flex-wrap: wrap; background: transparent; padding: 0; gap: 8px }
  .inventory-tabs > button:not(.act-btn) { flex: 1 1 calc(50% - 4px); min-height: 44px; background: rgba(73, 59, 44, .06) }
  .inventory-tabs > button:not(.act-btn).on { background: var(--tea) }
  .inventory-tabs .sp { display: none }
  .inventory-tabs .act-btn { flex: 1 1 calc(50% - 4px); min-height: 44px; background: var(--surface) }
  .inventory-tabs .export-all { flex: 1 1 100%; min-height: 44px; justify-content:center; background: var(--surface); border: 1px solid var(--line); border-radius: 10px }
  .import-box { padding: 14px; border-radius: 14px }
  .import-box textarea { font-size: 16px }
  .import-actions { align-items: stretch; flex-direction: column }
  .import-actions .btn { width: 100% }
  .manifest-intro { display: block }
  .manifest-intro.is-editing { display: contents }
  .manifest-scope { align-items: flex-start; flex-wrap: wrap; margin-top: 12px; padding: 10px 2px; border-left: 0; border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line) }
  .manifest-scope.is-editing {
    position: sticky;
    top: 64px;
    z-index: 45;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 10px 24px -18px rgba(73, 59, 44, .45);
  }
  .manifest-scope p { flex-basis: calc(100% - 25px) }
  .manifest-scope > button { width: 100%; min-height: 44px; background: var(--surface); border: 1px solid var(--line) }
  .manifest-scope .manifest-edit-actions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
  .manifest-scope .manifest-edit-actions button { width: 100%; min-height: 44px; background: var(--surface); border: 1px solid var(--line) }
  .type-switch { width: 100%; display: flex; flex-wrap: wrap }
  .type-switch > button { flex: 1 1 calc(50% - 4px); min-height: 44px }
  .type-switch .hint { flex: 1 1 100%; margin: 4px 2px }
  .backpack { padding: 14px 12px 16px; border-radius: 20px }
  .slot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 9px }
  .item-section { padding-top: 18px }
  .section-head h2 { font-size: 16px }
  .subsection-columns { grid-template-columns: 1fr; gap: 0; margin-top: 14px }
  .item-subsection { padding: 16px 0 }
  .item-subsection > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); gap: 10px 8px }
  .subsection-shelves .item-subsection { grid-template-columns: minmax(0, 1fr); row-gap: 20px }
  .subsection-shelves .subsection-head { align-self: auto }
  .subsection-edit { width: 44px; height: 44px }
  .subsection-shelves .item-subsection > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); justify-content: center; margin-top: 0 }
  .cultivation-groups { grid-template-columns: minmax(0, 1fr); gap: 10px }
  .cultivation-group { padding: 11px }
  .cultivation-group > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); gap: 10px 8px }
  .slot-ic:not(.is-agent) { width: min(100%, 88px) }
  .slot-count { min-width: 30px; height: 24px; font-size: 13px; padding: 2px 8px 0; right: 2px; bottom: 5px }
  .backpack.manifest-items { padding: 10px 8px 12px; border-radius: 14px }
  .manifest-items .item-section { padding-top: 11px }
  .manifest-items .section-head h2 { font-size: 13px }
  .manifest-items .slot-grid,
  .manifest-items .item-subsection > .slot-grid,
  .manifest-items .subsection-rows .item-subsection > .slot-grid,
  .manifest-items .subsection-shelves .item-subsection > .slot-grid,
  .manifest-items .cultivation-group > .slot-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px 3px; margin-top: 8px }
  .manifest-items .slot-ic:not(.is-agent) { width: min(100%, 42px) }
  .manifest-items .slot-name { height: 2.5em; margin-top: 2px; font-size: 9.5px; line-height: 1.25 }
  .manifest-items .slot-count { right: -1px; bottom: 1px; min-width: 20px; height: 16px; padding: 1px 4px 0; font-size: 9.5px }
  .manifest-items .slot-ph .ph-seal { display: none }
  .manifest-items .slot-ph .ph-mono { font-size: 18px }
  .manifest-items .subsection-columns { margin-top: 5px }
  .manifest-items .item-subsection { padding: 8px 0 }
  .manifest-items .subsection-shelves .item-subsection { grid-template-columns: minmax(0, 1fr); row-gap: 7px }
  .manifest-items .item-subsection.is-divination-stone > .slot-grid > .slot:nth-child(5) { grid-column: 1 }
  .manifest-items .cultivation-groups { grid-template-columns: minmax(0, 1fr); gap: 7px; margin-top: 7px }
  .manifest-items .cultivation-group { padding: 6px }
  .acquired-bar { flex-direction: column; align-items: stretch }
  .range { justify-content: space-between }
  .manifest-bar { flex-direction: column; align-items: stretch; gap: 10px }
  .manifest-bar .sp { display: none }
  .type-switch { flex-wrap: wrap }
  .type-switch > .sp { display: none }
  .stock-save-notice { width: 100%; text-align: center }
  .stock-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .stock-stepper { width: min(100%, 132px); height: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, 44px) }
  .stock-stepper button:first-child { grid-column: 1; grid-row: 2; border-right: 1px solid var(--line) }
  .stock-stepper button:last-child { grid-column: 2; grid-row: 2; border-left: 0 }
  .stock-stepper .stock-count-input { grid-column: 1 / -1; grid-row: 1; border-bottom: 1px solid var(--line); font-size: 15px }
  .mf-search { width: auto }
  .mf-stats { width: 100%; justify-content: space-between; gap: 8px }
  .mf-stat { flex-direction: column; gap: 1px }
  .mf-num { font-size: 18px }
  .mf-progress { width: 100% }
  .mf-search { width: 100%; min-height: 44px; font-size: 16px }
  .mf-filter { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr) }
  .mf-filter button { min-height: 40px }
  .range { align-items: stretch; flex-direction: column }
  .range label { justify-content: space-between }
  .range input { min-height: 44px; min-width: 0; font-size: 16px }
  .record { align-items: flex-start; padding: 12px; flex-wrap: wrap }
  .record-time { margin-left: 0 }
  .record-del { min-height: 44px; width: 100% }
  .state { padding: 36px 18px }
}

@media (prefers-reduced-motion: reduce) {
  .subsection-edit,
  .subsection-edit svg,
  .subsection-edit::after { transition: none }
  .subsection-edit:hover:not(:disabled) svg { transform: none }
}
</style>
