<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask star-help-mask" @click.self="emit('close')">
      <section ref="panel" class="star-help-panel" role="dialog" aria-modal="true" aria-labelledby="star-help-title" tabindex="-1">
        <header><h2 id="star-help-title">星石帮助</h2><button ref="closeButton" type="button" aria-label="关闭星石帮助" @click="emit('close')">×</button></header>
        <div class="star-help-content">
          <details :open="topic === 'screenshots' || topic === 'overlap'">
            <summary>上传、分类与重叠</summary>
            <p>手机和电脑网页端均可手动上传 JPG、PNG 等图片。MaaYuan 星石自动采集仍在接入中。首次 OCR 需要下载本机识别资源，请保持页面前台并使用稳定网络。</p>
            <p>使用同一账号、同一次背包查看过程的完整原始截图；期间不要升级、分解、获得或消耗星石。不要裁切、拼接或涂改，保留分类、完整行、等级、品质、名称与上下界面。</p>
            <p>系统推荐分类后，可拖到正确的池；触屏可长按缩略图再拖动。确认本池或一键确认全部后开始识别。重复整行才添加前后图关系；没有重复就直接识别。</p>
            <div class="star-help-examples"><button type="button" @click="exampleKind = 'screenshots'">查看截图重点示例</button><button type="button" @click="exampleKind = 'overlap'">查看重复整行对照</button></div>
          </details>
          <details :open="topic === 'review'">
            <summary>检查识别异常</summary>
            <p>{{ bagReviewInfo.intro }}</p>
            <section v-for="section in bagReviewInfo.sections" :key="section.title"><h3>{{ section.title }}</h3><p>{{ section.body }}</p></section>
          </details>
          <details :open="topic === 'advanced'"><summary>编辑、养成与进阶技巧</summary><section v-for="section in bagHelpSections" :key="section.title"><h3>{{ section.title }}</h3><p>{{ section.body }}</p></section></details>
          <details :open="topic === 'guidance'">
            <summary>引导与自动提示</summary>
            <p>「稍后再看」关闭本次引导；「跳过此提示」只隐藏本次当前阶段。首次识别后点击「完成引导」，或明确选择「不再自动提示」，才会记为已读。关闭帮助不改变这些设置。</p>
            <div class="star-help-examples"><button type="button" @click="emit('replay')">重新查看当前引导</button><button type="button" :disabled="autoDisabled" @click="emit('opt-out')">{{ autoDisabled ? '已关闭自动提示' : '不再自动提示' }}</button></div>
          </details>
          <p class="star-help-credit">截图仅在本机识别与保存；登录后同步当前账号背包数据。独立创作 · 著作权归作者 Drifty Yan 所有。</p>
        </div>
      </section>
    </div>
  </Teleport>
  <RecognitionExampleModal :items="exampleItems" @close="exampleKind = null" />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import RecognitionExampleModal from './RecognitionExampleModal.vue'
import { recognitionTutorialExamples } from './recognitionTutorial.js'
import { bagReviewInfo, bagHelpSections } from './bagTutorial.js'
const props = defineProps({ open: Boolean, topic: { type: String, default: 'screenshots' }, autoDisabled: Boolean })
const emit = defineEmits(['close', 'replay', 'opt-out'])
const panel = ref(null), closeButton = ref(null), exampleKind = ref(null)
const exampleItems = computed(() => recognitionTutorialExamples[exampleKind.value] || [])
watch(() => props.open, open => { if (!open) exampleKind.value = null })
useModalFocus(computed(() => props.open), panel, { initialFocus: () => closeButton.value, onEscape: () => emit('close') })
</script>

<style scoped>
.star-help-mask { padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
.star-help-panel { box-sizing: border-box; width: min(100%, 600px); max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex: none; }
h2, h3 { font-family: var(--font-s); font-weight: 900; }
h2 { font-size: 22px; margin: 0; }
h3 { font-size: 16px; margin: 12px 0 4px; }
.star-help-content { min-height: 0; overflow-y: auto; line-height: 1.7; font-size: 14px; }
p { margin: 8px 0; }
details { border-top: 1px solid var(--line); }
summary { min-height: 44px; padding-block: 10px; box-sizing: border-box; font-weight: 700; cursor: pointer; }
button { min-height: 44px; min-width: 44px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); font: inherit; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.star-help-examples { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.star-help-credit { font-size: 12px; color: var(--ink-60); }
</style>
