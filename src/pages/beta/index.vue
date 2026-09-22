<template>
  <div class="page-beta">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero"><div class="wrap">
        <div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">一起完善</span></div>
        <h1>参与内测<span class="small">从这里，一起出发</span></h1>
        <p class="hero-sub">自助报名，分批开放。不用写申请，也不用懂技术；你真实的使用感受，就是最有用的反馈。</p>
      </div></header>

      <section class="beta-content wrap">
        <div v-if="campaign?.localTestMode" class="beta-local" role="note">
          <b>本地测试模式</b>
          <span>当前是独立的模拟活动，报名和资格不会影响正式内测。</span>
        </div>

        <!-- 当前状态 + 我可以做什么，合成一张卡，普通用户一眼看完 -->
        <section class="beta-panel" :class="'tone-' + copy.tone" aria-labelledby="beta-status-title">
          <div class="beta-panel-status" role="status" aria-live="polite">
            <div class="beta-panel-head">
              <span class="beta-status"><i class="dot" aria-hidden="true"></i>{{ statusChip }}</span>
              <button class="beta-refresh" type="button" :disabled="refreshing" @click="refresh">
                {{ refreshing ? '正在确认…' : '刷新状态' }}
              </button>
            </div>
            <h2 id="beta-status-title">{{ copy.title }}</h2>
            <p class="beta-lead">{{ copy.description }}</p>
            <p v-if="error" class="beta-error" role="alert">{{ error }}</p>

            <div v-if="inBeta" class="beta-meter">
              <div class="beta-meter-top">
                <span>已开通 <b>{{ campaign.grantedCount }}</b> / {{ campaign.capacity }}</span>
                <span class="beta-meter-left">公开名额还剩 <b>{{ campaign.publicRemaining }}</b></span>
              </div>
              <div class="bar" role="progressbar" aria-label="内测名额开通进度" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                <i :style="{ width: progressPercent + '%' }" />
              </div>
              <details class="beta-more">
                <summary>名额是怎么分配的？</summary>
                <ul>
                  <li>本轮总名额 {{ campaign.capacity }} 个，最多可扩到 {{ campaign.maxCapacity }} 个。</li>
                  <li>其中 {{ campaign.reservedInitial }} 个留给符合条件的 MaaYuan Share 用户，目前还剩 {{ campaign.reservedRemaining }} 个。</li>
                  <li>公开报名名额目前还剩 {{ campaign.publicRemaining }} 个。</li>
                  <li>MaaYuan Share 用户预留到期没用完的部分会转给候补，不会浪费。</li>
                </ul>
              </details>
            </div>
          </div>

          <div class="beta-action">
            <template v-if="!auth.isLoggedIn">
              <p>注册或登录本站账号不会占用体验名额，已有作业站账号可以直接登录。</p>
              <div class="beta-actions">
                <router-link class="beta-button" :to="authLink('/login')">登录后参与</router-link>
                <router-link class="beta-button secondary" :to="authLink('/register')">注册账号</router-link>
              </div>
            </template>

            <template v-else-if="granted">
              <p>{{ campaign?.accessMode === 'OPEN' ? 'YuanHub 已正式开放，无需再领取资格。' : '体验资格已经开通，不需要重新登录。' }}</p>
              <router-link class="beta-button" :to="entryTarget">进入 YuanHub →</router-link>
              <p class="beta-fine">第一次体验可以试着同步一次 MaaYuan 数据；顺利或卡住，都欢迎反馈。</p>
            </template>

            <template v-else-if="waiting">
              <p>候补登记时间：{{ time(mine.joinedAt) }}</p>
              <p class="beta-fine">有释放或新增名额时会按报名顺序自动开通，不需要重复申请；不保证正式开放前一定能等到。</p>
              <button class="beta-button secondary" type="button" :disabled="submitting" @click="withdraw">取消候补</button>
              <p class="beta-fine">取消后如果再次报名，会重新排到队尾。</p>
            </template>

            <form v-else-if="canJoin" @submit.prevent="join">
              <fieldset>
                <legend>你主要想体验什么？<small>可选，不影响资格和排队顺序</small></legend>
                <div class="beta-interests">
                  <label v-for="intent in BETA_INTENTS" :key="intent.key" class="beta-interest">
                    <input v-model="intentTags" type="checkbox" :value="intent.key"> {{ intent.label }}
                  </label>
                </div>
              </fieldset>
              <label class="beta-consent">
                <input v-model="accepted" type="checkbox" required>
                <span>我了解这是测试版本，愿意尝试使用并反馈情况；如果本批名额已满，同意登记候补，之后按顺序自动开通。</span>
              </label>
              <button class="beta-button" type="submit" :disabled="submitting || !accepted">
                {{ submitting ? '正在确认报名…' : '报名内测' }}
              </button>
              <p class="beta-fine">不需要人工审核。点击后由服务器确认名额，满额会自动进入候补。</p>
            </form>

            <p v-else>当前还没有开放新的报名，可以先看看下面的参与方式和体验须知；状态读取失败时，点上面的「刷新状态」重试即可。</p>

            <p v-if="submitMessage" class="beta-feedback" :class="{ 'is-error': submitFailed }" :role="submitFailed ? 'alert' : 'status'">{{ submitMessage }}</p>
          </div>
        </section>

        <section v-if="canResetLocalTest" class="beta-testtools" aria-labelledby="beta-testtools-title">
          <div class="beta-testtools-head">
            <b id="beta-testtools-title">本地测试工具</b>
            <span class="beta-testtools-tag">仅本地测试模式可见</span>
          </div>
          <p>重置会清空本地活动里的报名、资格和相关通知，并立即重新开放，方便你反复测试报名流程；不会影响正式内测。</p>
          <button class="beta-button secondary" type="button" :disabled="resetting" @click="resetLocalTest">
            {{ resetting ? '正在重置…' : '重置本地内测' }}
          </button>
          <p v-if="resetMessage" class="beta-feedback" :class="{ 'is-error': resetFailed }" :role="resetFailed ? 'alert' : 'status'">{{ resetMessage }}</p>
        </section>

        <section v-if="showSteps" class="beta-steps" aria-labelledby="beta-steps-title">
          <h2 id="beta-steps-title">怎么参与</h2>
          <ol>
            <li><span class="n" aria-hidden="true">1</span><div><b>注册或登录本站账号</b><p>注册不占体验名额，已有账号直接登录即可。</p></div></li>
            <li><span class="n" aria-hidden="true">2</span><div><b>点一下「报名内测」</b><p>还有名额会立即开通；名额满了会自动排进候补队列。</p></div></li>
            <li><span class="n" aria-hidden="true">3</span><div><b>打开 YuanHub 开始体验</b><p>用一次同步、记一笔账都算体验，遇到问题随时反馈。</p></div></li>
          </ol>
        </section>

        <section class="beta-card" aria-labelledby="beta-rules-title">
          <h2 id="beta-rules-title">体验须知</h2>
          <div class="beta-rules">
            <div class="beta-rule"><span class="idx" aria-hidden="true">01</span><div><b>注册和使用都不占名额</b><p>注册、登录或使用公开功能都不会占用体验名额；一个账号只算一份，游戏子账号、设备和连接码不会额外占位。</p></div></div>
            <div class="beta-rule"><span class="idx" aria-hidden="true">02</span><div><b>名额分公开报名和 MaaYuan Share 用户预留</b><p>首批 {{ campaign?.initialCapacity || 100 }} 份里有一部分留给符合条件的 MaaYuan Share 用户，其余公开报名。预留名额按报名顺序发放，不保证每位 MaaYuan Share 用户都能拿到。</p></div></div>
            <div class="beta-rule"><span class="idx" aria-hidden="true">03</span><div><b>没用完的名额会释放</b><p>MaaYuan Share 用户预留从开放起算 72 小时，到期没用完的部分会转给候补；是否扩容到 {{ campaign?.maxCapacity || 200 }} 份，看实际测试情况决定。</p></div></div>
            <div class="beta-rule"><span class="idx" aria-hidden="true">04</span><div><b>报名后不用反复抢</b><p>按报名先后自动开通，不需要盯着刷新；也不会因为没有找到问题或没在群里发言而取消已开通的资格。</p></div></div>
          </div>
          <details v-if="inBeta" class="beta-more beta-dates">
            <summary>关键时间与更多说明</summary>
            <dl>
              <dt>名单对应时点</dt><dd>{{ time(campaign.snapshotAt) }}</dd>
              <dt>内测开放</dt><dd>{{ time(campaign.startsAt) }}</dd>
              <dt>MaaYuan Share 用户预留结束</dt><dd>{{ time(campaign.reservedUntil) }}</dd>
            </dl>
            <p>以上时间以 {{ campaign.announcementTimezone }} 公布的时间为准。内测版本可能遇到功能不完善、同步失败或显示异常；反馈截图和日志前，请遮住邮箱、连接码等敏感信息。正式开放后，这些名额数字只作为内测历史记录保留。</p>
          </details>
        </section>

        <div class="beta-links">
          <router-link to="/works">查看公开作业</router-link>
          <router-link to="/cart">使用本地账房</router-link>
          <router-link to="/feedback">反馈问题</router-link>
        </div>
      </section>

      <SiteFooter>
        <template #big>从这里，一起完善<br><span>YuanHub · 邀请内测</span></template>
        <template #fine>注册账号与内测资格分开<br>反馈真实体验，一起把工具做得更顺手</template>
      </SiteFooter>
    </main>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { beta } from '../../store/beta.js'
