<template>
  <div class="pkg-card" :class="{ sel: qty > 0 }">
    <button v-if="isCustom" class="pkg-del" :title="`删除自定义礼包「${pkg.name}」`" :aria-label="`删除自定义礼包「${pkg.name}」`" @click="$emit('remove-custom', pkg.id)">
      <Trash2 :size="16" />
    </button>
    <div class="pkg-top">
      <div class="flex-1 min-w-0 pr-2">
        <h2 class="pkg-name" :title="pkg.name">{{ pkg.name }}</h2>
        <div v-if="pkg.originalCurrency" class="pkg-original">标价 {{ formatMoney(pkg.originalPrice, pkg.originalCurrency) }}</div>
        <div v-else-if="showUsd && pkg.priceUsd" class="pkg-original">${{ pkg.priceUsd }}</div>
      </div>
      <div class="pkg-price">
        <div class="main">{{ formatMoney(displayPrice, currency) }}</div>
      </div>
    </div>
    <div class="pkg-tags">
      <span class="pkg-tag pts">{{ pkg.points }} 积分</span>
      <span v-if="pkg.draws > 0" class="pkg-tag line">{{ pkg.draws }} 抽</span>
      <span v-if="pkg.draws > 0" class="pkg-tag gold">{{ formatMoney(displayPrice == null ? null : displayPrice / pkg.draws, currency, 2) }}/抽</span>
      <span v-else class="pkg-tag line">每抽成本不适用</span>
      <span v-if="pkg._fromSnapshot" class="pkg-tag line">方案快照</span>
      <span v-if="pkg.extra" class="pkg-tag line">{{ pkg.extra }}</span>
    </div>
    <div class="pkg-foot">
      <div class="pkg-personal-actions">
        <label><input type="checkbox" :checked="pkg.discountEligible !== false" :aria-label="`${pkg.name}参与方案折扣`" @change="$emit('discount', $event.target.checked)" />参与折扣</label>
        <button type="button" @click="$emit(isCustom ? 'edit-custom' : 'copy-custom', pkg)">{{ isCustom ? '编辑礼包' : '复制自定义' }}</button>
      </div>
      <div class="pkg-limit">
        <template v-if="pkg.limit === 999">不限购</template>
        <template v-else>已选 <b :class="{ max: qty >= pkg.limit }">{{ qty }}</b> / 限购 {{ pkg.limit }}</template>
      </div>
      <div class="stepper">
        <button :disabled="qty === 0" :aria-label="`减少 ${pkg.name} 数量`" @click="$emit('remove')"><Minus :size="13" :stroke-width="2.5" /></button>
        <span class="qty">{{ qty }}</span>
        <button :disabled="qty >= pkg.limit" :aria-label="`增加 ${pkg.name} 数量`" @click="$emit('add')"><Plus :size="13" :stroke-width="2.5" /></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Minus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { formatMoney } from '../../utils/ledgerPricing.js'

const props = defineProps({
  pkg: { type: Object, required: true },
  qty: { type: Number, default: 0 },
  isCustom: { type: Boolean, default: false },
  showUsd: { type: Boolean, default: false },
  currency: { type: String, default: 'CNY' }
})

const displayPrice = computed(() => props.pkg.calculatedPrice === undefined ? props.pkg.calculatedPriceCny : props.pkg.calculatedPrice)
defineEmits(['add', 'remove', 'remove-custom', 'edit-custom', 'copy-custom', 'discount'])
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.pkg-personal-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--ink-60)}
.pkg-personal-actions button{border:0;border-radius:6px;background:transparent;color:var(--ink);padding:5px 8px;cursor:pointer}
.pkg-personal-actions label{display:flex;align-items:center;gap:4px;cursor:pointer}
.pkg-original{color:var(--ink-60);font-family:var(--font-d)}
.pkg-personal-actions input{accent-color:var(--accent-strong)}
.pkg-card{border-radius:12px;box-shadow:none}
.pkg-card.sel{background:var(--cream);box-shadow:none}
.pkg-card:hover{box-shadow:none}
.pkg-tag.pts{background:var(--cream);border:1px solid var(--line)}
.pkg-personal-actions button:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:2px}

</style>
<style scoped src="./packageCardDesktop.css"></style>
<style scoped src="./packageCardMobile.css"></style>
