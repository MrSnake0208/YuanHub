<template>
  <div class="page-operator page-admin-op">
    <IslandSidebar />

    <main class="operator-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">密探</span>
            <span class="pill">公共图鉴</span>
            <span class="pill">管理</span>
          </div>
          <h1>密探公共图鉴<span class="small">管理端</span></h1>
          <p class="hero-sub">管理「密探公共 API」背后的全局字典：增删改查有哪些密探、长什么样。改动即时反映到公共图鉴与导入校验；<b>不涉及</b>任何个人子账号的养成档案。</p>
          <div class="hero-stats">
            <div><div class="k">目录条目</div><div class="v">{{ rows.length }}<small>位</small></div></div>
            <div><div class="k">SP 形态</div><div class="v">{{ spCount }}<small>位</small></div></div>
            <div><div class="k">游戏版本</div><div class="v">{{ gameCount }}<small>版</small></div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">身份</div><div class="v">管理员<small>status ≥ 2</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 非管理员 / 未授权提示 -->
          <div v-if="forbidden" class="state err banner" v-reveal>
            <b>仅管理员可访问</b>：{{ forbidden }} · 请用管理员账号登录后再试
          </div>

          <!-- 目录管理工具条 -->
          <div v-else class="admin-bar" v-reveal>
            <input v-model.trim="search" class="adm-search" type="search" placeholder="搜索名称 / 别名 / id / 属性" />
            <span class="sp"></span>
            <button class="btn primary" @click="openNew">新增密探</button>
          </div>

          <!-- 列表 -->
          <div v-if="loading" class="state">正在加载密探公共图鉴…</div>
          <div v-else-if="error" class="state err">{{ error }}</div>
          <template v-else>
            <div v-if="filteredRows.length === 0" class="state">没有匹配「{{ search }}」的密探</div>
            <div v-else class="catalog-table-wrap" v-reveal>
              <table class="catalog-table">
                <thead>
                  <tr>
                    <th>密探</th>
                    <th>稀有度</th>
                    <th>属性 / 职业</th>
                    <th>版本</th>
                    <th>命盘</th>
                    <th>星石</th>
                    <th>SP</th>
                    <th>目录版本</th>
                    <th class="ops-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in filteredRows" :key="r.id">
                    <td class="cell-op">
                      <span class="op-ph" :class="'s' + Math.min(5, r.rarity || 5)">{{ monogram(r) }}</span>
                      <span class="op-name">
                        {{ r.name || r.id }}
                        <small>{{ r.id }}</small>
                        <em v-if="r.alias" class="op-alias">{{ r.alias }}</em>
                      </span>
                    </td>
                    <td><span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}★</span></td>
                    <td class="cell-prof">
                      <span v-for="p in r.prof" :key="p" class="tag-prof">{{ p }}</span>
                      <span v-if="!r.prof.length" class="muted">—</span>
                      <small v-if="r.subProf.length" class="sub-prof">{{ r.subProf.join('、') }}</small>
                    </td>
                    <td><span v-for="g in r.games" :key="g" class="tag-station">{{ g }}</span></td>
                    <td>{{ r.discs.length }}</td>
                    <td>{{ r.starStones.length }}</td>
                    <td><span v-if="r.spOf" class="tag-sp" :title="'本体：' + r.spOf">SP</span><span v-else class="muted">—</span></td>
                    <td class="cell-ver"><code>{{ r.catalogVersion }}</code><small>{{ fmtTime(r.createdAt) }}</small></td>
                    <td class="ops-col">
                      <button class="ops-btn" @click="openEdit(r)">编辑</button>
                      <button class="ops-btn danger" @click="onDelete(r)">删除</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </section>

      <!-- 新增 / 编辑弹窗 -->
      <div v-if="editing" class="editor-mask" @click.self="closeEditor">
        <div class="editor-panel" v-reveal>
          <div class="editor-head">
            <div>
              <h3>{{ isNew ? '新增密探' : (form.name || form.id) }}</h3>
              <p class="editor-sub">{{ isNew ? '写入公共图鉴字典，即时对公共图鉴与导入校验生效' : (form.id + ' · 修改会整条覆盖保存' ) }}</p>
            </div>
            <button class="editor-close" type="button" @click="closeEditor">×</button>
          </div>

          <div class="editor-body">
            <div class="editor-row">
              <span class="editor-label">基础</span>
              <div class="fields-2col">
                <label>ID（char_xxx）<input :readonly="!isNew" v-model.trim="form.id" placeholder="char_090_new" /></label>
                <label>名称 <input v-model.trim="form.name" placeholder="杨修" /></label>
                <label>别名 <input v-model.trim="form.alias" placeholder="搜索别名，可空" /></label>
                <label>稀有度
                  <select v-model="form.rarity">
                    <option :value="5">5 ★</option>
                    <option :value="4">4 ★</option>
                    <option :value="3">3 ★</option>
                  </select>
                </label>
                <label>属性（逗号分隔）<input v-model.trim="form.profText" placeholder="阳、阴、混沌…" /></label>
                <label>下属职业（逗号分隔）<input v-model.trim="form.subProfText" placeholder="shenji，可空" /></label>
              </div>
            </div>

            <div class="editor-row">
              <span class="editor-label">版本</span>
              <div class="games-pick">
                <label :class="{ on: form.games.indexOf('如鸢') !== -1 }"><input type="checkbox" value="如鸢" v-model="form.games" /> 如鸢</label>
                <label :class="{ on: form.games.indexOf('代号鸢') !== -1 }"><input type="checkbox" value="代号鸢" v-model="form.games" /> 代号鸢</label>
              </div>
              <span class="editor-label" style="margin-left: auto">SP 本体</span>
              <input class="spof-input" v-model.trim="form.spOf" placeholder="如 char_023_shizimiao，可空" />
            </div>

            <div class="editor-row">
              <span class="editor-label">命盘</span>
              <div class="sub-editor">
                <div v-for="(d, i) in form.discs" :key="i" class="sub-row">
                  <input v-model.trim="d.ot_name" placeholder="ot_name（必填，唯一）" class="sub-ot" />
                  <input v-model.trim="d.abbreviation" placeholder="简称" class="sub-sm" />
                  <select v-model="d.color" class="sub-color">
                    <option value="">无色</option>
                    <option value="金">金</option>
                    <option value="紫">紫</option>
                    <option value="蓝">蓝</option>
                  </select>
                  <input v-model.trim="d.desp" placeholder="描述" class="sub-desp" />
                  <button class="sub-del" type="button" @click="form.discs.splice(i, 1)">×</button>
                </div>
                <button class="btn ghost mini" type="button" @click="form.discs.push({ ot_name: '', abbreviation: '', color: '金', desp: '' })">＋ 添加命盘</button>
              </div>
            </div>

            <div class="editor-row">
              <span class="editor-label">星石槽</span>
              <div class="sub-editor">
                <div v-for="(s, i) in form.starStones" :key="i" class="sub-row">
                  <input v-model.trim="s.name" placeholder="星石名" class="sub-ot" />
                  <select v-model="s.type" class="sub-color">
                    <option value="main">主星石 main</option>
                    <option value="assist">辅星石 assist</option>
                  </select>
                  <button class="sub-del" type="button" @click="form.starStones.splice(i, 1)">×</button>
                </div>
                <button class="btn ghost mini" type="button" @click="form.starStones.push({ name: '', type: 'main' })">＋ 添加星石槽</button>
                <p class="hint">目录星石只是「槽位模板」；不展示给公共图鉴，只用于校验用户导入。</p>
              </div>
            </div>

            <div v-if="notice" class="editor-notice" :class="{ err: noticeError }">{{ notice }}</div>
          </div>

          <div class="editor-actions">
            <button class="btn ghost" type="button" :disabled="saving" @click="closeEditor">取消</button>
            <button class="btn primary" type="button" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : (isNew ? '新增到公共图鉴' : '保存修改') }}
            </button>
          </div>
        </div>
      </div>

      <SiteFooter>
        <template #big>密探公共图鉴<br><span>管理端</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探公共图鉴管理<br>
          仅管理员（status ≥ 2）可增删改查 · 与个人密探养成档案隔离<br>
          改动即时生效，请谨慎操作
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import {
  listAdminOperatorCatalog,
  createAdminOperatorCatalog,
  updateAdminOperatorCatalog,
  deleteAdminOperatorCatalog
} from '../../api/operator.js'
import { auth } from '../../store/auth.js'
import { dialog } from '../../utils/dialog.js'