import { BETA_INTENTS, betaEntryTarget, betaStatusCopy, formatBetaDay } from '../../utils/betaAccess.js'

const STATUS_CHIPS = {
  error: '读取失败', loading: '读取中', closed: '暂未开放', pending: '尚未开始',
  open: '正式开放', granted: '已开通', paused: '暂停新增', waiting: '候补中',
  reserved: '预留名额', join: '可报名', full: '名额已满', info: '查看说明'
}

const route = useRoute()
const accepted = ref(false)
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
const statusChip = computed(() => STATUS_CHIPS[copy.value.tone] || '查看说明')
const canJoin = computed(() => !error.value && mine.value?.nextAction === 'JOIN' && campaign.value?.accessMode === 'BETA')
const waiting = computed(() => mine.value?.enrollmentStatus === 'WAITING')
const granted = computed(() => !error.value && !!mine.value?.canUseBetaFeatures && campaign.value?.accessMode !== 'CLOSED')
const showSteps = computed(() => !['granted', 'open', 'closed', 'pending', 'error', 'loading'].includes(copy.value.tone))
const canResetLocalTest = computed(() => mine.value?.canResetLocalTest === true)
const inBeta = computed(() => campaign.value?.accessMode === 'BETA' && !!campaign.value?.snapshotAt)
const progressPercent = computed(() => {
  const capacity = Number(campaign.value?.capacity) || 0
  if (!capacity) return 0
  return Math.min(100, Math.max(0, Math.round((Number(campaign.value?.grantedCount) || 0) / capacity * 100)))
})

