<template>
  <Teleport to="body">
    <div v-if="open" class="preset-overlay" @click.self="cancel" @keydown.esc.prevent="cancel">
      <section class="preset-modal" role="dialog" aria-modal="true" aria-label="管理星石预设">
        <header class="preset-header"><div><p>星石装配</p><h2>管理预设</h2><span>每套 1–3 颗；主星、辅星各最多 20 套。</span></div><button type="button" :disabled="saving" aria-label="关闭预设管理" @click="cancel">×</button></header>
        <div class="preset-columns">
          <section v-for="kind in kinds" :key="kind.id" class="preset-column">
            <h3>{{ kind.label }}</h3>
            <div v-for="item in draft[kind.id]" :key="item.id" class="preset-edit">
              <input v-model="item.name" maxlength="64" aria-label="预设名称" placeholder="预设名称" />
              <input v-model="item.namesText" :aria-label="kind.label + '星石名称'" :placeholder="kind.example" @blur="normalizeRow(item, kind.id)" @keydown.enter.prevent="normalizeRow(item, kind.id)" />
              <button type="button" class="preset-delete" :aria-label="'删除' + (item.name || kind.label)" @click="remove(kind.id, item.id)">×</button>
            </div>
            <button type="button" class="preset-add" :disabled="draft[kind.id].length >= 20" @click="add(kind.id)">＋ 新增{{ kind.label }}</button>
          </section>
        </div>
        <p v-if="localError || cloudError" class="preset-error" role="alert">{{ localError || cloudError }}</p>
        <footer><button type="button" class="preset-secondary" :disabled="saving" @click="cancel">取消</button><button type="button" class="preset-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存预设' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { canonicalPresetNames } from '../../domain/starLoadoutUi.js'

const props = defineProps({
  open: Boolean,
  presets: { type: Object, default: function () { return { main: [], support: [] } } },
  saving: Boolean,
  cloudError: { type: String, default: '' },
  saveHandler: { type: Function, required: true },
})
const emit = defineEmits(['close'])
const kinds = [{ id: 'main', label: '主星预设', example: '天府 武曲 天机' }, { id: 'support', label: '辅星预设', example: '解神 文曲 天魁' }]
const draft = ref({ main: [], support: [] })
const localError = ref('')
let sequence = 0

watch(function () { return props.open }, function (open) {
  if (open) {
    draft.value = {
      main: cloneGroup(props.presets.main),
      support: cloneGroup(props.presets.support),
    }
    localError.value = ''
  }
})

function cloneGroup(source) {
  return (source || []).map(function (item) { return { id: item.id, name: item.name, namesText: (item.names || []).join(' ') } })
}
function add(kind) {
  if (draft.value[kind].length >= 20) return
  sequence += 1
  draft.value[kind].push({ id: kind + '-' + Date.now().toString(36) + '-' + sequence.toString(36), name: '', namesText: '' })
}
function remove(kind, id) { draft.value[kind] = draft.value[kind].filter(function (item) { return item.id !== id }); localError.value = '' }
function normalizeRow(item, kind) {
  const parsed = canonicalPresetNames(item.namesText, kind)
  if (parsed.valid) item.namesText = parsed.names.join(' ')
  return parsed
}
function cancel() { if (!props.saving) emit('close') }
async function save() {
  if (props.saving) return
  const next = { main: [], support: [] }
  for (const kind of ['main', 'support']) {
    for (const item of draft.value[kind]) {
      const parsed = normalizeRow(item, kind)
      if (!String(item.name || '').trim()) { localError.value = '预设名称不能为空'; return }
      if (!parsed.valid) { localError.value = String(item.name || '未命名预设').trim() + ' 的星石名称无效或重复'; return }
      next[kind].push({ id: item.id, name: String(item.name).trim(), names: parsed.names })
    }
  }
  localError.value = ''
  try {
    await props.saveHandler(next)
    emit('close')
  } catch (_) {
    // Cloud errors are rendered from the shared store; draft and modal stay intact.
  }
}
</script>

<style scoped>
.preset-overlay{position:fixed;inset:0;z-index:101;display:grid;place-items:center;padding:24px;background:rgba(73,59,44,.42);backdrop-filter:blur(4px)}.preset-modal{display:flex;flex-direction:column;width:min(720px,100%);max-height:min(82dvh,760px);overflow:hidden;border:1px solid var(--line,#decdb8);border-radius:22px;background:var(--surface,#fffdf6);box-shadow:0 40px 100px -30px rgba(73,59,44,.5);color:var(--ink,#493b2c)}.preset-header,.preset-modal footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;background:var(--surface,#fffdf6)}.preset-header{border-bottom:1.5px dashed var(--line,#decdb8)}.preset-header p{margin:0 0 3px;color:var(--ink-60,#897666);font:800 11px var(--font-b,inherit)}.preset-header h2{margin:0;font:900 21px var(--font-s,serif)}.preset-header span{display:block;margin-top:4px;color:var(--ink-60,#897666);font:700 12px var(--font-b,inherit)}.preset-header button{border:0;background:transparent;color:var(--ink,#493b2c);font-size:25px;cursor:pointer}.preset-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;overflow:auto;padding:14px 20px}.preset-column+.preset-column{border-left:1.5px dashed var(--line,#decdb8);padding-left:18px}.preset-column h3{margin:0 0 10px;font:900 14px var(--font-b,inherit)}.preset-edit{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.65fr) 30px;gap:7px;margin-bottom:8px}.preset-edit input{min-width:0;min-height:40px;border:1px solid var(--line,#decdb8);border-radius:10px;background:var(--surface,#fffdf6);padding:7px 9px;color:var(--ink,#493b2c);font:700 12px var(--font-b,inherit);outline:0}.preset-edit input:focus{border-color:var(--accent,#d78935);box-shadow:0 0 0 3px rgba(199,138,70,.11)}.preset-delete{width:30px;min-height:30px;align-self:center;border:0;border-radius:9px;background:transparent;color:var(--ink-60,#897666);font-size:20px;cursor:pointer}.preset-delete:hover{background:#f4e7d5;color:var(--ink,#493b2c)}.preset-add,.preset-secondary,.preset-primary{min-height:38px;border-radius:10px;padding:7px 12px;font:800 12px var(--font-b,inherit);cursor:pointer}.preset-add,.preset-secondary{border:1px solid var(--line-strong,#b89568);background:transparent;color:var(--ink,#493b2c)}.preset-add:hover:not(:disabled),.preset-secondary:hover:not(:disabled){background:#f4e7d5}.preset-primary{border:1px solid var(--tea,#5a4633);background:var(--tea,#5a4633);color:var(--cream,#fff8ec)}.preset-add:disabled,.preset-secondary:disabled,.preset-primary:disabled,.preset-header button:disabled{cursor:not-allowed;opacity:.5}.preset-modal footer{border-top:1.5px dashed var(--line,#decdb8);justify-content:flex-end}.preset-error{margin:0;padding:0 20px 12px;color:var(--rouge,#a6514a);font:700 12px var(--font-b,inherit)}@media(max-width:600px){.preset-overlay{padding:0}.preset-modal{width:100%;height:100dvh;max-height:none;border-radius:0}.preset-columns{grid-template-columns:1fr;gap:18px}.preset-column+.preset-column{border-top:1.5px dashed var(--line,#decdb8);border-left:0;padding-top:18px;padding-left:0}.preset-edit{grid-template-columns:minmax(0,1fr) minmax(0,1.45fr) 36px}.preset-edit input{min-height:44px;font-size:14px}}
</style>
