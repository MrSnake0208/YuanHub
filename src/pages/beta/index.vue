<template>
  <div class="page-beta">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero beta-hero">
        <div class="wrap">
          <div class="beta-hero-grid">
            <div class="beta-intro">
              <div class="crumb">
                <span class="pill fill">YuanHub</span>
                <span class="plain">邀请测试</span>
              </div>

              <p class="beta-kicker">WELCOME TO YUANHUB</p>
              <h1>
                先来坐坐吧
                <span class="small">一起把它变得更好</span>
              </h1>
              <p class="hero-sub">
                我们正在邀请第一批殿下提前体验 YuanHub。不用写申请，也不用懂技术；
                正常用一用、告诉我们哪里顺手或哪里别扭，就是最有帮助的反馈。
              </p>

              <div class="beta-promises" aria-label="参与说明">
                <span><CheckCircle2 :size="16" aria-hidden="true" /> 不需要人工审核</span>
                <span><CheckCircle2 :size="16" aria-hidden="true" /> 报名满额自动候补</span>
                <span><CheckCircle2 :size="16" aria-hidden="true" /> 不影响公开功能</span>
              </div>
            </div>

            <section class="invite-card" :class="'tone-' + copy.tone" aria-labelledby="beta-status-title">
              <div class="invite-paper" aria-hidden="true"></div>
              <div class="invite-card-inner">
                <div class="invite-card-top">
                  <span class="invite-status">
                    <i class="status-dot" aria-hidden="true"></i>
                    {{ statusLabel }}
                  </span>
                  <button
                    v-if="showRefresh"
                    class="icon-refresh"
                    type="button"
                    :disabled="refreshing"
                    :aria-label="refreshing ? '正在重新确认状态' : '重新确认状态'"
                    @click="refresh"
                  >
                    <RefreshCw :size="17" :class="{ spinning: refreshing }" aria-hidden="true" />
                  </button>
                </div>

                <div class="invite-seal" aria-hidden="true">
                  <Sparkles :size="28" />
                </div>

                <p class="invite-eyebrow">{{ invitationEyebrow }}</p>
                <h2 id="beta-status-title">{{ copy.title }}</h2>
                <p class="invite-description">{{ copy.description }}</p>
                <p v-if="error" class="beta-error" role="alert">{{ error }}</p>

                <div class="invite-action">
                  <template v-if="!auth.isLoggedIn">
                    <router-link class="beta-button primary" :to="authLink('/login')">
                      登录后参与
                      <ArrowRight :size="17" aria-hidden="true" />
                    </router-link>
                    <router-link class="beta-text-link" :to="authLink('/register')">还没有账号？注册一个</router-link>
                    <p class="action-note">已有作业站账号可以直接登录，注册本身不会占用内测名额。</p>
                  </template>

                  <template v-else-if="granted || campaign?.accessMode === 'OPEN'">
                    <router-link class="beta-button primary" :to="entryTarget">
                      进入 YuanHub
                      <ArrowRight :size="17" aria-hidden="true" />
                    </router-link>
                    <p class="action-note">{{ campaign?.accessMode === 'OPEN' ? 'YuanHub 已正式开放，现在无需内测资格。' : '资格已经开通，不需要重新登录。第一次来可以从「今日一览」开始。' }}</p>
                  </template>

                  <template v-else-if="waiting">
                    <div class="waiting-note">
                      <Clock3 :size="18" aria-hidden="true" />
                      <span>已经排上啦，有位置时会自动开通，不用反复刷新。</span>
                    </div>
                    <button class="beta-text-button" type="button" :disabled="submitting" @click="withdraw">
                      {{ submitting ? '正在处理…' : '不想等了，取消候补' }}
                    </button>
                    <p class="action-note">取消后如果再次报名，会重新排到队尾。</p>
                  </template>

                  <template v-else-if="canJoin">
                    <button class="beta-button primary" type="button" :disabled="submitting" @click="join">
                      {{ submitting ? '正在确认…' : joinButtonLabel }}
                      <ArrowRight v-if="!submitting" :size="17" aria-hidden="true" />
                    </button>
                    <p class="action-note">点击即表示你已了解这是测试版本；如果当前批次满额，会自动加入候补。</p>

                    <details class="preference-details">
                      <summary>顺便告诉我们，你最想体验什么？<span>选填</span></summary>
                      <div class="beta-interests">
                        <label v-for="intent in BETA_INTENTS" :key="intent.key" class="beta-interest">
                          <input v-model="intentTags" type="checkbox" :value="intent.key">
                          <span>{{ intent.label }}</span>
                        </label>
                      </div>
                    </details>
                  </template>

                  <template v-else>
                    <button
                      v-if="showRefresh"
                      class="beta-button secondary"
                      type="button"
                      :disabled="refreshing"
                      @click="refresh"
                    >
                      <RefreshCw :size="16" :class="{ spinning: refreshing }" aria-hidden="true" />
                      {{ refreshing ? '正在确认…' : '重新确认状态' }}
                    </button>
                    <p v-else class="action-note">可以先看看下面能体验到什么，开放后再回来参加。</p>
                  </template>

                  <p
                    v-if="submitMessage"
                    class="beta-feedback"
                    :class="{ 'is-error': submitFailed }"
                    :role="submitFailed ? 'alert' : 'status'"
                  >
                    {{ submitMessage }}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </header>

      <section class="beta-content wrap">
        <div v-if="campaign?.localTestMode" class="local-banner" role="note">
          <div class="local-banner-copy">
            <span class="local-chip">LOCAL</span>
            <div>
              <b>当前是本地内测模拟</b>
              <p>报名、候补和资格都与正式活动隔离，可以放心反复测试流程。</p>
            </div>
          </div>
          <button
            v-if="canResetLocalTest"
            class="local-reset"
            type="button"
            :disabled="resetting"
            @click="resetLocalTest"
          >
            {{ resetting ? '正在重置…' : '重置测试状态' }}
          </button>
        </div>

        <section class="experience-section" aria-labelledby="experience-title">
          <div class="section-heading">
            <p class="section-kicker">这次可以体验</p>
            <h2 id="experience-title">先从你真正会用到的地方开始</h2>
            <p>不用刻意“找 Bug”。按平时的习惯使用，哪里顺、哪里卡、哪里看不懂，都值得告诉我们。</p>
          </div>

          <div class="experience-grid">
            <article class="experience-card">
              <div class="experience-icon"><CalendarDays :size="22" aria-hidden="true" /></div>
              <div>
                <h3>今日一览</h3>
                <p>把每天要看的信息和可做的事情放到一起，少翻几层页面。</p>
              </div>
            </article>

            <article class="experience-card">
              <div class="experience-icon"><PackageOpen :size="22" aria-hidden="true" /></div>
              <div>
                <h3>背包与奖励统计</h3>
                <p>整理道具、派遣与据点奖励，配合 MaaYuan 可自动同步数据。</p>
              </div>
            </article>

            <article class="experience-card">
              <div class="experience-icon"><Sparkles :size="22" aria-hidden="true" /></div>
              <div>
                <h3>养成规划</h3>
                <p>看看今天的体力怎么分、距离目标还差多少，让养成更有数。</p>
              </div>
            </article>

            <article class="experience-card">
              <div class="experience-icon"><Share2 :size="22" aria-hidden="true" /></div>
              <div>
                <h3>BOX 分享</h3>
                <p>把自己的密探练度整理成更方便查看和分享的页面。</p>
              </div>
            </article>
          </div>
        </section>

        <section v-if="showSteps" class="steps-section" aria-labelledby="steps-title">
          <div class="section-heading compact">
            <p class="section-kicker">参加很简单</p>
            <h2 id="steps-title">三步就可以开始</h2>
          </div>

          <ol class="beta-steps">
            <li>
              <span class="step-number">01</span>
              <div>
                <b>登录 YuanHub</b>
                <p>已有账号直接登录；注册账号不会占体验名额。</p>
              </div>
            </li>
            <li>
              <span class="step-number">02</span>
              <div>
                <b>点一下报名</b>
                <p>有位置会直接开通，满额则自动加入候补。</p>
              </div>
            </li>
            <li>
              <span class="step-number">03</span>
              <div>
                <b>照常使用就好</b>
                <p>顺手、别扭、没看懂的地方，都可以随时反馈。</p>
              </div>
            </li>
          </ol>
        </section>

        <section class="details-section" aria-labelledby="details-title">
          <div class="section-heading compact">
            <p class="section-kicker">想了解更多</p>
            <h2 id="details-title">关于这次邀请测试</h2>
            <p>下面是名额和候补的具体规则。不影响你报名，想知道时再展开看。</p>
          </div>

          <div class="faq-list">
            <details>
              <summary>
                <span>为什么这次会有限额？</span>
                <small>查看说明</small>
              </summary>
              <div class="faq-body">
                <p>我们希望先用一小批真实用户验证同步、数据展示和使用流程是否稳定，再逐步放大范围。</p>
                <p v-if="campaign">本轮当前容量为 <b>{{ campaign.capacity }}</b> 人，最多可扩到 <b>{{ campaign.maxCapacity }}</b> 人；是否扩容会根据测试情况决定。</p>
              </div>
            </details>

            <details>
              <summary>
                <span>MaaYuan Share 用户的预留名额是什么？</span>
                <small>查看说明</small>
              </summary>
              <div class="faq-body">
                <p>首批名额中有一部分会预留给快照时已经符合条件的 MaaYuan Share 用户，仍然按报名顺序发放，并不是每位用户都保证一份。</p>
                <p v-if="inBeta">当前预留名额还剩 <b>{{ campaign.reservedRemaining }}</b> 个；名单对应时点为 {{ time(campaign.snapshotAt) }}。</p>
              </div>
            </details>

            <details>
              <summary>
                <span>名额满了以后会怎么样？</span>
                <small>查看说明</small>
              </summary>
              <div class="faq-body">
                <p>报名不会失败，而是自动进入候补。有释放或新增名额时会按报名先后自动开通，不需要一直盯着页面刷新。</p>
                <p v-if="inBeta">Share 预留从开放起保留 72 小时，未使用的部分会转给候补；本轮预留结束时间是 {{ time(campaign.reservedUntil) }}。</p>
              </div>
            </details>

            <details>
              <summary>
                <span>什么时候开始？正式开放后怎么办？</span>
                <small>查看说明</small>
              </summary>
              <div class="faq-body">
                <p v-if="campaign?.startsAt">本轮邀请测试开放时间为 {{ time(campaign.startsAt) }}。</p>
                <p>正式开放后不再需要内测资格，现有账号可以直接继续使用；这里的名额数字只作为本轮测试记录保留。</p>
              </div>
            </details>
          </div>
        </section>

        <section class="feedback-callout" aria-label="反馈入口">
          <div>
            <p class="section-kicker">不需要成为测试专家</p>
            <h2>“这里有点难懂”，就是很有价值的反馈</h2>
            <p>遇到显示异常、同步失败，或者只是觉得某一步不够自然，都可以直接告诉我们。</p>
          </div>
          <router-link class="beta-button secondary" to="/feedback">
            去反馈
            <ArrowRight :size="16" aria-hidden="true" />
          </router-link>
        </section>

        <div class="beta-links">
          <router-link to="/works">看看公开作业</router-link>
          <router-link to="/cart">使用本地账房</router-link>
          <router-link to="/feedback">反馈问题</router-link>
        </div>

        <p v-if="resetMessage" class="beta-feedback local-feedback" :class="{ 'is-error': resetFailed }" :role="resetFailed ? 'alert' : 'status'">
          {{ resetMessage }}
        </p>
      </section>

      <SiteFooter>
        <template #big>从这里，一起完善<br><span>YuanHub · 邀请测试</span></template>
        <template #fine>不用懂技术，也不用刻意找问题<br>真实使用感受，就是最有用的反馈</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageOpen,
  RefreshCw,
  Share2,
  Sparkles
} from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { beta } from '../../store/beta.js'
import { BETA_INTENTS, betaEntryTarget, betaStatusCopy, formatBetaDay } from '../../utils/betaAccess.js'

