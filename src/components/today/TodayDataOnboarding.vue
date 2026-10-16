<template>
  <section
    class="data-onboarding"
    aria-labelledby="data-onboarding-title"
  >
    <div class="onboarding-heading">
      <div>
        <span class="onboarding-kicker">{{ onboardingStage === 'data' && Object.values(dataReadiness).includes('unknown') ? '数据状态待确认' : '第一次建档' }}</span>
        <h2 id="data-onboarding-title">{{ onboardingTitle }}</h2>
        <p>{{ onboardingDescription }}</p>
      </div>
      <span class="onboarding-note">{{ onboardingNote }}</span>
    </div>

    <div v-if="onboardingStage === 'auth'" class="auth-onboarding-card">
      <span class="entry-icon" aria-hidden="true"><Users :size="20" /></span>
      <div class="auth-onboarding-copy">
        <h3>先登录 YuanHub</h3>
        <p>登录后会继续检查你有没有子账号，再分别检查密探、库存和星石。已经有的数据不会要求你重复录入。</p>
      </div>
      <div class="auth-onboarding-actions">
        <router-link class="entry-primary-action" :to="{ path: '/login', query: { redirect: '/' } }">
          登录并继续
          <ArrowRight :size="16" aria-hidden="true" />
        </router-link>
        <router-link class="entry-secondary-action" to="/register">还没有账号？注册</router-link>
      </div>
    </div>

    <div
      v-else-if="onboardingStage === 'account'"
      class="inline-account-card account-management-card"
      data-tour="today-create-account"
      aria-labelledby="inline-account-title"
    >
      <div class="inline-account-intro">
        <span class="entry-icon" aria-hidden="true"><Users :size="20" /></span>
        <div>
          <h3 id="inline-account-title">先建立你的游戏账号</h3>
          <p>在这里创建游戏账号，今日一览会自动继续检查这个账号的数据。</p>
        </div>
      </div>
      <button
        class="entry-primary-action account-management-action"
        type="button"
        @click="$emit('create-account', $event.currentTarget)"
      >
        创建游戏账号
        <ArrowRight :size="16" aria-hidden="true" />
      </button>
    </div>

    <div v-else-if="onboardingStage === 'data'" class="entry-choice-wrap" data-tour="today-entry-choice">
      <div class="data-readiness-grid" aria-label="当前账号的数据准备状态">
        <article
          v-for="item in dataSetupItems"
          :key="item.key"
          class="data-readiness-card"
          :class="{ 'is-ready': item.status === 'ready', 'is-unknown': item.status === 'unknown' }"
        >
          <div class="readiness-card-head">
            <span class="readiness-icon" aria-hidden="true"><component :is="item.icon" :size="19" /></span>
            <div>
              <h3>{{ item.title }}</h3>
              <span class="readiness-status">{{ item.statusLabel }}</span>
            </div>
          </div>
          <p v-if="item.status !== 'empty'">{{ item.description }}</p>
          <router-link
            v-if="item.status === 'empty'"
            class="readiness-action"
            :to="item.manualTo"
          >
            {{ item.manualLabel }}
            <ArrowRight :size="14" aria-hidden="true" />
          </router-link>
        </article>
      </div>

      <article v-if="autoSyncMissingItems.length" class="sync-recommendation">
        <div class="sync-recommendation-copy">
          <span class="entry-icon" aria-hidden="true"><Link2 :size="20" /></span>
          <div>
            <span class="recommend-badge">推荐</span>
            <h3>连接 MaaYuan 自动同步</h3>
            <p>
              自动同步：{{ autoSyncMissingLabel }}。完成对应 MaaYuan 任务后更新到当前游戏账号。
            </p>
            <small v-if="dataReadiness.star === 'empty'">星石暂需手动录入。</small>
          </div>
        </div>
        <router-link class="entry-primary-action" :to="maaYuanConnectTo">
          连接 MaaYuan
          <ArrowRight :size="16" aria-hidden="true" />
        </router-link>
      </article>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, Link2, Users } from '@lucide/vue'

