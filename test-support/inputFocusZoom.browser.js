// Run against the existing Vite service with: playwright-cli run-code --filename=test-support/inputFocusZoom.browser.js
// Chromium expands the iOS rule to check its cascade; this cannot verify the iOS keyboard or page scale.
async (page) => {
  await page.goto('http://127.0.0.1:5173/login')
  await page.locator('#login-email').waitFor()
  const platform = await page.evaluate(async () => {
    await import('/src/styles/feedback-workspace.css')
    const pool = (await import('/src/pages/recruitment/PoolEditor.vue')).default
    const operator = (await import('/src/pages/operator/index.vue')).default
    const beta = (await import('/src/pages/admin/beta.vue')).default
    const fixture = document.createElement('div')
    fixture.id = 'input-font-fixture'
    fixture.style.cssText = 'width:min(100%,360px);padding:12px;font-size:12px'
    const samples = [
      ['<div class="search"><input aria-label="搜索"></div>'],
      ['<textarea class="feedback-form-control" aria-label="反馈"></textarea>'],
      ['<div class="feedback-filter"><select aria-label="筛选"><option>全部</option></select></div>'],
      ['<div class="modal"><input aria-label="弹窗输入"></div>'],
      ['<div role="dialog"><input style="font:12px sans-serif" aria-label="Popover 输入"></div>'],
      ['<div contenteditable="true" style="font-size:12px">编辑正文</div>'],
      ['<div contenteditable="" style="font-size:12px">空值编辑属性</div>'],
      ['<div contenteditable="plaintext-only" style="font-size:12px">纯文本编辑</div>'],
      ['<div class="remaining-input"><input type="number" data-expected="20" aria-label="余量"></div>', pool.__scopeId],
      ['<div class="pull-count-field"><input type="number" data-expected="18" aria-label="招募次数"></div>', pool.__scopeId],
      ['<div class="editor-head-stat"><input type="number" aria-label="养成数值"></div>', operator.__scopeId],
      ['<div class="agent-ledger-card--editable agent-ledger-card--v2 agent-ledger-card--v3"><div class="share-card-stats is-enabled"><input class="ledger-combat-value" type="number" aria-label="卡片数值"><div class="ledger-oddity"><input type="number" aria-label="奇点数值"></div></div></div>', operator.__scopeId],
      ['<div class="capacity-input"><input type="number" data-expected="18" aria-label="容量"></div>', beta.__scopeId],
      ['<input type="checkbox" style="font-size:12px" data-excluded>'],
      ['<button style="font-size:12px" data-excluded>按钮</button>'],
      ['<div contenteditable="false" style="font-size:12px" data-excluded>只读正文</div>']
    ]
    for (const [html, scope] of samples) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = html
      if (scope) wrapper.querySelectorAll('*').forEach(el => el.setAttribute(scope, ''))
      fixture.append(wrapper)
    }
    // Outside #app, like a Teleport target.
    document.body.append(fixture)
    const baselineEmailFont = getComputedStyle(document.querySelector('#login-email')).fontSize
    const ios = CSS.supports('-webkit-touch-callout', 'none')
    const rule = [...document.styleSheets].flatMap(sheet => {
      try { return [...sheet.cssRules] } catch { return [] }
    }).find(rule => rule.conditionText === '(-webkit-touch-callout: none)')
    if (!rule) throw new Error('Missing iOS input font rule')
    if (!ios) {
      const style = document.createElement('style')
      style.id = 'expanded-ios-rule'
      style.textContent = [...rule.cssRules].map(rule => rule.cssText).join('\n')
      document.head.append(style)
    }
    return { nativeIosFeature: ios, expandedForCascadeCheck: !ios, baselineEmailFont }
  })
  const results = []
  for (const width of [320, 390, 844, 1440]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 })
    const result = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('#login-email,#login-password,#input-font-fixture input:not([data-excluded]),#input-font-fixture textarea,#input-font-fixture select,#input-font-fixture [contenteditable]:not([data-excluded])')]
      const fonts = controls.map(el => {
        const before = parseFloat(getComputedStyle(el).fontSize)
        if (before < 16) throw new Error(`${el.outerHTML}: font ${before} < 16`)
        if (el.dataset.expected && before !== Number(el.dataset.expected)) throw new Error('Large input font changed')
        if (el.closest('.editor-head-stat') && before !== (innerWidth <= 640 ? 22 : 23)) throw new Error('Responsive numeric font changed')
        el.focus()
        if (getComputedStyle(el).fontSize !== `${before}px`) throw new Error('Focus changed font')
        el.blur()
        if (getComputedStyle(el).fontSize !== `${before}px`) throw new Error('Blur changed font')
        return before
      })
      for (const el of document.querySelectorAll('[data-excluded]')) {
        if (getComputedStyle(el).fontSize !== '12px') throw new Error('Non-text control or readonly content changed')
      }
      const viewport = document.querySelector('meta[name=viewport]').content
      if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=/i.test(viewport)) throw new Error('Viewport restricts zoom')
      if (document.documentElement.scrollWidth > innerWidth) throw new Error('Page overflow')
      return { width: innerWidth, fonts, overflow: false }
    })
    results.push(result)
  }
  return { platform, results }
}
