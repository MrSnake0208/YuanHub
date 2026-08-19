<template>
  <div class="page-operator">
    <IslandSidebar />

    <main class="operator-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">密探</span>
            <span class="pill">养成</span>
            <span class="pill">图鉴</span>
            <span class="pill">归档</span>
          </div>
          <h1>密探养成<span class="small">图鉴 · 快照 · 归档</span></h1>
          <p class="hero-sub">如鸢 / 代号鸢 密探养成档案：多个子账号分别维护，记录修为、星级、等级、命盘与星石，支持导入导出完整交换档案（v2）。</p>
          <div class="hero-stats">
            <div><div class="k">密探目录</div><div class="v">{{ catalogCount }}<small>位</small></div></div>
            <div><div class="k">已拥有</div><div class="v">{{ currentEntries.length }}<small>位</small></div></div>
            <div><div class="k">游戏版本</div><div class="v">{{ gameCount }}<small>版</small></div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">已同步</div><div class="v">云端<small>可导入导出</small></div></div>
            <div v-else class="is-authed"><div class="k">未登录</div><div class="v">只读<small><router-link to="/login">去登录</router-link></small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 统一子账号（库存 × 密探共用） -->
          <AccountWorkspace
            v-model:accountId="accountId"
            :accounts="accounts"
            :error="accountError"
            :disabled="!auth.isLoggedIn || accountsLoading"
            :busy="accountBusy"
            heading-title="选择要查看的账号"
            heading-sub="密探养成、导入记录都会切换到这个子账号；这里创建的账号在库存页同样可见。"
            new-placeholder="新子账号名称（1~64 字）"
            @change="onAccountChange"
            @create="onCreateAccount"
            @rename="onRenameAccount"
            @delete="onDeleteAccount"
          />

          <!-- TABS：图鉴 / 当前养成 / 导入记录 -->
          <div class="operator-tabs" v-reveal>
            <button :class="{ on: activeTab === 'catalog' }" @click="setTab('catalog')">图鉴</button>
            <button :class="{ on: activeTab === 'current' }" @click="setTab('current')">当前养成</button>
            <span class="sp"></span>
            <span class="game-filter">
              版本
              <select v-model="gameFilter" @change="onGameChange">
                <option value="all">全部</option>
                <option value="如鸢">如鸢</option>
                <option value="代号鸢">代号鸢</option>
              </select>
            </span>
            <router-link class="act-btn ghost admin-link" :to="quickHref" @click="showImport = false">首次 / 快捷导入</router-link>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="showImport = !showImport">导入档案</button>
            <label v-if="accounts.length > 1" class="export-all"><input type="checkbox" v-model="exportAll" /> 全部账号</label>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="doExport">导出档案</button>
            <router-link v-if="auth.isLoggedIn" class="act-btn ghost admin-link" to="/operator/admin">管理图鉴</router-link>
          </div>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <p class="tip">粘贴符合《密探数据交换协议 v2》的 JSON 文档，或选择文件上传；导入结果会在下方展示。</p>
            <textarea v-model="importText" placeholder='{"format":"myshare-operator-exchange","version":2,"accounts":[{"id":"acc_xxx","name":"大号"}],"records":[{"account_id":"acc_xxx","record_id":"...","record_type":"operator_snapshot","snapshot_scope":"full","entries":[]}]}'></textarea>
            <div class="import-actions">
              <label class="btn ghost file-label">
                选择 JSON 文件
                <input type="file" accept=".json,application/json" @change="onFilePick" />
              </label>
              <button class="btn ghost" @click="fillExample">示例导入</button>
              <button class="btn primary" :disabled="importing || !importText.trim()" @click="doImport">导入</button>
            </div>
            <div v-if="importResult" class="import-result">
              导入完成：接受 {{ importResult.accepted }} 条 · 重复 {{ importResult.duplicates }} 条
              <span v-if="importResult.superseded"> · 已归档 {{ importResult.superseded }} 条</span>
              <span v-if="importResult.warnings && importResult.warnings.length"> · 警告 {{ importResult.warnings.length }} 条</span>
              <button class="ok" @click="afterImport">刷新养成</button>
            </div>
          </div>

          <!-- 图鉴（全量目录：默认全部显示，登录后叠加云端养成） -->
          <div v-show="activeTab === 'catalog'" class="panel">
            <div class="manifest-bar" v-reveal>
              <div class="mf-stats">
                <div class="mf-stat"><b class="mf-num">{{ catalogCount }}</b><span class="mf-k">目录</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestOwned }}</b><span class="mf-k">已拥有</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestPercent }}</b><span class="mf-k">拥有率</span></div>
              </div>
              <div class="mf-progress" title="拥有进度"><i :style="{ width: manifestPercent }"></i></div>
              <span class="sp"></span>
              <input v-model.trim="manifestSearch" class="mf-search" type="search" placeholder="搜索名称 / 别名 / id" />
              <div class="mf-filter">
                <button :class="{ on: manifestFilter === 'all' }" @click="manifestFilter = 'all'">全部</button>
                <button :class="{ on: manifestFilter === 'owned' }" @click="manifestFilter = 'owned'">已拥有</button>
                <button :class="{ on: manifestFilter === 'missing' }" @click="manifestFilter = 'missing'">未拥有</button>
              </div>
            </div>

            <!-- 属性 / 从属 筛选 -->
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

            <div v-if="catalogLoading" class="state">正在加载密探图鉴…</div>
            <div v-else-if="catalogError && !catalogOperators.length" class="state err">{{ catalogError }}<button class="link" @click="loadCatalog">重试</button></div>
            <div v-else class="backpack" v-reveal>
              <div class="bp-head">
                <span class="bp-tip">
                  共 <b class="bp-num">{{ catalogCount }}</b> 位密探 · 已拥有 <b class="bp-num">{{ manifestOwned }}</b> 位 ·
                  未拥有 <b class="bp-num">{{ manifestMissing }}</b> 位 · 目录 <b class="bp-num">{{ catalogVersion || '本地兜底' }}</b>
                  <template v-if="gameFilter !== 'all'"> · 已按「{{ gameFilter }}」过滤</template>
                  <template v-if="profFilter !== 'all'"> · 属性「{{ profFilter }}」</template>
                  <template v-if="subProfFilter !== 'all'"> · 从属「{{ subProfFilter }}」</template>
                  <template v-if="!auth.isLoggedIn"> · 未登录：仅展示图鉴，不显示云端养成</template>
                </span>
                <span class="sp"></span>
                <span v-if="error" class="bp-tip mf-warn">云端养成同步失败：{{ error }}</span>
              </div>
              <div v-if="manifestEntries.length === 0" class="state slim">没有匹配{{ filterSuffix }}的密探</div>
              <ul v-else class="slot-grid">
                <li v-for="e in manifestEntries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                  <div class="slot-ic is-agent">
                    <img v-if="e.avatar" class="slot-avatar" :src="avatarUrl(e.avatar)" :alt="e.name" loading="lazy" />
                    <div v-else class="slot-ph">
                      <span class="ph-seal">密</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <span class="slot-count" :class="{ zero: !e.owned }">{{ e.owned ? 'Lv' + e.level : '未养' }}</span>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                  <span class="slot-tag star" :class="'s' + (e.rarity || 3)">{{ e.rarity || 3 }}★ · {{ e.prof || '未知' }}</span>
                  <button v-if="auth.isLoggedIn && accountId" class="edit-btn" type="button" @click.stop="openEdit(e.id)">编辑</button>
                </li>
              </ul>
            </div>
          </div>

          <!-- 当前养成 -->
          <div v-show="activeTab === 'current'" class="panel">
            <div class="type-switch" v-reveal>
              <span class="hint">密探名称与目录信息来自统一图鉴，养成数值以最近快照为准</span>
            </div>

            <!-- 属性 / 从属 筛选 -->
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

            <div v-if="loading" class="state">正在加载养成状态…</div>
            <div v-else-if="error" class="state err">
              {{ error }}
              <button v-if="!auth.isLoggedIn" class="link" @click="goLogin">请先登录后重试</button>
            </div>
            <div v-else-if="currentEntries.length === 0" class="state">
              <template v-if="!auth.isLoggedIn">尚未登录：仅可浏览图鉴 · <router-link class="link" to="/login">登录后同步实际养成</router-link></template>
              <template v-else>暂无密探养成记录，请先导入档案</template>
            </div>
            <div v-else class="backpack" v-reveal>
              <div class="bp-head">
                <span class="bp-tip">已加载 <b class="bp-num">{{ filteredCurrent.length }}</b> 位密探 · 版本「{{ gameFilter === 'all' ? '全部' : gameFilter }}」<template v-if="profFilter !== 'all'"> · 属性「{{ profFilter }}」</template><template v-if="subProfFilter !== 'all'"> · 从属「{{ subProfFilter }}」</template> · 点击密探卡查看命盘与星石</span>
              </div>
              <div v-if="filteredCurrent.length === 0" class="state slim">没有匹配{{ filterSuffix }}的密探</div>
              <ul v-else class="slot-grid">
                <li v-for="e in filteredCurrent" :key="e.id" class="slot build-slot" :title="buildTitle(e)">
                  <div class="slot-ic is-agent">
                    <img v-if="avOf(e.id)" class="slot-avatar" :src="avatarUrl(avOf(e.id))" :alt="e.name" loading="lazy" />
                    <div v-else class="slot-ph">
                      <span class="ph-seal">密</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <span class="slot-count">{{ 'Lv' + e.level }}</span>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                  <span class="slot-tag star" :class="'s' + (e.rarity || 3)">{{ e.rarity || 3 }}★ · {{ e.prof || '未知' }}</span>
                  <span class="build-line">修为 {{ e.elite }} · {{ starLabel(e.starLevel) }}</span>
                  <span v-if="e.discs && e.discs.length" class="build-line small">命盘 {{ e.discs.length }} 格</span>
                  <span v-if="e.starStones && e.starStones.length" class="build-line small">星石 {{ e.starStones.length }} 槽</span>
                  <button class="edit-btn" type="button" @click.stop="openEdit(e.id)">编辑</button>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      <!-- 单个密探编辑弹窗 -->
      <div v-if="editing" class="editor-mask" @click.self="closeEditor">
        <div class="editor-panel" v-reveal>
          <div class="editor-head">
            <div>
              <h3>{{ editingOp.name || editingOp.id }}</h3>
              <p class="editor-sub">{{ editingOp.id }} · {{ editingOp.rarity }}★ · {{ editingOp.prof }}</p>
            </div>
            <button class="editor-close" type="button" @click="closeEditor">×</button>
          </div>

          <div class="editor-body">
            <div class="editor-save-hint">将保存到：{{ saveGameLabel }}</div>

            <div class="editor-row">
              <span class="editor-label">基础养成</span>
              <div class="num-fields">
                <div class="level-row">
                  <label>等级 <input type="number" v-model.number="editForm.level" min="0" max="100" /></label>
                  <label>修为 <input type="number" v-model.number="editForm.elite" min="0" :max="maxEliteForLevel" /></label>
                  <span class="elite-hint">当前等级最高修为 {{ maxEliteForLevel }}</span>
                </div>
                <div class="star-card" title="0=未拥有 · 1~30=星级·节点（starLevel = 6×(星−1)+节点+1）· 31=觉醒">
                  <div class="star-row">
                    <span class="star-caption">星级</span>
                    <span class="star-groups">
                      <button type="button" class="star-pill" :class="{ on: starGroupName === 'none' }" @click="pickStarGroup('none')">未拥有</button>
                      <button v-for="s in STAR_RANGE" :key="s" type="button" class="star-pill" :class="{ on: starGroupName === s }" @click="pickStarGroup(s)">{{ s }}星</button>
                      <button type="button" class="star-pill awaken" :class="{ on: starGroupName === 'awaken' }" @click="pickStarGroup('awaken')">觉醒</button>
                    </span>
                  </div>
                  <div v-if="starGroupName !== 'none' && starGroupName !== 'awaken'" class="star-row">
                    <span class="star-caption">节点</span>
                    <span class="star-nodes">
                      <button v-for="n in NODE_RANGE" :key="n" type="button" class="node-chip" :class="{ on: starNode === n }" @click="pickStarNode(n)">{{ starGroupName }}-{{ n }}</button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="editor-row">
              <span class="editor-label">命盘</span>
              <div class="disc-editor">
                <p class="hint">最多同时选择 3 个命盘。</p>
                <p v-if="!editingDiscs.length" class="hint">该密探暂无命盘目录数据，可直接留空保存。</p>
                <label v-for="d in editingDiscs" :key="discKey(d)" class="disc-option" :class="[discColorClass(d), { on: isDiscSelected(d) }]">
                  <input type="checkbox" :value="discKey(d)" v-model="editForm.discNames" />
                  <span class="disc-name">{{ discKey(d) }}</span>
                  <small v-if="d.abbreviation">{{ d.abbreviation }}</small>
                  <small v-if="d.color" class="disc-color">{{ d.color }}</small>
                </label>
              </div>
            </div>

            <div class="editor-row">
              <span class="editor-label">星石</span>
              <div class="stone-editor">
                <div v-for="slot in stoneSlots" :key="slot.type" class="stone-item">
                  <span class="stone-name">{{ slot.label }}</span>
                  <select v-model="editForm.stones[slot.type].name" class="stone-select">
                    <option value="">未装备</option>
                    <option v-for="opt in starOptionsFor(slot.type)" :key="opt" :value="opt">{{ opt }}<template v-if="slot.type === 'assist' && starDesc(slot.type, opt)"> · {{ starDesc(slot.type, opt) }}</template></option>
                  </select>
                  <template v-if="editForm.stones[slot.type].name">
                    <span class="stone-quick" title="快捷等级（星石最高 60 级）">
                      <button v-for="lv in STONE_QUICK_LEVELS" :key="lv" type="button" class="stone-lv-chip" :class="{ on: editForm.stones[slot.type].level === lv }" @click="editForm.stones[slot.type].level = lv">{{ lv }}</button>
                    </span>
                    <input type="number" v-model.number="editForm.stones[slot.type].level" min="0" max="60" placeholder="等级" />
                  </template>
                  <span v-else class="stone-empty">未装备</span>
                </div>
                <p class="hint">主星石与辅星石各可装备 3 个（对应 3 个命盘位）；名称为空表示未装备。保存后仅保留已填写名称且等级大于 0 的星石。</p>
              </div>
            </div>

            <div v-if="editNotice" class="editor-notice" :class="{ err: editNoticeError }">{{ editNotice }}</div>
          </div>

          <div class="editor-actions">
            <button class="btn ghost" type="button" :disabled="savingEdit" @click="closeEditor">取消</button>
            <button class="btn primary" type="button" :disabled="savingEdit" @click="saveEdit">
              {{ savingEdit ? '保存中…' : '保存到云端' }}
            </button>
          </div>
        </div>
      </div>

      <SiteFooter>
        <template #big>密探养成<br><span>图鉴 · 快照 · 归档</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探养成档案<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际养成为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AccountWorkspace from '../../components/AccountWorkspace.vue'
