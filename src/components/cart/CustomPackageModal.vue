<template>
  <Teleport to="body">
    <div v-if="show" class="modal-mask" @click.self="$emit('close')">
      <div ref="panel" class="modal" role="dialog" aria-modal="true" aria-labelledby="cart-custom-title" tabindex="-1">
        <div class="modal-head">
          <h3 id="cart-custom-title">录入自定义礼包</h3>
          <button type="button" aria-label="关闭自定义礼包弹窗" @click="$emit('close')"><X :size="20" /></button>
        </div>
        <form @submit.prevent="submit">
          <div class="fgrid">
            <div class="full">
              <label>礼包名称 <em>*</em></label>
              <input ref="nameInput" v-model="form.name" aria-label="礼包名称" type="text" required placeholder="输入名称" />
            </div>
            <div>
              <label>价格 ({{ version === 'daihao' ? 'USD' : 'CNY' }}) <em>*</em></label>
              <input v-model="form.price" type="number" step="0.01" min="0" required placeholder="0.00" />
            </div>
            <div>
              <label>分类</label>
              <input v-model="form.category" type="text" placeholder="自定义" />
            </div>
            <div>
              <label>积分</label>
              <input v-model="form.points" type="number" min="0" placeholder="0" />
            </div>
            <div>
              <label>抽数</label>
              <input v-model="form.draws" type="number" min="0" placeholder="0" />
            </div>
            <div>
              <label>限购次数</label>
              <input v-model="form.limit" type="number" min="1" placeholder="999" />
            </div>
            <div>
              <label>额外物品</label>
              <input v-model="form.extra" type="text" placeholder="如: 100体力" />
            </div>
            <div class="full">
              <label>排序 ID</label>
              <input v-model="form.sortId" type="number" placeholder="数字越小越靠前 (可选)" />
            </div>
          </div>
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

const props = defineProps({
  show: { type: Boolean, default: false },
  version: { type: String, default: 'daihao' }
})

const emit = defineEmits(['close', 'submit'])
const panel = ref(null)
const nameInput = ref(null)
useModalFocus(computed(() => props.show), panel, { initialFocus: () => nameInput.value, onEscape: () => emit('close') })

const form = reactive({
  name: '',
  price: '',
  points: '',
  draws: '',
  limit: '',
  extra: '',
  category: '自定义',
  sortId: ''
})

watch(() => props.show, (v) => {
  if (v) {
    form.name = ''; form.price = ''; form.points = ''; form.draws = '';
    form.limit = ''; form.extra = ''; form.category = '自定义'; form.sortId = '';
  }
})

function submit() {
  if (!form.name || !form.price) return
  emit('submit', { ...form })
}
</script>
