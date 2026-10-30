// The export template uses plain RGB colors and no filters or repeating gradients.
export async function prepareOperatorBoxImage(document, root) {
  const view = document.defaultView
  // html2canvas copies pseudo styles from the live viewport before creating its desktop clone.
  for (const portrait of root.querySelectorAll('.ledger-portrait')) {
    // A phone's live styles may have no ::after at all; materialize it in the desktop clone.
    const overlay = portrait.querySelector('html2canvaspseudoelement') || document.createElement('html2canvaspseudoelement')
    if (!overlay.parentNode) portrait.append(overlay)
    const hidden = '___html2canvas___pseudoelement_after'
    portrait.classList.remove(hidden)
    const computed = view.getComputedStyle(portrait, '::after')
    for (const property of Array.from(computed)) {
      if (property !== 'content') overlay.style.setProperty(property, computed.getPropertyValue(property))
    }
    portrait.classList.add(hidden)
  }
  // html2canvas does not paint writing-mode. Preserve the browser's actual glyph positions.
  const vertical = [...root.querySelectorAll('.ledger-name-tab > h3, .ledger-prof-tab > span')].map(node => {
    if (view.getComputedStyle(node).writingMode !== 'vertical-rl') return null
    const bounds = node.getBoundingClientRect(), glyphs = []
    const walker = document.createTreeWalker(node, 4)
    while (walker.nextNode()) {
      const text = walker.currentNode
      let offset = 0
      for (const char of text.textContent) {
        const range = document.createRange()
        range.setStart(text, offset); offset += char.length; range.setEnd(text, offset)
        const rect = range.getBoundingClientRect()
        glyphs.push({ char, left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height })
      }
    }
    return { node, bounds, glyphs }
  }).filter(Boolean)
  for (const { node, bounds, glyphs } of vertical) {
    node.replaceChildren()
    Object.assign(node.style, { position: 'relative', display: 'block', writingMode: 'horizontal-tb', width: `${bounds.width}px`, height: `${bounds.height}px`, maxHeight: 'none' })
    for (const glyph of glyphs) {
      const span = document.createElement('span')
      span.textContent = glyph.char
      // Inline !important also overrides the overview's special SP continuation selectors.
      span.style.cssText = `position:absolute!important;display:flex!important;align-items:center;justify-content:center;writing-mode:horizontal-tb!important;letter-spacing:0;line-height:1;left:${glyph.left}px;top:${glyph.top}px;width:${glyph.width}px;height:${glyph.height}px`
      node.append(span)
    }
  }
}