const STATUS_LABELS = {
  error: '暂时读不到状态',
  loading: '正在确认',
  closed: '暂时维护中',
  pending: '即将开放',
  open: '已经正式开放',
  granted: '你的资格已开通',
  paused: '暂停新增',
  waiting: '等待开通中',
  reserved: '预留资格可用',
  join: '报名开放中',
  full: '当前已满',
  info: '邀请测试'
}

const route = useRoute()
const intentTags = ref([])
const submitting = ref(false)
const submitMessage = ref('')
const submitFailed = ref(false)
const resetting = ref(false)
const resetMessage = ref('')
const resetFailed = ref(false)

const campaign = computed(() => beta.campaign)
const mine = computed(() => beta.mine)
const error = computed(() => beta.publicError || beta.personalError)
const copy = computed(() => betaStatusCopy(campaign.value, mine.value, error.value))
const refreshing = computed(() => beta.publicLoading || beta.personalLoading)
const entryTarget = computed(() => betaEntryTarget(route.query.redirect))
const statusLabel = computed(() => STATUS_LABELS[copy.value.tone] || '邀请测试')
const canJoin = computed(() => !error.value && mine.value?.nextAction === 'JOIN' && campaign.value?.accessMode === 'BETA')
const waiting = computed(() => mine.value?.enrollmentStatus === 'WAITING')
const granted = computed(() => !error.value && !!mine.value?.canUseBetaFeatures && campaign.value?.accessMode !== 'CLOSED')
const showSteps = computed(() => !['granted', 'open'].includes(copy.value.tone))
const canResetLocalTest = computed(() => mine.value?.canResetLocalTest === true)
const inBeta = computed(() => campaign.value?.accessMode === 'BETA' && !!campaign.value?.snapshotAt)
const showRefresh = computed(() => ['error', 'loading', 'waiting'].includes(copy.value.tone))
const invitationEyebrow = computed(() => {
  if (!auth.isLoggedIn) return '先登录，再参加'
  if (granted.value) return '欢迎进来'
  if (waiting.value) return '已经为你登记'
  if (canJoin.value) return '现在就可以参加'
  if (campaign.value?.accessMode === 'OPEN') return '欢迎使用'
  return '本轮邀请测试'
})
const joinButtonLabel = computed(() => {
  if (mine.value?.shareSnapshotEligible && campaign.value?.reservedRemaining > 0) return '领取体验资格'
  if (campaign.value?.admissionsPaused || ['FULL', 'PUBLIC_FULL_RESERVED_REMAIN', 'ALLOCATION_PENDING'].includes(campaign.value?.publicState)) return '加入候补'
  return '立即报名体验'
})