import {
  getOperatorCatalog,
  listOperatorAccounts,
  createOperatorAccount,
  renameOperatorAccount,
  deleteOperatorAccount,
  getOperatorCurrent,
  importOperator,
  exportOperator
} from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { auth } from '../../store/auth.js'
import { dialog } from '../../utils/dialog.js'
import { AGENT_CATALOG, AGENT_PROFS } from '../../data/inventory/catalog.js'
import { matchesProfSubFilter, subProfOptions as deriveSubProfOptions } from '../../utils/operatorFilters.js'
import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS, ASSIST_STAR_DESCRIPTIONS } from '../../data/starStones.js'

const activeTab = ref('catalog')
const gameFilter = ref('all')
const manifestSearch = ref('')
const manifestFilter = ref('all')
const profFilter = ref('all')
const subProfFilter = ref('all')
const profOptions = AGENT_PROFS
const subProfOptions = computed(function () { return deriveSubProfOptions(catalogOperators.value) })
const loading = ref(false)
const catalogLoading = ref(false)
const error = ref('')
const catalogError = ref('')
const catalogVersion = ref('')
const backendCatalog = ref([])
const currentEntries = ref([])
const showImport = ref(false)
const importText = ref('')
const importing = ref(false)
const importResult = ref(null)

// —— 单个密探编辑弹窗 ——
const editing = ref(false)
const editingId = ref('')
const editingOp = ref(null)
const editGame = ref('')
const editForm = ref({ elite: 0, starLevel: 0, level: 0, discNames: [], stones: {} })
const editNotice = ref('')
const editNoticeError = ref(false)
const savingEdit = ref(false)

