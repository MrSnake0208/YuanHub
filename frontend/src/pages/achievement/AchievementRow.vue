<template>
  <li class="achievement-row" :aria-busy="saving">
    <div class="achievement-row-main">
      <div class="achievement-row-copy">
        <label v-if="batchMode" class="achievement-selection"><input type="checkbox" :checked="selected" :disabled="!writable" :aria-label="'选择 ' + entry.name" @change="$emit('select')"></label>
        <h3 class="achievement-title">{{ entry.name }}</h3>
        <p class="achievement-condition">{{ entry.condition }}</p>
        <small v-if="entry.is_hidden === true">隐藏成就</small>
      </div>
      <div class="achievement-reward">
        <template v-if="entry.rewards?.length">
          <span v-for="reward in entry.rewards" :key="reward.item_key" class="achievement-reward-item"><AchievementRewardIcon :reward="reward" /><span>{{ reward.name }} × {{ reward.quantity }}</span></span>
        </template>
        <span v-else>{{ rewardText(entry, legacyReward) }}</span>
      </div>
      <div v-if="entry.linked_metric || hasQuantifiedProgress(entry) || record.progress != null" class="achievement-progress">
        <template v-if="entry.linked_metric">
          <span>{{ linked ? '羁绊已记录进度 ' + linked.displayed + ' / ' + entry.target : '羁绊进度未读取' }}</span>
          <progress v-if="linked" :value="linked.displayed" :max="entry.target" :aria-label="entry.name + ' 羁绊已记录进度'" />
          <small v-if="linked?.reached && completionStatus(record) !== 'completed'">记录已达标，可确认完成</small>
          <small v-if="record.progress != null">历史人工进度 {{ record.progress }}（单独保留）</small>
        </template>
        <template v-else-if="hasQuantifiedProgress(entry)">
          <button ref="progressTrigger" class="achievement-progress-edit" type="button" :disabled="!writable" :aria-expanded="editor.progressOpen" :aria-controls="'progress-' + entry.achievement_id" :aria-label="'编辑 ' + entry.name + ' 进度'" @click="$emit('edit', 'progress')"><span>{{ record.progress == null ? '进度未记录' : record.progress + ' / ' + entry.target }}</span><Pencil :size="13" aria-hidden="true" /></button>
          <progress v-if="record.progress != null" :value="record.progress" :max="entry.target" :aria-label="entry.name + ' 数值进度'" />
        </template>
        <span v-else class="achievement-hint">历史人工进度 {{ record.progress }}（待核对）</span>
      </div>
      <div class="achievement-row-actions">
        <div class="achievement-status" role="group" :aria-label="entry.name + ' 完成状态'">
          <button class="achievement-status-toggle" type="button" :aria-pressed="recordReady && completed" :aria-label="entry.name + (saving ? ' 正在保存' : recordReady ? (completed ? ' 已完成' : ' 未完成') : ' 未读取')" :title="completed ? '标记为未完成' : '标记为已完成'" :disabled="!writable || !recordReady" @click="$emit('quick-save', { achievement_id: entry.achievement_id, status: completed ? 'incomplete' : 'completed' })"><LoaderCircle v-if="saving" :size="18" aria-hidden="true" /><Check v-else-if="recordReady && completed" :size="18" aria-hidden="true" /><Circle v-else :size="18" aria-hidden="true" /><span>{{ saving ? '保存中…' : recordReady ? (completed ? '已完成' : '未完成') : '未读取' }}</span></button>
        </div>
        <button class="achievement-favorite" type="button" :aria-pressed="record.favorite" :aria-label="(record.favorite ? '取消关注 ' : '关注 ') + entry.name" :disabled="!writable" @click="$emit('quick-save', { achievement_id: entry.achievement_id, favorite: !record.favorite })"><Star :size="20" :fill="record.favorite ? 'currentColor' : 'none'" aria-hidden="true" /></button>
        <button ref="noteTrigger" class="achievement-note-toggle" type="button" :class="{ 'has-note': record.note }" :disabled="!writable" :aria-expanded="editor.noteOpen" :aria-controls="'note-' + entry.achievement_id" :aria-label="(record.note ? '查看或编辑 ' : '添加 ') + entry.name + ' 备注'" @click="$emit('edit', 'note')"><NotebookPen :size="17" aria-hidden="true" /><span>备注</span></button>
      </div>
    </div>
    <p v-if="pendingReorder" class="achievement-row-feedback">即将移至本分类已完成区域</p>
    <p v-if="pendingRemoval" class="achievement-row-feedback">即将从未完成列表移出</p>
    <p v-if="error" class="achievement-row-feedback achievement-error" role="alert">{{ error }}</p>
    <form v-if="editor.progressOpen" :id="'progress-' + entry.achievement_id" class="achievement-inline-editor achievement-progress-form" @submit.prevent="$emit('save', 'progress')">
      <label>数值进度（目标 {{ entry.target }}）<input ref="progressInput" :value="editor.progress" type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" :disabled="!writable" :aria-invalid="!!progressError" :aria-describedby="'progress-hint-' + entry.achievement_id" placeholder="未记录" @input="editor.progress = $event.target.value"></label>
      <div class="achievement-editor-actions"><button class="achievement-save" type="submit" :disabled="!writable || !!progressError || editor.progress === editor.baseProgress">保存进度</button><button type="button" :disabled="saving" @click="$emit('cancel', 'progress')">取消</button></div>
      <p :id="'progress-hint-' + entry.achievement_id" :class="progressError ? 'achievement-error' : 'achievement-hint'">{{ progressError || '进度独立保存，达到目标不会自动标记完成；留空表示未记录。' }}</p>
    </form>
    <form v-if="editor.noteOpen" :id="'note-' + entry.achievement_id" class="achievement-inline-editor achievement-note-form" @submit.prevent="$emit('save', 'note')">
      <label>个人备注<textarea ref="noteInput" v-model="editor.note" maxlength="500" rows="2" :disabled="!writable" placeholder="记录自己的完成思路或备注…" /></label>
      <label v-if="record.status === 'completed' || editor.completed_on !== editor.baseDate" class="achievement-date">实际游戏完成日期（可选）<input v-model="editor.completed_on" type="date" min="0001-01-01" max="9999-12-31" :disabled="!writable || record.status !== 'completed'"></label>
      <p v-if="record.status !== 'completed' && editor.completed_on !== editor.baseDate" class="achievement-hint">完成日期草稿已保留，标记完成后可保存，或取消编辑。</p>
      <div class="achievement-editor-actions"><small>{{ editor.note.length }} / 500</small><button class="achievement-save" type="submit" :disabled="!writable || (editor.note === editor.baseNote && (editor.completed_on === editor.baseDate || record.status !== 'completed'))">保存备注</button><button type="button" :disabled="saving" @click="$emit('cancel', 'note')">取消</button></div>
    </form>
  </li>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Circle, LoaderCircle, NotebookPen, Pencil, Star } from '@lucide/vue'
import { completionStatus, hasQuantifiedProgress, linkedProgress, progressValidationError, rewardText } from './rules.js'
import AchievementRewardIcon from './AchievementRewardIcon.vue'
const props = defineProps({ entry: Object, linkedMetrics: Array, legacyReward: String, record: Object, editor: Object, writable: Boolean, recordReady: Boolean, saving: Boolean, error: String, pendingRemoval: Boolean, pendingReorder: Boolean, batchMode: Boolean, selected: Boolean })
const completed = computed(() => completionStatus(props.record) === 'completed')
const linked = computed(() => linkedProgress(props.entry, props.linkedMetrics))
defineEmits(['select', 'quick-save', 'edit', 'cancel', 'save'])
const progressInput = ref(null), noteInput = ref(null), progressTrigger = ref(null), noteTrigger = ref(null)
watch(() => props.editor.progressOpen, async open => { await nextTick(); (open ? progressInput.value : progressTrigger.value)?.focus({ preventScroll: !open }) })
watch(() => props.editor.noteOpen, async open => { await nextTick(); (open ? noteInput.value : noteTrigger.value)?.focus({ preventScroll: !open }) })
const progressError = computed(() => progressValidationError(props.entry, props.editor.progress))
</script>
