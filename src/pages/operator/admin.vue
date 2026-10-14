<template>
  <div class="page-operator page-admin-op">
    <IslandSidebar />

    <main id="main-content" class="operator-main">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
          <h1 class="page-header-title">公共密探图鉴</h1>
          <p class="page-header-description">维护全站公共密探目录与导入校验数据。</p>
        </div>
      </header>

      <section class="catalog-content">
        <div class="wrap">
          <!-- 非管理员 / 未授权提示 -->
          <div v-if="forbidden" class="state err banner" role="alert" v-reveal>
            <b>仅管理员可访问</b>：{{ forbidden }} · 请用管理员账号登录后再试
          </div>

          <!-- 目录管理工具条 -->
          <div v-else class="admin-bar" v-reveal>
            <label class="adm-search-wrap">
              <Search :size="18" aria-hidden="true" />
              <input v-model.trim="search" class="adm-search" type="search" aria-label="搜索密探图鉴" placeholder="搜索名称、别名、ID 或属性" />
            </label>
            <span v-if="!loading && !error" class="result-count" aria-live="polite">{{ filteredRows.length }} 位密探</span>
            <span class="sp"></span>
            <button class="btn primary" type="button" @click="openNew">
              <Plus :size="17" aria-hidden="true" />
              新增密探
            </button>
          </div>

          <p v-if="!loading && !error && !forbidden" class="catalog-summary">共 {{ rows.length }} 位 · SP 形态 {{ spCount }} 位 · <span :class="{ warn: missingOddityCount }">奇闻待维护 {{ missingOddityCount }} 位</span></p>

          <!-- 列表 -->
          <div v-if="loading" class="state" role="status" aria-live="polite">正在加载密探公共图鉴…</div>
          <div v-else-if="error" class="state err" role="alert">
            {{ error }}<button class="state-retry" type="button" @click="load">重试</button>
          </div>
          <template v-else>
            <div v-if="filteredRows.length === 0" class="state">没有匹配「{{ search }}」的密探</div>
            <div v-else class="catalog-views">
              <div class="catalog-table-wrap" role="region" aria-label="公共密探目录列表" tabindex="0">
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
                      <td><span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}星</span></td>
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
                      <td class="cell-ver"><code :title="r.catalogVersion">{{ r.catalogVersion }}</code><small>{{ fmtTime(r.createdAt) }}</small></td>
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
                      <span class="rarity" :class="'s' + Math.min(5, r.rarity || 5)">{{ r.rarity || 5 }}星</span>
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
      <div v-if="editing" class="editor-mask" @keyup.esc="closeEditor">
        <div class="editor-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title">
          <div class="editor-head">
            <div>
              <h3 id="catalog-editor-title">{{ isNew ? '新增密探' : (form.name || form.id) }}</h3>
              <p class="editor-sub">{{ isNew ? '写入公共图鉴字典，即时对公共图鉴与导入校验生效' : (form.id + ' · 修改会整条覆盖保存' ) }}</p>
            </div>
            <button class="editor-close" type="button" :disabled="saving || avatarUploading || avatarOptimizing" aria-label="关闭编辑器" @click="closeEditor"><X :size="22" aria-hidden="true" /></button>
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
                    <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" class="avatar-file" :disabled="avatarUploading || avatarOptimizing" @change="onAvatarPick" />
                    <button class="btn ghost mini" type="button" :disabled="avatarUploading || avatarOptimizing" @click="pickAvatar">{{ avatarOptimizing ? '优化中…' : '选择图片' }}</button>
                    <button class="btn primary mini" type="button" :disabled="!form.avatarPick || avatarUploading || avatarOptimizing" @click="uploadAvatar">{{ avatarUploading ? '上传中…' : '上传' }}</button>
                    <button class="btn ghost mini" type="button" :disabled="avatarUploading || avatarOptimizing || !form.avatar" @click="removeAvatar">删除头像</button>
                  </div>
                </div>
                <p class="hint">支持 JPG、PNG、WebP；选择后会在本地自动转为 WebP 并压至 ≤500KB。上传即保存并即时对公共图鉴生效，不依赖下方「保存」按钮</p>
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
                    <option :value="5">5 星</option>
                    <option :value="4">4 星</option>
                    <option :value="3">3 星</option>
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

            <div v-if="notice" class="editor-notice" :class="{ err: noticeError }" :role="noticeError ? 'alert' : 'status'">{{ notice }}</div>
          </div>

          <div class="editor-actions">
            <button class="btn ghost" type="button" :disabled="saving || avatarUploading || avatarOptimizing" @click="closeEditor">取消</button>
            <button class="btn primary" type="button" :disabled="saving || avatarUploading || avatarOptimizing" @click="save">
              {{ saving ? '保存中…' : (isNew ? '新增到公共图鉴' : '保存修改') }}
            </button>
          </div>
        </div>
      </div>

      <SiteFooter>
        <template #big>密探公共图鉴<br><span>管理端</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探公共图鉴管理<br>
          仅具有公共图鉴写入权限的管理员可增删改查 · 与个人密探养成档案隔离<br>
          改动即时生效，请谨慎操作
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Pencil, Plus, Search, Trash2, X, ArrowLeft } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import '../../styles/page-header.css'
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
import { IMAGE_UPLOAD_PROFILES, prepareImageUpload } from '../../utils/imageUpload.js'
import { adminCatalogEntries, compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
import { elementAppearance } from '../../data/inventory/elementColors.js'
import { OPERATOR_ODDITY_KEYS, normalizeOperatorOdditySchema } from '../../utils/operatorCombatStats.js'

const rows = ref([])
const router = useRouter()
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
const avatarOptimizing = ref(false)
const avatarInput = ref(null)

const PROF_OPTIONS = ['地', '水', '火', '风', '阳', '阴', '混沌']
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
  if (avatarUploading.value || avatarOptimizing.value) return
  revokeAvatarPreview()
  editing.value = false
}

