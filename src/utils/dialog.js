// 弹窗状态管理（Vue reactive 单例，无 pinia）
// ------------------------------------------------------------
// 项目风格的自定义弹窗（alert / confirm / prompt），替代系统/浏览器弹窗。
// 组件：src/components/AppDialog.vue（在 App.vue 只挂载一次，Teleport 到 body）
//
// 页面调用：
//   import { dialog } from '@/utils/dialog.js'
//   await dialog.alert({ title: '提示', message: '...' })
//   const ok = await dialog.confirm({ title, message, type: 'danger', confirmText: '删除' })
//   const name = await dialog.prompt({ title, message, value: '默认值' })
//
// 返回值：
//   alert()  → 恒为 true
//   confirm()→ true 确定 / false 取消
//   prompt() → 输入字符串（trim 后） / null 取消
//
// 可选参数：
//   title / message / type('info'|'danger'|'success') /
//   confirmText / cancelText / placeholder / value / inputLabel / requiredValue（后四项仅 prompt）
import { reactive } from 'vue'

const state = reactive({
  visible: false,
  mode: 'alert', // 'alert' | 'confirm' | 'prompt'
  type: 'info', // 'info' | 'danger' | 'success'
  title: '',
  message: '',
  confirmText: '',
  cancelText: '',
  placeholder: '',
  inputLabel: '',
  requiredValue: '',
  value: '', // 输入框初始值
  input: '' // 输入框实时值
})

let resolveFn = null

function normalize(options) {
  return typeof options === 'string' ? { message: options } : (options || {})
}

function open(opts) {
  Object.assign(state, {
    visible: true,
    mode: opts.mode || 'alert',
    type: opts.type || 'info',
    title: opts.title || '',
    message: opts.message || '',
    confirmText: opts.confirmText || (opts.mode === 'alert' ? '知道了' : '确定'),
    cancelText: opts.cancelText || '取消',
    placeholder: opts.placeholder || '',
    inputLabel: opts.inputLabel || '',
    requiredValue: opts.requiredValue != null ? String(opts.requiredValue) : '',
    value: opts.value != null ? String(opts.value) : '',
    input: opts.value != null ? String(opts.value) : ''
  })
  return new Promise(function (resolve) {
    resolveFn = resolve
  })
}

// 结果只结算一次；关闭动画期间再次触发视为无操作
function settle(result) {
  state.visible = false
  if (resolveFn) resolveFn(result)
  resolveFn = null
}

function confirm() {
  if (state.mode === 'prompt') return settle(state.input.trim())
  return settle(true)
}

function cancel() {
  if (state.mode === 'alert') return settle(true) // 纯提示：关闭即视为已读
  if (state.mode === 'confirm') return settle(false)
  return settle(null) // prompt：取消
}

export const dialog = {
  alert(options) { return open(Object.assign({ mode: 'alert' }, normalize(options))) },
  confirm(options) { return open(Object.assign({ mode: 'confirm' }, normalize(options))) },
  prompt(options) { return open(Object.assign({ mode: 'prompt' }, normalize(options))) },
  // AppDialog 组件专用（勿在页面直接使用）
  _state: state,
  _confirm: confirm,
  _cancel: cancel
}
