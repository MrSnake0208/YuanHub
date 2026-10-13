<template>
  <section
    class="data-account-context-bar"
    :class="{ 'is-empty': !hasAccount, 'is-loading': loading, 'is-compact': compact }"
    role="region"
    aria-label="当前数据账号"
  >
    <template v-if="compact">
      <AccountSwitcher v-if="isLoggedIn" ref="switcher" :accounts="accounts" :account-id="accountId" :game="game" :loading="loading" :load-error="error"
        :disabled="switchDisabled" :disabled-reason="switchDisabledReason" :before-switch="beforeSwitch" :manage-to="manageTo" />
      <router-link v-else class="context-selector" :to="{ path: '/login', query: { redirect: currentPath } }">未登录</router-link>
      <small v-if="error" class="context-error" role="alert">{{ error }}</small>
      <slot name="actions" />
    </template>
    <template v-else>
    <div class="context-leading">
      <span class="context-icon" aria-hidden="true"><Users :size="17" /></span>
      <div class="context-copy">
        <span class="context-kicker">当前数据账号</span>
        <strong v-if="loading">正在读取游戏账号…</strong>
        <strong v-else-if="!isLoggedIn">未登录</strong>
        <AccountSwitcher v-else ref="switcher" :accounts="accounts" :account-id="accountId" :game="game" :loading="loading" :load-error="error"
          :disabled="switchDisabled" :disabled-reason="switchDisabledReason" :before-switch="beforeSwitch" :manage-to="manageTo" />
        <small v-if="!compact">
          <template v-if="loading">账号加载完成后会在这里显示数据归属。</template>
          <template v-else-if="!isLoggedIn">登录后会显示你的真实游戏账号与数据归属。</template>
          <template v-else-if="hasAccount">{{ description }}</template>
          <template v-else>创建游戏账号后，密探、库存、星石与同步数据都会归属到对应账号。</template>
        </small>
        <small v-if="error" class="context-error" role="alert">{{ error }}</small>
      </div>
    </div>

    <div class="context-actions">
      <button
        v-if="isLoggedIn"
        class="context-action"
        type="button"
        :disabled="loading || switchDisabled"
        @click="switcher?.openManager('list', $event.currentTarget)"
      >
        管理游戏账号
      </button>
      <router-link
        v-else
        class="context-action"
        :to="{ path: '/login', query: { redirect: currentPath } }"
      >
        登录
      </router-link>
      <slot name="actions" />
    </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Users } from '@lucide/vue'
import AccountSwitcher from './AccountSwitcher.vue'

const props = defineProps({
  switchDisabled: Boolean,
  switchDisabledReason: { type: String, default: '' },
  beforeSwitch: Function,
  compact: { type: Boolean, default: false },
  accounts: { type: Array, default: function () { return [] } },
  accountId: { type: String, default: '' },
  game: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  description: {
    type: String,
    default: '本页查看、录入与同步数据均归属此账号。',
  },
  manageTo: { type: [String, Object], default: '/user/profile#game-accounts' },
})

const route = useRoute()
const switcher = ref(null)
defineExpose({ openManager: (view, opener) => switcher.value?.openManager(view, opener) })

const selectedAccount = computed(function () {
  return props.accounts.find(function (account) {
    return account && account.id === props.accountId
  }) || null
})

const hasAccount = computed(function () {
  return !!(props.isLoggedIn && selectedAccount.value)
})

const currentPath = computed(function () {
  return route?.fullPath || '/'
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.data-account-context-bar {
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(73, 59, 44, .045);
}
.context-icon {
  border-radius: 11px;
  background: var(--yellow);
  color: var(--ink);
}
.context-kicker {
  color: var(--accent-strong);
}
.context-copy > strong {
  color: var(--ink);
}
.context-copy small {
  color: var(--ink-60);
}
.context-copy .context-error { color: var(--rouge); }
.context-action {
  border: 1.5px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  background: var(--paper);
  text-decoration: none;
  transition: border-color .2s var(--ease), color .2s var(--ease), background-color .2s var(--ease);
}
.context-action:hover,
.context-action:focus-visible {
  border-color: var(--accent);
  color: var(--ink);
  background: var(--cream);
  outline: none;
}
.data-account-context-bar.is-empty {
  border-left-color: var(--line);
}
.data-account-context-bar.is-loading {
  opacity: .82;
}
.data-account-context-bar.is-compact { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.context-selector { border-radius: 6px; color: var(--ink-60); text-decoration: none; }
.context-selector::before { content: ''; border-radius: 6px; background: color-mix(in srgb, var(--cream) 75%, transparent); }
.context-selector:hover { color: var(--tea); }
.context-selector:hover::before { background: var(--cream); }
.context-selector:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.is-compact .context-error { color: var(--rouge); }
</style>
<style scoped src="./dataAccountContextBarDesktop.css"></style>
<style scoped src="./dataAccountContextBarMobile.css"></style>
