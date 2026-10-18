<template>
  <nav ref="navEl" class="editor-section-nav" aria-label="密探编辑分区">
    <button v-for="section in sections" :key="section.id" type="button"
      :aria-controls="'operator-editor-' + section.id"
      :aria-current="activeSection === section.id ? 'location' : undefined"
      @click="goToSection(section.id)">
      <component :is="section.icon" :size="17" aria-hidden="true" />{{ section.label }}
    </button>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Sparkles, Target, Star } from '@lucide/vue'

const props = defineProps({ scrollRoot: Object })
const sections = [
  { id: 'growth', label: '基础养成', icon: Sparkles },
  { id: 'discs', label: '命盘', icon: Target },
  { id: 'stars', label: '星石', icon: Star },
]
const navEl = ref(null)
const activeSection = ref('growth')

function contentTop(root) {
  const top = root.getBoundingClientRect().top
  // 极矮视口由整个面板滚动，需避开面板内吸顶的导航。
  return root.contains(navEl.value) ? Math.max(top, navEl.value.getBoundingClientRect().bottom) : top
}

function updateActiveSection() {
  const root = props.scrollRoot
  if (!root) return
  const top = contentTop(root) + 24
  let active = 'growth'
  for (const section of root.querySelectorAll('[data-editor-section]')) {
    if (section.getBoundingClientRect().top <= top) active = section.dataset.editorSection
  }
  if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) active = 'stars'
  activeSection.value = active
}

function goToSection(id) {
  const root = props.scrollRoot
  const heading = root?.querySelector('#operator-editor-' + id)
  if (!heading) return
  heading.focus({ preventScroll: true })
  root.scrollTo({ top: root.scrollTop + heading.getBoundingClientRect().top - contentTop(root) - 12, behavior: 'instant' })
  updateActiveSection()
}

watch(() => props.scrollRoot, (root, _, onCleanup) => {
  if (!root) return
  updateActiveSection()
  root.addEventListener('scroll', updateActiveSection, { passive: true })
  onCleanup(() => root.removeEventListener('scroll', updateActiveSection))
}, { immediate: true, flush: 'post' })
</script>

<style scoped>
.editor-section-nav { display: flex; flex: none; min-width: 0; gap: 4px; margin: 0 20px; padding: 3px; overflow-x: auto; background: var(--surface); border-bottom: 1px solid var(--line); }
button { display: inline-flex; flex: 1 0 auto; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 8px 20px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ink-60); font: 800 13px var(--font-b); cursor: pointer; white-space: nowrap; }
button:hover { color: var(--tea); background: var(--cream); }
button[aria-current] { color: var(--tea); border-bottom-color: var(--accent); background: var(--cream); }
button[aria-current] svg { color: var(--accent-strong); }
button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: -3px; }
@media (max-width: 640px) {
  .editor-section-nav { margin-inline: 12px; }
  button { gap: 6px; padding-inline: 16px; }
}
</style>
