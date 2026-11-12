<template>
  <section v-if="editing" ref="editorPanel" class="editor-panel" aria-labelledby="catalog-editor-title" :aria-busy="busy">
    <div class="editor-head">
      <button v-if="compact" class="btn ghost mini editor-back" type="button" :disabled="busy || checkingLeave" @click="backToList"><ArrowLeft :size="16" aria-hidden="true" />返回列表</button>
      <img v-if="headerAvatarSrc && headerAvatarSrc !== failedAvatarSrc" :src="headerAvatarSrc" class="editor-head-avatar" alt="" width="56" height="56" @error="failedAvatarSrc = $event.target.getAttribute('src')" />
      <span v-else class="editor-head-avatar op-ph" aria-hidden="true">{{ monogram(form) }}</span>
      <div class="editor-heading">
        <h2 id="catalog-editor-title" tabindex="-1">{{ isNew ? '新增密探' : (form.name || form.id) }}</h2>
        <p class="editor-sub" :title="selectedRow?.catalogVersion ? '目录版本：' + selectedRow.catalogVersion : undefined">{{ isNew ? '新增密探 · 尚未保存' : form.id + ' · ' + form.rarity + '星' + (selectedRow?.createdAt ? ' · 更新于 ' + fmtTime(selectedRow.createdAt) : '') }}</p>
        <div class="avatar-actions" title="头像单独上传，上传后立即生效，无需点保存">
          <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" class="avatar-file" :disabled="busy || checkingLeave" @change="onAvatarPick" />
          <button class="editor-text-button" type="button" :disabled="busy || checkingLeave" @click="pickAvatar">{{ avatarOptimizing ? '优化中…' : '更换头像' }}</button>
          <button v-if="form.avatar" class="editor-text-button danger" type="button" :disabled="busy || checkingLeave" @click="removeAvatar">删除头像</button>
          <template v-if="form.avatarPick">
            <button class="editor-text-button" type="button" :disabled="busy || checkingLeave" @click="uploadAvatar">{{ avatarUploading ? '上传中…' : '上传新头像' }}</button>
            <button class="editor-text-button" type="button" :disabled="busy || checkingLeave" @click="discardAvatar">放弃</button>
          </template>
          <span v-if="avatarNotice" class="avatar-notice" :class="{ err: avatarNoticeError }" :role="avatarNoticeError ? 'alert' : 'status'">{{ avatarNotice }}</span>
        </div>
      </div>
      <button v-if="!isNew && selectedRow" class="editor-text-button catalog-delete danger" type="button" :disabled="busy || checkingLeave" @click="onDelete(selectedRow)"><Trash2 :size="14" aria-hidden="true" />删除密探</button>
    </div>
    <nav class="editor-nav" aria-label="编辑器段落">
      <button v-for="section in ['基础', '奇闻', '命盘', '星石']" :key="section" type="button" :class="{ active: activeSection === section }" @click="scrollToSection(section)">{{ section }}{{ section === '命盘' ? ' ' + form.discs.length : section === '星石' ? ' ' + form.starStones.length : '' }}</button>
    </nav>
    <fieldset ref="editorBody" class="editor-body" aria-label="密探资料" :disabled="busy || checkingLeave" @focusin="onEditorFocus">
      <section id="catalog-基础" class="editor-row">
        <h3 class="editor-label">基础</h3>
        <div class="fields-2col">
          <label>ID（char_xxx）<input :readonly="!isNew" v-model.trim="form.id" placeholder="char_090_new" @input="onAliasSourceInput" /></label>
          <label>名称 <input v-model.trim="form.name" placeholder="杨修" @input="onAliasSourceInput" /></label>
          <label>别名
            <input v-model.trim="form.alias" placeholder="搜索别名，可空" aria-label="别名" aria-describedby="catalog-alias-hint" @input="onAliasInput" />
            <span v-show="generatedAlias !== null || (form.id && form.name)" id="catalog-alias-hint" class="alias-hint hint">
              <span v-if="aliasAuto && generatedAlias !== null">根据 ID 和名称自动生成，可直接修改</span>
              <button v-if="generatedAlias !== null && generatedAlias !== form.alias" class="editor-text-button alias-regenerate" type="button" :title="generatedAlias" @click="regenerateAlias">按 ID 和名称重新生成</button>
              <span v-if="generatedAlias === null && form.id && form.name">无法从 ID 推断拼音，请手动填写别名</span>
            </span>
          </label>
          <label>稀有度
            <select v-model="form.rarity">
              <option :value="5">5 星</option>
              <option :value="4">4 星</option>
              <option :value="3">3 星</option>
            </select>
          </label>
          <fieldset class="multi-field">
            <legend>属性 <small v-if="!form.profs.length">可多选</small></legend>
            <div class="multi-pick prof-pick">
              <label v-for="prof in PROF_OPTIONS" :key="prof" class="prof-option" :class="{ on: form.profs.includes(prof) }" :style="profStyle(prof)">
                <input v-model="form.profs" type="checkbox" :value="prof" :aria-label="prof" />
                <span>{{ prof }}</span>
              </label>
            </div>
          </fieldset>
          <fieldset class="multi-field">
            <legend>职业 <small v-if="!form.subProfs.length">可多选</small></legend>
            <div class="multi-pick sub-prof-pick">
              <label v-for="option in subProfOptions" :key="option.value" :class="{ on: form.subProfs.includes(option.value) }">
                <input v-model="form.subProfs" type="checkbox" :value="option.value" />
                {{ option.label }}
              </label>
            </div>
          </fieldset>
          <fieldset class="version-field">
            <legend>版本</legend>
            <div class="games-pick">
              <label v-for="game in ['如鸢', '代号鸢']" :key="game" :class="{ on: form.games.includes(game) }"><input v-model="form.games" type="checkbox" :value="game" />{{ game }}</label>
            </div>
          </fieldset>
          <div ref="spPicker" class="sp-picker-field">
            <span id="catalog-sp-label" class="sp-picker-label">SP 本体</span>
            <div class="sp-picker-control">
              <button ref="spTrigger" class="sp-picker-trigger" :class="{ 'sp-missing': form.spOf && !spSelectedRow }" type="button" :disabled="busy || checkingLeave" aria-haspopup="listbox" :aria-expanded="spOpen" aria-controls="catalog-sp-options" aria-labelledby="catalog-sp-label catalog-sp-value" @click="toggleSpPicker" @keydown.down.prevent="openSpPicker(1)" @keydown.up.prevent="openSpPicker(-1)">
                <template v-if="spSelectedRow">
                  <img v-if="spAvatar(spSelectedRow) && !spAvatarFailures.has(spAvatar(spSelectedRow))" class="sp-picker-avatar" :src="spAvatar(spSelectedRow)" alt="" width="30" height="30" @error="spAvatarFailures.add($event.target.getAttribute('src'))" />
                  <span v-else class="sp-picker-avatar sp-picker-placeholder" aria-hidden="true">{{ monogram(spSelectedRow) }}</span>
                  <span id="catalog-sp-value" class="sp-picker-identity"><b>{{ spSelectedRow.name || spSelectedRow.id }}</b><small>{{ spSelectedRow.id }}</small></span>
                </template>
                <span v-else id="catalog-sp-value" :class="{ 'sp-picker-empty': !form.spOf }">{{ form.spOf ? form.spOf + '（目录中未找到）' : '不是 SP 形态' }}</span>
                <ChevronDown :size="16" class="sp-picker-chevron" aria-hidden="true" />
              </button>
              <button v-if="form.spOf" class="editor-text-button sp-picker-clear" type="button" :disabled="busy || checkingLeave" aria-label="清除 SP 本体" @click="chooseSp('')">清除</button>
            </div>
          </div>
        </div>
      </section>

      <section id="catalog-奇闻" class="editor-row oddity-editor-row">
        <h3 class="editor-label">奇闻</h3>
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
          <small id="special-oddity-hint" class="hint">这里只修改名称，上限会按品质自动计算。</small>
          <small v-show="specialOddityError" id="special-oddity-error" class="field-error" role="alert">{{ specialOddityError }}</small>
        </fieldset>
        <dl class="oddity-schema-preview" aria-label="奇闻稳定键与当前服务端上限">
          <div v-for="key in ODDITY_KEYS" :key="key" :title="key"><dt>{{ oddityPreviewName(key) }}</dt><dd>上限 {{ oddityPreviewMax(key) }}</dd></div>
        </dl>
      </section>

      <section id="catalog-命盘" class="editor-row">
        <h3 class="editor-label">命盘 {{ form.discs.length }}</h3>
        <div class="sub-editor">
          <p class="hint">命盘顺序会影响自动编队，已有密探请勿调整顺序</p>
          <div class="disc-columns" aria-hidden="true"><span>#</span><span>名称 ot_name</span><span>简称</span><span>颜色</span><span>描述</span><span>别名</span><span>操作</span></div>
          <div v-for="(d, i) in form.discs" :key="d._key" class="disc-editor-item">
            <div class="disc-row">
              <span class="disc-number"><span class="compact-label">命盘 </span>{{ i + 1 }}</span>
              <label class="disc-name"><span class="compact-label">名称 ot_name</span><input v-model.trim="d.ot_name" :aria-label="'命盘 ' + (i + 1) + ' 名称'" placeholder="ot_name（必填，唯一）" /></label>
              <label class="disc-abbreviation"><span class="compact-label">简称</span><input v-model.trim="d.abbreviation" :aria-label="'命盘 ' + (i + 1) + ' 简称'" placeholder="简称" /></label>
              <div class="disc-color" role="radiogroup" :aria-label="'命盘 ' + (i + 1) + ' 颜色'">
                <label v-for="color in ['金', '紫', '蓝']" :key="color" class="disc-color-choice" :data-color="color">
                  <input v-model="d.color" class="disc-color-input" type="radio" :name="'disc-color-' + d._key" :value="color" />
                  <span class="disc-color-swatch">{{ color }}</span>
                </label>
              </div>
              <label class="disc-description"><span class="compact-label">描述</span><textarea v-model.trim="d.desp" rows="1" :aria-label="'命盘 ' + (i + 1) + ' 描述'" placeholder="描述" @input="resizeDescription($event.target)" /></label>
              <button class="editor-text-button aliases-toggle" :class="{ muted: !aliasCount(d) }" type="button" :aria-expanded="expandedAliases.has(d._key)" :aria-controls="'disc-aliases-' + d._key" @click="toggleAliases(d)">{{ aliasCount(d) ? '别名 ' + aliasCount(d) : '+ 别名' }}</button>
              <button class="sub-del danger" type="button" :aria-label="'删除第 ' + (i + 1) + ' 条命盘'" @click="removeDisc(d)"><Trash2 :size="18" aria-hidden="true" /></button>
            </div>
            <div v-if="expandedAliases.has(d._key)" :id="'disc-aliases-' + d._key" class="disc-alias-panel">
              <label class="disc-aliases">OCR 别名<textarea v-model="d.aliasesText" rows="2" :aria-label="'命盘 ' + (i + 1) + ' OCR 别名'" placeholder="输入错读或旧标准名，可空" /></label>
              <label class="disc-aliases">描述别名<textarea v-model="d.despAliasesText" rows="2" :aria-label="'命盘 ' + (i + 1) + ' 描述别名'" placeholder="输入描述的其他写法，用于未解锁命盘识别，可空" /></label>
              <p class="hint">每行一个，各最多 20 个；OCR 别名每个最多 64 字符，描述别名每个最多 256 字符。</p>
            </div>
          </div>
          <button class="btn ghost mini" type="button" @click="addDisc"><Plus :size="16" aria-hidden="true" />添加命盘</button>
        </div>
      </section>

      <section id="catalog-星石" class="editor-row">
        <h3 class="editor-label">星石槽 {{ form.starStones.length }}</h3>
        <div class="sub-editor">
          <p class="hint">目录星石只是槽位模板，不展示给公共图鉴，只用于校验用户导入。</p>
          <div class="stone-columns" aria-hidden="true"><span>星石名</span><span>类型</span><span>操作</span></div>
          <div v-for="(s, i) in form.starStones" :key="i" class="stone-row">
            <label><span class="compact-label">星石名</span><input v-model.trim="s.name" placeholder="星石名" :aria-label="'星石槽 ' + (i + 1) + ' 名称'" /></label>
            <label><span class="compact-label">类型</span><select v-model="s.type" :aria-label="'星石槽 ' + (i + 1) + ' 类型'">
              <option value="main">主星石 main</option>
              <option value="assist">辅星石 assist</option>
            </select></label>
            <button class="sub-del danger" type="button" :aria-label="'删除第 ' + (i + 1) + ' 个星石槽'" @click="form.starStones.splice(i, 1)"><Trash2 :size="18" aria-hidden="true" /></button>
          </div>
          <button class="btn ghost mini" type="button" @click="form.starStones.push({ name: '', type: 'main' })"><Plus :size="16" aria-hidden="true" />添加星石槽</button>
        </div>
      </section>
    </fieldset>

    <footer class="editor-actions">
      <div class="editor-status"><p role="status">{{ isNew ? '尚未保存' : dirty ? '有未保存的修改' : '已与公共图鉴一致' }}</p><p v-if="notice" class="editor-notice" :class="{ err: noticeError }" :role="noticeError ? 'alert' : 'status'">{{ notice }}</p></div>
      <div class="editor-buttons">
        <button class="btn ghost" type="button" :disabled="busy || checkingLeave || (!dirty && !isNew)" @click="discardChanges">放弃修改</button>
        <button class="btn primary" type="button" :disabled="busy || checkingLeave || (!dirty && !isNew)" @click="save">
          {{ saving ? '保存中…' : (isNew ? '新增到公共图鉴' : '保存修改') }}
        </button>
      </div>
    </footer>
    <Teleport to="body">
      <div v-if="spOpen" ref="spPopup" class="operator-sp-picker-popup" :style="spPosition" @keydown="onSpKeydown">
        <input ref="spSearchInput" v-model="spSearch" class="operator-sp-picker-search" type="search" role="combobox" aria-label="搜索 SP 本体名称、别名或 ID" aria-autocomplete="list" aria-expanded="true" aria-controls="catalog-sp-options" :aria-activedescendant="'catalog-sp-option-' + spActiveIndex" autocomplete="off" placeholder="搜索名称、别名或 ID" @input="spActiveIndex = 0" />
        <div id="catalog-sp-options" ref="spOptionsPanel" class="operator-sp-picker-options" role="listbox" aria-labelledby="catalog-sp-label">
          <div v-for="(row, index) in spOptions" :id="'catalog-sp-option-' + index" :key="row?.id || '__none__'" class="operator-sp-picker-option" :class="{ active: spActiveIndex === index }" role="option" :aria-selected="form.spOf === (row?.id || '')" @pointerdown.prevent @click="chooseSp(row?.id || '')">
            <template v-if="row">
              <img v-if="spAvatar(row) && !spAvatarFailures.has(spAvatar(row))" class="sp-picker-avatar" :src="spAvatar(row)" alt="" width="30" height="30" @error="spAvatarFailures.add($event.target.getAttribute('src'))" />
              <span v-else class="sp-picker-avatar sp-picker-placeholder" aria-hidden="true">{{ monogram(row) }}</span>
              <span class="sp-picker-identity"><b>{{ row.name || row.id }}</b><small>{{ row.id }}</small></span>
              <span class="operator-sp-picker-rarity">{{ row.rarity || 5 }}星</span>
            </template>
            <span v-else>无（不是 SP 形态）</span>
            <Check v-if="form.spOf === (row?.id || '')" :size="16" class="operator-sp-picker-check" aria-hidden="true" />
          </div>
          <p v-if="spSearch && spOptions.length === 1" class="operator-sp-picker-empty" role="status">没有匹配的本体密探</p>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Plus, Trash2, ArrowLeft, Check, ChevronDown } from '@lucide/vue'
