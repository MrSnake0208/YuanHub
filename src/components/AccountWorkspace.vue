<template>
  <div class="account-workspace" v-reveal>
    <div class="account-bar" :class="{ 'with-actions': usesStackedLayout }">
      <div class="account-heading">
        <span class="section-kicker">数据归属</span>
        <h2>{{ headingTitle }}</h2>
        <p>{{ headingSub }}</p>
      </div>
      <div class="account-context">
        <div class="account-selector" :class="{ 'soft-account-selector': softDropdown }">
          <label class="ac-label" :for="softDropdown ? undefined : selectId">{{ selectLabel }}</label>
          <div v-if="softDropdown" ref="softDropdownRoot" class="account-soft-dropdown" @keydown.escape.prevent="closeAccountDropdown">
            <select ref="accountSelect" :id="selectId" class="account-native-select" :value="accountId" :disabled="disabled" :aria-invalid="!!error" aria-hidden="true" tabindex="-1" @change="onSelectChange">
              <option v-if="!accounts.length" value="">（未创建）</option>
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <button type="button" class="account-soft-trigger" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="accountDropdownOpen" @click="toggleAccountDropdown">{{ selectedAccountLabel }}</button>
            <div v-if="accountDropdownOpen" class="account-soft-listbox" role="listbox">
              <button v-if="!accounts.length" type="button" class="account-soft-option" role="option" aria-selected="true" disabled>（未创建）</button>
              <button v-for="a in accounts" :key="a.id" type="button" class="account-soft-option" role="option" :aria-selected="a.id === accountId" @click="selectAccountOption(a.id)">{{ a.name }}</button>
            </div>
          </div>
          <select v-else :id="selectId" :value="accountId" :disabled="disabled" :aria-invalid="!!error" @change="onSelectChange">
            <option v-if="!accounts.length" value="">（未创建）</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <span v-if="error" class="ac-warn">{{ error }}</span>
        </div>
        <fieldset class="account-game" :disabled="gameDisabled">
          <legend class="ac-label">游戏版本</legend>
          <div class="account-game-options" role="radiogroup" aria-label="当前子账号游戏版本">
            <label v-for="option in gameOptions" :key="option" :class="{ on: game === option }">
              <input
                type="radio"
                :name="gameInputName"
                :value="option"
                :checked="game === option"
                :aria-describedby="gameHelpId"
                @change="onGameChange(option)"
              />
              <span>{{ option }}</span>
            </label>
          </div>
        </fieldset>
      </div>
      <button
        type="button"
        class="act-btn account-manage"
        :disabled="disabled"
        :aria-expanded="open"
        @click="open = !open"
      >
        <Users :size="15" aria-hidden="true" />{{ open ? '收起账号管理' : '管理账号' }}
      </button>
      <slot name="actions" />
    </div>

    <div v-if="open && !disabled" class="account-mgr">
      <div class="account-mgr-head">
        <div>
          <h3>账号列表</h3>
          <p>{{ mgrDesc }}</p>
        </div>
        <span class="account-count">{{ accounts.length }} 个账号</span>
      </div>
      <div class="ac-new">
        <input
          v-model.trim="name"
          :aria-label="newLabel"
          autocomplete="off"
          :placeholder="newPlaceholder"
          @keyup.enter="submitCreate"
        />
        <button type="button" class="btn ghost" :disabled="busy || !name" @click="submitCreate">新建账号</button>
      </div>
      <ul v-if="accounts.length" class="ac-list">
        <li v-for="a in accounts" :key="a.id" class="ac-item" :class="{ selected: a.id === accountId }">
          <span class="ac-dot"></span>
          <div class="ac-meta">
            <span class="ac-name">{{ a.name }}<em v-if="a.id === accountId">当前</em></span>
            <code class="ac-id">{{ a.id }}</code>
          </div>
          <button type="button" class="ac-btn" :disabled="busy" @click="emit('rename', a)">改名</button>
          <button type="button" class="ac-btn danger" :disabled="busy" @click="emit('delete', a)">删除</button>
        </li>
      </ul>
      <p v-else class="ac-empty">{{ emptyText }}</p>
    </div>

    <!-- 页面自身追加的区块（如库存页的「数据交换」面板） -->
    <slot />
  </div>
