<template>
  <label>名称（必填）<input :id="prefix + '-name'" v-model="candidate.name" maxlength="200" :aria-invalid="!!errors.name" :aria-describedby="errors.name ? prefix + '-name-error' : undefined"><span v-if="errors.name" :id="prefix + '-name-error'">{{ errors.name }}</span></label>
  <label>游戏原生分类<select :id="prefix + '-category_id'" v-model="candidate.category_id" :aria-invalid="!!errors.category_id" :aria-describedby="errors.category_id ? prefix + '-category-error' : undefined"><option value="" disabled>请选择分类</option><option v-for="c in categories" :key="c.category_id" :value="c.category_id">{{ c.name }}</option></select><span v-if="errors.category_id" :id="prefix + '-category-error'">{{ errors.category_id }}</span></label>
  <label>隐藏成就<select v-model="candidate.is_hidden"><option :value="null">未知</option><option :value="false">否</option><option :value="true">是</option></select></label>
</template>
<script setup>
defineProps({ candidate: { type: Object, required: true }, categories: { type: Array, required: true }, prefix: { type: String, default: 'achievement' }, errors: { type: Object, default: () => ({}) } })
</script>
<style scoped>
label { display: grid; gap: 5px; min-width: 0; }
input, select { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; }
</style>
