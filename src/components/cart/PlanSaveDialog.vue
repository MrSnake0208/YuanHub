<template>
  <Teleport to="body">
    <div class="modal-mask" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-head">
          <h3>保存方案</h3>
          <button type="button" @click="$emit('close')"><X :size="20" /></button>
        </div>
        <form @submit.prevent="submitSave(existing)">
          <div class="fgrid">
            <div class="full">
              <label>方案名称 <em>*</em></label>
              <input v-model="draftName" type="text" maxlength="50" required placeholder="如：周年庆-代号鸢" />
            </div>
          </div>

          <p v-if="loggedIn" class="save-tip">
            <Cloud :size="14" />
            <span>{{ existing ? '将覆盖云端「' + (name || '当前方案') + '」，也可另存为新方案。' : '将保存到云端「我的方案」，随时可加载复原。' }}</span>
          </p>
          <p v-else class="save-tip guest">
            <HardDrive :size="14" />
            <span>当前为游客模式：方案将暂存在本机浏览器。登录后可把方案保存到云端。</span>
          </p>

          <div class="modal-foot">
            <button type="button" class="btn ghost" style="flex:none" @click="$emit('close')">取消</button>
            <button
              v-if="existing"
              type="button"
              class="btn ghost"
              style="flex:none"
              :disabled="saving"
              @click="submitSave(false)"
            >另存为新方案</button>
            <button type="submit" class="btn primary" style="flex:none" :disabled="saving">
              {{ saving ? '保存中…' : (existing ? '覆盖当前方案' : '保存') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { X, Cloud, HardDrive } from '@lucide/vue'

const props = defineProps({
  name: { type: String, default: '' },
  existing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  loggedIn: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'save'])

const draftName = ref(props.name)
watch(() => props.name, (v) => { draftName.value = v })

// overwrite：true=覆盖当前方案（PUT）；false=另存为新方案（POST）
function submitSave(overwrite) {
  if (!draftName.value || !draftName.value.trim()) return
  emit('save', { name: draftName.value, overwrite })
}
</script>

<style scoped>
.save-tip{
  display:flex;align-items:flex-start;gap:8px;
  background:var(--paper);border:1px solid var(--line);border-radius:12px;
  padding:10px 12px;font-size:12px;line-height:1.6;color:var(--ink-60);
}
.save-tip svg{flex-shrink:0;margin-top:2px;color:var(--brand-blue)}
.save-tip.guest{background:var(--yellow);border-color:var(--yellow-deep);color:var(--ink)}
.save-tip.guest svg{color:var(--accent-strong)}
</style>