let unsubscribe
function time(value) { return formatBetaDay(value, campaign.value?.announcementTimezone) }
function authLink(path) { return { path, query: { redirect: route.fullPath } } }
async function refresh() { await beta.refresh() }
async function join() {
  if (submitting.value || !accepted.value || !canJoin.value) return
  submitting.value = true; submitMessage.value = ''; submitFailed.value = false
  try {
    const result = await beta.join({ campaignId: campaign.value.campaignId, rulesVersion: campaign.value.rulesVersion, acceptedTerms: true, acceptWaitlist: true, intentTags: intentTags.value })
    if (result) submitMessage.value = result.canUseBetaFeatures ? '资格已开通，欢迎开始体验。' : '报名已受理，已进入候补，无需重复操作。'
  } catch (e) { submitFailed.value = true; submitMessage.value = e.message || '暂时无法确认报名结果，请刷新本人状态后重试。' }
  finally { submitting.value = false }
}
async function withdraw() {
  if (!window.confirm('确定取消候补吗？再次报名会重新排到队尾。')) return
  submitting.value = true; submitMessage.value = ''; submitFailed.value = false
  try { await beta.withdraw(); submitMessage.value = '已取消候补，账号仍可正常使用。' }
  catch (e) { submitFailed.value = true; submitMessage.value = e.message; await beta.refresh() }
  finally { submitting.value = false }
}
async function resetLocalTest() {
  if (resetting.value) return
  if (!window.confirm('重置本地内测？会清空本地活动的报名、资格和相关通知，并立即重新开放；不影响正式内测。')) return
  resetting.value = true; resetMessage.value = ''; resetFailed.value = false
  submitting.value = false; submitMessage.value = ''; submitFailed.value = false
  try {
    await beta.resetLocalTest()
    accepted.value = false; intentTags.value = []
    resetMessage.value = '本地内测已重置，可以重新报名测试了。'
  } catch (e) { resetFailed.value = true; resetMessage.value = e.message || '重置失败，请刷新后重试。' }
  finally { resetting.value = false }
}
onMounted(() => { unsubscribe = beta.subscribe() })
onBeforeUnmount(() => { unsubscribe?.() })
</script>
<style scoped>
.page-beta .hero { --wm: '邀'; }
.beta-content { display: grid; gap: 22px; padding-bottom: 44px; }

