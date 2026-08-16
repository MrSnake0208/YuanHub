<template>
  <div class="page-inventory">
    <IslandSidebar />

    <main class="inventory-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">库存</span>
            <span class="pill">背包</span>
            <span class="pill">统计</span>
          </div>
          <h1>广陵库房<span class="small">清点 · 归档 · 溯源</span></h1>
          <p class="hero-sub">代号鸢 / 如鸢 库存与奖励台账：同步当前背包数量，按月按周统计各类物品与角色碎片获得量，支持导入导出完整交换档案。</p>
          <div class="hero-stats">
            <div><div class="k">对象目录</div><div class="v">{{ catalogCount }}<small>项</small></div></div>
            <div><div class="k">当前物品</div><div class="v">{{ itemCount }}<small>种</small></div></div>
            <div><div class="k">当前角色</div><div class="v">{{ agentCount }}<small>种</small></div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">已同步</div><div class="v">云端<small>可导入导出</small></div></div>
            <div v-else class="is-authed"><div class="k">未登录</div><div class="v">只读<small><router-link to="/login">去登录</router-link></small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- TABS：当前库存 / 时段获得量 / 导入记录 -->
          <div class="inventory-tabs" v-reveal>
            <button :class="{ on: activeTab === 'current' }" @click="setTab('current')">当前库存</button>
            <button :class="{ on: activeTab === 'acquired' }" @click="setTab('acquired')">时段获得量</button>
            <button :class="{ on: activeTab === 'records' }" @click="setTab('records')">导入记录</button>
            <span class="sp"></span>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="showImport = !showImport">导入档案</button>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="doExport">导出档案</button>
          </div>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <p class="tip">粘贴符合《库存数据交换协议 v1》的 JSON 文档，或选择文件上传；导入结果会在下方展示。</p>
            <textarea v-model="importText" placeholder='{\n  "format": "myshare-inventory-exchange",\n  "version": 1,\n  ...\n}'></textarea>
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

          <!-- 当前库存 -->
          <div v-show="activeTab === 'current'" class="panel">
            <div class="type-switch" v-reveal>
              <button :class="{ on: entityType === 'item' }" @click="setEntityType('item')">物品 item</button>
              <button :class="{ on: entityType === 'agent' }" @click="setEntityType('agent')">角色 agent</button>
              <span class="sp"></span>
              <span class="hint">对象名称来自统一目录，数量以最近快照为准</span>
            </div>

            <div v-if="loading" class="state">正在加载库存…</div>
            <div v-else-if="error" class="state err">
              {{ error }}
              <button v-if="!auth.isLoggedIn" class="link" @click="goLogin">请先登录后重试</button>
            </div>
            <div v-else-if="currentEntries.length === 0" class="state">暂无 {{ entityType === 'item' ? '物品' : '角色' }} 库存记录</div>
            <div v-else class="backpack" v-reveal>
              <div class="bp-head">
                <span class="bp-tip">共 <b class="bp-num">{{ currentEntries.length }}</b> 种 · 图标请放至 <code>public/inventory-icons/{{ entityType === 'agent' ? 'agents' : 'items' }}/对象id.{{ ICON_EXT }}</code>，未上传前显示占位印</span>
              </div>
              <ul class="slot-grid">
                <li v-for="e in currentEntries" :key="e.id" class="slot" :title="e.name || e.id">
                  <div class="slot-ic" :class="{ 'is-agent': entityType === 'agent' }">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" loading="lazy" @error="onImgError" />
                    <span class="slot-count">{{ fmtCount(e.count) }}</span>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 时段获得量 -->
          <div v-show="activeTab === 'acquired'" class="panel">
            <div class="acquired-bar" v-reveal>
              <div class="type-switch">
                <button :class="{ on: entityType === 'item' }" @click="setEntityType('item')">物品 item</button>
                <button :class="{ on: entityType === 'agent' }" @click="setEntityType('agent')">角色 agent</button>
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
                <span class="bp-tip">本时段获得 <b class="bp-num">{{ acquiredEntries.length }}</b> 种 · 图标同「当前库存」目录，金橙角标为获得量</span>
              </div>
              <ul class="slot-grid">
                <li v-for="e in acquiredEntries" :key="e.id" class="slot" :title="e.name || e.id">
                  <div class="slot-ic" :class="{ 'is-agent': entityType === 'agent' }">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" loading="lazy" @error="onImgError" />
                    <span class="slot-count gained">+{{ fmtCount(e.count) }}</span>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 导入记录 -->
          <div v-show="activeTab === 'records'" class="panel">
            <div class="records-head" v-reveal>
              <span class="hint">共 {{ recordsList.length }} 条导入记录 · 删除单条后自动重放剩余记录重建库存</span>
              <span class="sp"></span>
              <button class="act-btn ghost" :disabled="recordsLoading" @click="loadRecords">刷新</button>
            </div>

            <div v-if="recordsLoading" class="state">正在加载记录…</div>
            <div v-else-if="recordsError" class="state err">{{ recordsError }}</div>
            <div v-else-if="recordsList.length === 0" class="state">暂无导入记录</div>
            <ul v-else class="record-list" v-reveal>
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
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵库房<br><span>清点 · 归档 · 溯源</span></template>
        <template #fine>
          <b>MaaYuan Share</b> · 库存与奖励台账<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际库存为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { getCatalog, getCurrent, getAcquired, exportInventory, importInventory, listRecords, deleteRecord } from '../../api/inventory.js'