let unsubscribe
function time(value) { return formatBetaDay(value, campaign.value?.announcementTimezone) }
function authLink(path) { return { path, query: { redirect: route.fullPath } } }
async function refresh() { await beta.refresh() }

async function join() {
  if (submitting.value || !canJoin.value) return
  submitting.value = true
  submitMessage.value = ''
  submitFailed.value = false
  try {
    const result = await beta.join({
      campaignId: campaign.value.campaignId,
      rulesVersion: campaign.value.rulesVersion,
      acceptedTerms: true,
      acceptWaitlist: true,
      intentTags: intentTags.value
    })
    if (result) {
      submitMessage.value = result.canUseBetaFeatures
        ? '欢迎进来，体验资格已经开通。'
        : '已经帮你排上啦，有位置时会自动开通。'
    }
  } catch (e) {
    submitFailed.value = true
    submitMessage.value = e.message || '暂时无法确认报名结果，请重新确认状态后再试。'
  } finally {
    submitting.value = false
  }
}

async function withdraw() {
  if (!window.confirm('确定取消候补吗？再次报名会重新排到队尾。')) return
  submitting.value = true
  submitMessage.value = ''
  submitFailed.value = false
  try {
    await beta.withdraw()
    submitMessage.value = '已取消候补，账号和公开功能仍可正常使用。'
  } catch (e) {
    submitFailed.value = true
    submitMessage.value = e.message
    await beta.refresh()
  } finally {
    submitting.value = false
  }
}