// 编辑保存目标版本：跟随页面顶部筛选；选“全部”时保存为通用状态（不区分版本）
const saveGame = computed(function () {
  return gameFilter.value === 'all' ? null : gameFilter.value
})
const saveGameLabel = computed(function () {
  return saveGame.value || '通用（全部）'
})

// 首次 / 快捷导入：把当前子账号带到向导页默认选中
const quickHref = computed(function () {
  return accountId.value ? '/operator/quick?account=' + encodeURIComponent(accountId.value) : '/operator/quick'
})

// —— 统一子账号（库存 × 密探共用） ——
const accounts = ref([])
const accountId = ref('')
const accountsLoading = ref(false)
const accountBusy = ref(false)
const accountError = ref('')
const exportAll = ref(false)

// —— 目录归一化 ——
function normalizeOperator(op) {
  const rawSub = op.subProf || op.sub_prof || ''
  return {
    // 优先取业务 id（operatorId），避免后端把 Mongo 内部 _id 作为 id 返回时串台
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

// 编辑弹窗辅助
function discKey(d) {
  if (!d) return ''
  return d.ot_name || d.otName || ''
}

function discObject(key) {
  const d = (editingOp.value && editingOp.value.discs || []).find(function (x) { return discKey(x) === key })
  if (!d) return { ot_name: key }
  return {
    ot_name: key,
    abbreviation: d.abbreviation || null,
    color: d.color || null,
    desp: d.desp || null
  }
}

// 命盘品级色 → 按钮配色类（与后端目录 color 字段：无色 / 金 / 紫 / 蓝 对齐）
const DISC_COLOR_CLASS = { '金': 'c-gold', '紫': 'c-purple', '蓝': 'c-blue' }
function discColorClass(d) {
  return (d && DISC_COLOR_CLASS[d.color]) || ''
}

const editingDiscs = computed(function () {
  return (editingOp.value && editingOp.value.discs) || []
})

const stoneSlots = computed(function () {
  return [
    { type: 'main1', label: '主星石 1' },
    { type: 'main2', label: '主星石 2' },
    { type: 'main3', label: '主星石 3' },
    { type: 'assist1', label: '辅星石 1' },
    { type: 'assist2', label: '辅星石 2' },
    { type: 'assist3', label: '辅星石 3' }
  ]
})

function starOptionsFor(type) {
  return type.indexOf('assist') === 0 ? ASSIST_STAR_OPTIONS : MAIN_STAR_OPTIONS
}

function starDesc(type, name) {
  if (type.indexOf('assist') !== 0) return ''
  return ASSIST_STAR_DESCRIPTIONS[name] || ''
}

// 命盘最多同时选择 3 个
watch(
  function () { return editForm.value.discNames },
  function (val) {
    if (val.length > 3) {
      editForm.value.discNames = val.slice(0, 3)
      editNotice.value = '命盘最多同时选择 3 个'
      editNoticeError.value = true
    }
  }
)

// 修为不能超过当前等级上限，等级变化时自动修正
watch(
  function () { return editForm.value.level },
  function (level) {
    const max = getMaxEliteForLevel(level)
    if (editForm.value.elite > max) {
      editForm.value.elite = max
      editNotice.value = '修为已随等级自动调整为 ' + max + '（当前等级上限）'
      editNoticeError.value = false
    }
  }
)

const catalogOperators = computed(function () {
  if (backendCatalog.value.length) return backendCatalog.value.map(normalizeOperator)
  // 后端不可达时的本地兜底：库存角色目录已含 id/name/稀有度/属性，足够展示基础图鉴
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
const gameCount = computed(function () {
  const set = new Set()
  catalogOperators.value.forEach(function (op) {
    ;(op.games || []).forEach(function (g) { set.add(g) })
  })
  if (set.size === 0) {
    set.add('如鸢')
    set.add('代号鸢')
  }
  return set.size || 2
})

function normalizeEntry(e) {
  e = e || {}
  return {
    elite: e.elite != null ? e.elite : 0,
    starLevel: e.starLevel != null ? e.starLevel : (e.star_level != null ? e.star_level : 0),
    level: e.level != null ? e.level : 0,
    discs: e.discs || [],
    starStones: (e.starStones || e.star_stones || []).map(function (s) {
      return Object.assign({}, s, { type: normalizeStoneType(s.type) })
    }),
    listedBaselineAt: e.listedBaselineAt || e.listed_baseline_at || null
  }
}

// 修为与等级关系（参考 MaaYuan-Share-frontend operatorRequirementModel）：
// 每 5 级增加 1 点修为上限，100 级时上限为 17。
const OPERATOR_LEVEL_MAX = 100
const OPERATOR_ELITE_MAX = 17

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

const maxEliteForLevel = computed(function () {
  return getMaxEliteForLevel(editForm.value.level)
})

// 星级（starLevel）映射，与后端 OperatorService.MAX_STAR_LEVEL 对齐：
// 0 = 未拥有；1..30 = 6×(星−1)+节点+1（1星·0 .. 5星·5，5星·5 = 30）；31 = 觉醒（仅一档）。
const MAX_STAR_LEVEL = 31
const STAR_LEVEL_AWAKEN = 31
const STAR_RANGE = [1, 2, 3, 4, 5]
const NODE_RANGE = [0, 1, 2, 3, 4, 5]
// 星石快捷等级（星石最高 60 级）
const STONE_QUICK_LEVELS = [40, 50, 60]

function starLabel(v) {
  const n = Number(v) || 0
  if (n === 0) return '未拥有'
  if (n === STAR_LEVEL_AWAKEN) return '觉醒'
  if (n >= 1 && n <= 30) {
    const star = Math.floor((n - 1) / 6) + 1
    const node = (n - 1) % 6
    return star + ' 星 · ' + node
  }
  return n
}

// 星级分段胶囊 + 节点胶囊：把一维 starLevel 拆成「星级分组 + 节点」二维状态
const starGroupName = computed(function () {
  const v = Number(editForm.value.starLevel) || 0
  if (v === 0) return 'none'
  if (v === STAR_LEVEL_AWAKEN) return 'awaken'
  if (v >= 1 && v <= 30) return Math.floor((v - 1) / 6) + 1
  return 'none'
})
const starNode = computed(function () {
  const v = Number(editForm.value.starLevel) || 0
  if (v >= 1 && v <= 30) return (v - 1) % 6
  return 0
})

function pickStarGroup(g) {
  if (g === 'none') { editForm.value.starLevel = 0; return }
  if (g === 'awaken') { editForm.value.starLevel = STAR_LEVEL_AWAKEN; return }
  const s = Number(g)
  if (!(s >= 1 && s <= 5)) return
  editForm.value.starLevel = 6 * (s - 1) + starNode.value + 1
}

function pickStarNode(n) {
  const s = starGroupName.value
  if (typeof s !== 'number') return
  editForm.value.starLevel = 6 * (s - 1) + Number(n) + 1
}

// 旧协议仅用 main/assist；新前端按 3 主星 + 3 辅星槽位保存为 main1..3 / assist1..3
function normalizeStoneType(type) {
  if (type === 'main') return 'main1'
  if (type === 'assist') return 'assist1'
  return type || ''
}

// 版本匹配：item 可以是目录项或当前养成项；未声明 games 视为通用/通配。
function matchesGame(item, game) {
  if (game === 'all') return true
  const games = item && (item.games || [])
  if (!games || games.length === 0) return true
  return games.indexOf(game) !== -1
}

const currentMap = computed(function () {
  const m = {}
  currentEntries.value.forEach(function (e) { m[e.id] = e })
  return m
})

// 图鉴顶部统计口径（不跟随属性/从属/搜索/已拥有筛选）：仅按游戏过滤的全量
const statsEntries = computed(function () {
  const state = currentMap.value
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id]
      const owned = !!(build && (build.level > 0 || build.elite > 0 || build.starLevel > 0))
      return Object.assign({}, op, { owned: owned })
    })
    .filter(function (e) { return matchesGame(e, gameFilter.value) })
})
const manifestOwned = computed(function () {
  return statsEntries.value.filter(function (e) { return e.owned }).length
})
const manifestMissing = computed(function () { return statsEntries.value.length - manifestOwned.value })
const manifestPercent = computed(function () {
  if (!statsEntries.value.length) return '0%'
  return Math.round(manifestOwned.value * 100 / statsEntries.value.length) + '%'
})

// 图鉴展示列表：在全量基础上叠加 属性/从属/搜索/已拥有 筛选
const manifestEntries = computed(function () {
  const state = currentMap.value
  const q = manifestSearch.value.toLowerCase()
  const f = manifestFilter.value
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id]
      const owned = !!(build && (build.level > 0 || build.elite > 0 || build.starLevel > 0))
      return Object.assign({}, op, {
        owned: owned,
        elite: build ? build.elite : 0,
        starLevel: build ? build.starLevel : 0,
        level: build ? build.level : 0
      })
    })
    .filter(function (e) {
      if (!matchesGame(e, gameFilter.value)) return false
      if (!matchesProfSubFilter(e, profFilter.value, subProfFilter.value)) return false
      if (f === 'owned' && !e.owned) return false
      if (f === 'missing' && e.owned) return false
      if (q) {
        const hay = [e.name, e.alias, e.id, e.prof, e.subProf].filter(Boolean).join(' ').toLowerCase()
        if (hay.indexOf(q) === -1) return false
      }
      return true
    })
})

