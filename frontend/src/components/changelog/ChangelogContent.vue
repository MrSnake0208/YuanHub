<template>
  <div v-if="error" class="changelog-body-error" role="alert">{{ error }} <button type="button" @click="loadBody">重试正文</button></div>
  <EditorContent v-else-if="editor" class="changelog-rich-text" :editor="editor" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { avatarUrl } from '../../api/request.js'
import { changelogExtensions, emptyChangelogBody } from '../../utils/changelogContent.js'

const props = defineProps({ body: { type: Object, default: emptyChangelogBody } })
const editor = shallowRef(null)
const error = ref('')

function renderBody(body) {
  // 正文是 JSON 文档，序列化可同时解除根节点与嵌套节点上的 Vue 代理。
  const copy = JSON.parse(JSON.stringify(body || emptyChangelogBody()))
  if (copy.type !== 'doc' || !Array.isArray(copy.content)) throw new Error('无效正文')
  function visit(node) {
    if (node && node.type === 'image' && node.attrs) node.attrs.src = avatarUrl(node.attrs.src)
    if (node && Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(copy)
  return copy
}

function loadBody() {
  error.value = ''
  try {
    const content = renderBody(props.body)
    if (editor.value) editor.value.commands.setContent(content)
    else editor.value = new Editor({ content, extensions: changelogExtensions(), editable: false })
  } catch (_) {
    editor.value?.destroy()
    editor.value = null
    error.value = '正文暂时无法显示，请重试或刷新页面。'
  }
}
onMounted(loadBody)
watch(() => props.body, loadBody, { deep: true })
onBeforeUnmount(() => editor.value?.destroy())
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.changelog-body-error { color: var(--theme-danger-text, var(--rouge)); }
.changelog-body-error button { border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.changelog-rich-text :deep(.tiptap) { color: var(--ink); }
.changelog-rich-text :deep(blockquote) { border-left: 3px solid var(--accent); color: var(--ink-60); }
.changelog-rich-text :deep(a) { color: var(--theme-info-text, var(--brand-blue)); text-underline-offset: 3px; }
.changelog-rich-text :deep(img) { border: 1px solid var(--line); border-radius: 12px; }
</style>
<style scoped src="./changelogContentDesktop.css"></style>
<style scoped src="./changelogContentMobile.css"></style>