function revokeAvatarPreview() {
  const preview = form.value.avatarPreview
  if (preview && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(preview)
  }
  form.value.avatarPreview = ''
}

function pickAvatar() {
  const el = avatarInput.value
  if (el) { el.value = ''; el.click() }
}

async function onAvatarPick(e) {
  const file = e.target.files && e.target.files[0]
  if (e.target) e.target.value = ''
  if (!file) return

  revokeAvatarPreview()
  form.value.avatarPick = null
  avatarOptimizing.value = true
  notice.value = '正在本地优化头像…'
  noticeError.value = false

  try {
    const optimized = await prepareImageUpload(file, IMAGE_UPLOAD_PROFILES.AVATAR)
    form.value.avatarPick = optimized.file
    form.value.avatarPreview = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(optimized.file)
      : ''
    notice.value = ''
  } catch (err) {
    notice.value = err?.message || '头像优化失败，请更换图片后重试'
    noticeError.value = true
  } finally {
    avatarOptimizing.value = false
  }
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
  if (!/^image\/webp$/i.test(file.type)) { notice.value = '头像优化结果不是 WebP，请重新选择图片'; noticeError.value = true; return }
  if (file.size > 500 * 1024) { notice.value = '头像优化后仍超过 500KB，请重新选择图片'; noticeError.value = true; return }
  avatarUploading.value = true
  notice.value = ''
  noticeError.value = false
  try {
    const saved = await uploadAdminOperatorAvatar(form.value.id, file)
    const path = (saved && saved.avatar) || '/avatar/' + form.value.id + '.webp'
    const row = rows.value.find(function (r) { return r.id === form.value.id })
    if (row) row.avatar = path
    form.value.avatar = path
    revokeAvatarPreview()
    form.value.avatarPick = null
    notice.value = '头像已上传，即时对公共图鉴生效'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
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
    revokeAvatarPreview()
    form.value.avatarPick = null
    notice.value = '头像已删除'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
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
    if (await leaveIfForbidden(err)) return
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
    if (await leaveIfForbidden(err)) return
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
    if (await leaveIfForbidden(err)) return
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

async function leaveIfForbidden(errorValue) {
  if (!errorValue || errorValue.status !== 403) return false
  rows.value = []
  closeEditor()
  await router.replace({ path: '/forbidden', query: { from: '/operator/admin' } })
  return true
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* —— 复用全局 CSS 变量，对齐密探页（operator/index.vue）版式与配色规范 —— */
.catalog-summary { color: var(--ink-60) }
.catalog-summary .warn { color: var(--rouge) }
.catalog-table-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

.banner { background: rgba(166, 81, 74, .08) }

.admin-bar { border-block: 1px solid var(--line) }
.adm-search-wrap { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-35); background: var(--paper); transition: border-color .25s, box-shadow .25s }
.adm-search-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .14) }
.adm-search { border: 0; color: var(--ink); background: transparent; outline: none }
.adm-search::placeholder { color: var(--ink-35) }
.result-count { color: var(--ink-60) }

