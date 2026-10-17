<template>
  <div class="page-beta">
    <main id="main-content" class="beta-main">
      <div class="beta-page">
        <div class="beta-topbar-wrap">
          <nav class="beta-topbar wrap" aria-label="内测页导航">
            <router-link class="beta-brand-link" to="/promo" aria-label="了解 YuanHub">
              <img class="beta-brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true">
              <span class="beta-brand-name">YuanHub</span>
            </router-link>
            <span class="beta-topbar-divider" aria-hidden="true"></span>
            <span class="beta-topbar-label">邀请测试</span>

            <div class="beta-topbar-actions">
              <div v-if="campaign?.localTestMode" class="local-inline" role="note">
                <span class="local-chip">LOCAL</span>
                <span>本地模拟</span>
                <button
                  v-if="canResetLocalTest"
                  class="local-inline-reset"
                  type="button"
                  :disabled="resetting"
                  @click="resetLocalTest"
                >
                  {{ resetting ? '重置中…' : '重置' }}
                </button>
              </div>
              <router-link class="beta-home-link" to="/promo">了解 YuanHub</router-link>
            </div>
          </nav>
        </div>

        <section class="beta-intro-section">
          <div class="wrap">
            <div class="beta-hero-grid">
              <div class="beta-intro">
                <p class="beta-kicker">WELCOME TO YUANHUB</p>
                <h1 class="beta-title">
                  先来坐坐吧
                  <span class="beta-title-tag">一起把它变得更好</span>
                </h1>
                <p class="beta-intro-copy">
                  我们正在邀请第一批殿下提前体验 YuanHub。不用写申请，也不用懂技术；
                  正常用一用、告诉我们哪里顺手或哪里别扭，就是最有帮助的反馈。
                </p>
                <p v-if="requestedPage" class="beta-redirect-note" role="status">
                  你刚才想打开「{{ requestedPage }}」，因此来到了内测资格页。
                  <template v-if="granted || campaign?.accessMode === 'OPEN'">现在可以点击「{{ entryButtonLabel }}」继续。</template>
                  <template v-else>这个页面目前需要体验资格。可按本页指引报名或候补；资格开通后点击「{{ entryButtonLabel }}」就能返回。</template>
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
                  <p v-if="refreshMessage || cooldownSeconds" class="beta-feedback" role="status">{{ cooldownSeconds ? `状态刷新暂缓，约 ${cooldownSeconds} 秒后可重试。` : refreshMessage }}</p>

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
                        {{ entryButtonLabel }}
                        <ArrowRight :size="17" aria-hidden="true" />
                      </router-link>
                      <button
                        v-if="showBetaCommunityEntry"
                        class="beta-button secondary"
                        type="button"
                        @click="openBetaCommunity"
                      >
                        <UsersRound :size="17" aria-hidden="true" />
                        查看内测交流群
                      </button>
                      <p class="action-note">{{ adminBypass ? '管理员账号不参与内测名额分配，可直接进入 YuanHub。' : campaign?.accessMode === 'OPEN' ? 'YuanHub 已正式开放，现在无需内测资格。' : '资格已经开通，不需要重新登录。第一次来可以从「今日一览」开始。' }}</p>
                    </template>

                    <template v-else-if="waiting">
                      <div class="waiting-note">
                        <Clock3 :size="18" aria-hidden="true" />
                        <span>已经排上啦，有位置时会自动开通；也可以点上方按钮确认当前状态。</span>
                      </div>
                      <button class="beta-text-button" type="button" :disabled="submitting" @click="withdraw">
                        {{ submitting ? '正在处理…' : '不想等了，取消候补' }}
                      </button>
                      <p class="action-note">取消后如果再次报名，会重新排到队尾。</p>
                    </template>

                    <template v-else-if="canJoin">
                      <details class="rules-details">
                        <summary>阅读本轮内测完整规则（{{ campaign.rulesVersion }}）</summary>
                        <div v-if="rulesAvailable" class="rules-body">
                          <p>这是测试版本，可能出现同步异常、数据错误或回滚；本轮不主动删档，但不能保证绝对不丢档。</p>
                          <p>登录和注册不占名额。报名后有位置即开通，满额会自动候补；候补按服务器记录的报名顺序递补，不保证正式开放前一定获得资格。</p>
                          <p>MaaYuan Share 老用户预留名额是共同名额池，按报名顺序领取，并非每人都有一个。预留只覆盖首批，开放后 72 小时未使用部分转为公开名额；扩容不会新增预留。</p>
                          <p>公开名额按统一队列分配，已有候补优先。取消候补不会删除账号，再次报名会排到队尾；已开通资格不会因不活跃而自动收回。</p>
                          <p>报名即同意满额时自动候补；获得资格后可以正常使用，也欢迎反馈使用体验。</p>
                        </div>
                        <p v-else class="beta-error" role="alert">当前规则版本尚未展示，请稍后刷新状态再报名。</p>
                      </details>
                      <label v-if="rulesAvailable" class="rules-consent"><input v-model="rulesAccepted" type="checkbox">我已阅读并同意本轮内测规则（{{ campaign.rulesVersion }}），满额时加入候补</label>
                      <button class="beta-button primary" type="button" :disabled="submitting || !rulesAvailable || !rulesAccepted" @click="join">
                        {{ submitting ? '正在确认…' : joinButtonLabel }}
                        <ArrowRight v-if="!submitting" :size="17" aria-hidden="true" />
                      </button>
                      <p class="action-note">确认规则后即可报名；满额时会自动加入候补。</p>

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
        </section>

        <section class="beta-content wrap">

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
                <p>YuanHub 仍处于开发早期，本轮只开放少量名额验证稳定性。</p>
                <p>本轮不主动删档，但无法保证绝对不会丢档；同步异常、数据错误、回滚等意外情况都可能发生，还请理解。</p>
                <p v-if="campaign">本轮当前容量为 <b>{{ campaign.capacity }}</b> 人；后续是否扩容会根据测试情况决定。</p>
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
          <router-link to="/cart">使用本地账房</router-link>
          <router-link to="/feedback">反馈问题</router-link>
        </div>

        <p v-if="resetMessage" class="beta-feedback local-feedback" :class="{ 'is-error': resetFailed }" :role="resetFailed ? 'alert' : 'status'">
          {{ resetMessage }}
        </p>
      </section>

      <SiteFooter>
        <template #big>从这里，一起完善<br><span>YuanHub · 邀请测试</span></template>
      </SiteFooter>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageOpen,
  RefreshCw,
  Share2,
  Sparkles,
  UsersRound
} from '@lucide/vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { beta } from '../../store/beta.js'
import { betaCommunity } from '../../store/betaCommunity.js'
import { BETA_INTENTS, betaEntryTarget, betaStatusCopy, formatBetaDay, safeBetaRedirect } from '../../utils/betaAccess.js'

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
const router = useRouter()
const intentTags = ref([])
const submitting = ref(false)
const submitMessage = ref('')
const submitFailed = ref(false)
const resetting = ref(false)
const resetMessage = ref('')
const resetFailed = ref(false)
const refreshMessage = ref('')
const rulesAccepted = ref(false)
const now = ref(Date.now())
let clockTimer