import { auth } from '../../store/auth.js'

const activeTab = ref('current')
const entityType = ref('item')
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
const recordsList = ref([])
const recordsLoading = ref(false)
const recordsError = ref('')

function setTab(t) {
  activeTab.value = t
  if (t === 'acquired' && acquiredEntries.value.length === 0) loadAcquired()
  if (t === 'records') loadRecords()
}
function setEntityType(t) {
  if (t === entityType.value) return
  entityType.value = t
  // 切换对象类型后,旧的时段获得量结果属于另一类型:清空避免张冠李戴;
  // 当前库存立即刷新;若正处于"时段获得量"页签则按新类型自动重新统计
  // (离开页签时 setTab 的空列表条件也会触发重新加载)。
  acquiredEntries.value = []
  error.value = ''
  reloadCurrent()
  if (activeTab.value === 'acquired') loadAcquired()
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
// 图片目录：public/inventory-icons/items/（物品）、public/inventory-icons/agents/（角色）
// 文件名 = 对象 id（与目录/导出档案中的 id 一致），扩展名见 ICON_EXT。
// 图片未上传时格子显示「青花图印 + 名称首字」占位；上传同名图片后刷新即自动显示。
const ICON_EXT = 'png'

function iconSrc(e) {
  const kind = entityType.value === 'agent' ? 'agents' : 'items'
  return import.meta.env.BASE_URL + 'inventory-icons/' + kind + '/' + encodeURIComponent(e.id) + '.' + ICON_EXT
}

// 图片加载失败 → 隐藏 img，露出底层占位（占位不删：后续补图刷新页面即可显示）
function onImgError(ev) {
  if (ev && ev.target) ev.target.style.display = 'none'
}

// 占位首字：取名称第一个字符（中文 / emoji 安全）
function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

// 名称查找：优先目录，其次后端返回的 name，最后回退 id
function nameOf(id, name) {
  if (name) return name
  if (!catalog.value.entities.length) return id
  const hit = catalog.value.entities.find(function (e) { return e.id === id && e.entity_type === entityType.value })
  return (hit && hit.name) ? hit.name : id
}

// 统计卡片数据
const catalogCount = computed(function () {
  const list = catalog.value.entities || []
  return list.length || '…'
})
const itemCount = computed(function () { return entityType.value === 'item' ? currentEntries.value.length : '—' })
const agentCount = computed(function () { return entityType.value === 'agent' ? currentEntries.value.length : '—' })

async function safeLoad(fn) {
  loading.value = true
  error.value = ''
  try { await fn() } catch (err) {
    error.value = humanErr(err, '加载失败，请稍后重试')
  } finally { loading.value = false }
}

// 后端 /current 返回 List<{ entity_type, entries: { "<id>": {count, listed_baseline_at} } }>。
// 传入 entity_type 时取首个元素，把 entries 对象转成 [{id, name, count}]。
async function reloadCurrent() {
  await safeLoad(async function () {
    const data = await getCurrent({ entityType: entityType.value })
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const doc = list[0]
    const entriesObj = (doc && doc.entries) ? doc.entries : {}
    currentEntries.value = Object.keys(entriesObj).map(function (id) {
      const se = entriesObj[id] || {}
      return { id: id, name: nameOf(id, se.name), count: Number(se.count) || 0 }
    }).sort(function (a, b) { return b.count - a.count })
  })
}

// 本地日期 YYYY-MM-DD → 本地时区当日 00:00 的 ISO 时刻（后端按 [from,to) 半开区间）。
function dayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2]).toISOString()
}

