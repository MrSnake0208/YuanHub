<template>
  <div ref="receiptElement" class="receipt">
    <div class="receipt-head">
      <h2><Receipt :size="18" />购物清单</h2>
      <div class="en">Purchase Receipt</div>
    </div>
    <div class="receipt-body">
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
        <div class="divider-dashed"></div>
        <div>
          <div class="tot-row"><span class="lb">总抽数</span><span class="v badge">{{ totalDraws.toFixed(1) }} 抽</span></div>
          <div class="tot-row"><span class="lb">平均每抽</span><span class="v gold">{{ totalDraws > 0 ? formatMoney(drawCost == null ? null : drawCost / totalDraws, currency, 2) : '不适用' }}</span></div>
          <p class="receipt-price-note">平均每抽仅计含抽数礼包的支出。</p>
          <div class="tot-row"><span class="lb">购物车积分</span><span class="v">{{ cartPoints }} 分</span></div>
          <div class="tot-row"><span class="lb strong">总积分 (含初始)</span><span class="v gold">{{ totalPoints }} 分</span></div>
          <div v-if="hasUsdItems" class="tot-row"><span class="lb">美元标价小计（折前）</span><span class="v">{{ formatMoney(totalUsd, 'USD') }}</span></div>
          <div v-if="originalTotal !== undefined" class="tot-row"><span class="lb">折前预算 ({{ currency }})</span><span class="v">{{ formatMoney(originalTotal, currency) }}</span></div>
          <div class="tot-row"><span class="lb">方案折扣</span><span class="v">{{ discountPercent == null ? '待填写' : discountPercent + '%' }}（原价百分比）</span></div>
          <div v-if="currency !== 'CNY'" class="tot-row"><span class="lb">折合人民币</span><span class="v">{{ formatMoney(totalCny, 'CNY') }}</span></div>
        </div>
        <div class="grand-total">
          <span class="lb">预计实付 ({{ currency }})</span>
          <span class="v">{{ formatMoney(amount, currency) }}</span>
        </div>
        <p v-if="rateEntries.length" class="receipt-price-note">参考汇率：{{ rateEntries.map(([code, rate]) => `1 ${code} = ${rate} CNY`).join('；') }}。</p>
        <p class="receipt-price-note">金额仅供预算参考；当地标价、渠道优惠及累充规则请以实际商店为准。折扣不改变已录入的积分和抽数。</p>
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
    <button class="btn ghost" :disabled="cartItems.length === 0" @click="$emit('clear')"><Trash2 :size="16" />清空</button>
    <button class="btn primary" :disabled="cartItems.length === 0 || exportBusy" :aria-busy="exportBusy" @click="$emit('export')"><Download :size="16" />{{ exportBusy ? '生成中…' : '导出图片' }}</button>
    <button class="btn primary" @click="$emit('save-plan')"><Save :size="16" />保存</button>
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
.receipt-pricing-error{color:var(--rouge)}
</style>
<style scoped src="./receiptPanelDesktop.css"></style>
<style scoped src="./receiptPanelMobile.css"></style>