</template>

<script setup>
// 统一子账号「数据归属」工作区 —— 库存页 / 密探页共用
// 账号 CRUD 已统一到 /v1/accounts（src/api/accounts.js），
// 这里只负责 UI：账号选择 + 管理（新建/改名/删除），创建/改名/删除动作向上冒泡由页面处理。
import { ref, computed, onBeforeUnmount, onMounted, useSlots } from 'vue'
import { Users } from '@lucide/vue'
import { ACCOUNT_GAMES } from '../store/activeAccount.js'

const props = defineProps({
  // 当前选中账号 id（v-model:accountId）
  accountId: { type: String, default: '' },
  // 当前子账号所属版本（v-model:game）；代号鸢目录即完整目录，不提供“全部”档。
  game: { type: String, default: '代号鸢' },
  accounts: { type: Array, default: function () { return [] } },
  // 账号相关错误提示（加载/创建/改名/删除失败）
  error: { type: String, default: '' },
  // 禁用选择器与管理（未登录 / 装载中 / 正在编辑等）
  disabled: { type: Boolean, default: false },
  // 版本可以在只读浏览时切换；仅在页面正在切换上下文或编辑时单独禁用。
  gameDisabled: { type: Boolean, default: false },
  // 账号操作进行中（新建/改名/删除）
  busy: { type: Boolean, default: false },
  // Gives pages without an action slot the same title-first layout as inventory.
  stacked: { type: Boolean, default: false },
  // 仅供 /star 使用的柔和账号下拉，不影响库存和密探页的既有原生选择器。
  softDropdown: { type: Boolean, default: false },
  headingTitle: { type: String, default: '选择要查看的账号' },
  headingSub: { type: String, default: '数据、统计和操作历史都会切换到这个子账号；这里创建的账号在另一页同样可见。' },
  selectLabel: { type: String, default: '当前账号' },
  newLabel: { type: String, default: '新子账号名称' },
  newPlaceholder: { type: String, default: '输入新账号名称' },
  emptyText: { type: String, default: '还没有子账号，先创建一个再开始记录。' },
  mgrDesc: {
    type: String,
    default: '给不同存档分别记账（库存 / 密探共用同一批账号）；删除账号会连同库存、密探、特别关注和所有 Token 一并清除。'
  }
})

const emit = defineEmits(['update:accountId', 'update:game', 'change', 'game-change', 'create', 'rename', 'delete'])

const open = ref(false)
const name = ref('')
const accountDropdownOpen = ref(false)
const accountSelect = ref(null)
const softDropdownRoot = ref(null)
const slots = useSlots()
const hasActions = computed(function () { return !!slots.actions })
const usesStackedLayout = computed(function () { return hasActions.value || props.stacked })
const selectedAccountLabel = computed(function () { return props.accounts.find(function (account) { return account.id === props.accountId })?.name || '（未创建）' })

let uidSeq = 0
const selectId = 'aw-account-' + (++uidSeq)
const gameInputName = 'aw-game-' + uidSeq
const gameHelpId = 'aw-game-help-' + uidSeq
const gameOptions = ACCOUNT_GAMES

function onSelectChange(e) {
  accountDropdownOpen.value = false
  const val = e.target.value
  emit('update:accountId', val)
  emit('change', val)
}

function closeAccountDropdown() { accountDropdownOpen.value = false }
function toggleAccountDropdown() { if (!props.disabled) accountDropdownOpen.value = !accountDropdownOpen.value }
function selectAccountOption(value) {
  if (props.disabled || !accountSelect.value) return
  accountSelect.value.value = value
  accountSelect.value.dispatchEvent(new Event('change', { bubbles: true }))
}
function onDocumentPointerDown(event) {
  if (accountDropdownOpen.value && !softDropdownRoot.value?.contains(event.target)) closeAccountDropdown()
}
onMounted(function () { document.addEventListener('pointerdown', onDocumentPointerDown, true) })
onBeforeUnmount(function () { document.removeEventListener('pointerdown', onDocumentPointerDown, true) })

function onGameChange(game) {
  emit('update:game', game)
  emit('game-change', game)
}