// 本地日期 YYYY-MM-DD → 本地时区次日 00:00 的 ISO 时刻（「止」包含当天整天）。
function nextDayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2] + 1).toISOString()
}

// 请求序号:快速切换 entity_type 时丢弃过期响应,避免旧类型结果覆盖新类型。
let acquiredSeq = 0

// 后端 /acquired 返回 { entity_type, from, to, acquired: { "<id>": count } }。
async function loadAcquired() {
  const seq = ++acquiredSeq
  await safeLoad(async function () {
    const from = dayStartIso(rangeFrom.value)
    const to = nextDayStartIso(rangeTo.value)
    if (!from || !to) { error.value = '请选择有效的起止日期'; return }
    const data = await getAcquired({ entityType: entityType.value, from: from, to: to })
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

// ---- 导入记录（列表 / 删除） ----
async function loadRecords() {
  recordsLoading.value = true
  recordsError.value = ''
  try {
    const list = await listRecords({})
    recordsList.value = Array.isArray(list) ? list : []
  } catch (err) {
    recordsError.value = humanErr(err, '加载记录失败')
  } finally {
    recordsLoading.value = false
  }
}

async function onDeleteRecord(rec) {
  const rid = rec && rec.record_id
  if (!rid) return
  if (!confirm('删除记录「' + rid + '」？\n删除后将重放剩余记录重建库存，此操作不可恢复。')) return
  try {
    await deleteRecord(rid)
    await loadRecords()
    await reloadCurrent()
  } catch (err) {
    alert(humanErr(err, '删除失败'))
  }
}

// stock_effect 标记的中文名
function stockEffectLabel(eff) {
  if (eff === 'applied') return '已生效'
  if (eff === 'history_only') return '仅历史'
  if (eff === 'superseded') return '已归档'
  return eff || '未知'
}

// ISO 时间 → 本地可读字符串
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

// entries 摘要：奖励用 +N，快照用 =N
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

// 一键填充 public/ 下的示例交换文档（供真机导入测试）。
async function fillExample() {
  if (loadingExample.value) return
  loadingExample.value = true
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'inventory-import-example.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    importText.value = await res.text()
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
  try {
    const data = await exportInventory({
      include: 'current,rewards',
      from: dayStartIso(rangeFrom.value),
      to: nextDayStartIso(rangeTo.value)
    })
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
  reloadCurrent()
})
</script>

<style scoped>
/* —— 复用全局 CSS 变量（不新增色值），对齐广陵账房（cart.vue）版式 —— */
.inventory-main { padding-bottom: 40px }
.page-inventory .hero::after { content: '库存' }

.inventory-tabs { display: flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 14px; padding: 4px; margin-top: 40px }
.inventory-tabs button {
  border: none; background: transparent; font-family: var(--font-b); font-weight: 700;
  font-size: 14px; padding: 10px 26px; border-radius: 10px; cursor: pointer; color: var(--ink-60);
  transition: all .3s var(--ease);
}
.inventory-tabs button.on { background: var(--tea); color: var(--cream) }
.inventory-tabs button:hover:not(.on) { color: var(--ink) }
.inventory-tabs .sp { flex: 1 }
.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: all .3s var(--ease); white-space: nowrap }
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
  transition: all .3s var(--ease);
}
.type-switch button.on { background: var(--yellow); color: var(--ink) }
.type-switch button:hover:not(.on) { color: var(--ink) }
.type-switch .sp { flex: 1 }
.type-switch .hint { font-size: 12px; color: var(--ink-35); font-weight: 600; margin-right: 6px }

.acquired-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap }
.range { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.range label { display: flex; align-items: center; gap: 6px }
.range .lb { font-size: 12px; font-weight: 700; color: var(--ink-60) }
.range input {
  border: 1.5px solid var(--line); border-radius: 10px; padding: 7px 10px; font-size: 13px;
  font-family: var(--font-b); color: var(--ink); background: var(--surface); outline: none; transition: border-color .3s;
}
.range input:focus { border-color: var(--accent) }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }

