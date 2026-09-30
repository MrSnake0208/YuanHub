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
.changelog-body-error { padding-block: 20px; color: var(--rouge); font-size: 13px; line-height: 1.8; }
.changelog-body-error button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--tea); font: inherit; cursor: pointer; }
.changelog-rich-text :deep(.tiptap) { color: var(--ink); font-size: 15px; line-height: 1.9; }
.changelog-rich-text :deep(h2), .changelog-rich-text :deep(h3) { margin: 1.5em 0 .55em; font-family: var(--font-s); font-weight: 900; }
.changelog-rich-text :deep(h2) { font-size: 24px; }
.changelog-rich-text :deep(h3) { font-size: 19px; }
.changelog-rich-text :deep(p), .changelog-rich-text :deep(ul), .changelog-rich-text :deep(ol), .changelog-rich-text :deep(blockquote) { margin: .75em 0; }
.changelog-rich-text :deep(ul), .changelog-rich-text :deep(ol) { padding-left: 1.6em; }
.changelog-rich-text :deep(blockquote) { padding: .3em 1em; border-left: 3px solid var(--accent); color: var(--ink-60); }
.changelog-rich-text :deep(a) { color: var(--brand-blue); text-underline-offset: 3px; }
.changelog-rich-text :deep(img) { display: block; max-width: 100%; height: auto; margin: 18px auto; border: 1px solid var(--line); border-radius: 12px; }
</style>
