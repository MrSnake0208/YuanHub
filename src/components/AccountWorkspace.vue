<template>
  <div class="account-workspace" :class="{ 'split-workspace': split, 'soft-dropdown-workspace': softDropdown }" v-reveal>
    <div v-if="split" class="workspace-summary" :data-tour="tourTarget || undefined">
      <div class="workspace-status" aria-live="polite">
        <slot name="status" />
        <span v-if="compact && error" class="ac-warn">{{ error }}</span>
      </div>
      <button type="button" class="act-btn workspace-toggle" :aria-expanded="!compact" :aria-controls="selectId + '-panels'" @click="compact = !compact">
        {{ compact ? summaryLabel : '收起面板' }}
      </button>
      <slot name="summary-actions" />
    </div>
    <div :id="selectId + '-panels'" v-show="!split || !compact" :class="{ 'workspace-panels': split }">
    <div class="workspace-account">
    <div v-if="showAccountBar" class="account-bar" :class="{ 'with-actions': usesStackedLayout }">
      <div class="account-heading">
        <span class="section-kicker">数据归属</span>
        <h2>{{ headingTitle }}</h2>
        <p>{{ headingSub }}</p>
      </div>
      <div class="account-context">
        <div class="account-selector" :class="{ 'soft-account-selector': softDropdown }">
          <label class="ac-label" :for="selectId">{{ selectLabel }}</label>
          <div v-if="softDropdown" ref="softDropdownRoot" class="account-soft-dropdown" @keydown.escape.prevent="closeAccountDropdown">
            <button :id="selectId" ref="accountTrigger" type="button" class="account-soft-trigger" :disabled="disabled" :aria-invalid="!!error" aria-haspopup="listbox" :aria-expanded="accountDropdownOpen" :aria-controls="selectId + '-listbox'" @click="toggleAccountDropdown" @keydown.down.prevent="openAccountDropdown('first')" @keydown.up.prevent="openAccountDropdown('last')">{{ selectedAccountLabel }}</button>
            <div v-if="accountDropdownOpen" :id="selectId + '-listbox'" class="account-soft-listbox" role="listbox" :aria-label="selectLabel" @keydown="onListboxKeydown">
              <button v-if="!accounts.length" type="button" class="account-soft-option" role="option" aria-selected="true" disabled>（未创建）</button>
              <button v-for="a in accounts" :key="a.id" type="button" class="account-soft-option" role="option" tabindex="-1" :aria-selected="a.id === accountId" @click="selectAccountOption(a.id)">{{ accountOptionLabel(a) }}</button>
            </div>
          </div>
          <select v-else :id="selectId" :value="accountId" :disabled="disabled" :aria-invalid="!!error" @change="onSelectChange">
            <option v-if="!accounts.length" value="">（未创建）</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ accountOptionLabel(a) }}</option>
          </select>
          <span v-if="error" class="ac-warn">{{ error }}</span>
        </div>
        <fieldset v-if="gameEditable" class="account-game" :disabled="gameDisabled">
          <legend class="ac-label">所属游戏</legend>
          <div class="account-game-options" role="radiogroup" aria-label="当前账号所属游戏">
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
        <div v-else class="account-game account-game-readonly">
          <span class="ac-label">所属游戏</span>
          <strong>{{ game }}</strong>
          <small>账号属性仅在个人中心修改</small>
        </div>
      </div>
      <button
        v-if="manageEnabled"
        type="button"
        class="act-btn account-manage"
        :disabled="disabled"
        :aria-expanded="open"
        @click="open = !open"
      >
        <Users :size="15" aria-hidden="true" />{{ open ? '收起账号管理' : '管理账号' }}
      </button>
      <router-link v-else class="act-btn account-manage account-manage-link" :to="manageTo">
        <Users :size="15" aria-hidden="true" />管理游戏账号
      </router-link>
      <slot name="actions" />
    </div>

    <div v-if="manageEnabled && open && !disabled" class="account-mgr">
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
            <span class="ac-name"><span class="ac-name-text">{{ a.name }}</span><em v-if="a.id === accountId">当前</em></span>
            <AccountIdDetails :value="a.id" label="查看账号编号" />
          </div>
          <button type="button" class="ac-btn" :disabled="busy" @click="emit('rename', a)">改名</button>
          <button type="button" class="ac-btn danger" :disabled="busy" @click="emit('delete', a)">删除</button>
        </li>
      </ul>
      <p v-else class="ac-empty">{{ emptyText }}</p>
    </div>

    <!-- 数据交换跟随账号区，移动端排在分享链接之前。 -->
    <slot />
    </div>
    <div v-if="split && slots.side" class="workspace-side"><slot name="side" /></div>
    </div>
  </div>