async function resetLocalTest() {
  if (resetting.value) return
  if (!window.confirm('重置本地内测？会清空本地活动的报名、资格和相关通知，并立即重新开放；不影响正式内测。')) return
  resetting.value = true
  resetMessage.value = ''
  resetFailed.value = false
  submitting.value = false
  submitMessage.value = ''
  submitFailed.value = false
  try {
    await beta.resetLocalTest()
    intentTags.value = []
    resetMessage.value = '本地内测已重置，可以重新测试报名流程。'
  } catch (e) {
    resetFailed.value = true
    resetMessage.value = e.message || '重置失败，请刷新后重试。'
  } finally {
    resetting.value = false
  }
}

onMounted(() => { unsubscribe = beta.subscribe() })
onBeforeUnmount(() => { unsubscribe?.() })
</script>

<style scoped>
.page-beta {
  min-height: 100vh;
}

.page-beta .hero {
  --wm: '邀';
}

.beta-hero {
  padding-bottom: clamp(54px, 7vw, 84px);
}

.beta-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(340px, .72fr);
  align-items: center;
  gap: clamp(36px, 6vw, 74px);
}

.beta-intro {
  min-width: 0;
  padding-bottom: 8px;
}

.beta-kicker,
.section-kicker {
  margin: 30px 0 0;
  color: var(--accent-strong);
  font: 900 11px/1.4 var(--font-d);
  letter-spacing: .18em;
}