const rows = ref([])
const loading = ref(false)
const error = ref('')
const forbidden = ref('')
const search = ref('')

// —— 列表面板 ——
function normalizeRow(r) {
  r = r || {}
  const rawSub = r.sub_prof || r.subProf || []
  return {
    id: r.id || '',
    name: r.name || '',
    alias: r.alias || '',
    rarity: r.rarity != null ? r.rarity : 5,
    prof: Array.isArray(r.prof) ? r.prof : [],
    subProf: Array.isArray(rawSub) ? rawSub : [],
    games: Array.isArray(r.games) ? r.games : [],
    discs: Array.isArray(r.discs) ? r.discs : [],
    starStones: Array.isArray(r.star_stones) ? r.star_stones : [],
    spOf: r.sp_of || r.spOf || null,
    catalogVersion: r.catalog_version || r.catalogVersion || '',
    createdAt: r.created_at || r.createdAt || null
  }
}

const spCount = computed(function () {
  return rows.value.filter(function (r) { return r.spOf }).length
})
const gameCount = computed(function () {
  const set = new Set()
  rows.value.forEach(function (r) { (r.games || []).forEach(function (g) { set.add(g) }) })
  return set.size || 2
})

const filteredRows = computed(function () {
  const q = search.value.toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(function (r) {
    const hay = [r.name, r.alias, r.id, r.prof.join(''), r.subProf.join('')].filter(Boolean).join(' ').toLowerCase()
    return hay.indexOf(q) !== -1
  })
})

