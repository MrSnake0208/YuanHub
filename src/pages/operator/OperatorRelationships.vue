<template>
  <section class="relationships" aria-label="信赖与传闻">
    <header class="relationships-heading">
      <div><h2>信赖与传闻</h2><p>点击头像上的铅笔选择信赖节点，查看下一档与未解锁奖励。</p></div>
      <button type="button" :disabled="saving || loading" @click="refresh">重新读取</button>
    </header>
    <p v-if="loading" role="status">正在读取信赖与传闻…</p>
    <p v-if="error || localError" role="alert">{{ localError || error }}</p>
    <p v-if="favoriteError" role="alert">{{ favoriteError }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!scope.enabled">请登录并选择游戏账号。</p>
    <template v-if="data && catalog">
      <div class="relationships-summary" aria-label="全账号未解锁奖励汇总">
        <p>全账号已拥有 {{ summary.total }} 位 · 已录入 {{ summary.recorded }} 位 · 信赖可计算 {{ summary.trustCovered }} / {{ summary.trustTotal }} 组（共享只计一次）</p>
        <p v-if="summary.trustConflicts" role="alert">{{ summary.trustConflicts }} 组历史信赖值不一致，请编辑核对；冲突组暂不计入奖励。</p>
        <p v-if="summary.overflow">奖励数量超过可精确计算范围，请核对规则。</p>
        <p v-else-if="summary.rewards.length">已知部分未解锁奖励：{{ rewardText(summary.rewards) }}</p>
        <p v-else-if="summary.missing">未录入或奖励资料不完整，暂不能给出完整奖励总额。</p>
        <p v-else>已达到全部已收录奖励条件。</p>
        <p v-if="summary.missing">{{ summary.missing }} 项信赖／传闻未纳入计算。搜索与筛选不改变全账号汇总。</p>
        <p v-if="!Object.keys(rules).length">当前游戏奖励资料待核准；可先记录进度，资料补齐后再计算奖励。</p>
      </div>
      <div class="relationships-filters">
        <label>搜索密探<input v-model="search" type="search" placeholder="密探名称" /></label>
        <label>品质<select v-model="rarity"><option value="">全部品质</option><option value="5">绝密</option><option value="4">机密</option><option value="3">隐密</option></select></label>
        <label>记录状态<select v-model="filter"><option value="all">全部已拥有</option><option value="unknown">未完整录入</option><option value="trust">信赖未满（上限已知）</option><option value="rumors">传闻未齐（总数已知）</option></select></label>
        <span>{{ visible.length }} 位</span>
      </div>
      <p v-if="!operators.length">当前账号没有已拥有密探，请先在名册录入。</p>
      <p v-else-if="!visible.length">没有符合筛选的密探。</p>
      <ul class="relationships-list">
        <li v-for="operator in visible" :key="operator.id" class="relationship-card" :class="'rarity-r' + (operator.rarity || 3)">
          <div class="relationship-portrait">
            <img v-if="operator.avatar" class="relationship-avatar" :src="avatarUrl(operator.avatar)" :alt="operator.name" loading="lazy" />
            <span v-else class="relationship-placeholder">{{ operator.name?.slice(0, 1) }}</span>
            <img v-if="profIcon(operator.prof)" class="relationship-prof" :src="profIcon(operator.prof)" :alt="'属性：' + operator.prof" />
            <button type="button" class="relationship-favorite" :aria-label="(favoriteIds.has(operator.id) ? '取消特别关注' : '特别关注') + operator.name" :aria-pressed="favoriteIds.has(operator.id)" :disabled="favoriteLoading || favoriteBusyIds.has(operator.id)" @click="$emit('favorite', operator)"><Star :size="16" :fill="favoriteIds.has(operator.id) ? 'currentColor' : 'none'" aria-hidden="true" /></button>
            <span class="relationship-badge" :class="{ unknown: value(operator.id, 'trust') == null }">{{ trustState(operator.id).conflict ? '待核对' : value(operator.id, 'trust') == null ? '未记录' : '信赖 ' + value(operator.id, 'trust') }}</span>
            <button type="button" class="relationship-edit" :disabled="!ready || !!preview" :aria-label="'编辑' + operator.name + '的进度'" aria-haspopup="dialog" @click="edit(operator.id)"><Pencil :size="17" aria-hidden="true" /></button>
          </div>
          <h3>{{ operator.name }}</h3>
          <small v-if="trustState(operator.id).conflict" class="relationship-conflict">历史记录冲突：{{ trustSourcesText(operator.id) }}</small>
        </li>
      </ul>
      <OperatorRelationshipDialog v-if="editing" :key="scope.key + editing" :name="operatorMap[editing]?.name || editing"
        :draft="draft" :baseline="baseline" :trust-rule="domain(editing, 'trust')" :rumor-rule="domain(editing, 'rumors')"
        :saving="saving" :ready="ready" :dirty="dirty" :error="localError || error"
        :shared-name="owner(editing) !== editing ? operatorMap[owner(editing)]?.name || owner(editing) : ''"
        :conflict="trustState(editing).conflict" :conflict-sources="trustSourcesText(editing)" :resolve-trust="resolveTrust"
        @trust="draft.trust = $event" @rumors="draft.rumors = $event" @resolve="resolveTrust = $event" @save="saveDraft" @close="cancel" @reload="refresh" />
      <details class="relationships-exchange"><summary>更多 · 信赖与传闻备份</summary>
        <p>仅备份当前账号的信赖与传闻记录，含列表之外的历史记录；与练度 JSON 分开，不包含奖励计算结果。</p>
        <button type="button" :disabled="!ready" @click="download">导出信赖与传闻备份</button>
        <label>读取备份（最大 1 MiB）<input type="file" accept="application/json,.json" :disabled="!ready || dirty" @change="readFile" /></label>
        <label>备份内容<textarea v-model="importText" rows="4" :disabled="saving || dirty" @input="preview = null; fileSequence++" /></label>
        <label><input v-model="overwrite" type="checkbox" :disabled="saving || dirty" @change="preview = null" />使用备份覆盖冲突值（默认保留当前记录）</label>
        <button type="button" :disabled="!ready || dirty || !importText.trim()" @click="prepareImport">预览恢复</button>
        <p v-if="!editing && localError" role="alert">{{ localError }}</p>
        <div v-if="preview" class="relationships-preview">
          <p>恢复到 {{ accountName }} · {{ game }}；将修改 {{ preview.changes }} 个进度值，发现 {{ preview.conflicts }} 个冲突。</p>
          <p>{{ overwrite ? '冲突项采用备份中的值。' : '冲突项保留当前记录，仅补充未记录项。' }}</p>
          <details v-if="preview.changes"><summary>查看将修改的进度</summary><ul>
            <template v-for="(fields, id) in preview.entries" :key="id"><li v-for="(next, kind) in fields" :key="id + kind">{{ operatorMap[id]?.name || id }} · {{ labels[kind] }}：{{ value(id, kind) ?? '未记录' }} → {{ next }}</li></template>
          </ul></details>
          <button type="button" :disabled="!ready || !preview.changes" @click="restore">确认恢复到当前账号</button>
          <button type="button" :disabled="saving" @click="preview = null">取消预览</button>
        </div>
      </details>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Pencil, Star } from '@lucide/vue'
