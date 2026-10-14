<template>
  <div class="account-event-toasts" aria-live="polite" aria-atomic="false">
    <details v-if="accountEvents.history.length" class="account-event-history" aria-live="off">
      <summary>最近事件（{{ accountEvents.history.length }}）</summary>
      <ul>
        <li v-for="entry in accountEvents.history" :key="entry.id">
          <b>{{ entry.title }}</b>
          <small v-if="entry.detail">{{ entry.detail }}</small>
          <a v-if="entry.reviewHref" :href="entry.reviewHref">查看并复核</a>
          <small v-if="entry.entries?.length">{{ entry.entries.map(item => item.display).join(' · ') }}</small>
        </li>
      </ul>
    </details>
    <TransitionGroup name="account-toast">
      <div v-for="toast in accountEvents.toasts" :key="toast.id" class="account-event-toast" :class="['is-' + toast.tone, 'is-' + toast.kind, toast.kind === 'operator' && toast.action ? 'is-capsule' : '', toast.kind === 'operator' && toast.rarity ? 'rarity-r' + toast.rarity : '']" :role="toast.tone === 'warning' ? 'alert' : 'status'">
        <span class="toast-badge" aria-hidden="true">
          <img v-if="toast.kind === 'operator' && toast.action" class="toast-agent-icon" :src="agentIconSrc(toast.operatorId)" alt="" />
          <PackageOpen v-if="toast.kind === 'inventory'" :size="18" />
          <Star v-else-if="toast.kind !== 'operator' && toast.tone === 'success'" :size="18" />
          <CircleAlert v-else-if="toast.kind !== 'operator' || !toast.action" :size="18" />
        </span>
        <span class="toast-copy">
          <em v-if="toast.kind === 'operator' && toast.action" class="toast-kicker">{{ toast.action === 'recruited' ? 'AGENT UNLOCKED' : 'AGENT UPDATED' }}</em>
          <b>{{ toast.title }}</b>
          <small v-if="toast.detail && !(toast.kind === 'operator' && toast.action)">{{ toast.detail }}</small>
          <a v-if="toast.reviewHref" :href="toast.reviewHref">查看并复核</a>
          <span v-if="toast.kind === 'inventory' && toast.entries && toast.entries.length" class="inventory-entries">
            <span v-for="(entry, entryIndex) in toast.entries" :key="entry.id + '-' + entryIndex" class="inventory-entry" :class="entry.highlight">
              <span>{{ entry.name }}</span><b>{{ entry.display.replace(entry.name, '') }}</b>
            </span>
          </span>
        </span>
        <span v-if="toast.kind === 'operator' && toast.action" class="toast-stars" aria-hidden="true"><Star v-for="index in Math.max(1, Math.min(5, Number(toast.rarity) || 3))" :key="index" :size="12" /></span>
        <button type="button" aria-label="关闭通知" title="关闭" @click="dismissAccountEventToast(toast.id)"><X :size="15" aria-hidden="true" /></button>
      </div>
    </TransitionGroup>
  </div>
  <aside v-if="previewEnabled" class="account-event-preview" aria-label="事件效果预览">
    <strong>效果预览</strong>
    <button type="button" @click="previewAccountEvent('operator-new')">密探点亮</button>
    <button type="button" @click="previewAccountEvent('operator-update')">密探更新</button>
    <button type="button" @click="previewAccountEvent('fazheng-new')">法正暗扫</button>
    <button type="button" @click="previewAccountEvent('shizimiao-sp-new')">史子眇SP符文</button>
    <button type="button" @click="previewAccountEvent('chendeng-sp-new')">陈登SP种子</button>
    <button type="button" @click="previewAccountEvent('review')">待复核</button>
    <button type="button" @click="previewAccountEvent('inventory')">据点情报</button>
    <button type="button" @click="previewAccountEvent('inventory-dispatch')">派遣</button>
    <button type="button" @click="previewAccountEvent('inventory-snapshot')">库存快照</button>
  </aside>
</template>

<script setup>
import { CircleAlert, PackageOpen, Star, X } from '@lucide/vue'
import { accountEvents, dismissAccountEventToast, previewAccountEvent } from '../store/accountEvents.js'

const previewEnabled = import.meta.env.DEV && new URLSearchParams(location.search).get('event_preview') === '1'