import { createAdminOperatorCatalog, updateAdminOperatorCatalog, deleteAdminOperatorCatalog, uploadAdminOperatorAvatar, deleteAdminOperatorAvatar } from '../../api/operator.js'
import { dialog } from '../../utils/dialog.js'
import { IMAGE_UPLOAD_PROFILES, prepareImageUpload } from '../../utils/imageUpload.js'
import { elementAppearance } from '../../data/inventory/elementColors.js'
import { OPERATOR_ODDITY_KEYS, normalizeOperatorOdditySchema } from '../../utils/operatorCombatStats.js'
import { generateOperatorAlias } from '../../utils/operatorAlias.js'

const props = defineProps({
  rows: { type: Array, required: true },
  compact: Boolean,
  reload: { type: Function, required: true },
  avatarSrc: { type: Function, required: true },
  onForbidden: { type: Function, required: true }
})
const emit = defineEmits(['back', 'avatar-updated'])
const rows = computed(function () { return props.rows })
const compact = computed(function () { return props.compact })
const ODDITY_KEYS = OPERATOR_ODDITY_KEYS
const SPECIAL_ODDITY_PRESETS = ['增伤值', '免伤值', '治疗加成']
const CUSTOM_ODDITY_OPTION = '__custom__'

// —— 新增 / 编辑 ——
let discKey = 0
const editing = ref(false)
const isNew = ref(false)
const form = ref(blankForm())
const aliasAuto = ref(true)
const generatedAlias = computed(function () { return generateOperatorAlias(form.value.id, form.value.name) })
const notice = ref('')
const noticeError = ref(false)
const saving = ref(false)
const specialOddityError = ref('')
const selectedId = ref('')
const selectedRow = computed(function () { return rows.value.find(function (r) { return r.id === selectedId.value }) })
const editorPanel = ref(null)
const editorBody = ref(null)
const initialSnapshot = ref('')
const expandedAliases = ref(new Set())
const activeSection = ref('基础')
const checkingLeave = ref(false)
const busy = computed(function () { return saving.value || avatarUploading.value || avatarOptimizing.value })
const dirty = computed(function () { return editing.value && snapshot() !== initialSnapshot.value })
let previousId = ''
let permissionRedirect = false
let disposed = false
let resizeFrame = 0