function submitCreate() {
  const text = name.value
  if (!text) return
  name.value = ''
  emit('create', text)
}
</script>

<style scoped>
/* —— 统一子账号「数据归属」工作区（库存 / 密探共用一套样式） —— */
.account-workspace { margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden }

.account-bar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(410px, 520px) auto; align-items: center; gap: 12px; padding: 22px 24px }
.account-bar.with-actions { grid-template-columns: minmax(410px, 1fr) auto auto }
.account-bar.with-actions .account-heading { grid-column: 1 / -1 }
.account-heading h2 { font-family: var(--font-s); font-size: 21px; line-height: 1.3; font-weight: 900; letter-spacing: .04em }
.account-heading p { margin-top: 5px; color: var(--ink-60); font-size: 12.5px; line-height: 1.7 }
.section-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .14em }

.account-context { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(190px, .82fr); align-items: start; gap: 12px }
.account-selector { display: flex; min-width: 0; flex-direction: column; gap: 6px }
.ac-label { font-size: 11.5px; font-weight: 800; color: var(--ink-60); letter-spacing: .08em }
.account-selector select { width: 100%; border: 1.5px solid var(--line); border-radius: 11px; padding: 11px 13px; font-size: 14px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; min-width: 160px; cursor: pointer; transition: border-color .3s, box-shadow .3s }
.account-selector select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.account-soft-dropdown { position: relative; width: 100%; min-width: 0 }
.account-native-select { position: absolute; width: 1px !important; height: 1px; margin: -1px; padding: 0 !important; overflow: hidden; clip: rect(0 0 0 0); opacity: 0; pointer-events: none }
.account-soft-trigger { position: relative; display: flex; width: 100%; min-width: 160px; min-height: 42px; align-items: center; padding: 10px 34px 10px 13px; overflow: hidden; border: 1.5px solid var(--line); border-radius: 11px; color: var(--ink); background: var(--paper); cursor: pointer; font-family: var(--font-b); font-size: 15px; font-weight: 600; line-height: 1.25; text-align: left; text-overflow: ellipsis; white-space: nowrap; transition: border-color .2s var(--ease), background-color .2s var(--ease), box-shadow .2s var(--ease) }
.account-soft-trigger::after { position: absolute; top: 50%; right: 14px; width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; content: ''; opacity: .72; transform: translateY(-65%) rotate(45deg); transition: transform .2s var(--ease) }
.account-soft-trigger[aria-expanded='true']::after { transform: translateY(-35%) rotate(225deg) }
.account-soft-trigger:hover:not(:disabled),.account-soft-trigger:focus-visible { border-color: var(--accent); background: var(--cream); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13); outline: 0 }
.account-soft-trigger:disabled { cursor: not-allowed; opacity: .55 }
.account-soft-listbox { position: absolute; z-index: 80; top: calc(100% + 5px); right: 0; left: 0; display: grid; max-height: 220px; overflow: auto; padding: 4px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); box-shadow: 0 12px 24px rgba(73, 59, 44, .16); scrollbar-color: var(--yellow-deep) transparent; scrollbar-width: thin }
.account-soft-option { width: 100%; padding: 8px 10px; overflow: hidden; border: 0; border-radius: 7px; color: var(--ink); background: transparent; cursor: pointer; font-family: var(--font-b); font-size: 15px; font-weight: 600; line-height: 1.25; text-align: left; text-overflow: ellipsis; white-space: nowrap }
.account-soft-option:hover:not(:disabled),.account-soft-option:focus-visible,.account-soft-option[aria-selected='true'] { background: var(--cream); outline: 0 }
.account-soft-option:disabled { cursor: not-allowed; opacity: .55 }
.ac-warn { font-size: 12px; color: var(--rouge); font-weight: 700 }
.account-game { min-width: 0; margin: 0; padding: 0; border: 0 }
.account-game legend { margin-bottom: 6px }
.account-game-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; border: 1.5px solid var(--line); border-radius: 11px; background: var(--paper) }
.account-game-options label { position: relative; display: inline-flex; min-width: 0; min-height: 37px; align-items: center; justify-content: center; border-radius: 7px; color: var(--ink-60); font-size: 12px; font-weight: 800; cursor: pointer; transition: color .2s var(--ease), background-color .2s var(--ease), box-shadow .2s var(--ease) }
.account-game-options label.on { background: var(--yellow); color: var(--ink); box-shadow: inset 0 0 0 1px var(--yellow-deep) }
.account-game-options label:focus-within { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.account-game-options input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none }
.account-game small { display: block; margin-top: 5px; color: var(--ink-35); font-size: 10px; font-weight: 700; line-height: 1.35; white-space: nowrap }
.account-game:disabled { opacity: .52 }
.account-game:disabled .account-game-options label { cursor: not-allowed }