import { avatarUrl } from '../../api/request.js'
import OperatorRelationshipDialog from '../../components/operator/OperatorRelationshipDialog.vue'
import { useOperatorRelationships } from '../../composables/useOperatorRelationships.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import { RELATIONSHIP_KINDS, RELATIONSHIP_BACKUP_LIMIT, relationshipOwner, relationshipTrustState, relationshipValue, relationshipSummary, parseRelationshipValue, makeRelationshipBackup, readRelationshipBackup, previewRelationshipImport } from '../../utils/operatorRelationships.js'
const props = defineProps({ accountId: String, accountName: String, game: String, userId: String, loggedIn: Boolean, profIcon: { type: Function, default: () => '' }, favoriteIds: { type: Set, default: () => new Set() }, favoriteBusyIds: { type: Set, default: () => new Set() }, favoriteLoading: Boolean, favoriteError: String, operators: { type: Array, default: () => [] }, allOperators: { type: Array, default: () => [] } })
defineEmits(['favorite'])
const scope = computed(() => ({ key: JSON.stringify([props.userId, props.loggedIn, props.accountId, props.game]), accountId: props.accountId, game: props.game, enabled: !!props.loggedIn && !!props.accountId }))
const { data, catalog, loading, saving, error, ready, reload, save } = useOperatorRelationships(scope)
const rules = computed(() => catalog.value?.operators || {}), records = computed(() => data.value?.entries || {})
const operatorMap = computed(() => Object.fromEntries(props.allOperators.map(item => [item.id, item])))
const summary = computed(() => relationshipSummary(props.operators, records.value, rules.value))
const labels = { trust: '信赖值', rumors: '传闻数量' }
const search = ref(''), rarity = ref(''), filter = ref('all'), editing = ref(''), draft = ref({ trust: '', rumors: '' }), baseline = ref({ trust: '', rumors: '' })
const localError = ref(''), notice = ref(''), importText = ref(''), overwrite = ref(false), preview = ref(null)
const resolveTrust = ref(false)
const dirty = computed(() => !!editing.value && (resolveTrust.value || RELATIONSHIP_KINDS.some(kind => draft.value[kind] !== baseline.value[kind])))
const hasUnsaved = computed(() => dirty.value || !!importText.value.trim() || saving.value)
const confirmDiscard = useUnsavedChanges(hasUnsaved, '信赖与传闻草稿')
const value = (id, kind) => relationshipValue(id, kind, records.value, rules.value)
const trustState = id => relationshipTrustState(id, records.value, rules.value)
const trustSourcesText = id => trustState(id).sources.map(source => (operatorMap.value[source.id]?.name || source.id) + ' ' + source.value).join('、')
const owner = id => relationshipOwner(id, 'trust', rules.value)
const domain = (id, kind) => rules.value[relationshipOwner(id, kind, rules.value)]?.[kind]
const rewardText = rewards => rewards.map(item => item.name + ' × ' + item.quantity).join('、')
const visible = computed(() => props.operators.filter(op => op.id === editing.value ||
  ((!search.value.trim() || op.name.includes(search.value.trim())) && (!rarity.value || String(op.rarity) === rarity.value) &&
  (filter.value === 'all' || (filter.value === 'unknown' ? RELATIONSHIP_KINDS.some(kind => value(op.id, kind) == null) : value(op.id, filter.value) != null && domain(op.id, filter.value) && value(op.id, filter.value) < domain(op.id, filter.value).max)))))
