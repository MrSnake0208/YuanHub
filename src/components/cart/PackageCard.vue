<template>
  <div class="pkg-card" :class="{ sel: qty > 0 }">
    <button v-if="isCustom" class="pkg-del" title="删除自定义礼包" @click="$emit('remove-custom', pkg.id)">
      <Trash2 :size="12" />
    </button>
    <div class="pkg-top">
      <div class="flex-1 min-w-0 pr-2">
        <h3 class="pkg-name" :title="pkg.name">{{ pkg.name }}</h3>
        <div class="pkg-tags">
          <span class="pkg-tag pts">{{ pkg.points }} 积分</span>
          <span v-if="pkg.draws > 0" class="pkg-tag line">{{ pkg.draws }} 抽</span>
          <span v-if="pkg.draws > 0" class="pkg-tag gold">¥{{ (pkg.calculatedPriceCny / pkg.draws).toFixed(2) }}/抽</span>
          <span v-if="pkg.extra" class="pkg-tag line">{{ pkg.extra }}</span>
        </div>
      </div>
      <div class="pkg-price">
        <div class="main">¥{{ pkg.calculatedPriceCny.toFixed(2) }}</div>
        <div v-if="showUsd && pkg.priceUsd" class="usd">${{ pkg.priceUsd }}</div>
      </div>
    </div>
    <div class="pkg-foot">
      <div class="pkg-limit">
        <template v-if="pkg.limit === 999">不限购</template>
        <template v-else>限购 <b :class="{ max: qty >= pkg.limit }">{{ qty }}</b>/{{ pkg.limit }}</template>
      </div>
      <div class="stepper">
        <button :disabled="qty === 0" @click="$emit('remove')"><Minus :size="13" :stroke-width="2.5" /></button>
        <span class="qty">{{ qty }}</span>
        <button :disabled="qty >= pkg.limit" @click="$emit('add')"><Plus :size="13" :stroke-width="2.5" /></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Minus, Trash2 } from '@lucide/vue'

defineProps({
  pkg: { type: Object, required: true },
  qty: { type: Number, default: 0 },
  isCustom: { type: Boolean, default: false },
  showUsd: { type: Boolean, default: false }
})

defineEmits(['add', 'remove', 'remove-custom'])
</script>