const campaign = computed(() => beta.campaign)
const mine = computed(() => beta.mine)
const error = computed(() => beta.publicError || beta.personalError)
const adminBypass = computed(() => !error.value && auth.isAdmin && mine.value?.canUseBetaFeatures === true)
const copy = computed(() => adminBypass.value
  ? {
      tone: 'granted',
      title: '管理员账号可直接进入',
      description: '管理员不受邀请测试资格、名额和开放状态限制，也不会占用体验名额。'
    }
  : betaStatusCopy(campaign.value, mine.value, error.value))
const refreshing = computed(() => beta.publicLoading || beta.personalLoading)
const entryTarget = computed(() => betaEntryTarget(route.query.redirect))
const requestedPage = computed(() => {
  if (safeBetaRedirect(route.query.redirect, '') !== entryTarget.value) return ''
  const target = router.resolve(entryTarget.value)
  if (!target.meta.requiresBeta || target.name === 'today') return ''
  return target.meta.title?.split(' — ')[0] || 'YuanHub'
})
const entryButtonLabel = computed(() => requestedPage.value ? `返回${requestedPage.value}` : '进入 YuanHub')
const statusLabel = computed(() => adminBypass.value ? '管理员直通' : STATUS_LABELS[copy.value.tone] || '邀请测试')
const canJoin = computed(() => !error.value && mine.value?.nextAction === 'JOIN' && campaign.value?.accessMode === 'BETA')
const waiting = computed(() => mine.value?.enrollmentStatus === 'WAITING')
const granted = computed(() => !error.value && !!mine.value?.canUseBetaFeatures)
const showBetaCommunityEntry = computed(() =>
  campaign.value?.accessMode === 'BETA' &&
  mine.value?.canUseBetaFeatures === true &&
  (adminBypass.value || mine.value?.enrollmentStatus === 'ACTIVE')
)
const showSteps = computed(() => !['granted', 'open'].includes(copy.value.tone))
const canResetLocalTest = computed(() => mine.value?.canResetLocalTest === true)
const inBeta = computed(() => campaign.value?.accessMode === 'BETA' && !!campaign.value?.snapshotAt)
const showRefresh = computed(() => ['error', 'loading', 'waiting'].includes(copy.value.tone) || (canJoin.value && !rulesAvailable.value))
const cooldownSeconds = computed(() => Math.max(0, Math.ceil((beta.personalCooldownUntil - now.value) / 1000)))
const rulesAvailable = computed(() => campaign.value?.rulesVersion === 'v1')
watch(() => campaign.value?.rulesVersion, () => { rulesAccepted.value = false })
function openBetaCommunity() {
  betaCommunity.open('manual')
}