.beta-intro h1 {
  display: block;
  max-width: 700px;
  margin-top: 12px;
  font-size: clamp(58px, 7vw, 96px);
  line-height: .98;
}

.beta-intro h1 .small {
  display: block;
  width: fit-content;
  margin: 18px 0 0 3px;
  padding: 9px 15px 10px;
  font-size: clamp(16px, 1.7vw, 23px);
}

.beta-promises {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 24px;
  color: rgba(73, 59, 44, .72);
  font-size: 12.5px;
  font-weight: 700;
}

.beta-promises span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.beta-promises svg {
  color: var(--tea);
}

.invite-card {
  --tone: var(--yellow-deep);
  position: relative;
  z-index: 3;
  min-width: 0;
  padding: 9px;
}

.invite-card.tone-join,
.invite-card.tone-reserved {
  --tone: var(--accent);
}

.invite-card.tone-granted,
.invite-card.tone-open {
  --tone: var(--tea);
}

.invite-card.tone-waiting,
.invite-card.tone-paused {
  --tone: var(--yellow-deep);
}

.invite-card.tone-error {
  --tone: var(--rouge);
}

.invite-card.tone-closed,
.invite-card.tone-pending,
.invite-card.tone-full,
.invite-card.tone-loading,
.invite-card.tone-info {
  --tone: var(--ink-35);
}

.invite-paper {
  position: absolute;
  inset: 18px 2px 0 18px;
  border: 1px solid rgba(73, 59, 44, .14);
  border-radius: 28px 10px 28px 12px;
  background: rgba(255, 253, 246, .56);
  transform: rotate(2.2deg);
  box-shadow: 0 28px 50px -38px rgba(73, 59, 44, .52);
}

.invite-card-inner {
  position: relative;
  min-height: 420px;
  padding: clamp(26px, 4vw, 38px);
  border: 1px solid rgba(73, 59, 44, .18);
  border-radius: 26px 12px 26px 12px;
  background:
    linear-gradient(rgba(255, 253, 246, .95), rgba(255, 253, 246, .95)),
    repeating-linear-gradient(0deg, rgba(73, 59, 44, .02) 0 1px, transparent 1px 5px);
  box-shadow: 0 30px 70px -48px rgba(73, 59, 44, .62);
}

.invite-card-inner::after {
  position: absolute;
  right: 28px;
  bottom: 24px;
  width: 70px;
  height: 70px;
  border: 1px solid color-mix(in srgb, var(--tone) 34%, transparent);
  border-radius: 50%;
  content: '';
  opacity: .44;
}

.invite-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.invite-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--tone) 58%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 7%, var(--surface));
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
}

.status-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 14%, transparent);
}

.icon-refresh {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}

.icon-refresh:hover:not(:disabled) {
  background: var(--cream);
  color: var(--ink);
}

.icon-refresh:disabled {
  opacity: .5;
  cursor: default;
}

.invite-seal {
  display: grid;
  width: 58px;
  height: 58px;
  margin-top: 30px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--tone) 52%, var(--line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--tone) 9%, var(--surface));
  color: var(--tone);
  box-shadow: inset 0 0 0 5px var(--surface);
}

.invite-eyebrow {
  margin: 18px 0 5px;
  color: var(--tone);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .08em;
}

.invite-card h2 {
  max-width: 440px;
  margin: 0;
  color: var(--ink);
  font: 900 clamp(26px, 3vw, 35px)/1.35 var(--font-s);
  letter-spacing: .025em;
}

.invite-description {
  max-width: 470px;
  margin: 12px 0 0;
  color: var(--ink-60);
  font-size: 14px;
  line-height: 1.85;
}

.beta-error {
  margin: 10px 0 0;
  color: var(--rouge);
  font-size: 13px;
  line-height: 1.7;
}

.invite-action {
  display: grid;
  justify-items: start;
  gap: 11px;
  margin-top: 24px;
  padding-top: 21px;
  border-top: 1px dashed var(--line);
}