/* ---- 本地测试提示 ---- */
.beta-local { display: grid; gap: 4px; padding: 13px 18px; border: 1px dashed var(--accent); border-radius: 14px; background: var(--cream); color: var(--ink); }
.beta-local b { color: var(--accent-strong); font-size: 12px; letter-spacing: .08em; }
.beta-local span { font-size: 13px; line-height: 1.7; }

/* ---- 状态面板 ---- */
.beta-panel { position: relative; overflow: hidden; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: clamp(22px, 3vw, 36px); box-shadow: 0 26px 60px -44px rgba(73,59,44,.5); }
.beta-panel::before { content: ''; position: absolute; inset: 0 0 auto; height: 5px; background: var(--tone, var(--yellow-deep)); }
.beta-panel.tone-join { --tone: var(--accent); }
.beta-panel.tone-granted, .beta-panel.tone-open { --tone: var(--tea); }
.beta-panel.tone-paused { --tone: var(--accent); }
.beta-panel.tone-waiting, .beta-panel.tone-reserved, .beta-panel.tone-loading, .beta-panel.tone-info { --tone: var(--yellow-deep); }
.beta-panel.tone-closed, .beta-panel.tone-pending { --tone: var(--ink-35); }
.beta-panel.tone-full { --tone: var(--ink-35); }
.beta-panel.tone-error { --tone: var(--rouge); }
.beta-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.beta-status { display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px; border: 1.5px solid var(--tone, var(--line)); border-radius: 999px; background: var(--cream); color: var(--ink); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.beta-status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone, var(--ink-35)); flex: none; }
.beta-refresh { border: 1px solid var(--line); background: var(--cream); color: var(--ink-60); border-radius: 999px; min-height: 36px; padding: 7px 16px; font: 700 12.5px var(--font-b); cursor: pointer; transition: color .3s var(--ease), border-color .3s var(--ease); }
.beta-refresh:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-35); }
.beta-refresh:disabled { opacity: .55; cursor: default; }
h2 { font: 900 clamp(21px, 3vw, 28px)/1.45 var(--font-s); margin: 16px 0 10px; color: var(--ink); }
.beta-lead { margin: 0; font-size: 15px; line-height: 1.9; color: var(--ink); overflow-wrap: anywhere; }
.beta-error { margin: 10px 0 0; color: var(--rouge); font-size: 13px; line-height: 1.8; }

/* ---- 名额进度 ---- */
.beta-meter { margin-top: 20px; padding: 16px 18px; background: var(--cream); border: 1px solid var(--line); border-radius: 16px; }
.beta-meter-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px 18px; flex-wrap: wrap; font-size: 13px; color: var(--ink-60); }
.beta-meter-top b { font-family: var(--font-d); font-weight: 800; font-size: 19px; color: var(--ink); }
.beta-meter-left b { color: var(--accent-strong); }
.bar { margin-top: 11px; height: 10px; border-radius: 999px; background: rgba(73,59,44,.1); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--yellow-deep), var(--accent)); transition: width .6s var(--ease); }

.beta-more { margin-top: 14px; }
.beta-more summary { cursor: pointer; font-weight: 800; font-size: 13px; color: var(--tea); padding: 4px 0; text-underline-offset: 4px; }
.beta-more ul { margin: 8px 0 2px; padding-left: 20px; display: grid; gap: 6px; font-size: 13px; line-height: 1.8; color: var(--ink-60); }