// —— 头像上传 / 删除 ——
const avatarUploading = ref(false)
const avatarOptimizing = ref(false)
const avatarInput = ref(null)
const avatarNotice = ref('')
const avatarNoticeError = ref(false)
const failedAvatarSrc = ref('')
const headerAvatarSrc = computed(function () { return form.value.avatarPreview || (form.value.avatar ? props.avatarSrc(form.value.avatar) : '') })

// SP 选择器状态不进入表单和 dirty 快照。
const spPicker = ref(null)
const spTrigger = ref(null)
const spPopup = ref(null)
const spSearchInput = ref(null)
const spOptionsPanel = ref(null)
const spOpen = ref(false)
const spSearch = ref('')
const spActiveIndex = ref(0)
const spPosition = ref({})
const spAvatarFailures = ref(new Set())
const spSelectedRow = computed(function () { return props.rows.find(function (row) { return row.id === form.value.spOf }) })
const spOptions = computed(function () {
  const q = spSearch.value.trim().toLowerCase()
  return [null].concat(props.rows.filter(function (row) {
    const allowed = row.id === form.value.spOf || (row.id !== form.value.id && !row.spOf)
    const hay = [row.name, row.alias, row.id].filter(Boolean).join(' ').toLowerCase()
    return allowed && (!q || hay.indexOf(q) !== -1)
  }))
})

