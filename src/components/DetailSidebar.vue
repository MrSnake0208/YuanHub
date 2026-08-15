<template>
  <aside class="island">
    <div class="brand">
      <div class="brand-mark">M</div>
      <div class="brand-txt">MaaYuan Share<b>通关作业</b></div>
    </div>
    <nav class="nav">
      <router-link to="/"><span class="no">←</span>返回作业广场</router-link>
      <a
        v-for="item in items"
        :key="item.id"
        :href="'#' + item.id"
        :class="{ active: activeId === item.id }"
      ><span class="no">{{ item.no }}</span>{{ item.label }}</a>
    </nav>
    <div class="island-foot">
      作者 <b>{{ author }}</b><br>
      <span class="src-tag">打法来源</span>{{ source }}
    </div>
  </aside>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  author: { type: String, default: '' },
  source: { type: String, default: '' }
})

const items = [
  { id: 'team', no: '01', label: '密探阵容' },
  { id: 'tips', no: '02', label: '打法要点' },
  { id: 'stones', no: '03', label: '星石练度' },
  { id: 'info', no: '04', label: '作业信息' }
]

const activeId = ref('team')
let observer = null

onMounted(() => {
  const secs = items
    .map(it => document.getElementById(it.id))
    .filter(Boolean)
  observer = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id
        const hit = items.find(it => it.id === id)
        if (hit) activeId.value = hit.id
      }
    })
  }, { rootMargin: '-30% 0px -55% 0px' })
  secs.forEach(s => observer.observe(s))
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})
</script>
