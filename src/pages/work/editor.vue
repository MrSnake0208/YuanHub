<template>
  <div class="page-work-editor">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <router-link class="back-link" :to="savedId ? '/work/' + savedId : '/works'">← {{ savedId ? '返回作业详情' : '返回作业广场' }}</router-link>
          <div class="crumb"><span class="pill fill">Work v1</span><span class="pill">{{ savedId ? '编辑' : '新建' }}</span></div>
          <h1>{{ savedId ? '编辑基础作业' : '新建基础作业' }}<span class="small">唯一执行事实源</span></h1>
          <p class="hero-sub">按顺序编辑回合动作，再显式保存。目标平台文档仅用于兼容性预览。</p>
          <div class="editor-meta" aria-live="polite">
            <span>{{ savedId || '尚未保存' }}</span><span>{{ status }}</span><span>revision {{ revision }}</span><span>{{ dirty ? '有未保存修改' : '已保存' }}</span>
          </div>
        </div>
      </header>

      <div class="wrap editor-content">
        <div v-if="loading" class="editor-state" aria-live="polite">正在读取作业…</div>
        <div v-else-if="loadError" class="editor-state error" role="alert">
          <strong>作业读取失败</strong><span>{{ loadError }}</span><button type="button" @click="load">重试</button>
        </div>
        <template v-else>
          <div v-if="conflict" class="notice conflict" role="alert">
            <span>服务端已有更新，本地内容仍保留且不会自动覆盖。请复制需要的内容后重新载入最新版本。</span>
            <button type="button" @click="reloadLatest">重新载入最新版本</button>
          </div>
          <p v-if="actionMessage" class="notice" :class="{ error: actionError }" :role="actionError ? 'alert' : 'status'">{{ actionMessage }}</p>
          <ul v-if="validationIssues.length" id="work-validation-summary" class="validation-list" role="alert" aria-label="保存前校验错误">
            <li v-for="item in validationIssues" :key="item.path"><code>{{ item.path }}</code>{{ item.message }}</li>
          </ul>

          <form class="work-form" :aria-invalid="validationIssues.length > 0" :aria-describedby="validationIssues.length ? 'work-validation-summary' : undefined" @submit.prevent="save">
            <section class="editor-section" aria-labelledby="basic-title">
              <div class="section-head"><span>01</span><div><h2 id="basic-title">基本信息</h2><p>游戏、关卡和文档说明。</p></div></div>
              <div class="field-grid">
                <label>游戏<select v-model="document.game" :aria-invalid="fieldInvalid('$.game')" :aria-describedby="fieldInvalid('$.game') ? 'work-validation-summary' : undefined"><option>如鸢</option><option>代号鸢</option></select></label>
                <label>Level Catalog
                  <select v-model="document.level_id" @change="selectLevel">
                    <option value="">不关联（使用关卡名称）</option>
                    <option v-for="level in gameLevels" :key="level.id" :value="level.id">{{ level.name }} · {{ level.id }}</option>
                  </select>
                </label>
                <label>关卡名称<input v-model="document.stage_name" maxlength="256" required :aria-invalid="fieldInvalid('$.stage_name')" :aria-describedby="fieldInvalid('$.stage_name') ? 'work-validation-summary' : undefined"></label>
                <label>作业标题<input v-model="document.doc.title" maxlength="256" required :aria-invalid="fieldInvalid('$.doc.title')" :aria-describedby="fieldInvalid('$.doc.title') ? 'work-validation-summary' : undefined"></label>
                <label class="wide">打法说明<textarea v-model="document.doc.details" rows="5" maxlength="20000" :aria-invalid="fieldInvalid('$.doc.details')" :aria-describedby="fieldInvalid('$.doc.details') ? 'work-validation-summary' : undefined"></textarea></label>
              </div>
            </section>

            <section class="editor-section" aria-labelledby="operators-title">
              <div class="section-head"><span>02</span><div><h2 id="operators-title">固定五槽阵容</h2><p>空槽保持为空；所有动作槽位均从 1 开始。</p></div></div>
              <div class="operator-fields">
                <label v-for="slot in 5" :key="slot"><span>{{ slot }} 号位</span><input v-model="document.operators[slot - 1]" :aria-label="slot + '号位密探'" maxlength="128" placeholder="留空表示未指定"></label>
              </div>
            </section>

            <section class="editor-section" aria-labelledby="rounds-title">
              <div class="section-head with-command"><span>03</span><div><h2 id="rounds-title">回合与有序动作</h2><p>列表顺序就是执行顺序；使用按钮调整，不自动重排。</p></div><button type="button" class="command" @click="addRound">新增回合</button></div>
              <article v-for="(round, roundIndex) in document.rounds" :key="roundIndex" class="round-editor">
                <header>
                  <label>回合 <input v-model.number="round.round" type="number" min="1" max="50"></label>
                  <label class="round-remark">备注 <input v-model="round.remark" maxlength="2000"></label>
                  <button type="button" class="danger-link" :disabled="document.rounds.length === 1" @click="removeRound(roundIndex)">删除回合</button>
                </header>
                <ol class="action-editors">
                  <li v-for="(action, actionIndex) in round.actions" :key="actionIndex" class="action-editor">
                    <span class="action-order">{{ actionIndex + 1 }}</span>
                    <label>动作
                      <select :value="action.type" :aria-label="'回合 ' + round.round + ' 第 ' + (actionIndex + 1) + ' 个动作类型'" @change="replaceAction(round, actionIndex, $event.target.value)">
                        <option v-for="option in WORK_ACTION_TYPES" :key="option[0]" :value="option[0]">{{ option[1] }}</option>
                      </select>
                    </label>
                    <label v-if="slotAction(action)">槽位 <select v-model.number="action.slot"><option v-for="slot in 5" :key="slot" :value="slot">{{ slot }}</option></select></label>
                    <label v-if="action.type === 'wait'">毫秒 <input v-model.number="action.duration_ms" type="number" min="1" max="600000"></label>
                    <template v-if="action.type === 'switch_target'">
                      <label>方向 <select v-model="action.direction"><option value="left">左</option><option value="right">右</option></select></label>
                      <label>次数 <input v-model.number="action.count" type="number" min="1" max="100"></label>
                    </template>
                    <label v-if="action.type === 'auto_battle'">状态 <select v-model="action.enabled"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
                    <template v-if="action.type === 'check'">
                      <label>条件
                        <select :value="action.condition.type" @change="action.condition = createWorkCondition($event.target.value)">
                          <option v-for="option in WORK_CONDITION_TYPES" :key="option[0]" :value="option[0]">{{ option[1] }}</option>
                        </select>
                      </label>
                      <label v-if="conditionSlot(action.condition)">槽位 <select v-model.number="action.condition.slot"><option v-for="slot in 5" :key="slot" :value="slot">{{ slot }}</option></select></label>
                      <label v-if="action.condition.type === 'dragon_qi'">槽位（可选） <select v-model="action.condition.slot"><option value="">全局</option><option v-for="slot in 5" :key="slot" :value="slot">{{ slot }}</option></select></label>
                      <label v-if="action.condition.type === 'star_count'">颜色 <select v-model="action.condition.color"><option value="orange">橙</option><option value="purple">紫</option><option value="blue">蓝</option></select></label>
                      <label v-if="['dragon_qi', 'star_count'].includes(action.condition.type)">比较 <select v-model="action.condition.operator"><option v-for="operator in ['<', '<=', '=', '>=', '>']" :key="operator">{{ operator }}</option></select></label>
                      <label v-if="['dragon_qi', 'star_count'].includes(action.condition.type)">数值 <input v-model.number="action.condition.value" type="number" min="0" max="999"></label>
                      <label>失败处理 <select v-model="action.on_fail"><option value="restart">重开</option><option value="stop">停止</option><option value="pause">暂停</option></select></label>
                    </template>
                    <div class="action-buttons" aria-label="动作顺序操作">
                      <button type="button" :disabled="actionIndex === 0" @click="moveAction(round, actionIndex, -1)">上移</button>
                      <button type="button" :disabled="actionIndex === round.actions.length - 1" @click="moveAction(round, actionIndex, 1)">下移</button>
                      <button type="button" class="danger-link" :disabled="round.actions.length === 1" @click="round.actions.splice(actionIndex, 1)">删除</button>
                    </div>
                  </li>
                </ol>
                <button type="button" class="add-action" @click="round.actions.push(createWorkAction())">添加动作</button>
              </article>
            </section>

            <section class="editor-section" aria-labelledby="exec-title">
              <div class="section-head"><span>04</span><div><h2 id="exec-title">执行配置与扩展</h2><p>公共延迟与目标平台专属导航参数。</p></div></div>
              <div class="delay-grid">
                <label v-for="key in ['attack', 'ultimate', 'defense', 'sp']" :key="key">{{ key }} 延迟（ms）<input v-model.number="document.exec.delays_ms[key]" type="number" min="0" max="600000"></label>
              </div>
              <details class="extension-panel">
                <summary>MaaYuan / YuanAssist 高级扩展</summary>
                <div class="field-grid extension-fields">
                  <label>MaaYuan 关卡类型<select v-model="document.exec.extensions.maayuan.level_type"><option value="">不指定</option><option v-for="type in ['主线', '洞窟', '活动', '活动有分级', '白鹄', '兰台', '其他']" :key="type">{{ type }}</option></select></label>
                  <label>识别名称<input v-model="document.exec.extensions.maayuan.recognition_name" maxlength="256"></label>
                  <label>难度<input v-model="document.exec.extensions.maayuan.difficulty" maxlength="128"></label>
                  <label>洞窟方向<select v-model="document.exec.extensions.maayuan.cave_type"><option value="">不指定</option><option>左</option><option>右</option></select></label>
                  <label class="checkbox"><input v-model="document.exec.extensions.maayuan.lantai_nav" type="checkbox">启用兰台导航</label>
                  <label>YuanAssist 敌方回合等待（ms）<input v-model.number="document.exec.extensions.yuanassist.enemy_turn_wait_ms" type="number" min="0" max="600000"></label>
                  <fieldset class="offset-field"><legend>MaaYuan 识别偏移（四个整数）</legend><input v-for="(_, index) in document.exec.extensions.maayuan.rec_target_offset" :key="index" v-model.number="document.exec.extensions.maayuan.rec_target_offset[index]" type="number" :aria-label="'识别偏移 ' + (index + 1)"></fieldset>
                </div>
              </details>
            </section>

            <footer class="form-actions">
              <button type="button" class="secondary" :disabled="busy" @click="previewCompatibility">预览两个 Adapter</button>
              <button type="submit" :disabled="busy || conflict">{{ busy ? '处理中…' : '保存草稿' }}</button>
              <button v-if="savedId && status !== 'PUBLIC'" type="button" :disabled="busy || dirty || conflict" @click="publish">发布</button>
              <button v-if="savedId && status === 'PUBLIC'" type="button" class="secondary" :disabled="busy || dirty || conflict" @click="unpublish">取消发布</button>
              <button v-if="savedId" type="button" class="danger" :disabled="busy || conflict" @click="remove">删除</button>
            </footer>
          </form>

          <section class="preview-section" aria-labelledby="preview-title">
            <div class="section-head"><span>05</span><div><h2 id="preview-title">兼容性预览</h2><p>结果由现有 Adapter 现算，不会写回基础协议。</p></div></div>
            <div class="target-grid">
              <article v-for="target in TARGETS" :key="target.key" class="target-card">
                <header><div><span>{{ target.provider }}</span><h3>{{ target.label }}</h3></div></header>
                <div class="target-body"><WorkCompatibilityResult :label="target.label" :state="compatibility[target.key]" @retry="previewTarget(target.key)" /></div>
              </article>
            </div>
          </section>
        </template>
      </div>
      <SiteFooter><template #big>Work v1<br><span>一次编辑，多端适配</span></template><template #fine>本页使用显式保存，不提供自动保存、拖拽或多人协作。</template></SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { createWork, deleteWork, getOwnedWork, previewWorkCompatibility, publishWork, unpublishWork, updateWork } from '@/api/work.js'