function monogram(r) {
  const s = String(r.name || r.id || '?')
  return Array.from(s)[0] || '?'
}

// —— 新增 / 编辑 ——
const editing = ref(false)
const isNew = ref(false)
const form = ref(blankForm())
const notice = ref('')
const noticeError = ref(false)
const saving = ref(false)

function blankForm() {
  return {
    id: '',
    name: '',
    alias: '',
    rarity: 5,
    profText: '',
    subProfText: '',
    games: ['如鸢'],
    spOf: '',
    discs: [],
    starStones: [{ name: '主星石', type: 'main' }, { name: '辅星石', type: 'assist' }]
  }
}

function fillForm(r) {
  return {
    id: r.id,
    name: r.name,
    alias: r.alias || '',
    rarity: r.rarity || 5,
    profText: r.prof.join('、'),
    subProfText: r.subProf.join('、'),
    games: (r.games && r.games.length) ? r.games.slice() : ['如鸢'],
    spOf: r.spOf || '',
    discs: r.discs.map(function (d) {
      return {
        ot_name: d.ot_name || d.otName || '',
        abbreviation: d.abbreviation || '',
        color: d.color || '金',
        desp: d.desp || ''
      }
    }),
    starStones: r.starStones.map(function (s) {
      return { name: s.name || '', type: s.type || 'main' }
    })
  }
}

function openNew() {
  isNew.value = true
  form.value = blankForm()
  notice.value = ''
  noticeError.value = false
  editing.value = true
}

function openEdit(r) {
  isNew.value = false
  form.value = fillForm(r)
  notice.value = ''
  noticeError.value = false
  editing.value = true
}

function closeEditor() {
  if (saving.value) return
  editing.value = false
}

function splitList(text) {
  return String(text || '')
    .split(/[,，、]/)
    .map(function (s) { return s.trim() })
    .filter(Boolean)
}

function buildBody() {
  const body = {
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    alias: form.value.alias.trim() || null,
    rarity: Number(form.value.rarity) || 5,
    prof: splitList(form.value.profText),
    subProf: splitList(form.value.subProfText),
    games: form.value.games,
    discs: form.value.discs
      .filter(function (d) { return d.ot_name && d.ot_name.trim() })
      .map(function (d) {
        return {
          ot_name: d.ot_name.trim(),
          abbreviation: (d.abbreviation && d.abbreviation.trim()) || null,
          color: d.color || null,
          desp: (d.desp && d.desp.trim()) || null
        }
      }),
    starStones: form.value.starStones
      .filter(function (s) { return s.name && s.name.trim() })
      .map(function (s) { return { name: s.name.trim(), type: s.type } }),
    spOf: form.value.spOf.trim() || null
  }
  return body
}

function validateBody(body) {
  if (!body.id || !/^char_[A-Za-z0-9_]+$/.test(body.id)) {
    notice.value = 'ID 必须以 char_ 开头（如 char_001_yangxiu）'
    noticeError.value = true
    return false
  }
  if (!body.name) { notice.value = '名称不能为空'; noticeError.value = true; return false }
  if (!body.games.length) { notice.value = '至少选择一个游戏版本'; noticeError.value = true; return false }
  const discNames = body.discs.map(function (d) { return d.ot_name })
  if (new Set(discNames).size !== discNames.length) { notice.value = '命盘 ot_name 不能重复'; noticeError.value = true; return false }
  const stoneTypes = body.starStones.map(function (s) { return s.type })
  if (new Set(stoneTypes).size !== stoneTypes.length) { notice.value = '星石 type 不能重复（main / assist 各一）'; noticeError.value = true; return false }
  if (body.spOf === body.id) { notice.value = 'spOf 不能引用自身'; noticeError.value = true; return false }
  return true
}