.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease); white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 8px }
.account-manage { min-height: 44px; align-self: center; transform: translateY(9px) }
.account-manage svg { flex: none }

.account-mgr { border-top: 1px dashed var(--line); background: var(--cream); padding: 20px 24px 22px }
.account-mgr-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px }
.account-mgr-head h3 { font-size: 14px; font-weight: 900; font-family: var(--font-s) }
.account-mgr-head p { margin-top: 4px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.account-count { flex: none; border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; color: var(--ink-60); font-size: 11px; font-weight: 800; white-space: nowrap }

.ac-new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.ac-new input { flex: 1; min-width: 200px; border: 1.5px solid var(--line); border-radius: 10px; padding: 9px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.ac-new input:focus { border-color: var(--accent) }

.ac-list { list-style: none; margin-top: 14px; display: flex; flex-direction: column; gap: 8px }
.ac-item { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; background: var(--paper) }
.ac-item.selected { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent) }
.ac-item .ac-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--yellow-deep); flex: none }
.ac-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.ac-name { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 800; color: var(--ink) }
.ac-name em { font-style: normal; background: var(--yellow); border-radius: 999px; padding: 2px 7px; font-size: 10px; letter-spacing: .03em }
.ac-id { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }

.ac-btn { flex: none; border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .25s, background-color .25s, border-color .25s }
.ac-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.ac-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ac-btn.danger:hover:not(:disabled) { background: rgba(166, 81, 74, .1) }
.ac-btn:disabled { opacity: .45; cursor: not-allowed }

.ac-empty { margin-top: 12px; font-size: 12.5px; color: var(--ink-35); font-weight: 600 }

@media (max-width: 640px) {
  .account-workspace { border-radius: 16px }
  .account-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 16px 10px; padding: 18px 16px }
  .account-bar.with-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .account-heading, .account-context { grid-column: 1 / -1 }
  .account-bar.with-actions > .account-manage,
  .account-bar.with-actions > :deep(.archive-toggle) { width: 100%; min-width: 0 }
  .account-context { grid-template-columns: 1fr; gap: 13px }
  .account-selector { gap: 6px }
  .account-selector select { width: 100%; min-width: 0; min-height: 46px; font-size: 16px }
  .account-soft-trigger { min-width: 0; min-height: 46px; font-size: 16px }
  .account-game-options label { min-height: 44px }
  .account-game small { white-space: normal }
  .account-manage { width: 100%; min-height: 44px; transform: none }
  .account-mgr { padding: 16px }
  .account-mgr-head { flex-direction: column; gap: 8px }
  .ac-new { align-items: stretch; flex-direction: column }
  .ac-new input { width: 100%; min-width: 0; min-height: 44px; font-size: 16px }
  .ac-new .btn { width: 100% }
  .ac-item { align-items: flex-start; gap: 8px; padding: 12px; flex-wrap: wrap }
  .ac-meta { flex-basis: calc(100% - 24px) }
  .ac-btn { min-height: 40px; flex: 1 }
}

@media (min-width: 641px) and (max-width: 900px) {
  .account-bar { grid-template-columns: minmax(0, 1fr) minmax(360px, 1fr); }
  .account-heading { grid-column: 1 / -1; }
  .account-context { grid-column: 1 / -1; }
  .account-manage { width: 100%; transform: none; }
  .account-bar.with-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
  .account-bar.with-actions .account-context { grid-column: 1 / -1; }
  .account-bar.with-actions > .account-manage,
  .account-bar.with-actions > :deep(.archive-toggle) { width: 100%; min-width: 0; }
}
</style>