// 筛选条件摘要（用于空态提示）
const filterSuffix = computed(function () {
  const parts = []
  if (manifestSearch.value) parts.push('「' + manifestSearch.value + '」')
  if (gameFilter.value !== 'all') parts.push('版本「' + gameFilter.value + '」')
  if (profFilter.value !== 'all') parts.push('属性「' + profFilter.value + '」')
  if (subProfFilter.value !== 'all') parts.push('从属「' + subProfFilter.value + '」')
  if (manifestFilter.value === 'owned') parts.push('「已拥有」')
  if (manifestFilter.value === 'missing') parts.push('「未拥有」')
  return parts.length ? parts.join(' · ') : ''
})

// 当前养成展示列表：叠加 属性/从属 筛选
const filteredCurrent = computed(function () {
  return currentEntries.value.filter(function (e) {
    return matchesProfSubFilter(e, profFilter.value, subProfFilter.value)
  })
})

function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

// 养成卡（currentEntries 系列快照）没有目录字段，按 id 回查目录拿到头像
function avOf(id) {
  const op = catalogMap.value[id]
  return (op && op.avatar) || ''
}

function slotTitle(e) {
  const parts = [e.name || e.id]
  if (e.owned) parts.push('修为 ' + e.elite + ' · ' + starLabel(e.starLevel) + ' · Lv' + e.level)
  else parts.push('未拥有')
  if (e.prof) parts.push(e.prof)
  return parts.join(' ｜ ')
}

