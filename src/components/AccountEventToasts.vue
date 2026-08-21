<template>
  <div class="account-event-toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="account-toast">
      <div v-for="toast in accountEvents.toasts" :key="toast.id" class="account-event-toast" :class="['is-' + toast.tone, 'is-' + toast.kind, toast.kind === 'operator' && toast.action ? 'is-capsule' : '', toast.kind === 'operator' && toast.rarity ? 'rarity-r' + toast.rarity : '']" role="status">
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
          <span v-if="toast.kind === 'inventory' && toast.entries && toast.entries.length" class="inventory-entries">
            <span v-for="(entry, entryIndex) in toast.entries" :key="entry.id + '-' + entryIndex" class="inventory-entry" :class="entry.highlight">
              <span>{{ entry.name }}</span><b>{{ entry.display.replace(entry.name, '') }}</b>
            </span>
          </span>
        </span>
        <span v-if="toast.kind === 'operator' && toast.action" class="toast-stars" aria-hidden="true">{{ '★'.repeat(Math.max(1, Math.min(5, Number(toast.rarity) || 3))) }}</span>
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
.account-event-toasts { position: fixed; z-index: 120; top: 22px; right: 24px; display: flex; width: min(340px, calc(100vw - 40px)); flex-direction: column; align-items: flex-end; gap: 10px; pointer-events: none }
.account-event-toast { --toast-accent: var(--yellow-deep); position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr) 28px; min-height: 64px; align-items: center; gap: 9px; padding: 10px 7px 10px 10px; border: 1.5px solid var(--toast-accent); border-radius: 18px 18px 6px 18px; background: var(--surface); color: var(--ink); box-shadow: 0 12px 28px rgba(73, 59, 44, .18), inset 0 1px 0 rgba(255, 255, 255, .9); font-size: 12.5px; line-height: 1.35; pointer-events: auto }
.account-event-toast::after { position: absolute; right: 17px; bottom: -8px; width: 14px; height: 14px; border-right: 1.5px solid var(--yellow-deep); border-bottom: 1.5px solid var(--yellow-deep); border-radius: 0 0 4px; background: var(--surface); content: ''; transform: skewY(34deg) rotate(20deg) }
.account-event-toast.is-capsule::after { display: none }
.toast-badge { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid var(--toast-accent); border-radius: 50%; background: var(--yellow); color: var(--accent-strong); box-shadow: inset 0 0 0 3px var(--surface) }
.toast-agent-icon { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.toast-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px }
.toast-copy b { overflow: hidden; font-size: 12.5px; font-weight: 900; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap }
.toast-copy small { overflow: hidden; color: var(--ink-60); font-size: 11px; font-weight: 700; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap }
.toast-kicker { overflow: hidden; color: var(--toast-accent); font-family: var(--font-d); font-size: 9px; font-style: normal; font-weight: 900; letter-spacing: .11em; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap }
.toast-stars { color: var(--toast-accent); font-family: var(--font-d); font-size: 10px; letter-spacing: .03em; white-space: nowrap }
.account-event-toast.is-capsule { grid-template-columns: 34px minmax(0, 1fr) auto 24px; width: fit-content; max-width: min(300px, calc(100vw - 32px)); min-height: 50px; padding: 6px 6px 6px 7px; gap: 7px; border-radius: 999px; border-color: color-mix(in srgb, var(--toast-accent) 72%, var(--line)); box-shadow: 0 10px 28px rgba(73, 59, 44, .2); }
.account-event-toast.is-capsule .toast-badge { width: 34px; height: 34px; border-radius: 50%; background: color-mix(in srgb, var(--toast-accent) 15%, var(--surface)); }
.account-event-toast.is-capsule .toast-copy { gap: 1px; }
.account-event-toast.is-capsule .toast-copy { max-width: 154px; }
.account-event-toast.is-capsule .toast-copy b { font-size: 13px; }
.account-event-toast.is-capsule.rarity-r5 { --toast-accent: var(--accent); }
.account-event-toast.is-capsule.rarity-r4 { --toast-accent: var(--brand-blue); }
.account-event-toast.is-capsule.rarity-r3 { --toast-accent: var(--mist); }
.account-event-toast.is-inventory { grid-template-columns: 48px minmax(0, 1fr) 28px; width: min(330px, calc(100vw - 40px)); min-height: 0; padding: 14px 38px 14px 14px; border: 1px solid var(--accent); border-radius: 22px; background: var(--surface); box-shadow: 0 8px 22px rgba(86, 66, 38, .09) }
.account-event-toast.is-inventory::after { display: none }
.account-event-toast.is-inventory .toast-badge { width: 48px; height: 48px; border-color: var(--accent); background: var(--cream); box-shadow: none; color: var(--accent-strong) }
.account-event-toast.is-inventory .toast-copy { gap: 4px }
.account-event-toast.is-inventory .toast-copy b { font-size: 15px; line-height: 1.2 }
.account-event-toast.is-inventory .toast-copy small { color: var(--ink-60); font-size: 13px; white-space: normal }
.inventory-entries { display: flex; flex-wrap: wrap; gap: 4px 8px; color: #615344; font-size: 12px; line-height: 1.4 }
.inventory-entry { display: inline-flex; gap: 2px; padding: 1px 5px; border-radius: 7px; background: rgba(240, 224, 174, .28) }
.inventory-entry b { color: #8e5e20; font-weight: 800 }
.inventory-entry.is-white-coin { background: rgba(239, 210, 142, .55); color: #8e5e20 }
.inventory-entry.is-zhuyu { background: rgba(191, 220, 192, .62); color: #466b4a }
.inventory-entry.is-favorite-agent { background: rgba(240, 207, 200, .68); color: #8c4740 }
.account-toast-enter-active.is-inventory { animation: inventory-refined-in .36s cubic-bezier(.18,.82,.2,1) both }
.account-toast-enter-active.is-inventory .toast-badge { animation: inventory-icon-ring .58s ease-out .08s both }
.account-event-toast.is-warning { --toast-accent: rgba(166, 81, 74, .55); border-color: var(--toast-accent) }
.account-event-toast.is-warning::after { border-color: rgba(166, 81, 74, .55) }
.account-event-toast.is-warning .toast-badge { border-color: var(--toast-accent); background: var(--surface); color: var(--rouge) }
.account-event-toast button { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--ink-60); cursor: pointer }
.account-event-toast button:hover { background: rgba(73, 59, 44, .08); color: var(--ink) }
.account-event-toast button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.account-toast-enter-active, .account-toast-leave-active { transition: opacity .2s ease, transform .2s var(--ease) }
.account-toast-enter-from, .account-toast-leave-to { opacity: 0; transform: translateY(-8px) }
.account-toast-enter-active.is-capsule { animation: capsule-pop .62s cubic-bezier(.17,.9,.22,1) both; }
.account-toast-enter-active.is-capsule .toast-badge { animation: capsule-icon-pop .55s cubic-bezier(.17,.9,.22,1) .06s both; }
@keyframes capsule-pop { 0% { opacity: 0; transform: translateY(10px) scale(.82) } 55% { opacity: 1; transform: translateY(-2px) scale(1.045) } 100% { opacity: 1; transform: none } }
@keyframes capsule-icon-pop { 0% { transform: scale(.4) rotate(-12deg); filter: brightness(.7) } 65% { transform: scale(1.18) rotate(3deg); filter: brightness(1.35) } 100% { transform: scale(1); filter: none } }
@keyframes inventory-refined-in { 0% { opacity: 0; transform: translateY(-10px) scale(.98) } 65% { opacity: 1; transform: translateY(1px) scale(1.005) } 100% { opacity: 1; transform: none } }
@keyframes inventory-icon-ring { 0% { box-shadow: 0 0 0 0 rgba(215, 137, 53, .28) } 100% { box-shadow: 0 0 0 10px rgba(215, 137, 53, 0) } }
.account-event-preview { position: fixed; z-index: 119; right: 22px; bottom: 22px; display: flex; max-width: calc(100vw - 32px); align-items: center; gap: 5px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 28px rgba(73, 59, 44, .16) }
.account-event-preview strong { padding: 0 7px; color: var(--ink-60); font-size: 10px; white-space: nowrap }
.account-event-preview button { min-height: 32px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink); font: 800 10.5px var(--font-b); cursor: pointer }
.account-event-preview button:hover { border-color: var(--accent); color: var(--accent-strong) }
.account-event-preview button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
@media (max-width: 767px) {
  .account-event-toasts { top: auto; right: 16px; bottom: calc(78px + env(safe-area-inset-bottom)); left: auto; width: min(320px, calc(100vw - 32px)); align-items: flex-end }
  .account-event-toast.is-capsule { max-width: calc(100vw - 32px); }
  .account-event-toast.is-capsule .toast-copy { max-width: min(154px, calc(100vw - 146px)); }
  .account-event-toast.is-inventory { width: min(330px, calc(100vw - 32px)); }
  .account-event-preview { right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); left: 12px; overflow-x: auto }
}
@media (prefers-reduced-motion: reduce) {
  .account-toast-enter-active, .account-toast-leave-active, .account-toast-enter-active.is-capsule, .account-toast-enter-active.is-capsule .toast-badge, .account-toast-enter-active.is-inventory, .account-toast-enter-active.is-inventory .toast-badge { animation: none; transition: none }
}
</style>