function spAvatar(row) {
  return row.avatar ? props.avatarSrc(row.avatar) : ''
}

function updateSpPosition(event) {
  if (!spOpen.value || (event?.target instanceof Node && spPopup.value?.contains(event.target))) return
  const rect = spTrigger.value?.getBoundingClientRect()
  const bodyRect = editorBody.value?.getBoundingClientRect()
  if (!rect || !bodyRect) return
  if (rect.bottom <= bodyRect.top || rect.top >= bodyRect.bottom) { closeSpPicker(); return }
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft || 0
  const top = viewport?.offsetTop || 0
  const width = viewport?.width || window.innerWidth
  const height = viewport?.height || window.innerHeight
  const anchorTop = Math.max(top + 8, Math.min(rect.top, top + height - 8))
  const anchorBottom = Math.max(top + 8, Math.min(rect.bottom, top + height - 8))
  const below = Math.max(0, top + height - anchorBottom - 8)
  const above = Math.max(0, anchorTop - top - 8)
  const dropUp = below < 340 && above > below
  const popupWidth = Math.min(Math.max(300, rect.width), width - 16)
  spPosition.value = {
    left: Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8)) + 'px',
    width: popupWidth + 'px',
    maxHeight: Math.min(340, dropUp ? above : below) + 'px',
    top: dropUp ? 'auto' : anchorBottom + 6 + 'px',
    bottom: dropUp ? window.innerHeight - anchorTop + 6 + 'px' : 'auto'
  }
}

