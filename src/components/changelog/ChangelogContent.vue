<template><EditorContent v-if="editor" class="changelog-rich-text" :editor="editor" /></template>

<script setup>
import { watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { avatarUrl } from '../../api/request.js'
import { changelogExtensions, emptyChangelogBody } from '../../utils/changelogContent.js'

const props = defineProps({ body: { type: Object, default: emptyChangelogBody } })

function renderBody(body) {
  const copy = structuredClone(body || emptyChangelogBody())
  function visit(node) {
    if (node && node.type === 'image' && node.attrs) node.attrs.src = avatarUrl(node.attrs.src)
    if (node && Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(copy)
  return copy
}

const editor = useEditor({ content: renderBody(props.body), extensions: changelogExtensions(), editable: false })
watch(function () { return props.body }, function (body) {
  if (editor.value) editor.value.commands.setContent(renderBody(body))
}, { deep: true })
</script>

<style scoped>
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
