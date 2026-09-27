<template>
  <div class="receipt">
    <div class="receipt-head">
      <h2><Receipt :size="18" />购物清单</h2>
      <div class="en">Purchase Receipt</div>
    </div>
    <div class="receipt-body">
      <div class="initial-row">
        <span class="lb"><Gift :size="14" class="ic" />已有初始积分</span>
        <input type="number" min="0" aria-label="已有初始积分" :value="initialPoints || ''" @input="onInitialInput" placeholder="0" />
      </div>

      <div v-if="cartItems.length === 0" class="receipt-empty">
        <ShoppingCart :size="40" class="ic" />
        <p>清单空空如也</p>
        <p class="sub">请添加您需要的礼包</p>
      </div>

      <template v-else>
        <div>
          <div v-for="item in cartItems" :key="item.id" class="cart-line">
            <div class="nm">
              {{ item.name }}
              <span class="sub">¥{{ item.calculatedPriceCny.toFixed(2) }} × {{ cart[item.id] }}</span>
            </div>
            <div class="amt">¥{{ (item.calculatedPriceCny * cart[item.id]).toFixed(2) }}</div>
          </div>
        </div>
        <div class="divider-dashed"></div>
        <div>
          <div class="tot-row"><span class="lb">总抽数</span><span class="v badge">{{ totalDraws.toFixed(1) }} 抽</span></div>
          <div class="tot-row"><span class="lb">平均每抽</span><span class="v gold">{{ totalDraws > 0 ? '¥' + (priceForDraws / totalDraws).toFixed(2) : '-' }}</span></div>
          <div class="tot-row"><span class="lb">购物车积分</span><span class="v">{{ cartPoints }} 分</span></div>
          <div class="tot-row"><span class="lb strong">总积分 (含初始)</span><span class="v gold">{{ totalPoints }} 分</span></div>
          <div v-if="version === 'daihao'" class="tot-row"><span class="lb">总价 (USD)</span><span class="v">${{ totalUsd.toFixed(2) }}</span></div>
        </div>
        <div class="grand-total">
          <span class="lb">总计 (CNY)</span>
          <span class="v">¥{{ totalCny.toFixed(2) }}</span>
        </div>
      </template>

      <template v-if="totalPoints > 0">
        <div v-if="cartItems.length > 0" class="divider-dashed"></div>
        <div class="milestone">
          <div class="head"><span class="tt"><Gift :size="14" class="ic" style="color:var(--accent)" />积分奖励进度</span></div>

          <div style="margin-top:14px">
            <div class="head">
              <span class="tt"><span class="nm">周年限时累充</span><span class="cd">{{ track1Campaign.active ? '剩余: ' : '' }}{{ track1Campaign.label }}</span></span>
              <span v-if="track1Campaign.active && next1 !== null" class="next">距下一档还差 <b>{{ next1 - totalPoints }}</b> 分</span>
              <span v-else-if="track1Campaign.active" class="done">已全部解锁</span>
            </div>
            <p v-if="!track1Campaign.active" class="campaign-ended-note">档位仅供历史参考，不再表示可领取奖励。</p>
            <div v-if="unlocked1.length > 0">
              <div v-for="(m, i) in unlocked1" :key="i" class="box">
                <b>{{ m.points }}积分</b>{{ m.rewards.map(r => r.name + ' ×' + r.count).join('、') }}
              </div>
            </div>
            <div v-else class="none">暂未解锁奖励</div>
          </div>

          <div style="margin-top:16px">
            <div class="head">
              <span class="tt"><span class="nm">男主限时累充</span><span class="cd">{{ track2Campaign.active ? '剩余: ' : '' }}{{ track2Campaign.label }}</span></span>
              <span v-if="track2Campaign.active && next2 !== null" class="next">距下一档还差 <b>{{ next2 - totalPoints }}</b> 分</span>
              <span v-else-if="track2Campaign.active" class="done">已全部解锁</span>
            </div>
            <p v-if="!track2Campaign.active" class="campaign-ended-note">档位仅供历史参考，不再表示可领取奖励。</p>
            <div v-if="unlocked2.length > 0">
              <div v-for="(m, i) in unlocked2" :key="i" class="box">
                <b>{{ m.points }}积分</b>{{ m.rewards.map(r => r.name + ' ×' + r.count).join('、') }}
              </div>
            </div>
            <div v-else class="none">暂未解锁奖励</div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <div class="cart-actions">
    <button class="btn ghost" :disabled="cartItems.length === 0" @click="$emit('clear')"><Trash2 :size="16" />清空</button>
    <button class="btn primary" :disabled="cartItems.length === 0 || exportBusy" :aria-busy="exportBusy" @click="$emit('export')"><Download :size="16" />{{ exportBusy ? '生成中…' : '导出图片' }}</button>
    <button class="btn primary" @click="$emit('save-plan')"><Save :size="16" />保存</button>
  </div>
</template>

<script setup>
import { ShoppingCart, Receipt, Gift, Trash2, Download, Save } from '@lucide/vue'

const props = defineProps({
  cartItems: { type: Array, default: () => [] },
  cart: { type: Object, default: () => ({}) },
  initialPoints: { type: Number, default: 0 },
  totalDraws: { type: Number, default: 0 },
  priceForDraws: { type: Number, default: 0 },
  cartPoints: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  totalUsd: { type: Number, default: 0 },
  totalCny: { type: Number, default: 0 },
  unlocked1: { type: Array, default: () => [] },
  unlocked2: { type: Array, default: () => [] },
  next1: { type: Number, default: null },
  next2: { type: Number, default: null },
  track1Campaign: { type: Object, default: () => ({ active: false, label: '活动时间待确认' }) },
  track2Campaign: { type: Object, default: () => ({ active: false, label: '活动时间待确认' }) },
  version: { type: String, default: 'daihao' },
  exportBusy: { type: Boolean, default: false }
})

const emit = defineEmits(['clear', 'update-initial', 'save-plan', 'export'])

function onInitialInput(e) {
  const val = parseInt(e.target.value, 10)
  emit('update-initial', isNaN(val) || val < 0 ? 0 : val)
}
</script>
