<template>
  <section
    class="data-account-context-bar"
    :class="{ 'is-empty': !hasAccount, 'is-loading': loading }"
    role="region"
    aria-label="当前数据账号"
  >
    <div class="context-leading">
      <span class="context-icon" aria-hidden="true"><Users :size="17" /></span>
      <div class="context-copy">
        <span class="context-kicker">当前数据账号</span>
        <strong v-if="loading">正在读取游戏账号…</strong>
        <strong v-else-if="!isLoggedIn">未登录</strong>
        <div
          v-else-if="hasAccount"
          class="context-identity"
          :aria-label="'当前数据账号：' + resolvedGame + '，' + selectedAccount.name"
        >
          <span
            class="game-tag"
            :class="resolvedGame === '如鸢' ? 'is-ruyuan' : 'is-daihao'"
          >{{ resolvedGame }}</span>
          <strong class="account-name" :title="selectedAccount.name">{{ selectedAccount.name }}</strong>
        </div>
        <strong v-else>未选择游戏账号</strong>
        <small>
          <template v-if="loading">账号加载完成后会在这里显示数据归属。</template>
          <template v-else-if="!isLoggedIn">登录后会显示你的真实游戏账号与数据归属。</template>
          <template v-else-if="hasAccount">{{ description }}</template>
          <template v-else>创建游戏账号后，密探、库存、星石与同步数据都会归属到对应账号。</template>
        </small>
      </div>
    </div>

    <router-link
      v-if="isLoggedIn"
      class="context-action"
      :to="manageTo"
    >
      管理游戏账号
    </router-link>
    <router-link
      v-else
      class="context-action"
      :to="{ path: '/login', query: { redirect: currentPath } }"
    >
      登录
    </router-link>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Users } from '@lucide/vue'
import { normalizeAccountGame } from '../store/activeAccount.js'

const props = defineProps({
  accounts: { type: Array, default: function () { return [] } },
  accountId: { type: String, default: '' },
  game: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  description: {
    type: String,
    default: '本页查看、录入与同步数据均归属此账号。',
  },
  manageTo: { type: [String, Object], default: '/user/profile#game-accounts' },
})

const route = useRoute()

const selectedAccount = computed(function () {
  return props.accounts.find(function (account) {
    return account && account.id === props.accountId
  }) || null
})

const hasAccount = computed(function () {
  return !!(props.isLoggedIn && selectedAccount.value)
})

const resolvedGame = computed(function () {
  if (!selectedAccount.value) return normalizeAccountGame(props.game)
  return normalizeAccountGame(selectedAccount.value.game || props.game)
})

const currentPath = computed(function () {
  return route.fullPath || '/'
})
</script>

<style scoped>
.data-account-context-bar {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(73, 59, 44, .045);
}
.context-leading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}
.context-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: var(--yellow);
  color: var(--ink);
}
.context-copy {
  min-width: 0;
}
.context-kicker {
  display: block;
  margin-bottom: 2px;
  color: var(--accent-strong);
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: .11em;
}
.context-copy > strong {
  display: block;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}
.game-tag {
  display: inline-flex;
  min-height: 23px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
  letter-spacing: .035em;
  white-space: nowrap;
}
.game-tag.is-daihao {
  border-color: rgba(215, 137, 53, .28);
  background: rgba(239, 210, 142, .24);
  color: var(--accent-strong);
}
.game-tag.is-ruyuan {
  border-color: rgba(91, 106, 140, .24);
  background: rgba(91, 106, 140, .09);
  color: var(--brand-blue);
}
.account-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-copy small {
  display: block;
  margin-top: 3px;
  color: var(--ink-60);
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.45;
}
.context-action {
  display: inline-flex;
  min-height: 40px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1.5px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  background: var(--paper);
  font-size: 12px;
  font-weight: 800;
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

@media (max-width: 640px) {
  .data-account-context-bar {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
    padding: 13px 14px;
  }
  .context-leading {
    align-items: flex-start;
  }
  .context-copy > strong {
    white-space: normal;
  }
  .context-identity {
    align-items: flex-start;
  }
  .account-name {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
  .context-action {
    width: 100%;
    min-height: 44px;
  }
}
</style>
