import { afterEach, describe, expect, it } from 'vitest'
import { observeLocalOcrProgressCopy } from '../src/pages/star/localOcrProgressCopy.js'

const old = '图片识别在本机完成；MaaYuan 截图从临时服务器读取。'
const local = '图片识别在本机完成；手动截图由浏览器读取。'
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
let observer

afterEach(() => { observer?.disconnect(); document.body.replaceChildren() })
describe('local OCR progress copy', () => {
  it('adapts initial and rerendered legacy hints without changing status or errors', async () => {
    document.body.innerHTML = `<div id="host"><article id="import-progress-panel"><small>${old}</small></article><small>${old}</small></div>`
    const root = document.querySelector('#host')
    observer = observeLocalOcrProgressCopy(root)
    const panel = root.querySelector('#import-progress-panel')
    expect(panel.textContent).toBe(local)
    expect(root.lastElementChild.textContent).toBe(old)
    panel.innerHTML = `<small>${old}</small>`
    await settle()
    expect(panel.textContent).toBe(local)
    panel.innerHTML = '<small>正在加载识别模型</small><small class="import-error">识别失败，请重试</small>'
    await settle()
    expect(panel.textContent).toBe('正在加载识别模型识别失败，请重试')
    observer.disconnect()
    panel.innerHTML = `<small>${old}</small>`
    await settle()
    expect(panel.textContent).toBe(old)
  })
})