async function beforeLeave() {
  if (saving.value) return false
  const key = scope.value.key
  if (!await confirmDiscard() || key !== scope.value.key || saving.value) return false
  fileSequence++; editing.value = ''; resolveTrust.value = false; importText.value = ''; preview.value = null; return true
}
async function edit(id) {
  if (!ready.value || !await beforeLeave()) return
  editing.value = id; localError.value = ''; notice.value = ''
  draft.value = Object.fromEntries(RELATIONSHIP_KINDS.map(kind => [kind, value(id, kind) == null ? '' : String(value(id, kind))]))
  baseline.value = { ...draft.value }
}
async function cancel() { if (await beforeLeave()) localError.value = '' }
async function saveDraft() {
  localError.value = ''; notice.value = ''
  const key = scope.value.key, id = editing.value, patch = {}
  try {
    for (const kind of RELATIONSHIP_KINDS) if (draft.value[kind] !== baseline.value[kind] || (kind === 'trust' && resolveTrust.value)) {
      if (kind === 'trust' && trustState(id).conflict && !resolveTrust.value) throw new Error('请先勾选已核对，再统一共享信赖值')
      patch[kind] = parseRelationshipValue(draft.value[kind])
      if (patch[kind] != null && domain(id, kind) && patch[kind] > domain(id, kind).max) throw new Error(labels[kind] + '超过已核准上限')
    }
    if (!Object.keys(patch).length) return
    if (await save({ [id]: patch }) && key === scope.value.key) { editing.value = ''; resolveTrust.value = false; notice.value = '进度已保存'; preview.value = null }
  } catch (err) { if (key === scope.value.key) localError.value = err.message }
}
async function refresh() { if (await beforeLeave()) { localError.value = ''; notice.value = ''; await reload() } }
function download() {
  const document = makeRelationshipBackup(props.game, records.value)
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = window.document.createElement('a'); link.href = url; link.download = 'YuanHub-信赖与传闻-' + props.game + '.json'
  window.document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
let fileSequence = 0
async function readFile(event) {
  const file = event.target.files?.[0], key = scope.value.key, sequence = ++fileSequence
  event.target.value = ''; preview.value = null; localError.value = ''
  if (!file) return
  try {
    if (file.size > RELATIONSHIP_BACKUP_LIMIT) throw new Error('备份不能超过 1 MiB')
    const text = await file.text()
    if (key === scope.value.key && sequence === fileSequence) { importText.value = text; prepareImport() }
  } catch (err) { if (key === scope.value.key && sequence === fileSequence) localError.value = err.message }
}
function prepareImport() {
  localError.value = ''; notice.value = ''; preview.value = null
  try {
    const incoming = readRelationshipBackup(importText.value, props.game, props.allOperators)
    preview.value = { ...previewRelationshipImport(incoming, records.value, rules.value, overwrite.value), key: scope.value.key, revision: data.value.revision }
  } catch (err) { localError.value = err.message }
}
async function restore() {
  const pending = preview.value
  if (!pending || pending.key !== scope.value.key || pending.revision !== data.value?.revision) { preview.value = null; return }
  if (await save(pending.entries, pending.revision) && pending.key === scope.value.key) { importText.value = ''; preview.value = null; notice.value = '信赖与传闻备份已恢复' }
}
watch(() => scope.value.key, () => {
  fileSequence++; editing.value = ''; resolveTrust.value = false; localError.value = ''; notice.value = ''; importText.value = ''; preview.value = null; overwrite.value = false
}, { flush: 'sync' })
defineExpose({ beforeLeave, saving })
</script>
<style scoped src="./operatorRelationshipsMobile.css"></style>
<style scoped src="./operatorRelationshipsDesktop.css"></style>