.beta-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 11px 21px;
  border: 1px solid var(--tea);
  border-radius: 999px;
  background: transparent;
  color: var(--tea);
  font: 800 14px var(--font-b);
  text-decoration: none;
  cursor: pointer;
  transition: transform .25s var(--ease), background-color .25s var(--ease), border-color .25s var(--ease), color .25s var(--ease);
}

.beta-button.primary {
  min-width: 184px;
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
  box-shadow: 0 16px 30px -24px rgba(73, 59, 44, .8);
}

.beta-button:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  transform: translateY(-1px);
}

.beta-button.secondary:hover:not(:disabled) {
  background: var(--yellow);
  color: var(--ink);
  transform: none;
}

.beta-button:disabled {
  opacity: .55;
  cursor: default;
}

.beta-text-link,
.beta-text-button {
  border: 0;
  background: transparent;
  color: var(--tea);
  font: 800 12.5px var(--font-b);
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}

.beta-text-button {
  padding: 2px 0;
}

.beta-text-button:disabled {
  opacity: .5;
  cursor: default;
}

.action-note {
  max-width: 450px;
  margin: 0;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.75;
}

.waiting-note {
  display: flex;
  max-width: 440px;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  border-radius: 13px;
  background: var(--cream);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.65;
}

.waiting-note svg {
  flex: none;
  margin-top: 2px;
  color: var(--accent-strong);
}

.preference-details {
  width: min(100%, 470px);
  margin-top: 3px;
}

.preference-details summary {
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.preference-details summary span {
  margin-left: 6px;
  color: var(--ink-35);
  font-weight: 600;
}

.beta-interests {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.beta-interest {
  position: relative;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.beta-interest input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.beta-interest:has(input:checked) {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}

.beta-feedback {
  margin: 2px 0 0;
  color: var(--tea);
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.7;
}

.beta-feedback.is-error {
  color: var(--rouge);
}

.spinning {
  animation: beta-spin .85s linear infinite;
}

@keyframes beta-spin {
  to { transform: rotate(360deg); }
}

.beta-content {
  display: grid;
  gap: clamp(54px, 7vw, 84px);
  padding-top: clamp(52px, 7vw, 82px);
  padding-bottom: 54px;
}

.local-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: calc(clamp(54px, 7vw, 84px) * -0.45);
  padding: 14px 17px;
  border: 1px dashed var(--accent);
  border-radius: 16px;
  background: var(--cream);
}

.local-banner-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 13px;
}

.local-banner-copy b {
  display: block;
  color: var(--ink);
  font-size: 13px;
}

.local-banner-copy p {
  margin: 2px 0 0;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.6;
}

.local-chip {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font: 900 10px var(--font-d);
  letter-spacing: .08em;
}

.local-reset {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--tea);
  font: 800 12px var(--font-b);
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}

.local-reset:disabled {
  opacity: .5;
}

.section-heading {
  max-width: 680px;
}

.section-heading .section-kicker {
  margin: 0 0 8px;
}

.section-heading h2,
.feedback-callout h2 {
  margin: 0;
  color: var(--ink);
  font: 900 clamp(29px, 4vw, 43px)/1.34 var(--font-s);
  letter-spacing: .025em;
}

.section-heading > p:last-child,
.feedback-callout > div > p:last-child {
  margin: 13px 0 0;
  color: var(--ink-60);
  font-size: 14px;
  line-height: 1.85;
}

.section-heading.compact h2 {
  font-size: clamp(27px, 3.4vw, 37px);
}

.experience-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
  margin-top: 28px;
}

.experience-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 15px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 19px;
  background: color-mix(in srgb, var(--surface) 88%, var(--cream));
  box-shadow: 0 20px 50px -42px rgba(73, 59, 44, .45);
}

.experience-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 15px;
  background: var(--yellow);
  color: var(--accent-strong);
}

.experience-card h3 {
  margin: 1px 0 5px;
  color: var(--ink);
  font-size: 15px;
  font-weight: 900;
}

.experience-card p {
  margin: 0;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.75;
}

.beta-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.beta-steps li {
  position: relative;
  display: grid;
  gap: 20px;
  padding: 25px 28px 28px 0;
}

.beta-steps li + li {
  padding-left: 28px;
  border-left: 1px solid var(--line);
}

.step-number {
  color: var(--accent-strong);
  font: 900 12px var(--font-d);
  letter-spacing: .12em;
}

.beta-steps b {
  display: block;
  color: var(--ink);
  font-size: 15px;
}

.beta-steps p {
  margin: 6px 0 0;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.75;
}

