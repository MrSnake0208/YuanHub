<template>
  <Teleport to="body">
    <div v-if="show" class="modal-mask" @click.self="$emit('close')">
      <div ref="panel" class="modal" role="dialog" aria-modal="true" aria-labelledby="cart-custom-title" tabindex="-1">
        <div class="modal-head">
          <h3 id="cart-custom-title">{{ editing ? '编辑自定义礼包' : '录入自定义礼包' }}</h3>
          <button type="button" aria-label="关闭自定义礼包弹窗" @click="$emit('close')"><X :size="20" /></button>
        </div>
        <form @submit.prevent="submit">
          <div class="fgrid">
            <div class="full">
              <label>礼包名称 <em>*</em></label>
              <input ref="nameInput" v-model="form.name" aria-label="礼包名称" type="text" maxlength="120" required placeholder="输入名称" />
            </div>
            <div>
              <label for="custom-price-currency">标价币种</label>
              <select id="custom-price-currency" v-model="form.currency" @change="form.price = ''">
                <option v-for="currency in ledgerCurrencies" :key="currency" :value="currency">{{ currencyNames[currency] }} {{ currency }}</option>
              </select>
            </div>
            <div>
              <label for="custom-price">价格 ({{ form.currency }}) <em>*</em></label>
              <input id="custom-price" v-model="form.price" type="number" step="any" min="0" max="1000000000" required placeholder="请填写该币种实际标价" />
            </div>
            <div>
              <label for="custom-category">分类</label>
              <input id="custom-category" v-model="form.category" type="text" placeholder="自定义" />
            </div>
            <div>
              <label for="custom-points">积分</label>
              <input id="custom-points" v-model="form.points" type="number" min="0" max="2147483647" placeholder="0" />
            </div>
            <div>
              <label for="custom-draws">抽数</label>
              <input id="custom-draws" v-model="form.draws" type="number" step="any" min="0" max="1000000000" placeholder="0" />
            </div>
            <div>
              <label for="custom-limit">限购次数</label>
              <input id="custom-limit" v-model="form.limit" type="number" min="1" max="9999" placeholder="999" />
            </div>
            <div>
              <label for="custom-extra">额外物品</label>
              <input id="custom-extra" v-model="form.extra" type="text" placeholder="如: 100体力" />
            </div>
            <div class="full">
              <label for="custom-sort">显示顺序</label>
              <input id="custom-sort" v-model="form.sortId" type="number" placeholder="数字越小越靠前 (可选)" />
            </div>
            <label class="full custom-discount"><input v-model="form.discountEligible" type="checkbox" />参与方案折扣（已填写实付价时请取消）</label>
          </div>
          <p class="custom-price-hint">当地商店价格请自行核实；更换标价币种后需重新填写金额。</p>
          <p v-if="error" class="custom-error" role="alert">{{ error }}</p>
          <div class="modal-foot">
            <button type="button" class="btn ghost" @click="$emit('close')">取消</button>
            <button type="submit" class="btn primary">确认录入</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { ledgerCurrencies, currencyNames, packagePrice, finiteNumber } from '../../utils/ledgerPricing.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  version: { type: String, default: 'daihao' },
  initialPackage: { type: Object, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])
const panel = ref(null)
const nameInput = ref(null)
const error = ref('')
useModalFocus(computed(() => props.show), panel, { initialFocus: () => nameInput.value, onEscape: () => emit('close') })

const form = reactive({
  name: '',
  price: '',
  points: '',
  draws: '',
  limit: '',
  extra: '',
  category: '自定义',
  sortId: '', currency: 'CNY', discountEligible: true
})

watch(() => props.show, (v) => {
  if (v) {
    const pkg = props.initialPackage
    const price = pkg ? packagePrice(pkg, props.version) : { amount: '', currency: props.version === 'daihao' ? 'USD' : 'CNY' }
    Object.assign(form, { name: pkg?.name || '', price: price.amount, currency: price.currency,
      points: pkg?.points ?? '', draws: pkg?.draws ?? '', limit: pkg?.limit ?? '', extra: pkg?.extra || '',
      category: pkg?.category || '自定义', sortId: pkg?.sortId ?? '', discountEligible: pkg?.discountEligible !== false })
    error.value = ''
  }
}, { immediate: true })

function submit() {
  const price = finiteNumber(form.price)
  if (!form.name.trim() || price === null || price < 0 || price > 1e9) {
    error.value = '请填写礼包名称和有效价格（0 至 1000000000）。'
    return
  }
  emit('submit', { ...form, name: form.name.trim() })
}
</script>

<style scoped>
.custom-price-hint{font-size:12px;color:var(--ink-60);margin-top:12px}
.custom-error{color:var(--theme-danger-text, var(--rouge))}
.custom-discount{display:flex;align-items:center;gap:6px}
.custom-discount input{width:auto}
.fgrid select{width:100%;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface);color:var(--ink)}
</style>
