import { nextTick, onScopeDispose, ref, shallowRef } from 'vue'
import html2canvas from 'html2canvas'

export function useReceiptExport(receiptProps, showResult) {
  const exportBusy = ref(false)
  const exportSnapshot = shallowRef(null)
  const exportPanel = ref(null)
  let disposed = false
  onScopeDispose(() => { disposed = true })

  async function exportReceipt() {
    if (exportBusy.value) return
    // Props contain only JSON source/derived values. Freeze the click-time view,
    // including rate, quantity and rewards, before the first asynchronous wait.
    exportSnapshot.value = JSON.parse(JSON.stringify(receiptProps.value))
    exportBusy.value = true
    showResult('正在生成账单图片…')
    try {
      await nextTick()
      await document.fonts?.ready
      if (disposed) return
      const element = exportPanel.value?.receiptElement
      if (!element) throw new Error('Receipt export view is unavailable')
      const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#FFFDF6', useCORS: true })
      if (disposed) return
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `shopping-receipt-${exportSnapshot.value.version}.png`
      link.click()
      showResult('账单图片已生成，浏览器将开始下载。')
    } catch (_error) {
      if (!disposed) showResult('导出图片失败，请重试。', true)
    } finally {
      exportSnapshot.value = null
      exportBusy.value = false
    }
  }

  return { exportReceipt, exportBusy, exportSnapshot, exportPanel }
}