function agentIconSrc(operatorId) {
  return operatorId ? '/inventory-icons/agents/' + operatorId + '.png' : ''
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.account-event-toasts { pointer-events: none }
.account-event-history { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); pointer-events: auto; }
.account-event-history summary { cursor: pointer; }
.account-event-history small { color: var(--ink-60); }
.account-event-toast { border: 1.5px solid var(--toast-accent); border-radius: 18px 18px 6px 18px; background: var(--surface); color: var(--ink); box-shadow: 0 12px 28px rgba(73, 59, 44, .18), inset 0 1px 0 rgba(255, 255, 255, .9); pointer-events: auto }
.account-event-toast::after { border-right: 1.5px solid var(--yellow-deep); border-bottom: 1.5px solid var(--yellow-deep); border-radius: 0 0 4px; background: var(--surface); content: '' }
.toast-badge { border: 1px solid var(--toast-accent); border-radius: 50%; background: var(--yellow); color: var(--accent-strong); box-shadow: inset 0 0 0 3px var(--surface) }
.toast-agent-icon { border-radius: inherit; }
.toast-copy small { color: var(--ink-60) }
.toast-kicker { color: var(--toast-accent) }
.toast-stars { color: var(--toast-accent) }
.account-event-toast.is-capsule { border-radius: 999px; border-color: color-mix(in srgb, var(--toast-accent) 72%, var(--line)); box-shadow: 0 10px 28px rgba(73, 59, 44, .2); }
.account-event-toast.is-capsule .toast-badge { border-radius: 50%; background: color-mix(in srgb, var(--toast-accent) 15%, var(--surface)); }
.account-event-toast.is-inventory { border: 1px solid var(--accent); border-radius: 22px; background: var(--surface); box-shadow: 0 8px 22px rgba(86, 66, 38, .09) }
.account-event-toast.is-inventory .toast-badge { border-color: var(--accent); background: var(--cream); box-shadow: none; color: var(--accent-strong) }
.account-event-toast.is-inventory .toast-copy small { color: var(--ink-60) }
.inventory-entries { color: #615344 }
.inventory-entry { border-radius: 7px; background: rgba(240, 224, 174, .28) }
.inventory-entry b { color: #8e5e20 }
.inventory-entry.is-white-coin { background: rgba(239, 210, 142, .55); color: #8e5e20 }
.inventory-entry.is-zhuyu { background: rgba(191, 220, 192, .62); color: #466b4a }
.inventory-entry.is-favorite-agent { background: rgba(240, 207, 200, .68); color: #8c4740 }
.account-toast-enter-active.is-inventory { animation: inventory-refined-in .36s cubic-bezier(.18,.82,.2,1) both }
.account-toast-enter-active.is-inventory .toast-badge { animation: inventory-icon-ring .58s ease-out .08s both }
.account-event-toast.is-warning { border-color: var(--toast-accent) }
.account-event-toast.is-warning::after { border-color: rgba(166, 81, 74, .55) }
.account-event-toast.is-warning .toast-badge { border-color: var(--toast-accent); background: var(--surface); color: var(--rouge) }
.account-event-toast a, .account-event-history a { color: var(--brand-blue); text-decoration: underline }
.account-event-toast a:focus-visible, .account-event-history a:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.account-event-toast button { border: 0; border-radius: 50%; background: transparent; color: var(--ink-60); cursor: pointer }
.account-event-toast button:hover { background: rgba(73, 59, 44, .08); color: var(--ink) }
.account-event-toast button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.account-toast-enter-active, .account-toast-leave-active { transition: opacity .2s ease, transform .2s var(--ease) }
.account-toast-enter-from, .account-toast-leave-to { opacity: 0 }
.account-toast-enter-active.is-capsule { animation: capsule-pop .62s cubic-bezier(.17,.9,.22,1) both; }
.account-toast-enter-active.is-capsule .toast-badge { animation: capsule-icon-pop .55s cubic-bezier(.17,.9,.22,1) .06s both; }
@keyframes capsule-pop { 0% { opacity: 0; transform: translateY(10px) scale(.82) } 55% { opacity: 1; transform: translateY(-2px) scale(1.045) } 100% { opacity: 1; transform: none } }
@keyframes capsule-icon-pop { 0% { transform: scale(.4) rotate(-12deg); filter: brightness(.7) } 65% { transform: scale(1.18) rotate(3deg); filter: brightness(1.35) } 100% { transform: scale(1); filter: none } }
@keyframes inventory-refined-in { 0% { opacity: 0; transform: translateY(-10px) scale(.98) } 65% { opacity: 1; transform: translateY(1px) scale(1.005) } 100% { opacity: 1; transform: none } }
@keyframes inventory-icon-ring { 0% { box-shadow: 0 0 0 0 rgba(215, 137, 53, .28) } 100% { box-shadow: 0 0 0 10px rgba(215, 137, 53, 0) } }
.account-event-preview { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 28px rgba(73, 59, 44, .16) }
.account-event-preview strong { color: var(--ink-60) }
.account-event-preview button { border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink); cursor: pointer }
.account-event-preview button:hover { border-color: var(--accent); color: var(--accent-strong) }
.account-event-preview button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
@media (prefers-reduced-motion: reduce) {
  .account-toast-enter-active, .account-toast-leave-active, .account-toast-enter-active.is-capsule, .account-toast-enter-active.is-capsule .toast-badge, .account-toast-enter-active.is-inventory, .account-toast-enter-active.is-inventory .toast-badge { animation: none; transition: none }
}
</style>
<style scoped src="./accountEventToastsDesktop.css"></style>
<style scoped src="./accountEventToastsMobile.css"></style>