async function save() {
  const body = buildBody()
  if (!validateBody(body)) return
  saving.value = true
  notice.value = ''
  noticeError.value = false
  try {
    if (isNew.value) {
      await createAdminOperatorCatalog(body)
    } else {
      await updateAdminOperatorCatalog(body.id, body)
    }
    notice.value = '已保存到公共图鉴'
    setTimeout(function () {
      closeEditor()
      load()
    }, 800)
  } catch (err) {
    notice.value = humanErr(err, '保存失败')
    noticeError.value = true
  } finally {
    saving.value = false
  }
}

async function onDelete(r) {
  const dependants = rows.value.filter(function (x) { return x.spOf === r.id }).map(function (x) { return x.name || x.id })
  const warn = dependants.length
    ? '；注意：「' + dependants.join('、') + '」以该密探为 SP 本体，删除后它们的 spOf 校验将失效'
    : ''
  const ok = await dialog.confirm({
    title: '删除密探',
    message: '删除密探「' + (r.name || r.id) + '」？删除后公共图鉴与导入校验立即生效' + warn + '，此操作不可恢复。',
    type: 'danger',
    confirmText: '删除'
  })
  if (!ok) return
  try {
    await deleteAdminOperatorCatalog(r.id)
    await load()
  } catch (err) {
    await dialog.alert({ title: '删除失败', message: humanErr(err, '删除失败') })
  }
}

// —— 加载 ——
async function load() {
  loading.value = true
  error.value = ''
  forbidden.value = ''
  try {
    const data = await listAdminOperatorCatalog()
    rows.value = Array.isArray(data) ? data.map(normalizeRow) : []
  } catch (err) {
    const msg = err && err.message ? err.message : ''
    if (/forbidden|管理|administrator/i.test(msg)) {
      forbidden.value = msg
      rows.value = []
    } else {
      rows.value = []
      error.value = humanErr(err, '公共图鉴加载失败')
    }
  } finally {
    loading.value = false
  }
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

onMounted(load)
</script>

<style scoped>
/* —— 复用全局 CSS 变量，对齐密探页（operator/index.vue）版式与配色规范 —— */
.operator-main { padding-bottom: 40px }
.page-admin-op .hero::after { content: '管' }

.banner { margin-top: 24px; background: rgba(166, 81, 74, .08) }

.admin-bar { display: flex; align-items: center; gap: 14px; margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; flex-wrap: wrap }
.admin-bar .sp { flex: 1 }
.adm-search { border: 1.5px solid var(--line); border-radius: 10px; padding: 9px 14px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 240px; transition: border-color .3s }
.adm-search:focus { border-color: var(--accent) }

.catalog-table-wrap { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 8px 10px; overflow-x: auto }
.catalog-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 920px }
.catalog-table th { text-align: left; font-family: var(--font-b); font-weight: 800; font-size: 12px; color: var(--ink-60); padding: 10px 12px; border-bottom: 1px dashed var(--line); white-space: nowrap }
.catalog-table td { padding: 10px 12px; border-bottom: 1px solid rgba(156, 122, 77, .12); vertical-align: middle }
.catalog-table tbody tr:last-child td { border-bottom: none }
.catalog-table tbody tr:hover { background: rgba(156, 122, 77, .05) }

.cell-op { min-width: 220px }
.cell-op { display: flex; align-items: center; gap: 12px }
.op-ph { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-family: var(--font-d); font-weight: 900; font-size: 14px; color: var(--cream) }
.op-ph.s3 { background: var(--yellow-deep); color: var(--ink) }
.op-ph.s4 { background: var(--accent) }
.op-ph.s5 { background: var(--tea) }
.op-name { display: flex; flex-direction: column; gap: 1px; line-height: 1.3 }
.op-name small { font-family: var(--font-d); font-size: 10.5px; color: var(--ink-35) }
.op-name em { font-style: normal; font-size: 11px; color: var(--ink-60) }