function buildTitle(e) {
  const parts = [e.name || e.id, '修为 ' + e.elite, starLabel(e.starLevel), 'Lv' + e.level]
  if (e.discs && e.discs.length) parts.push('命盘：' + e.discs.map(function (d) { return d.ot_name || d.abbreviation || d.otName }).join('、'))
  if (e.starStones && e.starStones.length) parts.push('星石：' + e.starStones.map(function (s) { return (s.name || s.type) + ' Lv' + s.level }).join('、'))
  return parts.join(' ｜ ')
}

function isDiscSelected(d) {
  return editForm.value.discNames.indexOf(discKey(d)) !== -1
}

async function openEdit(id) {
  if (!auth.isLoggedIn || !accountId.value) { await dialog.alert({ message: '请先登录并选择子账号' }); return }
  const op = catalogMap.value[id]
  if (!op) return
  const existing = currentMap.value[id] || {}
  editingId.value = id
  editingOp.value = op
  const stones = {}
  stoneSlots.value.forEach(function (slot) {
    const hit = (existing.starStones || []).find(function (s) { return s.type === slot.type })
    stones[slot.type] = {
      name: (hit && hit.name) || '',
      type: slot.type,
      level: (hit && hit.level != null) ? hit.level : 0
    }
  })
  editForm.value = {
    elite: existing.elite != null ? existing.elite : 0,
    starLevel: existing.starLevel != null ? existing.starLevel : 0,
    level: existing.level != null ? existing.level : 0,
    discNames: (existing.discs || []).map(discKey).filter(Boolean),
    stones: stones
  }
  editNotice.value = ''
  editNoticeError.value = false
  editing.value = true
}

function closeEditor() {
  if (savingEdit.value) return
  editing.value = false
  editingId.value = ''
  editingOp.value = null
  editGame.value = ''
  editNotice.value = ''
  editNoticeError.value = false
}

async function saveEdit() {
  if (!editingOp.value || !accountId.value) return
  if (editForm.value.level < 0 || editForm.value.elite < 0 || editForm.value.starLevel < 0) {
    editNotice.value = '养成数值不能为负数'
    editNoticeError.value = true
    return
  }
  if (editForm.value.starLevel > MAX_STAR_LEVEL) {
    editNotice.value = '星级需在 0..' + MAX_STAR_LEVEL + ' 之间（0=未拥有，31=觉醒）'
    editNoticeError.value = true
    return
  }
  const maxElite = getMaxEliteForLevel(editForm.value.level)
  if (editForm.value.elite > maxElite) {
    editNotice.value = '修为不能超过当前等级上限 ' + maxElite
    editNoticeError.value = true
    return
  }
  const op = editingOp.value
  const account = accounts.value.find(function (a) { return a.id === accountId.value }) || { id: accountId.value, name: accountId.value }
  const entry = {
    id: op.id,
    name: op.name || undefined,
    alias: op.alias || undefined,
    rarity: op.rarity,
    prof: op.prof ? op.prof.split('、') : [],
    subProf: Array.isArray(op.subProf) ? op.subProf : (op.subProf ? op.subProf.split('、') : []),
    games: op.games || [],
    elite: editForm.value.elite,
    starLevel: editForm.value.starLevel,
    level: editForm.value.level,
    discs: editForm.value.discNames.map(discObject),
    starStones: Object.keys(editForm.value.stones || {})
      .map(function (type) { return editForm.value.stones[type] })
      .filter(function (s) { return s && s.name && s.level > 0 })
      .map(function (s) { return { name: s.name, type: s.type, level: s.level } })
  }
  const doc = {
    format: 'myshare-operator-exchange',
    version: 2,
    exported_at: new Date().toISOString(),
    catalog_version: catalogVersion.value || '',
    producer: { platform: 'yuanhub', version: '1' },
    accounts: [{ id: account.id, name: account.name }],
    records: [{
      account_id: account.id,
      record_id: 'yuanhub:edit:' + Date.now() + ':' + Math.random().toString(16).slice(2, 8),
      record_type: 'operator_snapshot',
      game: saveGame.value,
      effective_at: new Date().toISOString(),
      snapshot_scope: 'listed',
      entries: [entry]
    }]
  }
  savingEdit.value = true
  editNotice.value = ''
  editNoticeError.value = false
  try {
    await importOperator(doc)
    editNotice.value = '已保存到云端'
    setTimeout(function () {
      closeEditor()
      reloadCurrent()
    }, 800)
  } catch (err) {
    editNotice.value = humanErr(err, '保存失败')
    editNoticeError.value = true
  } finally {
    savingEdit.value = false
  }
}

function setTab(t) {
  activeTab.value = t
  if (t === 'current' && currentEntries.value.length === 0) reloadCurrent()
}

function onGameChange() {
  currentEntries.value = []
  reloadCurrent()
}

// —— 公开目录 ——
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

// —— 统一子账号（库存 × 密探共用） ——
async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; accountId.value = ''; return }
  accountsLoading.value = true
  accountError.value = ''
  try {
    const list = await listOperatorAccounts()
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
  currentEntries.value = []
  error.value = ''
  reloadCurrent()
}

