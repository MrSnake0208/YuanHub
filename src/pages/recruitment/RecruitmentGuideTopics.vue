<template>
  <div class="guide-topics" role="group" aria-label="选择使用教程主题">
    <button v-for="topic in topics" :key="topic.id" type="button" :data-guide-topic="topic.id" @click="$emit('select', topic.id)">
      <strong>{{ topic.title }}</strong><span>{{ topic.description }}</span>
    </button>
  </div>
</template>

<script setup>
defineEmits(['select'])
const topics = [
  { id: 'explore', title: '第一次使用招募档案', description: '确认账号与卡池，读懂抽数，切换记录视图' },
  { id: 'progress', title: '抽了几次，但没有出绝密', description: '依据真实游戏进度更新保底' },
  { id: 'record', title: '抽出了绝密密探', description: '选择真实密探，加入记录，再保存修改' },
  { id: 'maintain', title: '补录或修改以前的记录', description: '找到历史卡池，查看与修改已有记录' }
]
</script>

<style scoped>
.guide-topics{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:10px}
button{display:grid;gap:4px;min-width:0;min-height:44px;padding:12px;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;overflow-wrap:anywhere}
strong{font-size:13px}span{font-size:12px;line-height:1.6;color:var(--ink-60)}button:hover{border-color:var(--accent);background:var(--cream)}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(min-width:600px){.guide-topics{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