.rarity { font-family: var(--font-d); font-weight: 800; white-space: nowrap }
.rarity.s3 { color: var(--yellow-deep) }
.rarity.s4 { color: var(--accent) }
.rarity.s5 { color: var(--tea) }
.cell-prof { display: flex; flex-direction: column; gap: 3px; align-items: flex-start }
.tag-prof { display: inline-block; background: var(--yellow); color: var(--ink); border-radius: 6px; padding: 1px 7px; font-size: 11px; font-weight: 800 }
.sub-prof { color: var(--ink-35); font-size: 11px }
.tag-station { display: inline-block; border: 1.5px solid var(--line); color: var(--ink); border-radius: 6px; padding: 1px 7px; font-size: 11px; margin-right: 4px }
.tag-sp { display: inline-block; background: var(--tea); color: var(--cream); border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 800 }
.muted { color: var(--ink-35); font-size: 12px }
.cell-ver { max-width: 150px }
.cell-ver code { display: block; font-family: var(--font-d); font-size: 10.5px; color: var(--ink-60); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cell-ver small { color: var(--ink-35); font-size: 10.5px }
.ops-col { text-align: right; white-space: nowrap }
.ops-btn { border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; padding: 5px 12px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s; margin-left: 6px }
.ops-btn:hover { border-color: var(--ink); color: var(--ink) }
.ops-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ops-btn.danger:hover { background: rgba(166, 81, 74, .1) }

/* —— 弹窗 —— */
.editor-mask { position: fixed; inset: 0; background: rgba(73, 59, 44, .34); backdrop-filter: blur(2px); display: grid; place-items: center; z-index: 90; padding: 24px }
.editor-panel { width: min(720px, 100%); max-height: 86vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 24px 26px; box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4) }
.editor-head { display: flex; align-items: flex-start; gap: 12px; border-bottom: 1px dashed var(--line); padding-bottom: 14px }
.editor-head h3 { font-family: var(--font-s); font-weight: 900; font-size: 22px; letter-spacing: .02em; color: var(--ink) }
.editor-sub { font-size: 12px; color: var(--ink-60); margin-top: 4px }
.editor-close { margin-left: auto; background: transparent; border: none; font-size: 24px; line-height: 1; cursor: pointer; color: var(--ink-35); padding: 0 4px }
.editor-close:hover { color: var(--ink) }
.editor-body { padding: 16px 0 4px; display: flex; flex-direction: column; gap: 16px }
.editor-row { display: flex; flex-direction: column; gap: 10px }
.editor-label { font-size: 12.5px; font-weight: 800; color: var(--ink-60); font-family: var(--font-b) }
.fields-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px }
.fields-2col label, .spof-input { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-60); font-weight: 700 }
.fields-2col input, .fields-2col select, .spof-input { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.fields-2col input:focus, .fields-2col select:focus, .spof-input:focus { border-color: var(--accent) }
.fields-2col input[readonly] { opacity: .55 }
.games-pick { display: flex; gap: 10px }
.games-pick label { display: inline-flex; align-items: center; gap: 6px; border: 1.5px solid var(--line); border-radius: 10px; padding: 7px 12px; font-size: 13px; font-weight: 800; color: var(--ink-60); cursor: pointer; transition: all .25s; background: var(--paper) }
.games-pick label.on { background: var(--yellow); color: var(--ink); border-color: var(--yellow-deep) }
.games-pick input { accent-color: var(--accent) }
.spof-input { width: 220px }

.sub-editor { display: flex; flex-direction: column; gap: 8px }
.sub-row { display: flex; gap: 8px; align-items: center }
.sub-row input, .sub-row select { border: 1.5px solid var(--line); border-radius: 9px; padding: 7px 10px; font-size: 12.5px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.sub-row input:focus, .sub-row select:focus { border-color: var(--accent) }
.sub-ot { flex: 2.2; min-width: 140px }
.sub-sm { flex: 1; min-width: 80px }
.sub-desp { flex: 3; min-width: 120px }
.sub-color { flex: .8; min-width: 76px }
.sub-del { border: none; background: transparent; color: var(--ink-35); font-size: 18px; cursor: pointer; padding: 0 4px }
.sub-del:hover { color: var(--rouge) }
.btn.mini { padding: 6px 12px; font-size: 12px; align-self: flex-start }
.hint { font-size: 11.5px; color: var(--ink-35); font-weight: 600 }

.editor-notice { border-radius: 12px; padding: 10px 14px; font-size: 12.5px; background: rgba(167, 209, 169, .25); color: var(--ink) }
.editor-notice.err { background: rgba(166, 81, 74, .1); color: var(--rouge) }
.editor-actions { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px dashed var(--line); padding-top: 16px; margin-top: 8px }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }
.btn.primary { background: var(--tea); color: var(--cream) }
.btn.primary:hover:not(:disabled) { background: var(--tea-deep) }

.state { text-align: center; padding: 40px 20px; color: var(--ink-60); font-size: 13.5px; margin-top: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.state.err { color: var(--rouge) }
</style>