</template>

<script setup>
// 统一子账号「数据归属」工作区 —— 库存页 / 密探页共用
// 账号 CRUD 已统一到 /v1/accounts（src/api/accounts.js），
// 这里只负责 UI：账号选择 + 管理（新建/改名/删除），创建/改名/删除动作向上冒泡由页面处理。
import { ref, computed, nextTick, onBeforeUnmount, onMounted, useSlots } from 'vue'
import { Users } from '@lucide/vue'
import AccountIdDetails from './AccountIdDetails.vue'
import { ACCOUNT_GAMES, normalizeAccountGame } from '../store/activeAccount.js'

const props = defineProps({
  split: { type: Boolean, default: false },
  showAccountBar: { type: Boolean, default: true },
  tourTarget: { type: String, default: '' },
  summaryLabel: { type: String, default: '更改账号与分享状态' },
  // 当前选中账号 id（v-model:accountId）
  accountId: { type: String, default: '' },
  // 当前子账号所属版本（v-model:game）；代号鸢目录即完整目录，不提供“全部”档。
  game: { type: String, default: '代号鸢' },
  accounts: { type: Array, default: function () { return [] } },
  // 账号相关错误提示（加载/创建/改名/删除失败）
  error: { type: String, default: '' },
  // 禁用选择器与管理（未登录 / 装载中 / 正在编辑等）
  disabled: { type: Boolean, default: false },
  // 只有统一账号管理入口允许修改所属游戏；业务页面只读展示。
  gameEditable: { type: Boolean, default: true },
  gameDisabled: { type: Boolean, default: false },
  // 业务页面关闭账号 CRUD，仅保留跳转到统一管理入口。
  manageEnabled: { type: Boolean, default: true },
  manageTo: { type: [String, Object], default: '/user/profile#game-accounts' },
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
    default: '给不同存档分别记账（库存 / 密探共用同一批账号）；删除账号会连同库存、密探、特别关注、活动订阅及个人关卡进度和所有 Token 一并清除。'
  }
})

const emit = defineEmits(['update:accountId', 'update:game', 'change', 'game-change', 'create', 'rename', 'delete'])

const compact = defineModel('compact', { type: Boolean, default: true })
const open = ref(false)
const name = ref('')
const accountDropdownOpen = ref(false)
const accountTrigger = ref(null)
const softDropdownRoot = ref(null)
const slots = useSlots()
const hasActions = computed(function () { return !!slots.actions })
const usesStackedLayout = computed(function () { return hasActions.value || props.stacked })
function accountOptionLabel(account) {
  if (!account) return '（未创建）'
  return normalizeAccountGame(account.game || props.game) + ' · ' + (account.name || '未命名账号')
}
const selectedAccountLabel = computed(function () {
  return accountOptionLabel(props.accounts.find(function (account) { return account.id === props.accountId }))
})

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

