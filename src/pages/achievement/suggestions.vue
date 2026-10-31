<template>
  <div class="achievement-suggestions">
    <IslandSidebar />
    <main id="main-content" class="wrap suggestions-main">
      <router-link :to="review ? '/achievement/admin' : '/achievement'">{{ review ? '返回成就目录管理' : '返回成就档案' }}</router-link>
      <h1>{{ review ? '审核成就投稿' : '补充成就资料' }}</h1>
      <p v-if="!identity">请先登录。</p>
      <p v-else-if="!allowed">需要成就目录管理权限。</p>
      <template v-else>
        <p>{{ review ? '采纳只追加到草稿；发布仍需在成就目录管理中预览确认。' : '提交候选新成就，管理员审核后加入目录草稿；不修改你的个人完成记录。' }}</p>
        <div v-if="error || Object.keys(errors).length" ref="errorSummary" tabindex="-1" role="alert" class="suggestion-error">
          <p>{{ error || '请修正以下内容后再提交。' }}</p>
          <p v-for="(message, field) in errors" :key="field"><a :href="'#candidate-' + field" @click.prevent="focusField(field)">{{ message }}</a></p>
        </div>
        <p class="action-feedback" v-if="notice" role="status">{{ notice }}</p>
        <nav v-if="!review" aria-label="投稿任务"><button :aria-pressed="mode === 'new'" :disabled="busy" @click="changeMode('new')">补充资料</button><button :aria-pressed="mode === 'mine'" :disabled="busy" @click="changeMode('mine')">我的投稿</button></nav>
        <template v-if="review || mode === 'mine'">
          <form class="suggestion-toolbar" @submit.prevent="loadList(1)">
            <label>状态<select v-model="status" :disabled="busy"><option value="">全部</option><option value="PENDING">待审核</option><option value="ACCEPTED">已采纳到草稿</option><option value="REJECTED">未采纳</option></select></label>
            <label v-if="review">游戏<select v-model="filterGame" :disabled="busy"><option v-for="name in games" :key="name">{{ name }}</option></select></label>
            <button :disabled="busy">查询</button>
          </form>
          <p v-if="loading" role="status">正在读取投稿…</p>
          <template v-if="list">
            <p v-if="!list.items.length">暂无符合条件的投稿。</p>
            <ul class="suggestion-list"><li v-for="row in list.items" :key="row.suggestion.id"><button :disabled="busy" @click="select(row.suggestion.id)">{{ row.suggestion.original.name }} · {{ row.suggestion.original.game }} · {{ suggestionStatus(row.suggestion.status) }}</button></li></ul>
            <nav aria-label="投稿分页"><button :disabled="busy || list.page <= 1" @click="loadList(list.page - 1)">上一页</button><span>第 {{ list.page }} 页 · 共 {{ list.total }} 条</span><button :disabled="busy || list.page * list.page_size >= list.total" @click="loadList(list.page + 1)">下一页</button></nav>
          </template>
          <AchievementSuggestionDetail :value="detail">
            <router-link v-if="review && detail?.suggestion.achievement_id" :to="{ path: '/achievement/admin', query: { game: detail.suggestion.original.game, entry: detail.suggestion.achievement_id } }">到目录查看草稿条目（尚需手动发布）</router-link>
          </AchievementSuggestionDetail>
        </template>
        <form v-if="mode === 'new' && !review || review && detail?.suggestion.status === 'PENDING'" novalidate @submit.prevent="send">
          <h2>{{ review ? '修订后采纳' : '候选新成就' }}</h2>
          <label v-if="!review">游戏<select :value="game" :disabled="busy || !!attempt" @change="switchGame($event.target.value)"><option v-for="name in games" :key="name">{{ name }}</option></select></label>
          <p v-if="optionsLoading" role="status">正在读取分类与奖励…</p>
          <p v-if="options?.compatibility_issues?.length" role="alert">目录含旧资料兼容问题，请先在目录管理中核对。</p>
          <button v-if="!options && !optionsLoading" type="button" :disabled="busy" @click="loadOptions">重新读取分类</button>
          <fieldset :disabled="busy || !options || !!attempt || !!options?.compatibility_issues?.length">
            <legend>{{ review ? '管理员修订内容' : '成就资料' }}</legend>
            <AchievementCandidateFields :candidate="candidate" :categories="categories" :reward-items="options?.reward_items || []" :errors="errors" />
            <template v-if="!review">
              <label>来源链接（必填）<input id="candidate-source_url" v-model="sourceUrl" type="url" maxlength="2048" :aria-invalid="!!errors.source_url" :aria-describedby="errors.source_url ? 'source-error' : undefined"><span v-if="errors.source_url" id="source-error">{{ errors.source_url }}</span></label>
              <label>补充说明（选填）<textarea v-model="submissionNote" maxlength="1000" rows="3"></textarea></label>
            </template>
            <label v-else>审核说明（拒绝时必填）<textarea id="candidate-review_note" v-model="reviewNote" maxlength="1000" :aria-invalid="!!errors.review_note" :aria-describedby="errors.review_note ? 'review-error' : undefined" rows="3"></textarea><span v-if="errors.review_note" id="review-error">{{ errors.review_note }}</span></label>
          </fieldset>
          <p v-if="attempt">上次提交结果尚未确定。输入已保留，请重试同一份投稿。</p>
          <button :disabled="busy || !options || !!options?.compatibility_issues?.length">{{ busy ? '正在提交…' : attempt ? '重试上次提交' : review ? '采纳到草稿' : '提交资料' }}</button>
          <template v-if="review"><button type="button" :disabled="busy" @click="reject">不采纳</button><button type="button" :disabled="busy" @click="refreshReview">刷新审核与目录版本（保留修正）</button></template>
        </form>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import AchievementCandidateFields from '../../components/achievement/AchievementCandidateFields.vue'
