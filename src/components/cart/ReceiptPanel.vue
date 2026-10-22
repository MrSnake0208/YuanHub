<template>
  <div ref="receiptElement" class="receipt">
    <div class="receipt-head">
      <h2><Receipt :size="18" aria-hidden="true" />预算清单</h2>
      <span class="receipt-count">已选 {{ Object.values(cart).reduce((sum, qty) => sum + qty, 0) }} 件</span>
    </div>
    <div class="receipt-body">
      <div class="grand-total">
        <span class="lb">预计支出 ({{ currency }})</span>
        <span class="v">{{ formatMoney(amount, currency) }}</span>
      </div>
      <div class="receipt-summary">
        <div class="receipt-metrics">
          <div><strong>{{ totalPoints }}</strong><span>总积分（含初始）</span></div>
          <div><strong>{{ totalDraws.toFixed(1) }}</strong><span>总抽数</span></div>
        </div>
        <p class="receipt-average">平均 <b>{{ totalDraws > 0 ? formatMoney(drawCost == null ? null : drawCost / totalDraws, currency, 2) + '/抽' : '不适用' }}</b></p>
        <p class="receipt-price-note">仅计含抽数礼包的支出</p>
      </div>
      <div class="initial-row">
        <span class="lb"><Gift :size="14" class="ic" />已有初始积分</span>
        <input v-if="!exportOnly" type="number" min="0" aria-label="已有初始积分" :value="initialPoints || ''" @input="onInitialInput" placeholder="0" />
        <span v-else>{{ initialPoints }} 分</span>
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
              <span class="sub">{{ formatMoney(itemPrice(item), currency) }} × {{ cart[item.id] }}</span>
              <span v-if="item.originalCurrency" class="sub">标价 {{ formatMoney(item.originalPrice, item.originalCurrency) }} · {{ item.discountEligible === false ? '不参与折扣' : '参与方案折扣' }}</span>
            </div>
            <div class="amt">{{ formatMoney(itemPrice(item) == null ? null : itemPrice(item) * cart[item.id], currency) }}</div>
          </div>
        </div>
        <details class="receipt-pricing-details" :open="exportOnly">
          <summary>计价明细 · 支付比例 {{ discountPercent == null ? '待填写' : discountPercent + '%' }}</summary>
          <div class="tot-row"><span class="lb">购物车积分</span><span class="v">{{ cartPoints }} 分</span></div>
          <div v-if="hasUsdItems" class="tot-row"><span class="lb">美元标价小计（折前）</span><span class="v">{{ formatMoney(totalUsd, 'USD') }}</span></div>
          <div v-if="originalTotal !== undefined" class="tot-row"><span class="lb">折前预算 ({{ currency }})</span><span class="v">{{ formatMoney(originalTotal, currency) }}</span></div>
          <div v-if="currency !== 'CNY'" class="tot-row"><span class="lb">折合人民币</span><span class="v">{{ formatMoney(totalCny, 'CNY') }}</span></div>
          <p v-if="rateEntries.length" class="receipt-price-note">参考汇率：{{ rateEntries.map(([code, rate]) => `1 ${code} = ${rate} CNY`).join('；') }}。</p>
          <p class="receipt-price-note">金额仅供预算参考；当地标价、渠道优惠及累充规则请以实际商店为准。折扣不改变已录入的积分和抽数。</p>
        </details>
        <p v-if="pricingMessage" class="receipt-pricing-error" role="alert">{{ pricingMessage }}</p>
      </template>

      <template v-if="totalPoints > 0">
        <div v-if="cartItems.length > 0" class="divider-dashed"></div>
        <div class="milestone">
          <div class="head"><span class="tt"><Gift :size="14" class="ic" style="color:var(--accent)" />积分奖励进度</span></div>

          <div v-for="campaign in campaigns" :key="campaign.id" style="margin-top:14px">
            <div class="head">
              <span class="tt"><span class="nm">{{ campaign.name }}</span><span class="cd">{{ campaign.label }}</span></span>
              <span v-if="campaign.active && campaign.next !== null" class="next">距下一档还差 <b>{{ campaign.next - totalPoints }}</b> 分</span>
              <span v-else-if="campaign.active" class="done">已全部解锁</span>
            </div>
            <p class="receipt-price-note">{{ formatLedgerTime(campaign.starts_at, campaign.time_zone) }} — {{ formatLedgerTime(campaign.ends_at, campaign.time_zone) }} · {{ campaign.time_zone }}</p>
            <p v-if="!campaign.active" class="campaign-ended-note">档位仅供历史参考或预算预览，不表示当前可领取奖励。</p>
            <p v-if="campaign.source_note" class="receipt-price-note">{{ campaign.source_note }}</p>
            <div v-if="campaign.unlocked.length > 0">
              <div v-for="m in campaign.unlocked" :key="m.points" class="box">
                <b>{{ m.points }}积分</b>{{ m.rewards.map(r => r.name + ' ×' + r.count).join('、') }}
              </div>
            </div>
            <div v-else class="none">{{ campaign.active ? '暂未达到奖励门槛' : '暂无达到门槛的参考档位' }}</div>
          </div>
          <p v-if="!campaigns.length" class="receipt-price-note">当前游戏暂无已发布累充活动。</p>
        </div>
      </template>
    </div>
  </div>

  <div v-if="!exportOnly" class="cart-actions">
    <button class="btn primary receipt-save" @click="$emit('save-plan')"><Save :size="16" />保存方案</button>
    <button class="btn ghost receipt-export" :disabled="cartItems.length === 0 || exportBusy" :aria-busy="exportBusy" @click="$emit('export')"><Download :size="16" />{{ exportBusy ? '生成中…' : '导出图片' }}</button>
    <button class="btn ghost receipt-clear" :disabled="cartItems.length === 0" @click="$emit('clear')"><Trash2 :size="16" />清空清单</button>
  </div>