.faq-list {
  margin-top: 25px;
  border-top: 1px solid var(--ink);
}

.faq-list details {
  border-bottom: 1px solid var(--line);
}

.faq-list summary {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 2px;
  color: var(--ink);
  font-size: 14.5px;
  font-weight: 900;
  cursor: pointer;
  list-style: none;
}

.faq-list summary::-webkit-details-marker {
  display: none;
}

.faq-list summary::after {
  width: 10px;
  height: 10px;
  flex: none;
  border-right: 1.5px solid var(--ink-60);
  border-bottom: 1.5px solid var(--ink-60);
  content: '';
  transform: rotate(45deg);
  transition: transform .2s var(--ease);
}

.faq-list details[open] summary::after {
  transform: rotate(225deg);
}

.faq-list summary span {
  min-width: 0;
}

.faq-list summary small {
  margin-left: auto;
  color: var(--ink-35);
  font-size: 11px;
  font-weight: 700;
}

.faq-body {
  max-width: 760px;
  padding: 0 44px 22px 2px;
}

.faq-body p {
  margin: 0 0 7px;
  color: var(--ink-60);
  font-size: 13px;
  line-height: 1.85;
}

.faq-body b {
  color: var(--ink);
}

.feedback-callout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: clamp(24px, 4vw, 36px);
  border: 1px solid var(--line);
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--yellow) 68%, var(--surface)), var(--surface));
}

.feedback-callout > div {
  max-width: 690px;
}

.feedback-callout .section-kicker {
  margin: 0 0 8px;
}

.feedback-callout h2 {
  font-size: clamp(24px, 3vw, 34px);
}

.feedback-callout .beta-button {
  flex: none;
}

.beta-links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  margin-top: -24px;
}

.beta-links a {
  color: var(--tea);
  font-size: 12.5px;
  font-weight: 800;
  text-underline-offset: 4px;
}

.local-feedback {
  margin-top: -38px;
}

.beta-button:focus-visible,
.beta-text-button:focus-visible,
.beta-text-link:focus-visible,
.icon-refresh:focus-visible,
.local-reset:focus-visible,
.preference-details summary:focus-visible,
.faq-list summary:focus-visible,
.beta-interest:focus-within,
.beta-links a:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

@media (max-width: 980px) {
  .beta-hero-grid {
    grid-template-columns: 1fr;
    gap: 42px;
  }

  .beta-intro {
    max-width: 760px;
  }

  .invite-card {
    width: min(100%, 620px);
  }
}

@media (max-width: 760px) {
  .beta-hero {
    padding-bottom: 48px;
  }

  .beta-intro h1 {
    font-size: clamp(50px, 16vw, 72px);
  }

  .beta-intro h1 .small {
    margin-top: 15px;
  }

  .beta-promises {
    display: grid;
    gap: 9px;
  }

  .invite-card {
    width: 100%;
    padding: 5px;
  }

  .invite-paper {
    inset: 15px 1px 0 13px;
  }

  .invite-card-inner {
    min-height: 0;
    padding: 24px 21px 26px;
  }

  .invite-seal {
    width: 52px;
    height: 52px;
    margin-top: 24px;
  }

  .experience-grid {
    grid-template-columns: 1fr;
  }

  .beta-steps {
    grid-template-columns: 1fr;
  }

  .beta-steps li,
  .beta-steps li + li {
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 12px;
    padding: 19px 0;
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .beta-steps li:first-child {
    border-top: 0;
  }

  .feedback-callout {
    align-items: flex-start;
    flex-direction: column;
  }

  .local-banner {
    align-items: flex-start;
    flex-direction: column;
  }

  .local-reset {
    align-self: flex-end;
  }
}

@media (max-width: 520px) {
  .beta-kicker {
    margin-top: 24px;
  }

  .invite-card h2 {
    font-size: 28px;
  }

  .invite-action,
  .invite-action .beta-button.primary,
  .invite-action .beta-button.secondary {
    width: 100%;
  }

  .invite-action {
    justify-items: stretch;
  }

  .beta-text-link,
  .beta-text-button,
  .action-note,
  .beta-feedback {
    justify-self: start;
  }

  .experience-card {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    padding: 18px;
  }

  .experience-icon {
    width: 42px;
    height: 42px;
    border-radius: 13px;
  }

  .faq-list summary small {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }

  .beta-button,
  .faq-list summary::after {
    transition: none;
  }
}
</style>