/* ---- 我的操作 ---- */
.beta-action { margin-top: 22px; padding-top: 20px; border-top: 1px dashed var(--line); }
.beta-action p { margin: 0 0 12px; line-height: 1.9; font-size: 14px; overflow-wrap: anywhere; }
.beta-actions, .beta-links { display: flex; flex-wrap: wrap; gap: 12px; }
.beta-button { display: inline-flex; justify-content: center; align-items: center; min-height: 44px; padding: 11px 22px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 700 14px var(--font-b); text-decoration: none; cursor: pointer; transition: background-color .3s var(--ease), color .3s var(--ease), transform .3s var(--ease); }
.beta-button:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: #fff; transform: translateY(-1px); }
.beta-button.secondary { background: transparent; color: var(--tea); }
.beta-button.secondary:hover:not(:disabled) { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink); transform: none; }
.beta-button:disabled { opacity: .55; cursor: default; }
fieldset { border: 0; margin: 0 0 18px; padding: 0; }
legend { font-weight: 700; line-height: 1.8; margin-bottom: 10px; }
legend small { display: block; font-weight: 400; color: var(--ink-60); font-size: 12px; }
.beta-interests { display: flex; flex-wrap: wrap; gap: 8px; }
.beta-interest { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 8px 14px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--cream); cursor: pointer; font-size: 13px; font-weight: 700; transition: border-color .3s var(--ease), background-color .3s var(--ease); }
.beta-interest:hover { border-color: var(--yellow-deep); }
.beta-interest:has(input:checked) { border-color: var(--yellow-deep); background: var(--yellow); }
.beta-consent { display: flex; align-items: flex-start; gap: 10px; line-height: 1.8; font-size: 13px; padding: 16px; border: 1px dashed var(--line); border-radius: 12px; margin-bottom: 14px; cursor: pointer; }
.beta-consent input { flex: none; margin-top: 5px; }
.beta-fine { font-size: 12px; color: var(--ink-60); line-height: 1.8; margin: 10px 0 0 !important; }
.beta-feedback { margin-top: 14px !important; color: var(--tea); font-weight: 700; }
.beta-error, .beta-feedback.is-error { color: var(--rouge); }

/* ---- 本地测试工具 ---- */
.beta-testtools { display: grid; gap: 12px; padding: clamp(18px, 3vw, 26px); border: 1.5px dashed var(--accent); border-radius: 20px; background: var(--cream); }
.beta-testtools-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.beta-testtools-head b { font-size: 15px; color: var(--ink); }
.beta-testtools-tag { padding: 3px 10px; border: 1px solid var(--accent); border-radius: 999px; background: var(--surface); color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .06em; }
.beta-testtools p { margin: 0; font-size: 13px; line-height: 1.85; color: var(--ink-60); }
.beta-testtools .beta-button { justify-self: start; }
.beta-testtools .beta-feedback { margin-top: 0 !important; }

/* ---- 怎么参与 ---- */
.beta-steps, .beta-card { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: clamp(20px, 3vw, 32px); }
.beta-steps ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.beta-steps li { display: flex; gap: 12px; padding: 16px; background: var(--cream); border: 1px solid var(--line); border-radius: 16px; }
.beta-steps .n { flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--yellow); color: var(--ink); display: grid; place-items: center; font: 900 14px var(--font-d); }
.beta-steps b { display: block; font-size: 14.5px; margin-bottom: 4px; color: var(--ink); }
.beta-steps p { margin: 0; font-size: 13px; line-height: 1.75; color: var(--ink-60); }

/* ---- 体验须知 ---- */
.beta-rules { display: grid; }
.beta-rule { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 14px; padding: 18px 0; border-top: 1px solid var(--line); }
.beta-rule:first-child { border-top: 0; padding-top: 4px; }
.beta-rule .idx { font: 900 15px var(--font-d); color: var(--accent-strong); letter-spacing: .04em; padding-top: 1px; }
.beta-rule b { display: block; font-size: 15px; margin-bottom: 5px; color: var(--ink); }
.beta-rule p { margin: 0; font-size: 13.5px; line-height: 1.85; color: var(--ink-60); overflow-wrap: anywhere; }
.beta-dates dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 18px; margin: 8px 0 12px; font-size: 13px; }
.beta-dates dt { color: var(--ink-60); }
.beta-dates dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.beta-dates p { margin: 0; font-size: 12.5px; line-height: 1.85; color: var(--ink-60); }

.beta-links { margin-top: 2px; }
.beta-links a { color: var(--tea); padding: 8px 0; font-weight: 700; text-underline-offset: 4px; }
.beta-button:focus-visible, .beta-refresh:focus-visible, .beta-more summary:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }

@media (max-width: 760px) {
  .beta-steps ol { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .beta-panel, .beta-steps, .beta-card { border-radius: 18px; }
  .beta-meter-top { font-size: 12.5px; }
  .beta-rule { grid-template-columns: 36px minmax(0, 1fr); gap: 10px; }
  .beta-dates dl { grid-template-columns: 1fr; gap: 3px; }
  .beta-dates dd { margin-bottom: 8px; }
  .beta-consent { padding: 13px; }
}
</style>