.catalog-table-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.catalog-table { border-collapse: separate; border-spacing: 0 }
.catalog-table th { color: var(--ink-60); border-bottom: 1px dashed var(--line) }
.catalog-table td { border-bottom: 1px solid rgba(156, 122, 77, .12) }
.catalog-table tbody tr:last-child td { border-bottom: none }
.catalog-table tbody tr:hover { background: rgba(156, 122, 77, .05) }
.op-ph { border-radius: 10px; color: var(--cream) }
.op-avatar { border-radius: 10px; background: var(--paper); border: 1.5px solid var(--line) }
.op-ph.s3 { background: var(--yellow-deep); color: var(--ink) }
.op-ph.s4 { background: var(--accent) }
.op-ph.s5 { background: var(--tea) }

/* —— 编辑弹窗头像区 —— */
.avatar-preview { border-radius: 14px; background: var(--paper); border: 1.5px solid var(--line) }
.avatar-placeholder { border-radius: 14px; background: var(--paper); border: 1.5px dashed var(--line); color: var(--ink-35) }
.op-name small { color: var(--ink-35) }
.op-name em { color: var(--ink-60) }
.rarity.s3 { color: var(--yellow-deep) }
.rarity.s4 { color: var(--accent) }
.rarity.s5 { color: var(--tea) }
.tag-prof { border: 1px solid var(--element-color, var(--yellow-deep)); border-radius: 6px; background: var(--surface); color: var(--ink); box-shadow: inset 3px 0 var(--element-color, var(--yellow-deep)) }
.tag-subprof { border: 1px solid var(--yellow-deep); border-radius: 6px; background: var(--yellow); color: var(--ink) }
.tag-station { border: 1.5px solid var(--line); color: var(--ink); border-radius: 6px }
.tag-sp { background: var(--tea); color: var(--cream); border-radius: 6px }
.cell-oddity small { color: var(--ink-35) }
.oddity-missing { color: var(--rouge) }
.oddity-ready { color: var(--ink) }
.muted { color: var(--ink-35) }
.cell-ver code { color: var(--ink-60) }
.cell-ver small { color: var(--ink-35) }
.ops-col { background: var(--surface); box-shadow: -10px 0 16px -16px rgba(73, 59, 44, .72) }
.catalog-table tbody tr:hover .ops-col { background: color-mix(in srgb, var(--surface) 95%, var(--tea)) }
.ops-btn { border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; cursor: pointer; transition: all .25s }
.ops-btn:hover { border-color: var(--ink); color: var(--ink) }
.ops-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ops-btn.danger:hover { background: rgba(166, 81, 74, .1) }