async function onCreateAccount(rawName) {
  const name = (rawName || '').trim()
  if (!name) return
  accountBusy.value = true
  accountError.value = ''
  try {
    const created = await createOperatorAccount(name)
    await loadAccounts()
    if (created && created.id) accountId.value = created.id
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '创建子账号失败')
  } finally {
    accountBusy.value = false
  }
}

async function onRenameAccount(acc) {
  const name = await dialog.prompt({
    title: '修改子账号名称',
    message: '修改子账号名称（1~64 字）：',
    value: acc.name || ''
  })
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed) { accountError.value = '名称不能为空'; return }
  accountBusy.value = true
  accountError.value = ''
  try {
    await renameOperatorAccount(acc.id, trimmed)
    await loadAccounts()
  } catch (err) {
    accountError.value = humanErr(err, '改名失败')
  } finally {
    accountBusy.value = false
  }
}

async function onDeleteAccount(acc) {
  const ok = await dialog.confirm({
    title: '删除子账号',
    message: '删除子账号「' + acc.name + '」？该账号的密探数据、库存数据、特别关注和所有 API Token 都会被一并清除，且不可恢复。',
    type: 'danger',
    confirmText: '删除'
  })
  if (!ok) return
  accountBusy.value = true
  accountError.value = ''
  try {
    await deleteOperatorAccount(acc.id)
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

// —— 当前养成 ——
async function safeLoad(fn, quiet) {
  loading.value = true
  if (!quiet) error.value = ''
  try { await fn() } catch (err) {
    if (!quiet) error.value = humanErr(err, '加载失败，请稍后重试')
  } finally { loading.value = false }
}

async function reloadCurrent(quiet) {
  if (!auth.isLoggedIn) {
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  if (!accountId.value) {
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  await safeLoad(async function () {
    const game = gameFilter.value === 'all' ? undefined : gameFilter.value
    const data = await getOperatorCurrent({ accountId: accountId.value, game: game })
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const combined = {}
    list.forEach(function (doc) {
      const entriesObj = (doc && doc.entries) ? doc.entries : {}
      Object.keys(entriesObj).forEach(function (id) {
        combined[id] = normalizeEntry(entriesObj[id])
      })
    })
    currentEntries.value = Object.keys(combined).map(function (id) {
      const op = catalogMap.value[id] || {}
      return Object.assign({ id: id, name: op.name || '', rarity: op.rarity, prof: op.prof || '', subProf: op.subProf || '', games: op.games || [] }, combined[id])
    }).filter(function (e) {
      return matchesGame(e, gameFilter.value)
    }).sort(function (a, b) {
      return (b.level - a.level) || (b.starLevel - a.starLevel) || (b.elite - a.elite)
    })
  }, quiet)
}

// —— 导入 / 导出 ——
async function doImport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!importText.value.trim()) { await dialog.alert({ message: '请粘贴交换协议 JSON 或选择文件' }); return }
  let doc = null
  try {
    doc = JSON.parse(importText.value)
  } catch (_e) {
    await dialog.alert({ title: '格式错误', message: 'JSON 解析失败，请检查格式' })
    return
  }
  // 若用户粘贴的文档使用占位 account_id，替换为当前账号，便于直接导入
  if (accountId.value && doc && Array.isArray(doc.accounts)) {
    doc.accounts = doc.accounts.map(function (a) { return Object.assign({}, a, { id: accountId.value }) })
  }
  if (accountId.value && doc && Array.isArray(doc.records)) {
    doc.records = doc.records.map(function (r) { return Object.assign({}, r, { account_id: accountId.value }) })
  }
  importing.value = true
  importResult.value = null
  try {
    const res = await importOperator(doc)
    importResult.value = res || {}
  } catch (err) {
    await dialog.alert({ title: '导入失败', message: humanErr(err, '导入失败') })
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

function fillExample() {
  const op = catalogOperators.value[0] || {}
  const account = accounts.value.find(function (a) { return a.id === accountId.value }) || { id: accountId.value || 'acc_demo', name: '示例账号' }
  const now = new Date().toISOString()
  const doc = {
    format: 'myshare-operator-exchange',
    version: 2,
    exported_at: now,
    catalog_version: catalogVersion.value || 'local',
    producer: { platform: 'yuanhub', version: '1' },
    accounts: [{ id: account.id, name: account.name }],
    records: [{
      account_id: account.id,
      record_id: 'yuanhub:example:' + Date.now(),
      record_type: 'operator_snapshot',
      game: '如鸢',
      effective_at: now,
      snapshot_scope: 'listed',
      entries: [{
        id: op.id || 'char_001_yangxiu',
        name: op.name || '杨修',
        elite: 0,
        starLevel: 30, // 5星·5（新映射：0=未拥有 · 1..30=星级·节点 · 31=觉醒）
        level: 40,
        discs: [],
        starStones: []
      }]
    }]
  }
  importText.value = JSON.stringify(doc, null, 2)
}

function afterImport() {
  importResult.value = null
  importText.value = ''
  showImport.value = false
  reloadCurrent()
}

async function doExport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { await dialog.alert({ message: '请先创建并选择一个子账号' }); return }
  try {
    const opts = {}
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = 'all'
    } else {
      opts.accountId = accountId.value
    }
    const data = await exportOperator(opts)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'operator-export.json'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (err) {
    await dialog.alert({ title: '导出失败', message: humanErr(err, '导出失败') })
  }
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

function goLogin() { location.href = '/login' }

onMounted(async function () {
  await loadCatalog()
  await loadAccounts()
  reloadCurrent()
})
</script>

<style scoped>
/* —— 复用全局 CSS 变量（不新增色值），对齐库存（inventory）页版式 —— */
.operator-main { padding-bottom: 40px }
.page-operator .hero::after { content: '密探' }

/* ---- 统一子账号：选择/管理已抽到共用组件 AccountWorkspace.vue ---- */
.export-all { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ink-60); cursor: pointer; white-space: nowrap }
.export-all input { accent-color: var(--accent); cursor: pointer }

.operator-tabs { display: flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 14px; padding: 4px; margin-top: 40px; flex-wrap: wrap; align-items: center }
.operator-tabs button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 14px; padding: 10px 26px; border-radius: 10px; cursor: pointer; color: var(--ink-60); transition: all .3s var(--ease) }
.operator-tabs button.on { background: var(--tea); color: var(--cream) }
.operator-tabs button:hover:not(.on) { color: var(--ink) }
.operator-tabs .sp { flex: 1 }
.game-filter { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--ink-60) }
.game-filter select { border: 1.5px solid var(--line); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; cursor: pointer }

.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: all .3s var(--ease); white-space: nowrap }
.admin-link { text-decoration: none; display: inline-flex; align-items: center }
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
.type-switch { display: flex; gap: 4px; background: transparent; padding: 4px 0; align-items: center }
.type-switch .hint { font-size: 12.5px; color: var(--ink-35); font-weight: 600 }