import { listLevelCatalog } from '@/api/level.js'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import WorkCompatibilityResult from '@/components/work/WorkCompatibilityResult.vue'
import {
  WORK_ACTION_TYPES, WORK_CONDITION_TYPES, buildWorkDocument, createEmptyWorkDocument,
  createWorkAction, createWorkCondition, hydrateWorkDocument, validateWorkDocument
} from '@/utils/workEditor.js'

const props = defineProps({ id: { type: String, default: '' } })
const router = useRouter()
const TARGETS = Object.freeze([
  { key: 'MAAYUAN', label: 'MAAYUAN', provider: 'MaaYuan Adapter' },
  { key: 'YUANASSIST', label: 'YUANASSIST', provider: 'YuanAssist Adapter' }
])
const document = reactive(createEmptyWorkDocument())
const levels = ref([])
const savedId = ref(props.id || '')
const revision = ref(0)
const status = ref('DRAFT')
const loading = ref(Boolean(props.id))
const busy = ref(false)
const dirty = ref(false)
const conflict = ref(false)
const loadError = ref('')
const actionMessage = ref('')
const actionError = ref(false)
const validationIssues = ref([])
const compatibility = reactive({ MAAYUAN: emptyCompatibility(), YUANASSIST: emptyCompatibility() })
let applying = true

