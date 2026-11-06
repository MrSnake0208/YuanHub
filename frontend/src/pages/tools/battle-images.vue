<template>
  <div class="page-battle-images">
    <IslandSidebar />
    <main id="main-content">
      <CompactToolHeader title="配队与操作图" description="整理一份配队，分享每一步打法。" mobile-description>
        <template #help>无需登录或创建作业。编辑内容仅留在本页，离开或刷新会丢失；下载的图片不包含可继续编辑的数据。未知练度可留空。</template>
      </CompactToolHeader>
      <div class="wrap battle-tool" @input="touched = true">
        <nav class="battle-modes" aria-label="编辑内容">
          <button type="button" :aria-pressed="kind === 'team'" @click="kind = 'team'"><UsersRound :size="18" aria-hidden="true" />配队</button>
          <button type="button" :aria-pressed="kind === 'actions'" @click="kind = 'actions'"><ListOrdered :size="18" aria-hidden="true" />操作记录</button>
          <a href="#battle-preview"><Eye :size="16" aria-hidden="true" />看预览</a>
        </nav>
        <div class="battle-workspace">
          <div id="battle-editor" class="battle-editor-panel">
            <section class="battle-meta" aria-label="图片基本信息">
              <label class="battle-title-field">标题 / 关卡<input v-model="draft.title" aria-label="标题或关卡" maxlength="120" placeholder="给这份攻略起个名字"></label>
              <div class="battle-byline-fields"><label>游戏<select v-model="draft.game" aria-label="游戏"><option>如鸢</option><option>代号鸢</option></select></label><label>署名<input v-model="draft.author" aria-label="署名" maxlength="60" placeholder="攻略作者（可选）"></label></div>
            </section>
            <div class="battle-editor-body">
              <section v-show="kind === 'team'" aria-label="配队编辑"><BattleTeamEditor :operators="draft.operators" @replace="(slot, operator) => draft.operators[slot] = operator" /></section>
              <BattleRecorder v-show="kind === 'actions'" :operators="draft.operators" :rounds="draft.rounds" :targets="draft.targets" @round-change="roundIndex = $event" />
              <details class="battle-common-note"><summary><FileText :size="15" aria-hidden="true" />打法说明<span>两种图片共用</span><ChevronDown :size="14" aria-hidden="true" /></summary><label><span class="sr-only">图片说明</span><textarea v-model="draft.note" aria-label="图片说明" maxlength="2000" rows="3" placeholder="配队要求、替换建议或打法说明"></textarea></label></details>
            </div>
          </div>
          <BattleImageExport :draft="draft" :kind="kind" :round-index="roundIndex" />
        </div>
        <p class="battle-local-note"><Info :size="14" aria-hidden="true" />内容仅在本页保留，离开或刷新前请保存图片。</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ChevronDown, Eye, FileText, Info, ListOrdered, UsersRound } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import BattleTeamEditor from '../../components/work/BattleTeamEditor.vue'
import BattleRecorder from '../../components/work/BattleRecorder.vue'
import BattleImageExport from '../../components/work/BattleImageExport.vue'
import { createBattleDraft } from '../../utils/battleImages.js'
import { dialog } from '../../utils/dialog.js'

