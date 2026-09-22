<template>
  <div class="page-beta">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero"><div class="wrap">
        <div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">一起完善</span></div>
        <h1>参与内测<span class="small">从这里，一起出发</span></h1>
        <p class="hero-sub">自助报名，分批开放。无需申请小作文，也不需要懂技术；你真实的使用感受，就是有价值的反馈。</p>
      </div></header>
      <section class="beta-content wrap">
        <div v-if="campaign?.localTestMode" class="beta-local-notice" role="note">
          <b>LOCAL · 本地内测模式</b>
          <span>当前使用独立的本地测试活动；所有已激活账号模拟为 Share 快照用户，报名与资格不会写入正式内测活动。</span>
        </div>
        <div class="beta-state" :class="{ 'is-error': error }" role="status" aria-live="polite">
          <span class="beta-kicker">当前开放状态</span>
          <h2>{{ copy.title }}</h2>
          <p>{{ copy.description }}</p>
          <p v-if="error" class="beta-error" role="alert">{{ error }}</p>
          <button class="beta-button secondary" type="button" :disabled="refreshing" @click="refresh">{{ refreshing ? '正在确认…' : '刷新状态' }}</button>
        </div>
        <template v-if="campaign?.snapshotAt">
          <div class="beta-numbers" aria-label="名额概览">
            <div><span>当前批次容量</span><strong>{{ campaign.capacity }}</strong><small>本轮最多 {{ campaign.maxCapacity }} 人</small></div>
            <div><span>已经开通</span><strong>{{ campaign.grantedCount }}</strong><small>以唯一统一账号计数</small></div>
            <div><span>Share 剩余预留</span><strong>{{ campaign.reservedRemaining }}</strong><small>初始预留 {{ campaign.reservedInitial }} 名</small></div>
            <div><span>公开剩余</span><strong>{{ campaign.publicRemaining }}</strong><small>已有候补优先分配</small></div>
          </div>
          <p class="beta-fine">名额以提交时的服务器结果为准。扩容后的新增位置全部公开，不重新划分 Share 比例；正式开放后以上数字仅保留为内测历史记录。</p>
        </template>
        <section class="beta-card" aria-labelledby="beta-action-title">
          <h2 id="beta-action-title">你的参与状态</h2>
          <template v-if="!auth.isLoggedIn">
            <p>可以先阅读下方规则。注册账号本身不会占名额，已有作业站账号可直接登录。</p>
            <div class="beta-actions">
              <router-link class="beta-button" :to="authLink('/login')">登录后参与</router-link>
              <router-link class="beta-button secondary" :to="authLink('/register')">注册统一账号</router-link>
            </div>
          </template>
          <template v-else-if="mine?.canUseBetaFeatures && !error && campaign?.accessMode !== 'CLOSED'">
            <p>{{ campaign?.accessMode === 'OPEN' ? '已正式开放，无需再领取资格。' : '资格已经开通，不需要重新登录。' }}</p>
            <router-link class="beta-button" :to="entryTarget">进入 YuanHub →</router-link>
            <p class="beta-fine">首次体验可尝试完成一次 MaaYuan 同步，并核对结果；成功或卡住，都欢迎反馈。</p>
          </template>
          <template v-else-if="mine?.enrollmentStatus === 'WAITING'">
            <p>候补登记时间：{{ time(mine.joinedAt) }}</p>
            <p>后续释放或增加名额时自动按顺序开通，无需重复申请。不保证正式开放前一定获得内测资格。</p>
            <button class="beta-button secondary" type="button" :disabled="submitting" @click="withdraw">取消候补</button>
            <p class="beta-fine">取消后再次报名，会重新排到队尾。</p>
          </template>
          <form v-else-if="canJoin" @submit.prevent="join">
            <fieldset><legend>你主要想体验什么？<small>可选，不影响资格与顺序</small></legend>
              <label v-for="intent in BETA_INTENTS" :key="intent.key" class="beta-interest">
                <input v-model="intentTags" type="checkbox" :value="intent.key"> {{ intent.label }}
              </label>
            </fieldset>
            <label class="beta-consent"><input v-model="accepted" type="checkbox" required>
              <span>我了解这是测试版本，愿意尝试使用并反馈情况；如本批名额已满，同意登记候补，后续按顺序自动开通。</span>
            </label>
            <button class="beta-button" type="submit" :disabled="submitting || !accepted">{{ submitting ? '正在确认报名…' : '报名内测' }}</button>
            <p class="beta-fine">无需人工审核。点击后由服务器确认名额，满额自动候补。</p>
          </form>
          <p v-else>请先确认当前开放状态。尚未开始或正在维护时，不能新增报名；状态读取失败时可重试。</p>
          <p v-if="submitMessage" class="beta-feedback" :class="{ 'is-error': submitFailed }" :role="submitFailed ? 'alert' : 'status'">{{ submitMessage }}</p>
        </section>
        <section class="beta-card" aria-labelledby="beta-rules-title">
          <h2 id="beta-rules-title">本轮规则</h2>
          <div class="beta-rule"><b>01 · 同一套账号，单独领取资格</b><p>Share 正常注册和使用不受影响。每个统一账号最多占一份体验名额，游戏子账号、设备和连接码不会额外占位。</p></div>
          <div class="beta-rule"><b>02 · 首批预留，所有人都有报名入口</b><p>首批 {{ campaign?.initialCapacity || 100 }} 名中，{{ campaign?.reservedInitial || 25 }} 名为冻结名单内的 Share 老用户共同预留，其余公开报名。预留并非每人保证一份；用尽后老用户仍可参与公开报名。</p></div>
          <div class="beta-rule"><b>03 · 72 小时后统一释放</b><p>预留期从开测起连续计算 72 小时。未使用的预留到期后转给公开候补，不增加本轮总上限。快照之后新注册 Share 的账号不享受这批预留。</p></div>
          <div class="beta-rule"><b>04 · 不需要反复抢名额</b><p>后续按服务器报名顺序递补；是否扩到 {{ campaign?.maxCapacity || 200 }} 人根据测试情况决定。不会因没有找到 Bug 或不在群里发言而自动取消已开通资格。</p></div>
          <dl v-if="campaign?.snapshotAt" class="beta-dates">
            <dt>名单对应时点</dt><dd>{{ time(campaign.snapshotAt) }}</dd>
            <dt>内测开放</dt><dd>{{ time(campaign.startsAt) }}</dd>
            <dt>专属预留结束</dt><dd>{{ time(campaign.reservedUntil) }}</dd>
          </dl>
          <p class="beta-fine">内测可能遇到功能不完善、同步失败或显示异常。反馈截图和日志前，请遮住邮箱、连接码等敏感信息。</p>
        </section>
        <div class="beta-links"><router-link to="/works">查看公开作业</router-link><router-link to="/cart">使用本地账房</router-link><router-link to="/feedback">反馈问题</router-link></div>
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
import { BETA_INTENTS, betaEntryTarget, betaStatusCopy, formatBetaTime } from '../../utils/betaAccess.js'
const route = useRoute()
const accepted = ref(false)
const intentTags = ref([])
const submitting = ref(false)
const submitMessage = ref('')
const submitFailed = ref(false)
const campaign = computed(() => beta.campaign)
const mine = computed(() => beta.mine)
const error = computed(() => beta.publicError || beta.personalError)
const copy = computed(() => betaStatusCopy(campaign.value, mine.value, error.value))
const refreshing = computed(() => beta.publicLoading || beta.personalLoading)
const entryTarget = computed(() => betaEntryTarget(route.query.redirect))
const canJoin = computed(() => !error.value && mine.value?.nextAction === 'JOIN' && campaign.value?.accessMode === 'BETA')
let unsubscribe
function time(value) { return formatBetaTime(value, campaign.value?.announcementTimezone) }
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
  try { await beta.withdraw(); submitMessage.value = '已取消候补，统一账号仍可正常使用。' }
  catch (e) { submitFailed.value = true; submitMessage.value = e.message; await beta.refresh() }
  finally { submitting.value = false }
}
onMounted(() => { unsubscribe = beta.subscribe() })
onBeforeUnmount(() => { unsubscribe?.() })
</script>
<style scoped>
.page-beta .hero { --wm: '邀'; }
.beta-content { display: grid; gap: 22px; padding-bottom: 44px; }
.beta-local-notice { display: grid; gap: 5px; padding: 14px 18px; border: 1px dashed var(--accent); border-radius: 14px; background: var(--cream); color: var(--ink); }
.beta-local-notice b { color: var(--accent); font-size: 12px; letter-spacing: .08em; }
.beta-local-notice span { font-size: 13px; line-height: 1.7; }
.beta-state, .beta-card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: clamp(20px, 3vw, 34px); }
.beta-state { border-top: 4px solid var(--tea); }
.beta-kicker { font-size: 12px; color: var(--ink-60); letter-spacing: .12em; }
h2 { font: 900 clamp(20px, 3vw, 27px)/1.45 var(--font-s); margin: 8px 0 14px; color: var(--ink); }
p { color: var(--ink); line-height: 1.9; margin: 10px 0 16px; overflow-wrap: anywhere; }
.beta-numbers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.beta-numbers > div { display: grid; gap: 7px; padding: 22px 18px; border: 1px solid var(--line); background: var(--cream); border-radius: 16px; }
.beta-numbers span, .beta-numbers small { font-size: 12px; color: var(--ink-60); }
.beta-numbers strong { font: 800 34px/1.1 var(--font-d); color: var(--tea); }
.beta-fine { font-size: 12px; color: var(--ink-60); margin: 0; }
.beta-actions, .beta-links { display: flex; flex-wrap: wrap; gap: 12px; }
.beta-button { display: inline-flex; justify-content: center; align-items: center; min-height: 44px; padding: 11px 22px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 700 14px var(--font-b); text-decoration: none; cursor: pointer; margin: 8px 0; }
.beta-button.secondary { background: transparent; color: var(--tea); }
.beta-button:disabled { opacity: .55; cursor: default; }
.beta-button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
fieldset { border: 0; margin: 0 0 22px; padding: 0; }
legend { font-weight: 700; line-height: 1.8; margin-bottom: 10px; }
legend small { display: block; font-weight: 400; color: var(--ink-60); }
.beta-interest { display: inline-flex; align-items: center; gap: 6px; padding: 10px 13px; margin: 4px 7px 4px 0; border: 1px solid var(--line); border-radius: 999px; background: var(--cream); cursor: pointer; font-size: 13px; }
.beta-consent { display: flex; align-items: flex-start; gap: 10px; line-height: 1.8; padding: 16px; border: 1px dashed var(--line); border-radius: 12px; margin-bottom: 12px; }
.beta-consent input { flex: none; margin-top: 6px; }
.beta-rule { border-top: 1px solid var(--line); padding: 18px 0 0; }
.beta-rule b { color: var(--tea); }
.beta-rule p { font-size: 14px; }
.beta-dates { display: grid; grid-template-columns: auto 1fr; gap: 10px 16px; padding: 16px; background: var(--cream); border-radius: 12px; font-size: 12px; }
.beta-dates dd { margin: 0; overflow-wrap: anywhere; }
.beta-links a { color: var(--tea); padding: 8px 0; text-underline-offset: 4px; }
.beta-error, .beta-feedback.is-error { color: var(--rouge); }
.beta-feedback { color: var(--tea); }
@media (max-width: 620px) { .beta-numbers { grid-template-columns: repeat(2, minmax(0, 1fr)); } .beta-dates { grid-template-columns: 1fr; gap: 5px; } .beta-dates dd { margin-bottom: 10px; } .beta-consent { padding: 12px; font-size: 13px; } }
</style>