/* —— 弹窗 —— */
.editor-mask { background: rgba(73, 59, 44, .34); backdrop-filter: blur(2px) }
.editor-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4) }
.editor-head { border-bottom: 1px dashed var(--line) }
.editor-head h3 { color: var(--ink) }
.editor-sub { color: var(--ink-60) }
.editor-close { background: transparent; border: none; border-radius: 10px; cursor: pointer; color: var(--ink-35) }
.editor-close:hover { color: var(--ink) }
.editor-label { color: var(--ink-60) }
.fields-2col label, .spof-input { color: var(--ink-60) }
.fields-2col input, .fields-2col select, .spof-input { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.fields-2col input:focus, .fields-2col select:focus, .spof-input:focus { border-color: var(--accent) }
.fields-2col input[readonly] { opacity: .55 }
.oddity-choice-field { border: 0; color: var(--ink-60) }
.oddity-choice-field legend b { color: var(--rouge) }
.oddity-choice-grid label { border: 1.5px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink-60); cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
.oddity-choice-grid label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.oddity-choice-grid label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px }
.oddity-choice-grid input { accent-color: var(--accent) }
.oddity-custom-field input { border: 1.5px solid var(--line); border-radius: 10px; outline: none; background: var(--paper); color: var(--ink); transition: border-color .25s, box-shadow .25s }
.oddity-custom-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .14) }
.oddity-custom-field input[aria-invalid="true"] { border-color: var(--rouge) }
.field-error { color: var(--rouge) }
.oddity-schema-preview > span { border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.oddity-schema-preview code { color: var(--accent) }
.oddity-schema-preview b { color: var(--ink) }
.oddity-schema-preview em { color: var(--ink-35) }
.multi-field { border: 0 }
.multi-field legend { color: var(--ink-60) }
.multi-field legend small { color: var(--ink-35) }
.multi-pick label { border: 1.5px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink-60); cursor: pointer; transition: border-color .2s, background-color .2s, color .2s }
.multi-pick label.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.multi-pick label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px }
.fields-2col .multi-pick input { border: 0; background: transparent; accent-color: var(--accent) }
.multi-pick .prof-option { border-color: var(--line); border-left: 3px solid var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
.multi-pick .prof-option.on { border-color: var(--line); border-left-color: var(--element-color, var(--yellow-deep)); background: var(--paper); color: var(--element-text-color, var(--ink)) }
.multi-pick .prof-option input { accent-color: var(--element-color, var(--accent)) }
.games-pick label { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-60); cursor: pointer; transition: all .25s; background: var(--paper) }
.games-pick label.on { background: var(--yellow); color: var(--ink); border-color: var(--yellow-deep) }
.games-pick input { accent-color: var(--accent) }
.sub-row input, .sub-row select { border: 1.5px solid var(--line); border-radius: 9px; color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.sub-row input:focus, .sub-row select:focus { border-color: var(--accent) }
.sub-del { border: none; border-radius: 8px; background: transparent; color: var(--ink-35); cursor: pointer }
.sub-del:hover { color: var(--rouge) }
.hint { color: var(--ink-35) }

.editor-notice { border-radius: 12px; background: rgba(167, 209, 169, .25); color: var(--ink) }
.editor-notice.err { background: rgba(166, 81, 74, .1); color: var(--rouge) }
.editor-actions { border-top: 1px dashed var(--line) }

.btn { border-radius: 12px; cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }
.btn.primary { background: var(--tea); color: var(--cream) }
.btn.primary:hover:not(:disabled) { background: var(--tea-deep) }

.state { color: var(--ink-60); background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.state.err { color: var(--rouge) }
.state-retry { border: 0; background: transparent; color: var(--accent-strong); text-decoration: underline; text-underline-offset: 3px; cursor: pointer }
.state-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

.admin-bar button:focus-visible,
.ops-btn:focus-visible,
.mobile-actions button:focus-visible,
.editor-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

@media (max-width: 767px) {
  .admin-bar {
    background: var(--paper);
    box-shadow: 0 12px 28px -24px rgba(73, 59, 44, .58);
  }
  .adm-search-wrap { border-radius: 11px }
  .mobile-entry {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .mobile-avatar { border-radius: 10px; background: var(--paper); border: 1.5px solid var(--line) }
  .mobile-avatar.op-ph { border: 0 }
  .mobile-identity h2 { color: var(--ink) }
  .mobile-meta { color: var(--ink-60) }
  .mobile-meta code { color: inherit }
  .mobile-tags .tag-station { background: transparent }
  .mobile-foot { border-top: 1px dashed var(--line) }
  .mobile-data > div { border-right: 1px solid var(--line) }
  .mobile-data > div:last-child { border-right: 0 }
  .mobile-data dt { color: var(--ink-35) }
  .mobile-data dd { color: var(--ink) }
  .mobile-oddity dd.missing { color: var(--rouge) }
  .mobile-actions button { border-radius: 9px; cursor: pointer }
  .mobile-actions .mobile-edit { border: 0; background: var(--tea); color: var(--cream) }
  .mobile-delete { border: 1.5px solid rgba(166, 81, 74, .35); background: transparent; color: var(--rouge) }
  .mobile-actions button:active { opacity: .72 }

  .state { border-radius: 14px }
  .editor-panel { border-width: 1px 0 0; border-radius: 20px 20px 0 0 }
  .editor-head { background: var(--surface) }
  .sub-row { border: 1px solid var(--line); border-radius: 12px; background: var(--cream) }
  .sub-del { color: var(--rouge) }
  .editor-actions { background: var(--surface); box-shadow: 0 -12px 28px -24px rgba(73, 59, 44, .58) }
}
</style>
<style scoped src="./operatorAdminDesktop.css"></style>
<style scoped src="./operatorAdminMobile.css"></style>
