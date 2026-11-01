<template>
  <div class="ledger-avatar operator-avatar" :class="'rarity-r' + rarity">
    <img v-if="avatar" :src="avatarUrl(avatar)" :alt="name" loading="lazy" />
    <span v-else>{{ Array.from(name || '?')[0] }}</span>
    <slot />
  </div>
</template>

<script setup>
import { avatarUrl } from '../../api/request.js'
defineProps({ avatar: { type: String, default: '' }, name: { type: String, default: '' }, rarity: { type: Number, default: 3 } })
</script>

<style scoped>
.operator-avatar { --ledger-rarity-accent: #99b5cf; position: relative; flex: none; width: 46px; height: 46px; overflow: visible; border: 2px solid var(--ledger-rarity-accent); border-radius: 10px; background: color-mix(in srgb, var(--ledger-rarity-accent) 16%, var(--paper)); }
.operator-avatar.rarity-r5 { --ledger-rarity-accent: var(--accent); }
.operator-avatar.rarity-r4 { --ledger-rarity-accent: #8672b2; }
.operator-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
.operator-avatar > span { display: grid; width: 100%; height: 100%; place-items: center; color: var(--ink-35); font: 900 21px var(--font-s); }
@media (max-width: 640px) { .operator-avatar { width: 44px; height: 44px; } }
</style>