/* ---- 背包格（游戏背包样式）---- */
.backpack { margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 18px 18px 20px }
.bp-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); flex-wrap: wrap }
.bp-tip { font-size: 12px; color: var(--ink-60); font-weight: 600; line-height: 1.8 }
.bp-tip code { font-family: var(--font-d); font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; color: var(--ink-60); margin: 0 2px; word-break: break-all }
.bp-num { font-family: var(--font-d); font-weight: 900; color: var(--accent-strong); font-size: 13px }

.slot-grid { list-style: none; margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 14px 12px }
.slot { display: flex; flex-direction: column; transition: transform .45s var(--ease) }
.slot:hover { transform: translateY(-4px) }
.slot-ic {
  position: relative; aspect-ratio: 1 / 1; border-radius: 18px; border: 1.5px solid var(--line);
  background: var(--cream); overflow: hidden;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(73, 59, 44, .16);
  transition: border-color .3s, box-shadow .45s var(--ease);
}
.slot-ic.is-agent { border-color: rgba(215, 137, 53, .38); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(215, 137, 53, .22) }
.slot:hover .slot-ic { border-color: var(--accent); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), 0 14px 26px -14px rgba(73, 59, 44, .4) }
.slot-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(168deg, var(--surface) 0%, var(--cream) 62%, var(--paper) 100%) }
.slot-ph .ph-seal {
  position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border: 1.5px solid var(--brand-blue);
  border-radius: 6px; color: var(--brand-blue); font-size: 11px; font-weight: 800; display: grid; place-items: center;
  opacity: .8; font-family: var(--font-b); line-height: 1;
}
.slot-ph .ph-mono { font-family: var(--font-s); font-weight: 900; font-size: clamp(26px, 4vw, 34px); color: var(--ink-35); user-select: none }
.slot-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover }
.slot-count {
  position: absolute; right: 7px; bottom: 7px; min-width: 24px; padding: 3px 8px; border-radius: 999px;
  background: var(--tea); color: var(--cream); font-family: var(--font-d); font-weight: 900; font-size: 12.5px;
  line-height: 1.25; text-align: center; box-shadow: 0 2px 6px rgba(73, 59, 44, .28);
}
.slot-count.gained { background: var(--accent); color: var(--cream) }
.slot-name {
  margin-top: 8px; font-size: 12.5px; font-weight: 700; color: var(--ink); text-align: center; line-height: 1.45;
  min-height: calc(2 * 1.45em); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-all; transition: color .3s;
}
.slot:hover .slot-name { color: var(--accent-strong) }

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
.record-del { flex: none; border: 1.5px solid rgba(166, 81, 74, .35); background: rgba(166, 81, 74, .06); color: var(--rouge); border-radius: 10px; padding: 7px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s }
.record-del:hover { background: rgba(166, 81, 74, .16) }

/* 深色块上的文字（未登录提示） */
.hero-stats div.is-authed .v small a { color: var(--cream); text-decoration: underline; text-underline-offset: 3px }

@media (max-width: 640px) {
  .backpack { padding: 14px 12px 16px; border-radius: 20px }
  .slot-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 12px 10px }
  .slot-count { font-size: 11.5px; padding: 2px 7px; right: 5px; bottom: 5px }
  .acquired-bar { flex-direction: column; align-items: stretch }
  .range { justify-content: space-between }
}
</style>