const gameLevels = computed(function () { return levels.value.filter(function (level) { return level.game === document.game }) })

function emptyCompatibility() { return { status: 'idle', data: null, error: '' } }
function recordDocument(value) { return value?.document || value?.work || value?.detail?.work || null }
function recordId(value) { return String(value?.metadata?.id || value?.detail?.metadata?.id || value?.id || savedId.value || '') }
function recordRevision(value) { return Number(value?.metadata?.revision ?? value?.detail?.metadata?.revision ?? value?.revision ?? revision.value) || 0 }
function recordStatus(value) { return String(value?.metadata?.status || value?.detail?.metadata?.status || value?.status || status.value || 'DRAFT').toUpperCase() }

function applyRecord(value) {
  const work = recordDocument(value)
  if (!work) throw new Error('作业响应缺少 WorkDocument')
  applying = true
  Object.assign(document, hydrateWorkDocument(work))
  savedId.value = recordId(value)
  revision.value = recordRevision(value)
  status.value = recordStatus(value)
  conflict.value = false
  dirty.value = false
  queueMicrotask(function () { applying = false })
}

async function load() {
  if (!props.id) { applying = false; loading.value = false; return }
  loading.value = true
  loadError.value = ''
  try { applyRecord(await getOwnedWork(props.id)) }
  catch (error) { loadError.value = error?.message || '作业读取失败' }
  finally { loading.value = false }
}