async function revealSpOption() {
  await nextTick()
  spOptionsPanel.value?.querySelectorAll('[role="option"]')[spActiveIndex.value]?.scrollIntoView({ block: 'nearest' })
}

async function openSpPicker(direction = 0) {
  if (busy.value || checkingLeave.value) return
  if (!spOpen.value) {
    spSearch.value = ''
    spOpen.value = true
    const selected = spOptions.value.findIndex(function (row) { return (row?.id || '') === form.value.spOf })
    spActiveIndex.value = Math.max(0, selected)
  }
  spActiveIndex.value = Math.max(0, Math.min(spOptions.value.length - 1, spActiveIndex.value + direction))
  await nextTick()
  updateSpPosition()
  spSearchInput.value?.focus({ preventScroll: true })
  await revealSpOption()
}

function toggleSpPicker() {
  if (spOpen.value) closeSpPicker()
  else void openSpPicker()
}

function closeSpPicker(restoreFocus = false) {
  spOpen.value = false
  if (restoreFocus) nextTick(function () { spTrigger.value?.focus({ preventScroll: true }) })
}

function chooseSp(id) {
  if (busy.value || checkingLeave.value) return
  form.value.spOf = id
  closeSpPicker(true)
}

function onSpKeydown(event) {
  if (event.isComposing) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    spActiveIndex.value = Math.max(0, Math.min(spOptions.value.length - 1, spActiveIndex.value + (event.key === 'ArrowDown' ? 1 : -1)))
    void revealSpOption()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    chooseSp(spOptions.value[spActiveIndex.value]?.id || '')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeSpPicker(true)
  } else if (event.key === 'Tab') {
    closeSpPicker()
    spTrigger.value?.focus({ preventScroll: true })
  }
}

function onSpPointerDown(event) {
  if (spOpen.value && !spPicker.value?.contains(event.target) && !spPopup.value?.contains(event.target)) closeSpPicker()
}

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
    discs: Array.from({ length: 12 }, function () {
      return { _key: ++discKey, _persisted: false, ot_name: '', abbreviation: '', color: '金', desp: '', aliasesText: '', despAliasesText: '' }
    }),
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
        _key: ++discKey,
        _persisted: true,
        ot_name: d.ot_name || d.otName || '',
        abbreviation: d.abbreviation || '',
        color: d.color || '金',
        desp: d.desp || '',
        aliasesText: Array.isArray(d.aliases) ? d.aliases.join('\n') : '',
        despAliasesText: Array.isArray(d.desp_aliases) ? d.desp_aliases.join('\n') : ''
      }
    }),
    starStones: r.starStones.map(function (s) {
      return { name: s.name || '', type: s.type || 'main' }
    })
  }
}