function closeAccountDropdown(returnFocus = true) {
  if (!accountDropdownOpen.value) return
  accountDropdownOpen.value = false
  if (returnFocus) nextTick(() => accountTrigger.value?.focus())
}
function toggleAccountDropdown() { if (!props.disabled) accountDropdownOpen.value = !accountDropdownOpen.value }
async function openAccountDropdown(edge) {
  if (props.disabled) return
  accountDropdownOpen.value = true
  await nextTick()
  const options = softDropdownRoot.value?.querySelectorAll('.account-soft-option:not(:disabled)') || []
  options[edge === 'last' ? options.length - 1 : 0]?.focus()
}
function onListboxKeydown(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const options = [...softDropdownRoot.value.querySelectorAll('.account-soft-option:not(:disabled)')]
  if (!options.length) return
  event.preventDefault()
  const current = options.indexOf(document.activeElement)
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
  options[target].focus()
}
function selectAccountOption(value) {
  if (props.disabled) return
  emit('update:accountId', value)
  emit('change', value)
  closeAccountDropdown()
}
function onDocumentPointerDown(event) {
  if (accountDropdownOpen.value && !softDropdownRoot.value?.contains(event.target)) closeAccountDropdown(false)
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* —— 统一子账号「数据归属」工作区（库存 / 密探共用一套样式） —— */
.account-workspace { background: var(--surface); border: 1px solid var(--line); border-radius: 20px }
.account-heading p { color: var(--ink-60) }
.section-kicker { color: var(--accent-strong) }
.ac-label { color: var(--ink-60) }
.account-selector select { border: 1.5px solid var(--line); border-radius: 11px; color: var(--ink); background: var(--paper); outline: none; cursor: pointer; transition: border-color .3s, box-shadow .3s }
.account-selector select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.account-soft-trigger { border: 1.5px solid var(--line); border-radius: 11px; color: var(--ink); background: var(--paper); cursor: pointer; transition: border-color .2s var(--ease), background-color .2s var(--ease), box-shadow .2s var(--ease) }
.account-soft-trigger::after { border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; content: ''; opacity: .72; transition: transform .2s var(--ease) }
.account-soft-trigger:hover:not(:disabled),.account-soft-trigger:focus-visible { border-color: var(--accent); background: var(--cream); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13); outline: 0 }
.account-soft-trigger:disabled { cursor: not-allowed; opacity: .55 }
.account-soft-listbox { border: 1px solid var(--line); border-radius: 11px; background: var(--surface); box-shadow: 0 12px 24px rgba(73, 59, 44, .16); scrollbar-color: var(--yellow-deep) transparent }
.account-soft-option { border: 0; border-radius: 7px; color: var(--ink); background: transparent; cursor: pointer }
.account-soft-option:hover:not(:disabled),.account-soft-option:focus-visible,.account-soft-option[aria-selected='true'] { background: var(--cream); outline: 0 }
.account-soft-option:disabled { cursor: not-allowed; opacity: .55 }
.ac-warn { color: var(--rouge) }
.account-game { border: 0 }
.account-game-options { border: 1.5px solid var(--line); border-radius: 11px; background: var(--paper) }
.account-game-options label { border-radius: 7px; color: var(--ink-60); cursor: pointer; transition: color .2s var(--ease), background-color .2s var(--ease), box-shadow .2s var(--ease) }
.account-game-options label.on { background: var(--yellow); color: var(--ink); box-shadow: inset 0 0 0 1px var(--yellow-deep) }
.account-game-options label:focus-within { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.account-game-options input { opacity: 0; pointer-events: none }
.account-game small { color: var(--ink-35) }
.account-game-readonly strong { border: 1.5px solid var(--line); border-radius: 11px; background: var(--cream); color: var(--ink) }
.account-game:disabled { opacity: .52 }
.account-game:disabled .account-game-options label { cursor: not-allowed }

.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; color: var(--ink-60); cursor: pointer; transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease) }
.account-manage-link { text-decoration: none }

.account-mgr { border-top: 1px dashed var(--line); background: var(--cream) }
.account-mgr-head p { color: var(--ink-60) }
.account-count { border: 1px solid var(--line); border-radius: 999px; color: var(--ink-60) }
.ac-new input { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.ac-new input:focus { border-color: var(--accent) }
.ac-item { border: 1px solid var(--line); border-radius: 12px; background: var(--paper) }
.ac-item.selected { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent) }
.ac-item .ac-dot { border-radius: 50%; background: var(--yellow-deep) }
.ac-name { color: var(--ink) }
.ac-name em { background: var(--yellow); border-radius: 999px }

.ac-btn { border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; cursor: pointer; transition: color .25s, background-color .25s, border-color .25s }
.ac-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.ac-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ac-btn.danger:hover:not(:disabled) { background: rgba(166, 81, 74, .1) }
.ac-btn:disabled { opacity: .45; cursor: not-allowed }

.ac-empty { color: var(--ink-35) }
.workspace-status { color: var(--ink-60) }
.workspace-toggle:hover, .workspace-toggle:focus-visible { border-color: var(--accent); color: var(--ink) }
.workspace-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.workspace-panels { border-top: 1px solid var(--line) }
@media (min-width: 1024px) {
  .workspace-side { border-left: 1px solid var(--line); background: var(--cream) }
  .workspace-side :deep(.share-manager) { border-top: 0 }
}
@media (max-width: 640px) {
  .account-workspace { border-radius: 16px }
}

/* 数据交换在半宽账号栏和手机上共用紧凑排布。 */
</style>
<style scoped src="./accountWorkspaceDesktop.css"></style>
<style scoped src="./accountWorkspaceMobile.css"></style>
