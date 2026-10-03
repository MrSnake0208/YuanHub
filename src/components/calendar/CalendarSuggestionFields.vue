<template>
  <div class="calendar-fields">
    <label>游戏 *<select :id="prefix + 'game'" v-model="form.game" v-bind="attributes('game')" required><option value="">请选择游戏</option><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select><small v-if="errors.game" :id="prefix + 'error-game'">{{ errors.game }}</small></label>
    <label>类型 *<select :id="prefix + 'category'" v-model="form.category" v-bind="attributes('category')" required><option v-for="(label, key) in MANUAL_CATEGORIES" :key="key" :value="key">{{ label }}</option></select><small v-if="errors.category" :id="prefix + 'error-category'">{{ errors.category }}</small></label>
    <label v-for="field in basicFields" :key="field.key" :class="{ 'calendar-wide': field.key === 'title' }">{{ SUGGESTION_FIELD_LABELS[field.key] }} *<input :id="prefix + field.key" v-model="form[field.key]" :type="field.type" :maxlength="field.max" :min="field.key === 'end_date' ? form.start_date || undefined : undefined" v-bind="attributes(field.key)" required><small v-if="errors[field.key]" :id="prefix + 'error-' + field.key">{{ errors[field.key] }}</small></label>
  </div>
  <p class="calendar-hint">招募由卡池生成，请通过<router-link to="/feedback">反馈中心</router-link>提供招募线索。日期和时间按 Asia/Shanghai 记录。</p>
  <label class="calendar-checkbox"><input v-model="form.precise" type="checkbox">填写精确时间（开始、结束成对）</label>
  <div v-if="form.precise" class="calendar-fields">
    <label v-for="key in ['start_time', 'end_time']" :key="key">{{ SUGGESTION_FIELD_LABELS[key] }} *<input :id="prefix + key" v-model="form[key]" type="time" v-bind="attributes(key)" required><small v-if="errors[key]" :id="prefix + 'error-' + key">{{ errors[key] }}</small></label>
  </div>
  <div class="calendar-fields">
    <label class="calendar-wide">简短说明（采纳后可公开）<textarea :id="prefix + 'description'" v-model="form.description" rows="3" maxlength="1000" v-bind="attributes('description')"></textarea><small v-if="errors.description" :id="prefix + 'error-description'">{{ errors.description }}</small></label>
    <label class="calendar-wide">来源链接 *<input :id="prefix + 'source_url'" v-model.trim="form.source_url" type="url" maxlength="2048" placeholder="https://…" v-bind="attributes('source_url')" required><small v-if="errors.source_url" :id="prefix + 'error-source_url'">{{ errors.source_url }}</small></label>
    <label v-if="submission" class="calendar-wide">给审核员的补充说明（仅你和审核员可见）<textarea :id="prefix + 'submission_note'" v-model="form.submission_note" rows="3" maxlength="1000" v-bind="attributes('submission_note')"></textarea><small v-if="errors.submission_note" :id="prefix + 'error-submission_note'">{{ errors.submission_note }}</small></label>
    <label v-else class="calendar-wide">来源备注（仅管理端）<textarea :id="prefix + 'source_note'" v-model="form.source_note" rows="2" maxlength="1000" v-bind="attributes('source_note')"></textarea><small v-if="errors.source_note" :id="prefix + 'error-source_note'">{{ errors.source_note }}</small></label>
  </div>
</template>
<script setup>
import { CALENDAR_GAMES, MANUAL_CATEGORIES } from '@/data/activityCalendar.js'
import { SUGGESTION_FIELD_LABELS } from '@/data/activityCalendarSuggestions.js'
const props = defineProps({ form: { type: Object, required: true }, errors: { type: Object, default: () => ({}) }, prefix: { type: String, default: 'suggestion-' }, submission: Boolean })
const basicFields = [{ key: 'title', type: 'text', max: 120 }, { key: 'start_date', type: 'date' }, { key: 'end_date', type: 'date' }]
const attributes = key => ({ 'aria-invalid': !!props.errors[key], 'aria-describedby': props.errors[key] ? props.prefix + 'error-' + key : undefined })
</script>