function snapshot() {
  const { avatar, avatarPick, avatarPreview, ...content } = form.value
  return JSON.stringify({ ...content, discs: content.discs.map(function ({ _key, _persisted, ...disc }) { return disc }) })
}

function onAliasSourceInput(event) {
  if (event.isComposing || event.target.composing) return
  if (aliasAuto.value && generatedAlias.value !== null) form.value.alias = generatedAlias.value
}

function onAliasInput(event) {
  if (event.isComposing || event.target.composing) return
  aliasAuto.value = form.value.alias === generatedAlias.value
}

function regenerateAlias() {
  if (busy.value || checkingLeave.value || generatedAlias.value === null) return
  form.value.alias = generatedAlias.value
  aliasAuto.value = true
}

async function canLeave() {
  if (busy.value || checkingLeave.value) return false
  if (!dirty.value) return true
  checkingLeave.value = true
  try {
    return await dialog.confirm({ title: '放弃未保存的修改？', message: '「' + (form.value.name || form.value.id || '新增密探') + '」有尚未保存的修改。', confirmText: '放弃修改', cancelText: '继续编辑' })
  } finally {
    checkingLeave.value = false
  }
}

async function resetEditor() {
  closeSpPicker()
  aliasAuto.value = !form.value.alias || form.value.alias === generatedAlias.value
  notice.value = ''
  noticeError.value = false
  avatarNotice.value = ''
  avatarNoticeError.value = false
  specialOddityError.value = ''
  expandedAliases.value = new Set()
  activeSection.value = '基础'
  editing.value = true
  initialSnapshot.value = snapshot()
  await nextTick()
  resizeDescriptions()
  if (editorBody.value) editorBody.value.scrollTop = 0
  editorPanel.value?.querySelector('h2')?.focus({ preventScroll: true })
  if (compact.value) editorPanel.value?.scrollIntoView({ block: 'start' })
}

async function openNew() {
  if (!await canLeave()) return
  if (!isNew.value) previousId = selectedId.value
  revokeAvatarPreview()
  selectedId.value = ''
  isNew.value = true
  form.value = blankForm()
  await resetEditor()
}

async function openEdit(r) {
  if (editing.value && !isNew.value && selectedId.value === r.id) return
  if (!await canLeave()) return
  await selectRow(r)
}

async function selectRow(r) {
  revokeAvatarPreview()
  selectedId.value = r.id
  isNew.value = false
  form.value = fillForm(r)
  await resetEditor()
}

function clearEditor() {
  closeSpPicker()
  revokeAvatarPreview()
  editing.value = false
  selectedId.value = ''
  isNew.value = false
}

async function backToList() {
  if (!await canLeave()) return
  const id = selectedId.value || previousId
  clearEditor()
  emit('back', id)
}

async function discardChanges() {
  if (!await canLeave()) return
  if (isNew.value) {
    if (compact.value) {
      clearEditor()
      emit('back', previousId)
    } else {
      const row = rows.value.find(function (r) { return r.id === previousId }) || rows.value[0]
      if (row) await selectRow(row)
      else clearEditor()
    }
  } else {
    const restored = JSON.parse(initialSnapshot.value)
    restored.discs = restored.discs.map(function (disc) { return { ...disc, _key: ++discKey, _persisted: true } })
    const avatar = form.value.avatar
    revokeAvatarPreview()
    form.value = { ...restored, avatar, avatarPick: null, avatarPreview: '' }
    await resetEditor()
  }
}

function onBeforeUnload(event) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function scrollToSection(name) {
  activeSection.value = name
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  editorBody.value?.querySelector('[id="catalog-' + name + '"]')?.scrollIntoView({ block: 'start', behavior })
}