function reloadLatest() {
  if (window.confirm('重新载入会丢弃当前本地修改，确定继续吗？')) void load()
}

function selectLevel() {
  const level = levels.value.find(function (item) { return item.id === document.level_id })
  if (level) document.stage_name = level.name
}
function addRound() {
  const used = new Set(document.rounds.map(function (round) { return Number(round.round) }))
  let number = 1
  while (used.has(number) && number < 50) number += 1
  document.rounds.push({ round: number, remark: '', actions: [createWorkAction()] })
}
function removeRound(index) { if (document.rounds.length > 1) document.rounds.splice(index, 1) }
function replaceAction(round, index, type) { round.actions.splice(index, 1, createWorkAction(type)) }
function moveAction(round, index, distance) {
  const target = index + distance
  if (target < 0 || target >= round.actions.length) return
  const action = round.actions.splice(index, 1)[0]
  round.actions.splice(target, 0, action)
}
function slotAction(action) { return ['attack', 'ultimate', 'defense', 'sp', 'operator_action'].includes(action.type) }
function conditionSlot(condition) { return ['operator_alive', 'operator_present', 'operator_copied'].includes(condition.type) }

function validatedDocument() {
  const payload = buildWorkDocument(document)
  validationIssues.value = validateWorkDocument(payload, levels.value)
  return validationIssues.value.length ? null : payload
}
function fieldInvalid(path) { return validationIssues.value.some(function (issue) { return issue.path === path }) }
function showAction(message, error = false) { actionMessage.value = message; actionError.value = error }
function handleMutationError(error, fallback) {
  showAction(error?.message || fallback, true)
  if (error?.status === 409 || error?.code === 'work_revision_conflict') conflict.value = true
}

