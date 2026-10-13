// Component smoke on the existing Vite service; synthetic props only, all application API calls intercepted.
// Full viewport/device and real preview/import journeys remain part of batch acceptance.
async (page) => {
  await page.route('**/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status_code: 200, data: [] }) }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/feedback/plaza')
  await page.evaluate(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js')
    const { default: Form } = await import('/src/components/operator/OperatorScanReviewForm.vue')
    const { dialog } = await import('/src/utils/dialog.js')
    const { operatorScanReviewFixture } = await import('/test-support/operatorScanReviewFixtures.js')
    const fixture = operatorScanReviewFixture('oddity')
    document.querySelector('#app').setAttribute('hidden', '')
    const root = document.createElement('div'); root.id = 'operator-review-synthetic'; document.body.append(root)
    createApp({ setup() {
      const previews = ref(0)
      return () => h('main', { class: 'wrap', style: 'padding:16px' }, [
        h(Form, { ...fixture, accountName: '合成账号', onPreview: () => { previews.value++ },
          onClose: () => dialog.confirm({ title: '放弃未保存修改？', message: '合成组件检查：取消后继续复核。', type: 'danger' }) }),
        h('p', { id: 'synthetic-preview-count' }, '表单预览动作 ' + previews.value),
      ])
    } }).mount(root)
  })
  const checkOverflow = async () => {
    const result = await page.locator('#operator-review-synthetic').evaluate(root => ({ width: innerWidth, document: document.documentElement.scrollWidth, component: root.scrollWidth }))
    if (result.document > result.width || result.component > result.width) throw new Error('Review overflow: ' + JSON.stringify(result))
    return result
  }
  const initial = await checkOverflow()
  await page.screenshot({ path: '.ux/audits/assets/usability-operator-review-initial.png', fullPage: true })
  await page.getByLabel('修正后的攻击奇闻', { exact: true }).fill('351')
  await page.getByRole('button', { name: '校验并预览', exact: true }).click()
  if (!await page.locator('.errors').evaluate(element => element === document.activeElement)) throw new Error('Validation summary did not receive focus')
  await page.screenshot({ path: '.ux/audits/assets/usability-operator-review-error.png', fullPage: true })
  await page.locator('.errors a').click()
  if (!await page.getByLabel('修正后的攻击奇闻', { exact: true }).evaluate(element => element === document.activeElement)) throw new Error('Error link did not focus the field')
  await page.getByLabel('修正后的攻击奇闻', { exact: true }).fill('350')
  await page.getByRole('button', { name: '校验并预览', exact: true }).click()
  if (!await page.locator('#synthetic-preview-count').textContent().then(text => text.includes('1'))) throw new Error('Valid form did not emit preview')
  await page.getByLabel('复核化极星级与节点').selectOption('13')
  await page.getByRole('button', { name: '取消复核', exact: true }).click()
  await page.locator('.dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.dialog').waitFor({ state: 'hidden' })
  if (await page.getByLabel('复核化极星级与节点').inputValue() !== '13') throw new Error('Escape discarded lower form input')
  await page.screenshot({ path: '.ux/audits/assets/usability-operator-review-mid-flow.png', fullPage: true })
  const controls = await page.locator('.scan-review-form button:visible').evaluateAll(elements => elements.map(element => ({ label: element.textContent || element.getAttribute('aria-label'), height: element.getBoundingClientRect().height })))
  if (controls.some(control => control.height < 44)) throw new Error('Touch target too short: ' + JSON.stringify(controls))
  return { viewport: initial.width, overflow: await checkOverflow(), controls, scope: 'synthetic component only; no persistence/device acceptance' }
}