const invitationEyebrow = computed(() => {
  if (!auth.isLoggedIn) return '先登录，再参加'
  if (adminBypass.value) return '管理员账号'
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
async function refresh() {
  refreshMessage.value = ''
  now.value = Date.now()
  if (cooldownSeconds.value) return
  const before = JSON.stringify([beta.mine, beta.campaign])
  await beta.refresh({ force: true })
  now.value = Date.now()
  if (cooldownSeconds.value) return
  refreshMessage.value = beta.publicError || beta.personalError || (before === JSON.stringify([beta.mine, beta.campaign]) ? '状态已是最新。' : '状态已更新。')
}

async function join() {
  if (submitting.value || !canJoin.value || !rulesAvailable.value || !rulesAccepted.value) return
  refreshMessage.value = ''
  submitting.value = true
  submitMessage.value = ''
  submitFailed.value = false
  try {
    const result = await beta.join({
      campaignId: campaign.value.campaignId,
      rulesVersion: campaign.value.rulesVersion,
      acceptedTerms: rulesAccepted.value,
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
    submitMessage.value = e?.message?.trim() || '暂时无法确认报名结果，请重新确认状态后再试。'
  } finally {
    submitting.value = false
  }
}

async function withdraw() {
  if (!window.confirm('确定取消候补吗？再次报名会重新排到队尾。')) return
  refreshMessage.value = ''
  submitting.value = true
  submitMessage.value = ''
  submitFailed.value = false
  try {
    await beta.withdraw()
    submitMessage.value = '已取消候补，账号和公开功能仍可正常使用。'
  } catch (e) {
    submitFailed.value = true
    submitMessage.value = e?.message?.trim() || '取消候补失败，请稍后重试。'
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

onMounted(() => { unsubscribe = beta.subscribe(); clockTimer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { unsubscribe?.(); clearInterval(clockTimer) })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.beta-main {
  background: #f7f2e8;
}

.beta-page {
  background:
    radial-gradient(circle at 14% 8%, rgba(231, 196, 111, .18), transparent 31rem),
    radial-gradient(circle at 88% 19%, rgba(176, 138, 86, .08), transparent 25rem),
    linear-gradient(180deg, #fbf8f1 0%, #f7f2e8 58%, #f5efe4 100%);
}

.beta-page::before,
.beta-page::after {
  border: 1px solid rgba(97, 74, 50, .07);
  border-radius: 50%;
  content: '';
  pointer-events: none;
}

.beta-topbar-wrap {
  border-bottom: 1px solid rgba(73, 59, 44, .1);
  background: rgba(251, 248, 241, .86);
  backdrop-filter: blur(16px);
}

.beta-brand-link {
  color: var(--ink);
  text-decoration: none;
}

.beta-brand-mark {
  border-radius: 10px;
}

.beta-topbar-divider {
  background: rgba(73, 59, 44, .16);
}

.beta-topbar-label {
  color: var(--ink-60);
}

.beta-home-link {
  color: var(--tea);
  text-decoration: none;
}

.beta-home-link:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.local-inline {
  border: 1px solid rgba(215, 137, 53, .32);
  border-radius: 999px;
  background: rgba(255, 253, 246, .72);
  color: var(--ink-60);
}

.local-chip {
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
}

.local-inline-reset {
  border: 0;
  border-radius: 999px;
  background: rgba(73, 59, 44, .07);
  color: var(--tea);
  cursor: pointer;
}

.local-inline-reset:disabled {
  opacity: .5;
  cursor: default;
}

.beta-intro-section {
  border-bottom: 1px solid rgba(73, 59, 44, .1);
}

.beta-intro-section::after {
  border-top: 1px solid rgba(73, 59, 44, .08);
  border-bottom: 1px solid rgba(73, 59, 44, .06);
  content: '';
  pointer-events: none;
}

.beta-kicker,
.section-kicker {
  color: var(--accent-strong);
}

.beta-title {
  color: var(--ink);
}

.beta-title-tag {
  border-radius: 10px;
  background: var(--tea);
  color: var(--cream);
}

.beta-intro-copy {
  color: rgba(73, 59, 44, .72);
}

.beta-redirect-note { border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:8px; background:var(--surface); color:var(--ink); }

.beta-promises {
  color: rgba(73, 59, 44, .68);
}

.beta-promises svg {
  color: var(--tea);
}

.invite-paper {
  border: 1px solid rgba(73, 59, 44, .14);
  border-radius: 28px 10px 28px 12px;
  background: rgba(255, 253, 246, .56);
  box-shadow: 0 28px 50px -38px rgba(73, 59, 44, .52);
}

.invite-card-inner {
  border: 1px solid rgba(73, 59, 44, .18);
  border-radius: 26px 12px 26px 12px;
  background:
    linear-gradient(rgba(255, 253, 246, .95), rgba(255, 253, 246, .95)),
    repeating-linear-gradient(0deg, rgba(73, 59, 44, .02) 0 1px, transparent 1px 5px);
  box-shadow: 0 30px 70px -48px rgba(73, 59, 44, .62);
}

.invite-card-inner::after {
  border: 1px solid color-mix(in srgb, var(--tone) 34%, transparent);
  border-radius: 50%;
  content: '';
  opacity: .44;
}

.invite-status {
  border: 1px solid color-mix(in srgb, var(--tone) 58%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 7%, var(--surface));
  color: var(--ink);
}

.status-dot {
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 14%, transparent);
}

.icon-refresh {
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
  border: 1px solid color-mix(in srgb, var(--tone) 52%, var(--line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--tone) 9%, var(--surface));
  color: var(--tone);
  box-shadow: inset 0 0 0 5px var(--surface);
}

.invite-eyebrow {
  color: var(--tone);
}

.invite-card h2 {
  color: var(--ink);
}

.invite-description {
  color: var(--ink-60);
}

.beta-error {
  color: var(--rouge);
}

.invite-action {
  border-top: 1px dashed var(--line);
}

.beta-button {
  border: 1px solid var(--tea);
  border-radius: 999px;
  background: transparent;
  color: var(--tea);
  text-decoration: none;
  cursor: pointer;
  transition: transform .25s var(--ease), background-color .25s var(--ease), border-color .25s var(--ease), color .25s var(--ease);
}

.beta-button.primary {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
  box-shadow: 0 16px 30px -24px rgba(73, 59, 44, .8);
}

.beta-button:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.beta-button.secondary:hover:not(:disabled) {
  background: var(--yellow);
  color: var(--ink);
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
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}

.rules-details { color: var(--ink); }
.rules-details summary { cursor: pointer; }
.rules-body { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.rules-consent { color: var(--ink); cursor: pointer; }
.rules-consent input { accent-color: var(--tea); }

.beta-text-button:disabled {
  opacity: .5;
  cursor: default;
}

.action-note {
  color: var(--ink-60);
}

.waiting-note {
  border-radius: 13px;
  background: var(--cream);
  color: var(--ink);
}

.waiting-note svg {
  color: var(--accent-strong);
}

.preference-details summary {
  color: var(--ink-60);
  cursor: pointer;
}

.preference-details summary span {
  color: var(--ink-35);
}

.beta-interest {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
}

.beta-interest input {
  opacity: 0;
  pointer-events: none;
}

.beta-interest:has(input:checked) {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}

.beta-feedback {
  color: var(--tea);
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

.section-heading h2,
.feedback-callout h2 {
  color: var(--ink);
}

.section-heading > p:last-child,
.feedback-callout > div > p:last-child {
  color: var(--ink-60);
}

.experience-card {
  border: 1px solid var(--line);
  border-radius: 19px;
  background: color-mix(in srgb, var(--surface) 88%, var(--cream));
  box-shadow: 0 20px 50px -42px rgba(73, 59, 44, .45);
}

.experience-icon {
  border-radius: 15px;
  background: var(--yellow);
  color: var(--accent-strong);
}

.experience-card h3 {
  color: var(--ink);
}

.experience-card p {
  color: var(--ink-60);
}

.beta-steps {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.beta-steps li + li {
  border-left: 1px solid var(--line);
}

.step-number {
  color: var(--accent-strong);
}

.beta-steps b {
  color: var(--ink);
}

.beta-steps p {
  color: var(--ink-60);
}

.faq-list {
  border-top: 1px solid var(--ink);
}

.faq-list details {
  border-bottom: 1px solid var(--line);
}

.faq-list summary {
  color: var(--ink);
  cursor: pointer;
}

.faq-list summary::after {
  border-right: 1.5px solid var(--ink-60);
  border-bottom: 1.5px solid var(--ink-60);
  content: '';
  transition: transform .2s var(--ease);
}

.faq-list summary small {
  color: var(--ink-35);
}

.faq-body p {
  color: var(--ink-60);
}

.faq-body b {
  color: var(--ink);
}

.feedback-callout {
  border: 1px solid var(--line);
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--yellow) 68%, var(--surface)), var(--surface));
}

.beta-links a {
  color: var(--tea);
  text-underline-offset: 4px;
}

.beta-button:focus-visible,
.beta-text-button:focus-visible,
.beta-text-link:focus-visible,
.icon-refresh:focus-visible,
.local-inline-reset:focus-visible,
.beta-brand-link:focus-visible,
.beta-home-link:focus-visible,
.preference-details summary:focus-visible,
.faq-list summary:focus-visible,
.beta-interest:focus-within,
.beta-links a:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

@media (max-width: 760px) {

  .beta-title-tag {
    border-radius: 8px;
  }

  .invite-card-inner {
    border-radius: 22px;
    box-shadow: 0 20px 48px -38px rgba(73, 59, 44, .5);
  }

  .invite-seal {
    box-shadow: inset 0 0 0 4px var(--surface);
  }

  .experience-card {
    border-radius: 16px;
  }

  .experience-icon {
    border-radius: 12px;
  }

  .beta-steps {
    border: 0;
  }

  .beta-steps li,
  .beta-steps li + li {
    border: 0;
  }

  .beta-steps li:not(:last-child)::after {
    background: var(--line);
    content: '';
  }

  .step-number {
    border-radius: 50%;
    background: var(--yellow);
    color: var(--ink);
  }

  .feedback-callout {
    border-radius: 18px;
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
<style scoped src="./betaPageDesktop.css"></style>
<style scoped src="./betaPageMobile.css"></style>