async function save() {
  const payload = validatedDocument()
  if (!payload) { showAction('请先修正保存前校验错误。', true); return }
  busy.value = true
  showAction('')
  try {
    const result = savedId.value
      ? await updateWork(savedId.value, revision.value, payload)
      : await createWork(payload)
    applyRecord(result)
    showAction('草稿已保存。')
    if (!props.id && savedId.value) await router.replace('/work/' + savedId.value + '/edit')
  } catch (error) { handleMutationError(error, '保存失败') }
  finally { busy.value = false }
}

async function mutateStatus(action, success, fallback) {
  if (dirty.value) { showAction('请先保存当前修改。', true); return }
  busy.value = true
  try { applyRecord(await action(savedId.value, revision.value)); showAction(success) }
  catch (error) { handleMutationError(error, fallback) }
  finally { busy.value = false }
}
function publish() { void mutateStatus(publishWork, '作业已发布。', '发布失败') }
function unpublish() { void mutateStatus(unpublishWork, '作业已取消发布。', '取消发布失败') }
async function remove() {
  if (!window.confirm('删除后作业将不再显示，确定继续吗？')) return
  busy.value = true
  try {
    await deleteWork(savedId.value, revision.value)
    dirty.value = false
    await router.replace('/works')
  } catch (error) { handleMutationError(error, '删除失败') }
  finally { busy.value = false }
}

async function previewTarget(target, payload = validatedDocument()) {
  if (!payload) { showAction('请先修正预览前校验错误。', true); return }
  compatibility[target] = { status: 'loading', data: null, error: '' }
  try { compatibility[target] = { status: 'success', data: await previewWorkCompatibility(payload, target), error: '' } }
  catch (error) { compatibility[target] = { status: 'error', data: null, error: error?.message || '兼容性分析失败' } }
}
function previewCompatibility() {
  const payload = validatedDocument()
  if (!payload) { showAction('请先修正预览前校验错误。', true); return }
  showAction('')
  void previewTarget('MAAYUAN', payload)
  void previewTarget('YUANASSIST', payload)
}