</template>

<script setup>
import { ShoppingCart, Receipt, Gift, Trash2, Download, Save } from '@lucide/vue'
import { computed, ref } from 'vue'
import { formatLedgerTime } from '@/utils/ledgerCatalog.js'
import { formatMoney } from '../../utils/ledgerPricing.js'

const receiptElement = ref(null)
defineExpose({ receiptElement })

const props = defineProps({
  cartItems: { type: Array, default: () => [] },
  cart: { type: Object, default: () => ({}) },
  initialPoints: { type: Number, default: 0 },
  totalDraws: { type: Number, default: 0 },
  priceForDraws: { type: Number, default: 0 },
  cartPoints: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  totalUsd: { type: Number, default: 0 },
  hasUsdItems: { type: Boolean, default: false },
  totalCny: { type: Number, default: 0 },
  campaigns: { type: Array, default: () => [] },
  version: { type: String, default: 'daihao' },
  exportBusy: { type: Boolean, default: false },
  exchangeRate: { type: Number, default: 6.7 },
  currency: { type: String, default: 'CNY' },
  totalAmount: { type: Number, default: undefined },
  originalTotal: { type: Number, default: undefined },
  displayDrawCost: { type: Number, default: undefined },
  discountPercent: { type: Number, default: 100 },
  referenceRates: { type: Object, default: () => ({}) },
  pricingMessage: { type: String, default: '' },
  exportOnly: { type: Boolean, default: false }
})

const emit = defineEmits(['clear', 'update-initial', 'save-plan', 'export'])
const amount = computed(() => props.totalAmount === undefined ? props.totalCny : props.totalAmount)
const drawCost = computed(() => props.displayDrawCost === undefined ? props.priceForDraws : props.displayDrawCost)
const itemPrice = item => item.calculatedPrice === undefined ? item.calculatedPriceCny : item.calculatedPrice
const rateEntries = computed(() => Object.entries(props.referenceRates).filter(([code]) =>
  code === props.currency || props.cartItems.some(item => (item.originalCurrency || (props.version === 'daihao' ? 'USD' : 'CNY')) === code)))

function onInitialInput(e) {
  const val = parseInt(e.target.value, 10)
  emit('update-initial', isNaN(val) || val < 0 ? 0 : val)
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.receipt-price-note{color:var(--ink-60)}
.receipt-pricing-error{color:var(--theme-danger-text, var(--rouge))}
.receipt{box-shadow:none;border-radius:14px}
.receipt-head{background:var(--cream);color:var(--theme-strong-text, var(--tea));border-bottom:1px solid var(--line)}
.receipt-count{color:var(--ink-60)}
.receipt .grand-total{border:0}
.receipt .grand-total .v{color:var(--theme-strong-text, var(--tea));overflow-wrap:anywhere}
.receipt-summary{background:var(--cream);border-radius:10px}
.receipt-metrics strong{color:var(--theme-strong-text, var(--tea));font-family:var(--font-d)}
.receipt-metrics span,.receipt-average{color:var(--ink-60)}
.receipt-metrics>div+div{border-left:1px solid var(--line)}
.receipt-pricing-details{border-top:1px solid var(--line)}
.receipt-pricing-details summary{cursor:pointer;color:var(--ink)}
.receipt-pricing-details summary:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:2px}
.cart-actions .receipt-save{background:var(--accent-strong);border:1px solid var(--accent-strong);color:var(--on-surface)}
.cart-actions .receipt-export,.cart-actions .receipt-clear{background:var(--surface);border:1px solid var(--line);color:var(--theme-strong-text, var(--tea))}
.cart-actions .btn:hover:not(:disabled){filter:brightness(.96)}
</style>
<style scoped src="./receiptPanelDesktop.css"></style>
<style scoped src="./receiptPanelMobile.css"></style>