defineProps({
  onboardingTitle: { type: String, required: true },
  onboardingDescription: { type: String, required: true },
  onboardingNote: { type: String, required: true },
  onboardingStage: { type: String, required: true },
  dataSetupItems: { type: Array, required: true },
  autoSyncMissingItems: { type: Array, required: true },
  autoSyncMissingLabel: { type: String, required: true },
  dataReadiness: { type: Object, required: true },
  maaYuanConnectTo: { type: Object, required: true },
})
defineEmits(['create-account'])
</script>

<style scoped>
/* 刻意共享的字段外观，不持有双端布局。 */
.data-onboarding { border: 1px solid rgba(156, 122, 77, .3); background: linear-gradient(145deg, rgba(255, 253, 246, .94), rgba(239, 210, 142, .12)); }
.onboarding-kicker { color: var(--accent); font: 800 11px/1 var(--font-d); letter-spacing: .14em; }
.onboarding-heading h2 { font-family: var(--font-s); font-weight: 900; }
.onboarding-heading p { color: rgba(73, 59, 44, .68); line-height: 1.75; }
.onboarding-note { color: var(--ink-60); line-height: 1.6; }
.auth-onboarding-card { border: 1px solid rgba(156, 122, 77, .24); background: rgba(255, 253, 246, .9); }
.auth-onboarding-copy h3 { font-family: var(--font-s); font-weight: 900; }
.auth-onboarding-copy p { color: rgba(73, 59, 44, .61); line-height: 1.65; }
.inline-account-card { border: 1px solid rgba(215, 137, 53, .36); background: rgba(255, 253, 246, .9); box-shadow: inset 0 3px 0 rgba(215, 137, 53, .32); }
.inline-account-intro h3 { font-family: var(--font-s); font-weight: 900; }
.inline-account-intro p { color: rgba(73, 59, 44, .61); line-height: 1.65; }
.account-management-action { white-space: normal; }
.data-readiness-card { border: 1px solid rgba(215, 137, 53, .34); background: rgba(255, 253, 246, .9); }
.data-readiness-card.is-ready { border-color: rgba(98, 128, 93, .28); background: rgba(98, 128, 93, .07); }
.data-readiness-card.is-unknown { border-style: dashed; border-color: rgba(91, 106, 140, .28); }
.readiness-icon { background: rgba(215, 137, 53, .1); color: var(--accent); }
.is-ready .readiness-icon { background: rgba(98, 128, 93, .12); color: #587253; }
.readiness-card-head h3 { font-family: var(--font-s); font-weight: 900; }
.readiness-status { color: var(--accent); font-weight: 900; }
.is-ready .readiness-status { color: #587253; }
.is-unknown .readiness-status { color: var(--brand-blue); }
.data-readiness-card > p { color: rgba(73, 59, 44, .6); line-height: 1.65; }
.readiness-action { background: rgba(156, 122, 77, .08); color: var(--ink); font-weight: 900; text-decoration: none; }
.readiness-action:hover { background: rgba(239, 210, 142, .22); }
.sync-recommendation { border: 1px solid rgba(215, 137, 53, .36); background: rgba(239, 210, 142, .11); }
.sync-recommendation h3 { font-family: var(--font-s); font-weight: 900; }
.sync-recommendation p { color: rgba(73, 59, 44, .62); line-height: 1.65; }
.sync-recommendation small { color: rgba(73, 59, 44, .52); line-height: 1.55; }
.entry-icon { background: rgba(215, 137, 53, .1); color: var(--accent); }
.recommend-badge { background: rgba(239, 210, 142, .48); color: var(--tea); }
.entry-primary-action, .entry-secondary-action { font-weight: 900; text-decoration: none; }
.entry-primary-action { background: var(--tea); color: var(--cream); box-shadow: 0 8px 18px rgba(73, 59, 44, .12); }
.entry-secondary-action { border: 1px solid rgba(73, 59, 44, .22); color: var(--ink); }

a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
<style scoped src="./todayOnboardingDesktop.css"></style>
<style scoped src="./todayOnboardingMobile.css"></style>