function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(function () { return !dirty.value || window.confirm('当前有未保存修改，确定离开吗？') })
onBeforeRouteUpdate(function () {
  if (dirty.value && !window.confirm('当前有未保存修改，确定离开吗？')) return false
  dirty.value = false
})
watch(document, function () { if (!applying) { dirty.value = true; conflict.value = false } }, { deep: true })
watch(function () { return props.id }, function (id, previous) {
  if (id === previous) return
  savedId.value = id || ''
  void load()
})
watch(function () { return document.game }, function () {
  const level = levels.value.find(function (item) { return item.id === document.level_id })
  if (level && level.game !== document.game) document.level_id = ''
})
onMounted(async function () {
  window.addEventListener('beforeunload', beforeUnload)
  try { levels.value = (await listLevelCatalog()).levels }
  catch (_) { levels.value = [] }
  await load()
})
onBeforeUnmount(function () { window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style scoped>
.page-work-editor .hero { --wm: '创作'; }
.back-link { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 18px; color: var(--ink); font-weight: 800; text-decoration: none; }
.editor-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.editor-meta span { padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-60); font: 800 11px var(--font-d); }
.editor-content { padding-block: 48px 72px; }
.editor-state { min-height: 320px; display: grid; place-content: center; justify-items: center; gap: 12px; border: 1px dashed var(--line); border-radius: 20px; background: var(--surface); color: var(--ink-60); }
.editor-state button, .form-actions button, .command, .add-action { min-height: 44px; padding: 9px 16px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font-weight: 800; cursor: pointer; }
.notice { margin-bottom: 18px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink-60); }
.notice.error, .notice.conflict { border-color: rgba(166,81,74,.45); color: var(--rouge); }
.notice.conflict { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.notice.conflict button { min-height: 44px; padding: 8px 13px; border: 1px solid var(--rouge); border-radius: 999px; background: var(--surface); color: var(--rouge); font-weight: 800; cursor: pointer; }
.validation-list { margin-bottom: 18px; display: grid; gap: 7px; padding: 16px 20px; border: 1px solid rgba(166,81,74,.45); border-radius: 14px; background: var(--surface); list-style: none; color: var(--rouge); font-size: 13px; }
.validation-list code { margin-right: 10px; color: var(--ink-60); }
.work-form, .preview-section { display: grid; gap: 24px; }
.editor-section, .preview-section { padding: 28px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.preview-section { margin-top: 24px; }
.section-head { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 14px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.section-head > span { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--yellow); font: 900 12px var(--font-d); }
.section-head h2 { font: 900 24px var(--font-s); }
.section-head p { margin-top: 4px; color: var(--ink-60); font-size: 13px; }
.section-head.with-command { grid-template-columns: auto minmax(0, 1fr) auto; }
.field-grid { margin-top: 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.field-grid .wide { grid-column: 1 / -1; }
label, fieldset { min-width: 0; display: grid; gap: 7px; color: var(--ink-60); font-size: 12px; font-weight: 800; }
input, select, textarea { width: 100%; min-height: 44px; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); font: 14px var(--font-b); }
textarea { resize: vertical; line-height: 1.7; }
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.operator-fields { margin-top: 22px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.round-editor { margin-top: 18px; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--cream); }
.round-editor > header { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; align-items: end; gap: 12px; }
.action-editors { margin-top: 16px; display: grid; gap: 10px; list-style: none; }
.action-editor { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.action-editor label { flex: 1 1 130px; }
.action-order { width: 28px; height: 28px; align-self: center; display: grid; place-items: center; border-radius: 50%; background: var(--yellow); font: 800 11px var(--font-d); }
.action-buttons { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.action-buttons button, .danger-link { min-height: 44px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink-60); cursor: pointer; }
.danger-link { color: var(--rouge) !important; }
button:disabled { opacity: .45; cursor: default; }
.add-action { margin-top: 12px; background: var(--surface); color: var(--tea); }
.delay-grid { margin-top: 22px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.extension-panel { margin-top: 20px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--cream); }
.extension-panel summary { min-height: 44px; display: flex; align-items: center; font-weight: 800; cursor: pointer; }
.extension-fields { margin-top: 14px; }
.checkbox { display: flex; align-items: center; gap: 10px; }
.checkbox input { width: 20px; min-height: 20px; }
.offset-field { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 0; }
.offset-field legend { grid-column: 1 / -1; margin-bottom: 7px; }
.form-actions { position: sticky; bottom: 10px; z-index: 3; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,253,246,.96); box-shadow: 0 8px 28px rgba(73,59,44,.12); }
.form-actions .secondary { background: var(--surface); color: var(--tea); }
.form-actions .danger { border-color: var(--rouge); background: var(--surface); color: var(--rouge); }
.target-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.target-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.target-card > header { padding: 18px 20px; background: var(--cream); }
.target-card header span { color: var(--ink-60); font-size: 11px; }
.target-card h3 { margin-top: 4px; font: 900 18px var(--font-d); }
.target-body { padding: 0 20px 20px; }
@media (max-width: 900px) { .operator-fields, .delay-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .target-grid { grid-template-columns: 1fr; } }
@media (max-width: 767px) {
  .editor-content { padding-block: 28px 42px; }
  .editor-section, .preview-section { padding: 18px 14px; border-radius: 16px; }
  .field-grid, .operator-fields, .delay-grid { grid-template-columns: 1fr; }
  .section-head.with-command { grid-template-columns: auto minmax(0, 1fr); }
  .section-head.with-command .command { grid-column: 1 / -1; width: 100%; }
  .round-editor > header { grid-template-columns: 1fr; }
  .action-editor { align-items: stretch; }
  .action-editor label { flex-basis: 100%; }
  .action-buttons { width: 100%; margin-left: 0; }
  .action-buttons button { flex: 1; }
  .offset-field { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .form-actions { position: static; }
  .form-actions button { flex: 1 1 42%; }
}
</style>
