// Host copy adaptation keeps the committed OCR bundle and its provenance intact.
const retiredCopy = '图片识别在本机完成；MaaYuan 截图从临时服务器读取。'
const localCopy = '图片识别在本机完成；手动截图由浏览器读取。'

export function observeLocalOcrProgressCopy(root) {
  if (!root) return null
  const update = () => {
    for (const note of root.querySelectorAll('#import-progress-panel > small:not(.import-error)')) {
      if (note.textContent === retiredCopy) note.textContent = localCopy
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  update()
  return observer
}