/* ---- 清单工具条 ---- */
.manifest-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px }
.mf-stats { display: flex; gap: 24px; align-items: baseline }
.mf-stat { display: flex; align-items: baseline; gap: 6px }
.mf-num { font-family: var(--font-d); font-weight: 900; font-size: 20px; color: var(--accent-strong); letter-spacing: -.01em }
.mf-k { font-size: 12px; color: var(--ink-60); font-weight: 700 }
.mf-progress { flex: none; width: 120px; height: 8px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); overflow: hidden }
.mf-progress i { display: block; height: 100%; border-radius: 999px; background: var(--accent); transition: width .8s var(--ease) }
.manifest-bar .sp { flex: 1 }
.mf-search { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 180px; transition: border-color .3s }
.mf-search:focus { border-color: var(--accent) }
.mf-filter { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 10px; padding: 4px; flex-wrap: wrap }
.mf-filter button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; color: var(--ink-60); transition: all .3s var(--ease) }
.mf-filter button.on { background: var(--surface); color: var(--accent-strong); box-shadow: 0 1px 4px rgba(73, 59, 44, .16) }
.mf-filter button:hover:not(.on) { color: var(--ink) }

/* ---- 属性 / 从属 筛选行 ---- */
.prof-filter { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px }
.pf-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.pf-label { flex: none; min-width: 34px; font-size: 12.5px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }

.mf-warn { color: var(--rouge) }
.state.slim { padding: 26px 20px; margin-top: 14px; border-radius: 14px }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }
.btn.primary { background: var(--tea); color: var(--cream) }
.btn.primary:hover:not(:disabled) { background: var(--accent); color: #fff }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }

/* ---- 密探卡片 ---- */
.backpack { margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 18px 18px 20px }
.bp-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); flex-wrap: wrap }
.bp-head .sp { flex: 1 }
.bp-tip { font-size: 12px; color: var(--ink-60); font-weight: 600; line-height: 1.8 }
.bp-tip code { font-family: var(--font-d); font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; color: var(--ink-60); margin: 0 2px; word-break: break-all }
.bp-num { font-family: var(--font-d); font-weight: 900; color: var(--accent-strong); font-size: 13px }