import AchievementSuggestionDetail from '../../components/achievement/AchievementSuggestionDetail.vue'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import * as api from '../../api/achievementSuggestions.js'
import { candidateErrors, newCandidate, safeSource, suggestionStatus } from './suggestionRules.js'
const props = defineProps({ review: Boolean })
const route = useRoute(), games = ['代号鸢', '如鸢']
const identity = computed(() => String(auth.userInfo?.id || ''))
const allowed = computed(() => !!identity.value && (!props.review || hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ACHIEVEMENT_CATALOG_WRITE)))
const mode = ref(route.query.mode === 'mine' ? 'mine' : 'new'), game = ref(games[0]), filterGame = ref(games[0]), status = ref(props.review ? 'PENDING' : '')
const candidate = ref(newCandidate(game.value)), sourceUrl = ref(''), submissionNote = ref(''), reviewNote = ref('')
const list = ref(null), detail = ref(null), options = ref(null), loading = ref(false), optionsLoading = ref(false), busy = ref(false)
const error = ref(''), notice = ref(''), errors = ref({}), errorSummary = ref(null), attempt = ref(null)
const categories = computed(() => props.review ? options.value?.draft.categories.filter(c => c.enabled) || [] : options.value?.catalog.categories || [])
const clone = value => JSON.parse(JSON.stringify(value))
const baseline = ref(JSON.stringify(candidate.value))
const dirty = computed(() => !!attempt.value || JSON.stringify(candidate.value) !== baseline.value || !!(sourceUrl.value || submissionNote.value || reviewNote.value))
let generation = 0, listTurn = 0, detailTurn = 0, optionsTurn = 0
async function fail(e) { error.value = e.message || '读取失败，请重试。'; await nextTick(); errorSummary.value?.focus() }
function focusField(field) { document.getElementById('candidate-' + field)?.focus() }
function canLeave() { return !dirty.value || window.confirm('有未提交资料或尚未确定的提交结果，确定离开？') }
async function loadOptions() {
  const turn = ++optionsTurn, session = generation, owner = identity.value, target = game.value
  optionsLoading.value = true
  try {
    const value = await (props.review ? api.getSuggestionReviewOptions : api.getSuggestionOptions)(target, owner)
    if (turn === optionsTurn && session === generation) options.value = value
  } catch (e) { if (turn === optionsTurn && session === generation) await fail(e) }
  finally { if (turn === optionsTurn && session === generation) optionsLoading.value = false }
}
async function loadList(page = 1) {
  if (!allowed.value) return
  const turn = ++listTurn, session = generation
  loading.value = true; error.value = ''
  try {
    const params = { page, page_size: 20, status: status.value, ...(props.review ? { game: filterGame.value } : {}) }
    const value = await (props.review ? api.getAchievementSuggestionQueue : api.getMyAchievementSuggestions)(params, identity.value)
    if (turn === listTurn && session === generation) list.value = value
  } catch (e) { if (turn === listTurn && session === generation) await fail(e) }
  finally { if (turn === listTurn && session === generation) loading.value = false }
}
async function select(id) {
  if (!canLeave()) return
  const turn = ++detailTurn, session = generation
  busy.value = true; error.value = ''; errors.value = {}; detail.value = null; options.value = null
  try {
    const value = await api.getAchievementSuggestion(id, identity.value, props.review)
    if (turn !== detailTurn || session !== generation) return
    detail.value = value
    if (props.review) {
      candidate.value = clone(value.suggestion.original); game.value = candidate.value.game; baseline.value = JSON.stringify(candidate.value); reviewNote.value = ''
      await loadOptions()
    }
  } catch (e) { if (turn === detailTurn && session === generation) await fail(e) }
  finally { if (turn === detailTurn && session === generation) busy.value = false }
}
async function refreshReview() {
  const session = generation; busy.value = true
  try {
    const value = await api.getAchievementSuggestion(detail.value.suggestion.id, identity.value, true)
    if (session !== generation) return
    detail.value = value; await loadOptions()
    notice.value = '已更新审核和目录版本，保留你的修正，请核对后重试。'
  } catch (e) { if (session === generation) await fail(e) }
  finally { if (session === generation) busy.value = false }
}
async function send() {
  if (busy.value || !options.value || !allowed.value) return
  errors.value = attempt.value ? {} : candidateErrors(candidate.value, categories.value, options.value.reward_items)
  if (!props.review && !attempt.value && !safeSource(sourceUrl.value)) errors.value.source_url = '请填写http/https来源链接。'
  if (Object.keys(errors.value).length) { await nextTick(); errorSummary.value?.focus(); return }
  const session = generation, owner = identity.value
  busy.value = true; error.value = ''; notice.value = ''
  if (!props.review && !attempt.value) attempt.value = { client_request_id: crypto.randomUUID(), candidate: clone(candidate.value), source_url: sourceUrl.value, submission_note: submissionNote.value }
  try {
    const value = props.review
      ? await api.reviewAchievementSuggestion(detail.value.suggestion.id, 'accept', { expected_version: detail.value.suggestion.version, expected_catalog_revision: options.value.revision, candidate: clone(candidate.value), review_note: reviewNote.value }, owner)
      : await api.submitAchievementSuggestion(clone(attempt.value), owner)
    if (session !== generation) return
    detail.value = value; attempt.value = null; sourceUrl.value = ''; submissionNote.value = ''; reviewNote.value = ''; baseline.value = JSON.stringify(candidate.value)
    notice.value = props.review ? '已采纳到草稿，尚未发布。' : '已提交，等待管理员审核。'
    mode.value = 'mine'; await loadList(1)
  } catch (e) {
    if (session !== generation) return
    if (!props.review && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) attempt.value = null
    await fail(e)
  } finally { if (session === generation) busy.value = false }
}
async function reject() {
  errors.value = {}
  if (!reviewNote.value.trim()) { errors.value.review_note = '请说明不采纳原因。'; await nextTick(); errorSummary.value?.focus(); return }
  const session = generation; busy.value = true; error.value = ''
  try {
    const value = await api.reviewAchievementSuggestion(detail.value.suggestion.id, 'reject', { expected_version: detail.value.suggestion.version, review_note: reviewNote.value }, identity.value)
    if (session !== generation) return
    detail.value = value; reviewNote.value = ''; baseline.value = JSON.stringify(candidate.value); notice.value = '已记录不采纳原因。'; await loadList(1)
  } catch (e) { if (session === generation) await fail(e) }
  finally { if (session === generation) busy.value = false }
}
async function changeMode(value) {
  if (mode.value === value || !canLeave()) return
  mode.value = value; error.value = ''; errors.value = {}
  if (value === 'new') { candidate.value = newCandidate(game.value); baseline.value = JSON.stringify(candidate.value); sourceUrl.value = ''; submissionNote.value = ''; attempt.value = null; await loadOptions() }
  else await loadList(1)
}
async function switchGame(value) {
  if (!canLeave()) return
  game.value = value; candidate.value = newCandidate(value); baseline.value = JSON.stringify(candidate.value); options.value = null; errors.value = {}; await loadOptions()
}
watch([identity, allowed, () => props.review], () => {
  generation++; listTurn++; detailTurn++; optionsTurn++; list.value = null; detail.value = null; options.value = null; attempt.value = null
  busy.value = false; loading.value = false; optionsLoading.value = false; error.value = ''; notice.value = ''; errors.value = {}
  candidate.value = newCandidate(game.value); baseline.value = JSON.stringify(candidate.value); sourceUrl.value = ''; submissionNote.value = ''; reviewNote.value = ''
  if (allowed.value) { if (props.review || mode.value === 'mine') loadList(); else loadOptions() }
}, { immediate: true })
onBeforeRouteLeave(canLeave)
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.suggestions-main { max-width: 900px; padding-block: 24px 64px; overflow-wrap: anywhere; }
form, fieldset { display: grid; gap: 14px; min-width: 0; }
form { margin-block: 20px; }
fieldset { border: 1px solid var(--border, #dfd0b8); padding: 16px; }
label { display: grid; gap: 6px; min-width: 0; }
input, select, textarea { min-width: 0; width: 100%; box-sizing: border-box; font: inherit; }
button { font: inherit; padding: 8px 12px; white-space: normal; }
nav, .suggestion-toolbar { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; }
.suggestion-list { padding-left: 20px; }
.suggestion-list li { margin-block: 10px; }
.suggestion-list button { text-align: left; overflow-wrap: anywhere; max-width: 100%; }
.suggestion-error { border: 1px solid currentColor; padding: 12px; }
</style>