const draft = ref(createBattleDraft()), kind = ref('team'), touched = ref(false), roundIndex = ref(0)
const initial = JSON.stringify(draft.value)
const dirty = computed(() => touched.value || JSON.stringify(draft.value) !== initial)
onBeforeRouteLeave(() => !dirty.value || dialog.confirm({ title: '离开图片工具？', message: '编辑内容尚未保存，离开后将丢失。已下载的图片不能恢复编辑内容。', confirmText: '离开', cancelText: '继续编辑' }))
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<style>
.battle-tool { color: var(--ink); padding-bottom: 40px; }
.battle-tool label { display: grid; gap: 7px; font-size: 12px; font-weight: 600; min-width: 0; color: var(--ink-60); }
.battle-tool :is(input, select, textarea) { box-sizing: border-box; min-width: 0; width: 100%; padding: 10px 11px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: 400 14px/1.5 var(--font-b); transition: border-color .15s; }
.battle-tool :is(input, textarea)::placeholder { color: var(--ink-35); }
.battle-tool textarea { resize: vertical; }
.battle-tool button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: 500 13px/1.5 var(--font-b); cursor: pointer; transition: border-color .15s, background-color .15s; }
.battle-tool button:disabled { opacity: .4; cursor: not-allowed; }
.battle-tool :is(button, input, select, textarea, summary, a, [tabindex]):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.battle-tool .battle-primary { background: var(--tea); color: var(--on-strong); border-color: var(--tea); font-weight: 700; }
.battle-modes { display: flex; align-items: center; gap: 24px; border-bottom: 1px solid var(--line); margin-bottom: 22px; }
.battle-modes button { position: relative; padding: 14px 2px; border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: transparent; color: var(--ink-60); font-size: 15px; }
.battle-modes button[aria-pressed="true"] { border-bottom-color: var(--theme-accent-text, var(--tea)); color: var(--ink); font-weight: 700; }
.battle-modes a { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 13px; color: var(--ink-60); text-decoration: none; }
.battle-workspace { display: grid; align-items: start; gap: 24px; }
.battle-editor-panel { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); scroll-margin-top: 90px; }
.battle-meta { display: grid; gap: 14px; padding: 22px; border-bottom: 1px solid var(--line); }
.battle-title-field input { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 4px 0 10px; font-size: 20px; font-weight: 600; }
.battle-byline-fields { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1.3fr); gap: 14px; }
.battle-editor-body { padding: 22px; }
.battle-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.battle-section-heading h2 { margin: 0; font-size: 16px; font-weight: 700; }
.battle-section-heading > span { color: var(--ink-60); font-size: 12px; }
.battle-hint { font-size: 12px; line-height: 1.7; color: var(--ink-60); margin: 10px 0; }
.battle-team-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.battle-tool .battle-slot-card { position: relative; display: flex; flex-direction: column; gap: 0; min-width: 0; padding: 0 0 9px; border: 1px solid var(--line); background: var(--cream); overflow: hidden; }
.battle-tool .battle-slot-card[aria-pressed="true"] { border-color: var(--theme-accent-text, var(--tea)); box-shadow: inset 0 -2px 0 var(--theme-accent-text, var(--tea)); }
.battle-slot-number { position: absolute; top: 4px; left: 6px; z-index: 1; color: var(--ink-60); font: 600 11px/1.5 var(--font-d); }
.battle-slot-art { display: flex; align-items: center; justify-content: center; width: 100%; height: 78px; color: var(--ink-35); }
.battle-slot-art img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.battle-slot-card strong { display: block; max-width: 100%; padding: 0 3px; color: var(--ink); font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.battle-member-detail { margin-top: 22px; }
.battle-name-field { position: relative; display: flex; align-items: center; }
.battle-name-field > svg { position: absolute; left: 11px; pointer-events: none; }
.battle-name-field input { padding-left: 35px; }
.battle-field-group { min-width: 0; border: 0; margin: 20px 0 0; padding: 0; }
.battle-field-group legend { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; width: 100%; padding: 0 0 12px; font-size: 13px; font-weight: 700; }
.battle-field-group legend span { font-size: 11px; font-weight: normal; color: var(--ink-60); }
.battle-stat-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.battle-stat-fields label:last-child { grid-column: span 2; }
.battle-stat-fields input { font-family: var(--font-d); }
.battle-disc-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.battle-field-discs, .battle-field-stars { grid-column: 1 / -1; }
.battle-member-empty { display: grid; justify-items: center; gap: 10px; padding: 40px 10px; color: var(--ink-60); text-align: center; }
.battle-member-empty > svg { color: var(--ink-35); } .battle-member-empty p { font-size: 14px; } .battle-member-empty span { font-size: 12px; line-height: 1.7; }
.battle-round-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 16px 0; }
.battle-round-toolbar > label { flex: 1; min-width: 130px; }
.battle-round-toolbar > button:last-child { font-size: 12px; }
.battle-targets { margin: 20px 0 12px; padding-block: 16px; border-block: 1px solid var(--line); }
.battle-target-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; font-size: 12px; }
.battle-target-heading strong { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; } .battle-target-heading > span { color: var(--ink-60); }
.battle-target-buttons { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
.battle-target-buttons button { position: relative; min-width: 0; flex-direction: column; gap: 6px; padding: 10px 3px; font-size: 12px; overflow-wrap: anywhere; }
.battle-target-buttons button[aria-pressed="true"] { border-color: var(--theme-accent-text, var(--tea)); background: var(--cream); font-weight: 700; }
.battle-target-buttons button > svg { position: absolute; right: 3px; top: 3px; }
.battle-target-buttons i, .battle-sequence i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(73,59,44,.2); flex-shrink: 0; }
.battle-target-edit { margin-top: 10px; } .battle-target-edit summary { width: fit-content; font-size: 12px; color: var(--ink-60); }
.battle-tool summary { cursor: pointer; } .battle-target-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.battle-record-buttons { display: grid; gap: 0; }
.battle-record-member { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(0, 1.7fr); gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.battle-record-identity { display: flex; align-items: center; gap: 8px; min-width: 0; }
.battle-record-portrait { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 44px; background: var(--cream); border-radius: 4px; overflow: hidden; color: var(--ink-35); }
.battle-record-portrait img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.battle-record-identity strong { min-width: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.battle-record-identity small { display: block; font-size: 10px; font-weight: normal; color: var(--ink-60); margin-bottom: 2px; }
.battle-record-pad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.battle-record-pad button { flex-direction: column; gap: 1px; padding: 5px 2px; }
.battle-record-pad b { font: 600 19px/1.3 var(--font-b); } .battle-record-pad small { font-size: 11px; white-space: nowrap; }
.battle-sequence-heading { justify-content: space-between; align-items: center; margin-top: 24px; }
.battle-round-toolbar h3 { margin: 0; font-size: 13px; } .battle-round-toolbar h3 span { margin-left: 4px; font-size: 11px; color: var(--ink-60); font-weight: normal; }
.battle-sequence-heading button { border: 0; background: transparent; padding: 5px 0; }
.battle-sequence { overflow-x: auto; padding-bottom: 8px; }
.battle-sequence > p { font-size: 12px; padding: 18px 0; color: var(--ink-60); line-height: 1.6; }
.battle-sequence ol { display: flex; gap: 8px; padding: 0; list-style: none; }
.battle-sequence li { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; flex: 0 0 auto; min-width: 105px; max-width: 190px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px 10px 28px; background: var(--cream); }
.battle-sequence li > span { position: absolute; top: 12px; left: 9px; font: 600 10px/1.5 var(--font-d); color: var(--ink-60); }
.battle-sequence strong { font-size: 12px; overflow-wrap: anywhere; } .battle-sequence b { font-size: 15px; }
.battle-sequence small { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--ink-60); overflow-wrap: anywhere; }
.battle-step-editor { margin: 10px 0 20px; }
.battle-step-editor > summary, .battle-common-note > summary { display: flex; align-items: center; gap: 8px; list-style: none; font-size: 13px; padding: 10px 0; }
.battle-step-editor > summary::-webkit-details-marker, .battle-common-note > summary::-webkit-details-marker { display: none; }
.battle-step-editor > summary span, .battle-common-note > summary span { margin-left: auto; font-size: 11px; color: var(--ink-60); }
.battle-step-editor[open] > summary > svg:last-child, .battle-common-note[open] > summary > svg:last-child { transform: rotate(180deg); }
.battle-action-list { list-style: none; padding: 0; margin: 8px 0; }
.battle-action-list li { display: grid; gap: 7px; align-items: center; grid-template-columns: 20px repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); padding: 10px 0; }
.battle-action-list li > label:nth-of-type(3) { grid-column: 2; }
.battle-action-order { font-weight: 600; font-size: 12px; text-align: center; }
.battle-action-tools { display: flex; justify-content: flex-end; gap: 6px; } .battle-action-tools button { padding: 9px; }
.battle-common-note { margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--line); }
.battle-local-note { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--ink-60); font-size: 12px; line-height: 1.7; margin-top: 24px; }
.battle-tool .battle-error { color: var(--theme-danger-text, var(--rouge)); font-size: 14px; }
.battle-tool .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (hover: hover) { .battle-tool button:hover:not(:disabled) { border-color: var(--ink-60); } .battle-record-pad button:hover:not(:disabled) { background: var(--cream); } }
@media (prefers-reduced-motion: reduce) { .battle-tool :is(button, input, textarea, select) { transition: none; } }
</style>
<style src="./battleImagesDesktop.css"></style>
<style src="./battleImagesMobile.css"></style>