.slot-grid { list-style: none; margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 14px 12px }
.slot { display: flex; flex-direction: column; transition: transform .45s var(--ease) }
.slot:hover { transform: translateY(-4px) }
.slot-ic {
  position: relative; aspect-ratio: 1 / 1; border-radius: 18px; border: 1.5px solid rgba(215, 137, 53, .38);
  background: var(--cream); overflow: hidden;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(215, 137, 53, .22);
  transition: border-color .3s, box-shadow .45s var(--ease);
}
.slot:hover .slot-ic { border-color: var(--accent); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), 0 14px 26px -14px rgba(73, 59, 44, .4) }
.slot-avatar { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block }
.slot-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(168deg, var(--surface) 0%, var(--cream) 62%, var(--paper) 100%) }
.slot-ph .ph-seal {
  position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border: 1.5px solid var(--brand-blue);
  border-radius: 6px; color: var(--brand-blue); font-size: 11px; font-weight: 800; display: grid; place-items: center;
  opacity: .8; font-family: var(--font-b); line-height: 1;
}
.slot-ph .ph-mono { font-family: var(--font-s); font-weight: 900; font-size: clamp(26px, 4vw, 34px); color: var(--ink-35); user-select: none }
.slot-count {
  position: absolute; right: 7px; bottom: 7px; min-width: 24px; padding: 3px 8px; border-radius: 999px;
  background: var(--tea); color: var(--cream); font-family: var(--font-d); font-weight: 900; font-size: 12.5px;
  line-height: 1.25; text-align: center; box-shadow: 0 2px 6px rgba(73, 59, 44, .28);
}
.slot-count.zero { background: transparent; border: 1.5px dashed var(--line); color: var(--ink-35); box-shadow: none }
.slot-name {
  margin-top: 8px; font-size: 12.5px; font-weight: 700; color: var(--ink); text-align: center; line-height: 1.45;
  min-height: calc(2 * 1.45em); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-all; transition: color .3s;
}
.slot:hover .slot-name { color: var(--accent-strong) }
.slot-tag {
  margin-top: 5px; align-self: center; font-size: 10.5px; font-weight: 700; color: var(--ink-60);
  background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; line-height: 1.5;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.slot-tag.star.s5 { background: var(--yellow); border-color: transparent; color: var(--ink) }
.slot-tag.star.s4 { background: transparent; border: 1.5px solid rgba(91, 106, 140, .45); color: var(--slate-deep) }
.slot-tag.star.s3 { background: transparent; border: 1.5px solid var(--line); color: var(--ink-60) }
.slot.is-missing .slot-ic { opacity: .55; border-style: dashed }
.slot.is-missing:hover .slot-ic { opacity: .8 }
.slot.is-missing .slot-name { color: var(--ink-35) }
.slot.is-missing:hover .slot-name { color: var(--ink-60) }

.build-slot .build-line { margin-top: 4px; align-self: center; font-size: 11px; color: var(--ink-60); font-weight: 700; line-height: 1.4 }
.build-slot .build-line.small { font-size: 10.5px; color: var(--ink-35) }

/* ---- 单个密探编辑弹窗 ---- */
.editor-mask { position: fixed; inset: 0; z-index: 100; background: rgba(73, 59, 44, .42); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px }
.editor-panel { width: min(680px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; box-shadow: 0 40px 100px -30px rgba(73, 59, 44, .5) }
.editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px 28px 16px; border-bottom: 1.5px dashed var(--line) }
.editor-head h3 { font-family: var(--font-s); font-weight: 900; font-size: 26px; letter-spacing: .04em; color: var(--ink) }
.editor-sub { margin-top: 4px; font-size: 12px; color: var(--ink-35); font-weight: 600 }
.editor-close { border: none; background: transparent; color: var(--ink-60); font-size: 26px; line-height: 1; cursor: pointer; padding: 4px 8px; border-radius: 10px; transition: all .25s }
.editor-close:hover { color: var(--rouge); background: rgba(166, 81, 74, .08) }
.editor-body { display: flex; flex-direction: column; gap: 18px; padding: 20px 28px 24px }
.editor-save-hint { background: var(--paper); border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 14px; font-size: 12.5px; color: var(--ink-60); font-weight: 700 }
.editor-row { display: flex; gap: 16px; align-items: flex-start }
.editor-label { flex: none; width: 76px; padding-top: 9px; font-size: 13px; font-weight: 800; color: var(--ink) }
.editor-game { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.game-pill { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 700; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 16px; transition: all .25s }
.game-pill input { display: none }
.game-pill:has(input:checked) { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.editor-game .hint { flex-basis: 100%; margin-top: 2px; font-size: 11.5px; color: var(--ink-35); line-height: 1.7 }
.num-fields { display: flex; gap: 12px; flex-wrap: wrap }
.num-fields label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 12px }
.num-fields input { width: 76px; border: none; background: transparent; font-family: var(--font-d); font-weight: 900; font-size: 16px; color: var(--ink); outline: none; -moz-appearance: textfield }
.num-fields input::-webkit-outer-spin-button, .num-fields input::-webkit-inner-spin-button { -webkit-appearance: none }
.num-fields .star-card {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
}
.star-row { display: flex; align-items: center; gap: 12px; min-width: 0 }
.star-caption { flex: none; width: 34px; font-size: 13px; font-weight: 800; color: var(--ink) }
.star-groups { display: flex; flex-wrap: wrap; gap: 6px }
.star-pill {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 12.5px;
  font-weight: 800;
  font-family: var(--font-b);
  line-height: 1.4;
  cursor: pointer;
  transition: all .25s;
}
.star-pill:hover { border-color: var(--accent); color: var(--accent-strong) }
.star-pill.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.star-pill.awaken { letter-spacing: .04em }
.star-pill.awaken.on { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.star-nodes { display: flex; align-items: center; flex-wrap: wrap; gap: 6px }
.node-chip {
  min-width: 30px;
  height: 26px;
  padding: 0 6px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--font-d);
  line-height: 1;
  cursor: pointer;
  transition: all .25s;
}
.node-chip:hover { border-color: var(--accent); color: var(--accent-strong) }
.node-chip.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.num-fields .level-row { flex-basis: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: 12px }
.num-fields .elite-hint { flex-basis: 100%; font-size: 11.5px; color: var(--ink-35); font-weight: 600 }
.disc-editor { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; min-width: 200px }
.disc-editor .hint { flex-basis: 100%; font-size: 12px; color: var(--ink-35) }
.disc-option { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 7px 14px; cursor: pointer; transition: all .25s; user-select: none }
.disc-option input { display: none }
.disc-option.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.disc-option small { font-size: 10.5px; color: var(--ink-35); font-weight: 600 }
.disc-option .disc-color { color: var(--accent-strong); font-weight: 800 }
/* 命盘品级色：金 / 紫 / 蓝（未选中=淡色底，选中=实色） */
.disc-option.c-gold { background: rgba(215, 137, 53, .14); border-color: rgba(215, 137, 53, .55); color: #8a5a1f }
.disc-option.c-gold.on { background: var(--accent); border-color: #b06f24; color: var(--cream) }
.disc-option.c-purple { background: rgba(151, 130, 199, .16); border-color: rgba(151, 130, 199, .62); color: #6d56a0 }
.disc-option.c-purple.on { background: #8a72bd; border-color: #7a62ab; color: var(--cream) }
.disc-option.c-blue { background: rgba(110, 135, 184, .16); border-color: rgba(110, 135, 184, .6); color: #4f6387 }
.disc-option.c-blue.on { background: #6E87B8; border-color: #5f76a4; color: var(--cream) }
.disc-option.c-gold .disc-color { color: var(--accent-strong) }
.disc-option.c-purple .disc-color { color: #7a62ab }
.disc-option.c-blue .disc-color { color: #5f76a4 }
.disc-option.c-gold.on .disc-color, .disc-option.c-purple.on .disc-color, .disc-option.c-blue.on .disc-color { color: var(--cream) }
.disc-option.c-gold.on small, .disc-option.c-purple.on small, .disc-option.c-blue.on small { color: inherit }
.stone-editor { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 200px }
.stone-item { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; background: var(--paper); border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 14px }
.stone-name { flex: none; min-width: 64px; font-size: 13px; font-weight: 800; color: var(--ink) }
.stone-select { flex: none; width: 104px; border: 1.5px solid var(--line); border-radius: 8px; padding: 6px 10px; font-family: var(--font-b); font-size: 13px; font-weight: 700; color: var(--ink); background: var(--surface); outline: none; cursor: pointer }
.stone-select:focus { border-color: var(--accent) }
.stone-item input { width: 90px; border: 1.5px solid var(--line); border-radius: 8px; padding: 6px 10px; font-family: var(--font-d); font-weight: 800; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; -moz-appearance: textfield }
.stone-item input:focus { border-color: var(--accent) }
.stone-quick { display: flex; align-items: center; gap: 5px }
.stone-lv-chip {
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--font-d);
  line-height: 1;
  cursor: pointer;
  transition: all .25s;
}
.stone-lv-chip:hover { border-color: var(--accent); color: var(--accent-strong) }
.stone-lv-chip.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.stone-empty { font-size: 12px; color: var(--ink-35); font-weight: 600; flex: 1 }
.stone-editor .hint { font-size: 11.5px; color: var(--ink-35); line-height: 1.6 }
.editor-notice { margin-top: 4px; background: var(--yellow); color: var(--ink); border-radius: 12px; padding: 10px 14px; font-size: 12.5px; font-weight: 700; line-height: 1.6 }
.editor-notice.err { background: rgba(166, 81, 74, .14); color: var(--rouge) }
.editor-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 28px 24px }

.edit-btn { margin-top: 6px; align-self: center; border: 1.5px solid var(--line); background: var(--paper); color: var(--ink-60); border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s; line-height: 1.5 }
.edit-btn:hover { border-color: var(--accent); color: var(--accent-strong); background: var(--cream) }

/* 深色块上的文字（未登录提示） */
.hero-stats div.is-authed .v small a { color: var(--cream); text-decoration: underline; text-underline-offset: 3px }

@media (max-width: 640px) {
  .backpack { padding: 14px 12px 16px; border-radius: 20px }
  .slot-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 12px 10px }
  .slot-count { font-size: 11.5px; padding: 2px 7px; right: 5px; bottom: 5px }
  .manifest-bar { flex-direction: column; align-items: stretch; gap: 10px }
  .manifest-bar .sp { display: none }
  .mf-search { width: auto }
  .mf-stats { justify-content: space-between }
  .mf-progress { width: 100% }
}
</style>