function onEditorFocus(event) {
  if (!compact.value || !event.target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select')) return
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  event.target.scrollIntoView({ block: 'center', behavior })
}

function resizeDescription(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

function resizeDescriptions() {
  editorBody.value?.querySelectorAll('.disc-description textarea').forEach(resizeDescription)
}

function onWindowResize() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(resizeDescriptions)
}

function aliasCount(disc) {
  return [disc.aliasesText, disc.despAliasesText].reduce(function (count, text) {
    return count + (text || '').split(/\r?\n/).filter(function (line) { return line.trim() }).length
  }, 0)
}

function toggleAliases(disc) {
  if (expandedAliases.value.has(disc._key)) expandedAliases.value.delete(disc._key)
  else expandedAliases.value.add(disc._key)
}

async function addDisc() {
  form.value.discs.push({ _key: ++discKey, _persisted: false, ot_name: '', abbreviation: '', color: '金', desp: '', aliasesText: '', despAliasesText: '' })
  await nextTick()
  resizeDescriptions()
  editorBody.value?.querySelector('.disc-editor-item:last-of-type .disc-name input')?.focus()
}

async function removeDisc(disc) {
  if (busy.value || checkingLeave.value) return
  const index = form.value.discs.indexOf(disc)
  if (index < 0) return
  if (disc._persisted) {
    checkingLeave.value = true
    try {
      const count = form.value.discs.length - index - 1
      const message = (count ? '删除后，后面 ' + count + ' 条命盘的序号都会前移一位，已有密探的自动编队可能受影响。' : '删除后，使用该命盘的自动编队可能受影响。') + '保存前仍可通过「放弃修改」恢复。'
      if (!await dialog.confirm({ type: 'danger', title: '删除命盘「' + (disc.ot_name || '命盘 ' + (index + 1)) + '」？', message, confirmText: '删除命盘' })) return
    } finally { checkingLeave.value = false }
  }
  form.value.discs.splice(index, 1)
  expandedAliases.value.delete(disc._key)
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

function discardAvatar() {
  revokeAvatarPreview()
  form.value.avatarPick = null
  avatarNotice.value = ''
  avatarNoticeError.value = false
}

async function onAvatarPick(e) {
  const file = e.target.files && e.target.files[0]
  if (e.target) e.target.value = ''
  if (!file) return

  revokeAvatarPreview()
  form.value.avatarPick = null
  avatarOptimizing.value = true
  avatarNotice.value = '正在本地优化头像…'
  avatarNoticeError.value = false

  try {
    const optimized = await prepareImageUpload(file, IMAGE_UPLOAD_PROFILES.AVATAR)
    if (disposed) return
    form.value.avatarPick = optimized.file
    form.value.avatarPreview = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(optimized.file)
      : ''
    avatarNotice.value = ''
  } catch (err) {
    avatarNotice.value = err?.message || '头像优化失败，请更换图片后重试'
    avatarNoticeError.value = true
  } finally {
    avatarOptimizing.value = false
  }
}

// 上传头像：独立动作，上传即存、即时对公共图鉴生效（不依赖表单「保存」）
async function uploadAvatar() {
  if (busy.value || checkingLeave.value) return
  if (!form.value.id || !/^char_[A-Za-z0-9_]+$/.test(form.value.id)) {
    avatarNotice.value = '请先填写合法的 ID（char_xxx）再上传头像'
    avatarNoticeError.value = true
    return
  }
  const file = form.value.avatarPick
  if (!file) { avatarNotice.value = '请先选择图片'; avatarNoticeError.value = true; return }
  if (!/^image\/webp$/i.test(file.type)) { avatarNotice.value = '头像优化结果不是 WebP，请重新选择图片'; avatarNoticeError.value = true; return }
  if (file.size > 500 * 1024) { avatarNotice.value = '头像优化后仍超过 500KB，请重新选择图片'; avatarNoticeError.value = true; return }
  avatarUploading.value = true
  avatarNotice.value = ''
  avatarNoticeError.value = false
  try {
    const saved = await uploadAdminOperatorAvatar(form.value.id, file)
    const path = (saved && saved.avatar) || '/avatar/' + form.value.id + '.webp'
    const row = rows.value.find(function (r) { return r.id === form.value.id })
    if (row) row.avatar = path
    form.value.avatar = path
    emit('avatar-updated', path)
    revokeAvatarPreview()
    form.value.avatarPick = null
    avatarNotice.value = '头像已上传，即时对公共图鉴生效'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    avatarNotice.value = humanErr(err, '头像上传失败')
    avatarNoticeError.value = true
  } finally {
    avatarUploading.value = false
  }
}

// 删除头像：独立动作，即时生效
async function removeAvatar() {
  if (busy.value || checkingLeave.value) return
  checkingLeave.value = true
  try {
    if (!await dialog.confirm({ type: 'danger', title: '删除「' + (form.value.name || form.value.id) + '」的头像？', message: '删除后立即生效，无需保存表单。', confirmText: '删除头像' })) return
  } finally { checkingLeave.value = false }
  avatarUploading.value = true
  avatarNotice.value = ''
  avatarNoticeError.value = false
  try {
    await deleteAdminOperatorAvatar(form.value.id)
    const row = rows.value.find(function (r) { return r.id === form.value.id })
    if (row) row.avatar = ''
    form.value.avatar = ''
    revokeAvatarPreview()
    form.value.avatarPick = null
    avatarNotice.value = '头像已删除'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    avatarNotice.value = humanErr(err, '头像删除失败')
    avatarNoticeError.value = true
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
          desp: (d.desp && d.desp.trim()) || null,
          aliases: [...new Set((d.aliasesText || '').split(/\r?\n/).map(function (alias) { return alias.trim() }).filter(Boolean))],
          desp_aliases: [...new Set((d.despAliasesText || '').split(/\r?\n/).map(function (alias) { return alias.trim() }).filter(Boolean))]
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
  if (busy.value || checkingLeave.value || (!isNew.value && !dirty.value)) return
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
    isNew.value = false
    selectedId.value = body.id
    form.value.discs.forEach(function (disc) { disc._persisted = Boolean(disc.ot_name.trim()) })
    initialSnapshot.value = snapshot()
    const refreshed = await props.reload()
    if (permissionRedirect) return
    const row = rows.value.find(function (r) { return r.id === body.id })
    if (refreshed && row) {
      await selectRow(row)
      notice.value = '已保存到公共图鉴'
    } else {
      notice.value = '已保存到公共图鉴，但未能获取最新资料，请重试刷新列表。'
      noticeError.value = true
    }
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    notice.value = humanErr(err, '保存失败')
    noticeError.value = true
  } finally {
    saving.value = false
  }
}

async function onDelete(r) {
  if (busy.value || checkingLeave.value) return
  const dependants = rows.value.filter(function (x) { return x.spOf === r.id }).map(function (x) { return x.name || x.id })
  const warn = dependants.length
    ? '\n注意：「' + dependants.join('、') + '」以该密探为 SP 本体，删除后它们的 spOf 校验将失效。'
    : ''
  checkingLeave.value = true
  let confirmation
  try {
    confirmation = await dialog.prompt({
      title: '确认删除密探',
      message: '将永久删除「' + (r.name || r.id) + '」，并立即影响公共图鉴与导入校验。此操作不可恢复。' + warn,
      type: 'danger',
      inputLabel: '输入 ' + r.id + ' 以确认',
      placeholder: r.id,
      requiredValue: r.id,
      confirmText: '永久删除'
    })
  } finally { checkingLeave.value = false }
  if (confirmation !== r.id) return
  saving.value = true
  try {
    await deleteAdminOperatorCatalog(r.id)
    clearEditor()
    await props.reload()
    if (compact.value) emit('back', '')
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    await dialog.alert({ title: '删除失败', message: humanErr(err, '删除失败') })
  } finally {
    saving.value = false
  }
}

async function leaveIfForbidden(errorValue) {
  if (!errorValue || errorValue.status !== 403) return false
  permissionRedirect = true
  clearEditor()
  await props.onForbidden(errorValue)
  return true
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。'
  return msg
}

function monogram(row) {
  return Array.from(String(row.name || row.id || '?'))[0] || '?'
}

window.addEventListener('beforeunload', onBeforeUnload)
window.addEventListener('resize', onWindowResize)
window.addEventListener('resize', updateSpPosition)
window.addEventListener('scroll', updateSpPosition, true)
window.visualViewport?.addEventListener('resize', updateSpPosition)
window.visualViewport?.addEventListener('scroll', updateSpPosition)
document.addEventListener('pointerdown', onSpPointerDown, true)
watch([busy, checkingLeave], function ([working, checking]) {
  if (working || checking) closeSpPicker()
})
watch(spOptions, function (options) {
  spActiveIndex.value = Math.min(spActiveIndex.value, options.length - 1)
})
watch(rows, async function () {
  if (editing.value && !isNew.value && !dirty.value && !busy.value && selectedRow.value) await selectRow(selectedRow.value)
})
watch(dirty, function (value) {
  if (value && !noticeError.value) notice.value = ''
})
watch(compact, async function () {
  await nextTick()
  resizeDescriptions()
})
onBeforeRouteLeave(function () { return permissionRedirect || canLeave() })
onBeforeUnmount(function () {
  disposed = true
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('resize', updateSpPosition)
  window.removeEventListener('scroll', updateSpPosition, true)
  window.visualViewport?.removeEventListener('resize', updateSpPosition)
  window.visualViewport?.removeEventListener('scroll', updateSpPosition)
  document.removeEventListener('pointerdown', onSpPointerDown, true)
  cancelAnimationFrame(resizeFrame)
  revokeAvatarPreview()
})
defineExpose({ canLeave, openNew, openEdit, selectRow, clearEditor, leaveIfForbidden, editing, isNew, selectedId, busy, checkingLeave })
</script>

