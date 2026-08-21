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
            <div><div class="k">奇闻待维护</div><div class="v" :class="{ warn: missingOddityCount }">{{ missingOddityCount }}<small>位</small></div></div>
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
            <label class="adm-search-wrap">
              <Search :size="18" aria-hidden="true" />
              <input v-model.trim="search" class="adm-search" type="search" aria-label="搜索密探图鉴" placeholder="搜索名称、别名、ID 或属性" />
            </label>
            <span class="result-count" aria-live="polite">{{ filteredRows.length }} 位密探</span>
            <span class="sp"></span>
            <button class="btn primary" type="button" @click="openNew">
              <Plus :size="17" aria-hidden="true" />
              新增密探
            </button>
          </div>

          <!-- 列表 -->
          <div v-if="loading" class="state" role="status" aria-live="polite">正在加载密探公共图鉴…</div>
          <div v-else-if="error" class="state err" role="alert">
            {{ error }}<button class="state-retry" type="button" @click="load">重试</button>
          </div>
          <template v-else>
            <div v-if="filteredRows.length === 0" class="state">没有匹配「{{ search }}」的密探</div>
            <div v-else class="catalog-views">
              <div class="catalog-table-wrap">
                <table class="catalog-table">
                  <thead>
                    <tr>
                      <th>密探</th>
                      <th>稀有度</th>
                      <th>属性 / 职业</th>
                      <th>版本</th>
                      <th>命盘</th>
                      <th>星石</th>
                      <th>第三奇闻</th>
                      <th>SP</th>
                      <th>目录版本</th>
                      <th class="ops-col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in filteredRows" :key="r.id">
                      <td class="cell-op">
                        <img v-if="r.avatar" class="op-avatar" :src="avatarUrl(r.avatar)" :alt="r.name" loading="lazy" width="34" height="34" />
                        <span v-else class="op-ph" :class="'s' + Math.min(5, r.rarity || 5)">{{ monogram(r) }}</span>
                        <span class="op-name">
                          {{ r.name || r.id }}
                          <small>{{ r.id }}</small>
                          <em v-if="r.alias" class="op-alias">{{ r.alias }}</em>
                        </span>
                      </td>
                      <td><span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}★</span></td>
                      <td class="cell-prof">
                        <div class="cell-tag-flow">
                          <span v-for="p in r.prof" :key="'prof-' + p" class="tag-prof" :style="profStyle(p)">{{ p }}</span>
                          <span v-for="career in r.subProf" :key="'career-' + career" class="tag-subprof">{{ subProfLabel(career) }}</span>
                          <span v-if="!r.prof.length && !r.subProf.length" class="muted">—</span>
                        </div>
                      </td>
                      <td>
                        <div class="cell-tag-flow">
                          <span v-for="g in r.games" :key="g" class="tag-station">{{ g }}</span>
                          <span v-if="!r.games.length" class="muted">—</span>
                        </div>
                      </td>
                      <td>{{ r.discs.length }}</td>
                      <td>{{ r.starStones.length }}</td>
                      <td class="cell-oddity">
                        <span :class="r.specialOddityName ? 'oddity-ready' : 'oddity-missing'">{{ r.odditySchema.special.name }}</span>
                        <small>/ {{ r.odditySchema.special.max == null ? '—' : r.odditySchema.special.max }}</small>
                      </td>
                      <td><span v-if="r.spOf" class="tag-sp" :title="'本体：' + r.spOf">SP</span><span v-else class="muted">—</span></td>
                      <td class="cell-ver"><code>{{ r.catalogVersion }}</code><small>{{ fmtTime(r.createdAt) }}</small></td>
                      <td class="ops-col">
                        <button class="ops-btn" type="button" @click="openEdit(r)">编辑</button>
                        <button class="ops-btn danger" type="button" @click="onDelete(r)">删除</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="catalog-mobile" aria-label="密探目录">
                <article v-for="r in filteredRows" :key="'mobile-' + r.id" class="mobile-entry" :aria-labelledby="'mobile-name-' + r.id">
                  <div class="mobile-entry-head">
                    <img v-if="r.avatar" class="mobile-avatar" :src="avatarUrl(r.avatar)" alt="" loading="lazy" width="46" height="46" />
                    <span v-else class="mobile-avatar op-ph" :class="'s' + Math.min(5, r.rarity || 5)" aria-hidden="true">{{ monogram(r) }}</span>
                    <div class="mobile-identity">
                      <h2 :id="'mobile-name-' + r.id">{{ r.name || r.id }}</h2>
                      <div class="mobile-meta">
                        <code>{{ r.id }}</code>
                        <span v-if="r.alias">· {{ r.alias }}</span>
                      </div>
                    </div>
                    <div class="mobile-badges">
                      <span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}★</span>
                      <span v-if="r.spOf" class="tag-sp" :title="'本体：' + r.spOf">SP</span>
                    </div>
                  </div>

                  <div class="mobile-tags">
                    <span v-for="p in r.prof" :key="'prof-' + p" class="tag-prof" :style="profStyle(p)">{{ p }}</span>
                    <span v-for="career in r.subProf" :key="'career-' + career" class="tag-subprof">{{ subProfLabel(career) }}</span>
                    <span v-for="g in r.games" :key="'game-' + g" class="tag-station">{{ g }}</span>
                    <span v-if="!r.prof.length && !r.subProf.length && !r.games.length" class="muted">尚未填写属性、职业与版本</span>
                  </div>

                  <div class="mobile-foot">
                    <dl class="mobile-data">
                      <div><dt>命盘</dt><dd>{{ r.discs.length }}</dd></div>
                      <div><dt>星石</dt><dd>{{ r.starStones.length }}</dd></div>
                      <div class="mobile-oddity"><dt>第三奇闻</dt><dd :class="{ missing: !r.specialOddityName }">{{ r.odditySchema.special.name }} / {{ r.odditySchema.special.max == null ? '—' : r.odditySchema.special.max }}</dd></div>
                      <div class="mobile-version"><dt>目录</dt><dd :title="r.catalogVersion">{{ r.catalogVersion || '—' }}</dd></div>
                    </dl>

                    <div class="mobile-actions">
                      <button class="mobile-edit" type="button" :aria-label="'编辑密探' + (r.name || r.id)" title="编辑" @click="openEdit(r)">
                        <Pencil :size="17" aria-hidden="true" />
                      </button>
                      <button class="mobile-delete" type="button" :aria-label="'删除密探' + (r.name || r.id)" title="删除" @click="onDelete(r)">
                        <Trash2 :size="18" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- 新增 / 编辑弹窗 -->
      <div v-if="editing" class="editor-mask" @click.self="closeEditor" @keyup.esc="closeEditor">
        <div class="editor-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title">
          <div class="editor-head">
            <div>
              <h3 id="catalog-editor-title">{{ isNew ? '新增密探' : (form.name || form.id) }}</h3>
              <p class="editor-sub">{{ isNew ? '写入公共图鉴字典，即时对公共图鉴与导入校验生效' : (form.id + ' · 修改会整条覆盖保存' ) }}</p>
            </div>
            <button class="editor-close" type="button" aria-label="关闭编辑器" @click="closeEditor"><X :size="22" aria-hidden="true" /></button>
          </div>

          <div class="editor-body">
            <div class="editor-row">
              <span class="editor-label">头像</span>
              <div class="avatar-editor">
                <div class="avatar-editor-main">
                  <img v-if="form.avatarPreview" :src="form.avatarPreview" class="avatar-preview" alt="新头像预览" />
                  <img v-else-if="form.avatar" :src="avatarUrl(form.avatar)" class="avatar-preview" alt="当前头像" />
                  <span v-else class="avatar-placeholder">无头像</span>
                  <div class="avatar-actions">
                    <input ref="avatarInput" type="file" accept="image/webp" class="avatar-file" @change="onAvatarPick" />
                    <button class="btn ghost mini" type="button" @click="pickAvatar">选择图片</button>
                    <button class="btn primary mini" type="button" :disabled="!form.avatarPick || avatarUploading" @click="uploadAvatar">{{ avatarUploading ? '上传中…' : '上传' }}</button>
                    <button class="btn ghost mini" type="button" :disabled="avatarUploading || !form.avatar" @click="removeAvatar">删除头像</button>
                  </div>
                </div>
                <p class="hint">仅支持 webp，≤500KB；上传即保存并即时对公共图鉴生效，不依赖下方「保存」按钮</p>
              </div>
            </div>

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
                <fieldset class="multi-field">
                  <legend>属性 <small>{{ form.profs.length ? '已选 ' + form.profs.length + ' 项' : '可多选' }}</small></legend>
                  <div class="multi-pick prof-pick">
                    <label v-for="prof in PROF_OPTIONS" :key="prof" class="prof-option" :class="{ on: form.profs.includes(prof) }" :style="profStyle(prof)">
                      <input v-model="form.profs" type="checkbox" :value="prof" :aria-label="prof" />
                      <span>{{ prof }}</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset class="multi-field">
                  <legend>职业 <small>{{ form.subProfs.length ? '已选 ' + form.subProfs.length + ' 项' : '可多选' }}</small></legend>
                  <div class="multi-pick sub-prof-pick">
                    <label v-for="option in subProfOptions" :key="option.value" :class="{ on: form.subProfs.includes(option.value) }">
                      <input v-model="form.subProfs" type="checkbox" :value="option.value" />
                      {{ option.label }}
                    </label>
                  </div>
                </fieldset>
              </div>
            </div>

            <div class="editor-row oddity-editor-row">
              <span class="editor-label">奇闻定义</span>
              <fieldset class="oddity-choice-field" :aria-invalid="specialOddityError ? 'true' : 'false'" aria-describedby="special-oddity-hint special-oddity-error">
                <legend>第三奇闻名称 <b aria-hidden="true">*</b></legend>
                <div class="oddity-choice-grid">
                  <label v-for="name in SPECIAL_ODDITY_PRESETS" :key="name" :class="{ on: form.specialOddityChoice === name }">
                    <input v-model="form.specialOddityChoice" type="radio" name="special-oddity-name" :value="name" @change="specialOddityError = ''" />
                    <span>{{ name }}</span>
                  </label>
                  <label :class="{ on: form.specialOddityChoice === CUSTOM_ODDITY_OPTION }">
                    <input v-model="form.specialOddityChoice" type="radio" name="special-oddity-name" :value="CUSTOM_ODDITY_OPTION" @change="specialOddityError = ''" />
                    <span>自定义</span>
                  </label>
                </div>
                <label v-if="form.specialOddityChoice === CUSTOM_ODDITY_OPTION" class="oddity-custom-field">
                  <span>自定义名称</span>
                  <input
                    v-model.trim="form.specialOddityCustomName"
                    placeholder="输入正式属性名称"
                    autocomplete="off"
                    :aria-invalid="specialOddityError ? 'true' : 'false'"
                    aria-describedby="special-oddity-hint special-oddity-error"
                    @blur="validateSpecialOddityName"
                    @input="specialOddityError = ''"
                  />
                </label>
                <small id="special-oddity-hint" class="hint">只维护展示名称；稳定键固定为 special，上限由服务端按稀有度生成。</small>
                <small v-show="specialOddityError" id="special-oddity-error" class="field-error" role="alert">{{ specialOddityError }}</small>
              </fieldset>
              <div class="oddity-schema-preview" aria-label="奇闻稳定键与当前服务端上限">
                <span v-for="key in ODDITY_KEYS" :key="key"><code>{{ key }}</code><b>{{ oddityPreviewName(key) }}</b><em>上限 {{ oddityPreviewMax(key) }}</em></span>
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
                  <button class="sub-del" type="button" :aria-label="'删除第 ' + (i + 1) + ' 条命盘'" @click="form.discs.splice(i, 1)"><X :size="18" aria-hidden="true" /></button>
                </div>
                <button class="btn ghost mini" type="button" @click="form.discs.push({ ot_name: '', abbreviation: '', color: '金', desp: '' })"><Plus :size="16" aria-hidden="true" />添加命盘</button>
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
                  <button class="sub-del" type="button" :aria-label="'删除第 ' + (i + 1) + ' 个星石槽'" @click="form.starStones.splice(i, 1)"><X :size="18" aria-hidden="true" /></button>
                </div>
                <button class="btn ghost mini" type="button" @click="form.starStones.push({ name: '', type: 'main' })"><Plus :size="16" aria-hidden="true" />添加星石槽</button>
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
import { ref, computed } from 'vue'
import { Pencil, Plus, Search, Trash2, X } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import {
  listAdminOperatorCatalog,
  createAdminOperatorCatalog,
  updateAdminOperatorCatalog,
  deleteAdminOperatorCatalog,
  uploadAdminOperatorAvatar,
  deleteAdminOperatorAvatar
} from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { auth } from '../../store/auth.js'
import { dialog } from '../../utils/dialog.js'
import { adminCatalogEntries, compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
import { elementAppearance } from '../../data/inventory/elementColors.js'
import { OPERATOR_ODDITY_KEYS, normalizeOperatorOdditySchema } from '../../utils/operatorCombatStats.js'

const rows = ref([])
const loading = ref(true)
const error = ref('')
const forbidden = ref('')
const search = ref('')
const ODDITY_KEYS = OPERATOR_ODDITY_KEYS
const SPECIAL_ODDITY_PRESETS = ['增伤值', '免伤值', '治疗加成']
const CUSTOM_ODDITY_OPTION = '__custom__'

// —— 列表面板 ——
function normalizeRow(r) {
  r = r || {}
  const rawSub = r.sub_prof || r.subProf || []
  const specialOddityName = r.special_oddity_name != null ? r.special_oddity_name : r.specialOddityName
  const odditySchema = normalizeOperatorOdditySchema(r.oddity_schema || r.odditySchema)
  return {
    id: r.id || r.operator_id || r.operatorId || '',
    name: r.name || '',
    alias: r.alias || '',
    rarity: r.rarity != null ? r.rarity : 5,
    prof: Array.isArray(r.prof) ? r.prof : [],
    subProf: Array.isArray(rawSub) ? rawSub : [],
    games: Array.isArray(r.games) ? r.games : [],
    discs: Array.isArray(r.discs) ? r.discs : [],
    starStones: Array.isArray(r.star_stones) ? r.star_stones : (Array.isArray(r.starStones) ? r.starStones : []),
    spOf: r.sp_of || r.spOf || null,
    specialOddityName: String(specialOddityName || '').trim(),
    odditySchema: odditySchema,
    incompleteFields: Array.isArray(r.incomplete_fields) ? r.incomplete_fields : (Array.isArray(r.incompleteFields) ? r.incompleteFields : []),
    avatar: r.avatar || '',
    catalogVersion: r.catalog_version || r.catalogVersion || '',
    createdAt: r.created_at || r.createdAt || null
  }
}

const spCount = computed(function () {
  return rows.value.filter(function (r) { return r.spOf }).length
})
const missingOddityCount = computed(function () {
  return rows.value.filter(function (r) {
    return !r.specialOddityName || r.incompleteFields.indexOf('special_oddity_name') !== -1
  }).length
})

const filteredRows = computed(function () {
  const q = search.value.toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(function (r) {
    const hay = [r.name, r.alias, r.id, r.prof.join(''), r.subProf.join(''), r.specialOddityName, r.specialOddityName ? '' : '待维护'].filter(Boolean).join(' ').toLowerCase()
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
const specialOddityError = ref('')

// —— 头像上传 / 删除 ——
const avatarUploading = ref(false)
const avatarInput = ref(null)

const PROF_OPTIONS = ['阳', '阴', '火', '风', '水', '地', '混沌']
const BASE_SUB_PROF_OPTIONS = [
  { value: 'shenji', label: '神纪' },
  { value: 'guidao', label: '诡道' },
  { value: 'pojun', label: '破军' },
  { value: 'qihuang', label: '岐黄' },
  { value: 'longdun', label: '龙盾' }
]
const SUB_PROF_CODE_BY_LABEL = Object.fromEntries(BASE_SUB_PROF_OPTIONS.map(function (option) {
  return [option.label, option.value]
}))
const SUB_PROF_LABEL_BY_CODE = Object.fromEntries(BASE_SUB_PROF_OPTIONS.map(function (option) {
  return [option.value, option.label]
}))

const subProfOptions = computed(function () {
  const options = BASE_SUB_PROF_OPTIONS.slice()
  const known = new Set(options.map(function (option) { return option.value }))
  form.value.subProfs.forEach(function (value) {
    if (!known.has(value)) options.push({ value, label: value })
  })
  return options
})

function normalizeSubProfValue(value) {
  const text = String(value || '').trim()
  return SUB_PROF_CODE_BY_LABEL[text] || text
}

function subProfLabel(value) {
  const text = String(value || '').trim()
  return SUB_PROF_LABEL_BY_CODE[text] || text
}

function profStyle(prof) {
  const appearance = elementAppearance(prof)
  if (!appearance) return null
  return {
    '--element-color': appearance.color,
    '--element-text-color': appearance.darkInk
      ? 'color-mix(in srgb, var(--element-color) 40%, var(--ink))'
      : 'color-mix(in srgb, var(--element-color) 60%, var(--ink))'
  }
}

function blankForm() {
  return {
    id: '',
    name: '',
    alias: '',
    rarity: 5,
    profs: [],
    subProfs: [],
    games: ['如鸢'],
    spOf: '',
    specialOddityChoice: '',
    specialOddityCustomName: '',
    odditySchema: normalizeOperatorOdditySchema(),
    avatar: '',
    avatarPick: null,
    avatarPreview: '',
    discs: [],
    starStones: [{ name: '主星石', type: 'main' }, { name: '辅星石', type: 'assist' }]
  }
}

function fillForm(r) {
  const specialOddityName = String(r.specialOddityName || '').trim()
  const usesPreset = SPECIAL_ODDITY_PRESETS.indexOf(specialOddityName) !== -1
  return {
    id: r.id,
    name: r.name,
    alias: r.alias || '',
    rarity: r.rarity || 5,
    profs: r.prof.slice(),
    subProfs: r.subProf.map(normalizeSubProfValue),
    games: (r.games && r.games.length) ? r.games.slice() : ['如鸢'],
    spOf: r.spOf || '',
    specialOddityChoice: usesPreset ? specialOddityName : (specialOddityName ? CUSTOM_ODDITY_OPTION : ''),
    specialOddityCustomName: usesPreset ? '' : specialOddityName,
    odditySchema: normalizeOperatorOdditySchema(r.odditySchema),
    avatar: r.avatar || '',
    avatarPick: null,
    avatarPreview: '',
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
  specialOddityError.value = ''
  editing.value = true
}

function openEdit(r) {
  isNew.value = false
  form.value = fillForm(r)
  notice.value = ''
  noticeError.value = false
  specialOddityError.value = ''
  editing.value = true
}

function closeEditor() {
  if (saving.value) return
  if (avatarUploading.value) return
  editing.value = false
}

function pickAvatar() {
  const el = avatarInput.value
  if (el) { el.value = ''; el.click() }
}

function onAvatarPick(e) {
  const file = e.target.files && e.target.files[0]
  form.value.avatarPick = file || null
  form.value.avatarPreview = file ? URL.createObjectURL(file) : ''
}

// 上传头像：独立动作，上传即存、即时对公共图鉴生效（不依赖表单「保存」）
async function uploadAvatar() {
  if (!form.value.id || !/^char_[A-Za-z0-9_]+$/.test(form.value.id)) {
    notice.value = '请先填写合法的 ID（char_xxx）再上传头像'
    noticeError.value = true
    return
  }
  const file = form.value.avatarPick
  if (!file) { notice.value = '请先选择图片'; noticeError.value = true; return }
  if (!/^image\/webp$/i.test(file.type)) { notice.value = '仅支持 webp 图片'; noticeError.value = true; return }
  if (file.size > 500 * 1024) { notice.value = '图片不能超过 500KB'; noticeError.value = true; return }
  avatarUploading.value = true
  notice.value = ''
  noticeError.value = false
  try {
    const saved = await uploadAdminOperatorAvatar(form.value.id, file)
    const path = (saved && saved.avatar) || '/avatar/' + form.value.id + '.webp'
    const row = rows.value.find(function (r) { return r.id === form.value.id })
    if (row) row.avatar = path
    form.value.avatar = path
    form.value.avatarPreview = ''
    form.value.avatarPick = null
    notice.value = '头像已上传，即时对公共图鉴生效'
  } catch (err) {
    notice.value = humanErr(err, '头像上传失败')
    noticeError.value = true
  } finally {
    avatarUploading.value = false
  }
}

// 删除头像：独立动作，即时生效
async function removeAvatar() {
  if (!confirm('删除「' + (form.value.name || form.value.id) + '」的头像？')) return
  avatarUploading.value = true
  notice.value = ''
  noticeError.value = false
  try {
    await deleteAdminOperatorAvatar(form.value.id)
    const row = rows.value.find(function (r) { return r.id === form.value.id })
    if (row) row.avatar = ''
    form.value.avatar = ''
    form.value.avatarPreview = ''
    form.value.avatarPick = null
    notice.value = '头像已删除'
  } catch (err) {
    notice.value = humanErr(err, '头像删除失败')
    noticeError.value = true
  } finally {
    avatarUploading.value = false
  }
}

function buildBody() {
  const body = {
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    alias: form.value.alias.trim() || null,
    rarity: Number(form.value.rarity) || 5,
    prof: form.value.profs.slice(),
    subProf: form.value.subProfs.slice(),
    games: form.value.games,
    specialOddityName: resolvedSpecialOddityName(),
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
  if (!validateSpecialOddityName()) {
    notice.value = specialOddityError.value
    noticeError.value = true
    return false
  }
  if (!body.games.length) { notice.value = '至少选择一个游戏版本'; noticeError.value = true; return false }
  const discNames = body.discs.map(function (d) { return d.ot_name })
  if (new Set(discNames).size !== discNames.length) { notice.value = '命盘 ot_name 不能重复'; noticeError.value = true; return false }
  const stoneTypes = body.starStones.map(function (s) { return s.type })
  if (new Set(stoneTypes).size !== stoneTypes.length) { notice.value = '星石 type 不能重复（main / assist 各一）'; noticeError.value = true; return false }
  if (body.spOf === body.id) { notice.value = 'spOf 不能引用自身'; noticeError.value = true; return false }
  return true
}

function validateSpecialOddityName() {
  const name = resolvedSpecialOddityName()
  specialOddityError.value = name ? '' : (form.value.specialOddityChoice === CUSTOM_ODDITY_OPTION
    ? '请输入自定义的正式属性名称'
    : '请选择或自定义第三奇闻名称')
  return !specialOddityError.value
}

function resolvedSpecialOddityName() {
  if (form.value.specialOddityChoice === CUSTOM_ODDITY_OPTION) {
    return String(form.value.specialOddityCustomName || '').trim()
  }
  return SPECIAL_ODDITY_PRESETS.indexOf(form.value.specialOddityChoice) !== -1
    ? form.value.specialOddityChoice
    : ''
}

function oddityPreviewName(key) {
  if (key === 'special' && resolvedSpecialOddityName()) return resolvedSpecialOddityName()
  return form.value.odditySchema[key].name
}

function oddityPreviewMax(key) {
  const max = form.value.odditySchema[key].max
  return max == null ? '保存后生成' : max
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
    ? '\n注意：「' + dependants.join('、') + '」以该密探为 SP 本体，删除后它们的 spOf 校验将失效。'
    : ''
  const confirmation = await dialog.prompt({
    title: '确认删除密探',
    message: '将永久删除「' + (r.name || r.id) + '」，并立即影响公共图鉴与导入校验。此操作不可恢复。' + warn,
    type: 'danger',
    inputLabel: '输入 ' + r.id + ' 以确认',
    placeholder: r.id,
    requiredValue: r.id,
    confirmText: '永久删除'
  })
  if (confirmation !== r.id) return
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
    const entries = adminCatalogEntries(data)
    if (entries === null) throw new Error('管理接口响应格式异常，请刷新后重试')
    rows.value = entries.map(normalizeRow).sort(compareOperatorIdDesc)
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

// 在 setup 阶段立即请求，确保首次渲染直接进入加载态并自动填充列表。
load()
</script>

<style scoped>
/* —— 复用全局 CSS 变量，对齐密探页（operator/index.vue）版式与配色规范 —— */
.operator-main { padding-bottom: 0 }
.page-admin-op .hero::after { content: '管' }

.banner { margin-top: 24px; background: rgba(166, 81, 74, .08) }

.admin-bar { display: flex; align-items: center; gap: 14px; margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; flex-wrap: wrap }
.admin-bar .sp { flex: 1 }
.adm-search-wrap { width: 280px; min-height: 40px; display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--line); border-radius: 10px; padding: 0 12px; color: var(--ink-35); background: var(--paper); transition: border-color .25s, box-shadow .25s }
.adm-search-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .14) }
.adm-search { min-width: 0; flex: 1; border: 0; padding: 9px 0; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: transparent; outline: none }
.adm-search::placeholder { color: var(--ink-35) }
.result-count { font-family: var(--font-d); font-size: 12px; font-weight: 700; color: var(--ink-60); white-space: nowrap }

.catalog-table-wrap { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 8px 10px; overflow-x: auto; scrollbar-gutter: stable }
.catalog-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; min-width: 980px }
.catalog-table th { text-align: left; font-family: var(--font-b); font-weight: 800; font-size: 12px; color: var(--ink-60); padding: 10px 8px; border-bottom: 1px dashed var(--line); white-space: nowrap }
.catalog-table td { padding: 10px 8px; border-bottom: 1px solid rgba(156, 122, 77, .12); vertical-align: middle }
.catalog-table tbody tr:last-child td { border-bottom: none }
.catalog-table tbody tr:hover { background: rgba(156, 122, 77, .05) }
.catalog-mobile { display: none }

.cell-op { min-width: 178px }
.cell-op { display: flex; align-items: center; gap: 8px }
.op-ph { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-family: var(--font-d); font-weight: 900; font-size: 14px; color: var(--cream) }
.op-avatar { flex: none; width: 34px; height: 34px; border-radius: 10px; object-fit: cover; background: var(--paper); border: 1.5px solid var(--line) }
.op-ph.s3 { background: var(--yellow-deep); color: var(--ink) }
.op-ph.s4 { background: var(--accent) }
.op-ph.s5 { background: var(--tea) }

/* —— 编辑弹窗头像区 —— */
.avatar-editor { display: flex; flex-direction: column; gap: 8px }
.avatar-editor-main { display: flex; align-items: center; gap: 16px }
.avatar-preview { width: 72px; height: 72px; border-radius: 14px; object-fit: cover; background: var(--paper); border: 1.5px solid var(--line) }
.avatar-placeholder { width: 72px; height: 72px; border-radius: 14px; display: grid; place-items: center; background: var(--paper); border: 1.5px dashed var(--line); color: var(--ink-35); font-size: 12px; text-align: center }
.avatar-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start }
.avatar-file { display: none }
.op-name { display: flex; flex-direction: column; gap: 1px; line-height: 1.3 }
.op-name small { font-family: var(--font-d); font-size: 10.5px; color: var(--ink-35) }
.op-name em { font-style: normal; font-size: 11px; color: var(--ink-60) }

.rarity { font-family: var(--font-d); font-weight: 800; white-space: nowrap }
.rarity.s3 { color: var(--yellow-deep) }
.rarity.s4 { color: var(--accent) }
.rarity.s5 { color: var(--tea) }
.hero-stats .v.warn { color: var(--rouge) }
.cell-prof { min-width: 132px }
.cell-tag-flow { display: flex; align-items: center; flex-wrap: wrap; gap: 4px }
.tag-prof { display: inline-block; border: 1px solid var(--element-color, var(--yellow-deep)); border-radius: 6px; padding: 1px 7px 1px 10px; background: var(--surface); color: var(--ink); box-shadow: inset 3px 0 var(--element-color, var(--yellow-deep)); font-size: 11px; font-weight: 800 }
.tag-subprof { display: inline-block; border: 1px solid var(--yellow-deep); border-radius: 6px; padding: 1px 7px; background: var(--yellow); color: var(--ink); font-size: 11px; font-weight: 800 }
.tag-station { display: inline-block; border: 1.5px solid var(--line); color: var(--ink); border-radius: 6px; padding: 1px 7px; font-size: 11px }
.tag-sp { display: inline-block; background: var(--tea); color: var(--cream); border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 800 }
.cell-oddity { min-width: 124px }
.cell-oddity span { display: block; font-weight: 800 }
.cell-oddity small { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px }
.oddity-missing { color: var(--rouge) }
.oddity-ready { color: var(--ink) }
.muted { color: var(--ink-35); font-size: 12px }
.cell-ver { width: 96px; max-width: 96px }
.cell-ver code { display: block; font-family: var(--font-d); font-size: 10.5px; color: var(--ink-60); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cell-ver small { color: var(--ink-35); font-size: 10.5px }
.ops-col { position: sticky; right: 0; z-index: 2; min-width: 116px; text-align: right !important; white-space: nowrap; background: var(--surface); box-shadow: -10px 0 16px -16px rgba(73, 59, 44, .72) }
.catalog-table thead .ops-col { z-index: 3 }
.catalog-table tbody tr:hover .ops-col { background: color-mix(in srgb, var(--surface) 95%, var(--tea)) }
.ops-btn { border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; padding: 5px 8px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s; margin-left: 4px }
.ops-btn:hover { border-color: var(--ink); color: var(--ink) }
.ops-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ops-btn.danger:hover { background: rgba(166, 81, 74, .1) }

/* —— 弹窗 —— */
.editor-mask { position: fixed; inset: 0; background: rgba(73, 59, 44, .34); backdrop-filter: blur(2px); display: grid; place-items: center; z-index: 90; padding: 24px }
.editor-panel { width: min(720px, 100%); max-height: 86vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 24px 26px; box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4) }
.editor-head { display: flex; align-items: flex-start; gap: 12px; border-bottom: 1px dashed var(--line); padding-bottom: 14px }
.editor-head h3 { font-family: var(--font-s); font-weight: 900; font-size: 22px; letter-spacing: .02em; color: var(--ink) }
.editor-sub { font-size: 12px; color: var(--ink-60); margin-top: 4px }
.editor-close { flex: none; width: 44px; height: 44px; margin: -8px -8px 0 auto; display: grid; place-items: center; background: transparent; border: none; border-radius: 10px; cursor: pointer; color: var(--ink-35) }
.editor-close:hover { color: var(--ink) }
.editor-body { padding: 16px 0 4px; display: flex; flex-direction: column; gap: 16px }
.editor-row { display: flex; flex-direction: column; gap: 10px }
.editor-label { font-size: 12.5px; font-weight: 800; color: var(--ink-60); font-family: var(--font-b) }
.fields-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px }
.fields-2col label, .spof-input { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-60); font-weight: 700 }
.fields-2col input, .fields-2col select, .spof-input { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.fields-2col input:focus, .fields-2col select:focus, .spof-input:focus { border-color: var(--accent) }
.fields-2col input[readonly] { opacity: .55 }
.oddity-editor-row { align-items: start }
.oddity-choice-field { display: flex; width: 100%; min-width: 0; flex-direction: column; gap: 8px; border: 0; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.oddity-choice-field legend { margin-bottom: 8px }
.oddity-choice-field legend b { color: var(--rouge) }
.oddity-choice-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.oddity-choice-grid label { display: inline-flex; min-width: 0; min-height: 40px; align-items: center; justify-content: center; gap: 7px; border: 1.5px solid var(--line); border-radius: 10px; padding: 7px 9px; background: var(--paper); color: var(--ink-60); cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
.oddity-choice-grid label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.oddity-choice-grid label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px }
.oddity-choice-grid input { flex: none; width: 16px; height: 16px; accent-color: var(--accent) }
.oddity-custom-field { display: flex; flex-direction: column; gap: 5px }
.oddity-custom-field input { min-height: 40px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; outline: none; background: var(--paper); color: var(--ink); font: 13px var(--font-b); transition: border-color .25s, box-shadow .25s }
.oddity-custom-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .14) }
.oddity-custom-field input[aria-invalid="true"] { border-color: var(--rouge) }
.field-error { color: var(--rouge); font-size: 11.5px; font-weight: 700 }
.oddity-schema-preview { display: grid; min-width: min(300px, 100%); flex: 1; gap: 6px }
.oddity-schema-preview > span { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; background: var(--cream) }
.oddity-schema-preview code { color: var(--accent); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.oddity-schema-preview b { overflow: hidden; color: var(--ink); font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap }
.oddity-schema-preview em { color: var(--ink-35); font-size: 10.5px; font-style: normal; white-space: nowrap }
.multi-field { min-width: 0; grid-column: 1 / -1; border: 0 }
.multi-field legend { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.multi-field legend small { flex: none; color: var(--ink-35); font-size: 11px; font-weight: 600 }
.multi-pick { display: flex; flex-wrap: wrap; gap: 8px }
.multi-pick label { min-width: 58px; min-height: 38px; display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; border: 1.5px solid var(--line); border-radius: 10px; padding: 7px 11px; background: var(--paper); color: var(--ink-60); font-size: 13px; font-weight: 800; cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
.multi-pick label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.multi-pick label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px }
.fields-2col .multi-pick input { flex: none; width: 16px; height: 16px; min-height: 16px; padding: 0; border: 0; background: transparent; accent-color: var(--accent) }
.multi-pick .prof-option { min-width: 68px; justify-content: flex-start; padding-left: 13px; border-color: var(--line); border-left: 3px solid var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
.multi-pick .prof-option.on { border-color: var(--line); border-left-color: var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
.multi-pick .prof-option input { accent-color: var(--element-color, var(--accent)) }
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
.sub-del { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border: none; border-radius: 8px; background: transparent; color: var(--ink-35); cursor: pointer }
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
.state-retry { min-width: 44px; min-height: 28px; margin-left: 6px; padding: 2px 6px; border: 0; background: transparent; color: var(--accent-strong); font: inherit; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; cursor: pointer }
.state-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

.admin-bar button:focus-visible,
.ops-btn:focus-visible,
.mobile-actions button:focus-visible,
.editor-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

@media (max-width: 767px) {
  .page-admin-op .hero-sub { display: none }
  .page-admin-op .hero h1 { font-size: 34px }
  .page-admin-op .hero-stats { margin-top: 18px }

  .admin-bar {
    position: sticky;
    top: 64px;
    z-index: 30;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    margin: 16px 0 0;
    padding: 12px;
    border-radius: 14px;
    box-shadow: 0 12px 28px -24px rgba(73, 59, 44, .58);
  }
  .admin-bar .sp { display: none }
  .adm-search-wrap { grid-column: 1 / -1; width: 100%; min-height: 46px; border-radius: 11px }
  .adm-search { min-height: 44px; padding: 0; font-size: 16px }
  .result-count { padding-left: 4px; font-size: 12px }
  .admin-bar .btn { min-height: 44px; padding: 9px 14px }

  .catalog-table-wrap { display: none }
  .catalog-mobile { display: flex; flex-direction: column; gap: 10px; margin-top: 14px }
  .mobile-entry {
    min-width: 0;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .mobile-entry-head { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: start; gap: 10px; padding: 12px 12px 8px }
  .mobile-avatar { width: 46px; height: 46px; border-radius: 10px; object-fit: cover; background: var(--paper); border: 1.5px solid var(--line) }
  .mobile-avatar.op-ph { display: grid; place-items: center; border: 0; font-size: 16px }
  .mobile-identity { min-width: 0 }
  .mobile-identity h2 { overflow-wrap: anywhere; font-family: var(--font-s); font-size: 17px; line-height: 1.3; font-weight: 900; letter-spacing: .04em; color: var(--ink) }
  .mobile-meta { display: flex; min-width: 0; align-items: center; gap: 4px; margin-top: 2px; color: var(--ink-60); font-size: 11px; line-height: 1.4 }
  .mobile-meta code { min-width: 0; overflow: hidden; color: inherit; font-family: var(--font-d); font-size: inherit; text-overflow: ellipsis; white-space: nowrap }
  .mobile-meta span { flex: none; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .mobile-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding-top: 1px }
  .mobile-badges .rarity { font-size: 12px }

  .mobile-tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px }
  .mobile-tags .tag-station { background: transparent }
  .mobile-foot { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 9px; padding: 8px 12px; border-top: 1px dashed var(--line) }
  .mobile-data { display: grid; grid-template-columns: 42px 42px minmax(104px, 1.45fr) minmax(58px, .8fr); width: 100%; min-width: 0 }
  .mobile-data > div { min-width: 0; padding: 0 7px; border-right: 1px solid var(--line) }
  .mobile-data > div:first-child { padding-left: 0 }
  .mobile-data > div:last-child { border-right: 0 }
  .mobile-data dt { color: var(--ink-35); font-size: 9.5px; font-weight: 700; line-height: 1.35 }
  .mobile-data dd { margin-top: 1px; color: var(--ink); font-family: var(--font-d); font-size: 13px; font-weight: 800; line-height: 1.35 }
  .mobile-version dd { overflow: hidden; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap }
  .mobile-oddity { padding-block: 0 !important }
  .mobile-oddity dd { overflow: hidden; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap }
  .mobile-oddity dd.missing { color: var(--rouge) }

  .mobile-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px }
  .mobile-actions button { flex: none; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; cursor: pointer; touch-action: manipulation }
  .mobile-actions .mobile-edit { width: 68px; border: 0; background: var(--tea); color: var(--cream) }
  .mobile-delete { border: 1.5px solid rgba(166, 81, 74, .35); background: transparent; color: var(--rouge) }
  .mobile-actions button:active { opacity: .72 }

  .state { margin-top: 14px; padding: 32px 16px; border-radius: 14px }
  .state-retry { min-height: 44px }

  .editor-mask { align-items: end; padding: 0 }
  .editor-panel { width: 100%; max-height: calc(100dvh - env(safe-area-inset-top)); padding: 0; border-width: 1px 0 0; border-radius: 20px 20px 0 0; overscroll-behavior: contain }
  .editor-head { position: sticky; top: 0; z-index: 3; padding: 16px 16px 12px; background: var(--surface) }
  .editor-head h3 { font-size: 20px }
  .editor-sub { padding-right: 4px; font-size: 11.5px; line-height: 1.5 }
  .editor-body { padding: 16px; gap: 20px }
  .editor-row { gap: 9px }
  .editor-label { font-size: 13px }
  .fields-2col { grid-template-columns: 1fr; gap: 12px }
  .fields-2col label { font-size: 13px }
  .fields-2col input,
  .fields-2col select,
  .spof-input { width: 100%; min-height: 44px; padding: 9px 11px; font-size: 16px }
  .multi-field legend { margin-bottom: 8px; font-size: 13px }
  .oddity-editor-row { flex-direction: column }
  .oddity-choice-field, .oddity-schema-preview { width: 100%; min-width: 0 }
  .oddity-choice-grid { grid-template-columns: 1fr 1fr }
  .oddity-choice-grid label { min-height: 44px }
  .oddity-custom-field input { min-height: 44px; font-size: 16px }
  .multi-field legend small { font-size: 12px }
  .multi-pick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
  .multi-pick label { min-width: 0; min-height: 44px; padding: 8px 5px; font-size: 13px }
  .sub-prof-pick { grid-template-columns: repeat(3, minmax(0, 1fr)) }
  .games-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
  .games-pick label { min-height: 44px; justify-content: center; padding: 8px }
  .games-pick + .editor-label { margin-left: 0 !important }
  .avatar-editor-main { align-items: flex-start; gap: 12px }
  .avatar-preview,
  .avatar-placeholder { width: 72px; height: 72px; flex: none }
  .avatar-actions { min-width: 0; flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
  .avatar-actions .btn { width: 100%; min-height: 44px; padding: 8px }
  .avatar-actions .btn:last-child { grid-column: 1 / -1 }
  .hint { font-size: 12px; line-height: 1.65 }

  .sub-editor { gap: 10px }
  .sub-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 8px; padding: 12px 56px 12px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream) }
  .sub-row input,
  .sub-row select { width: 100%; min-width: 0; min-height: 44px; padding: 8px 10px; font-size: 16px }
  .sub-row .sub-ot,
  .sub-row .sub-desp { grid-column: 1 / -1; min-width: 0 }
  .sub-row .sub-sm,
  .sub-row .sub-color { min-width: 0 }
  .sub-del { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; color: var(--rouge) }
  .btn.mini { min-height: 44px; padding: 8px 12px }

  .editor-notice { font-size: 13px; line-height: 1.55 }
  .editor-actions { position: sticky; bottom: 0; z-index: 3; display: grid; grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr); gap: 8px; margin: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--surface); box-shadow: 0 -12px 28px -24px rgba(73, 59, 44, .58) }
  .editor-actions .btn { min-height: 46px; padding-inline: 10px }
}
</style>
