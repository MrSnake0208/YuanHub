// Adapt computed overview styles only in html2canvas's clone; never change the live cards.
export async function prepareOperatorBoxImage(document, root) {
  const view = document.defaultView
  // html2canvas ignores CSS filters; bake the overview's portrait filter into the clone.
  for (const image of root.querySelectorAll('.ledger-portrait img')) {
    const filter = view.getComputedStyle(image).filter
    if (!filter || filter === 'none') continue
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
    // shortcut: browsers without Canvas filters retain the source colors; recheck if supported targets change.
    if (!('filter' in context)) continue
    try {
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.filter = filter
      context.drawImage(image, 0, 0)
      image.src = canvas.toDataURL('image/png')
      image.style.filter = 'none'
      await image.decode()
    } finally { canvas.width = canvas.height = 0 }
  }
  // html2canvas copies pseudo styles from the live viewport before creating its desktop clone.
  for (const portrait of root.querySelectorAll('.ledger-portrait')) {
    const overlay = portrait.querySelector('html2canvaspseudoelement')
    if (!overlay) continue
    const hidden = '___html2canvas___pseudoelement_after'
    portrait.classList.remove(hidden)
    const computed = view.getComputedStyle(portrait, '::after')
    for (const property of Array.from(computed)) {
      if (property !== 'content') overlay.style.setProperty(property, computed.getPropertyValue(property))
    }
    portrait.classList.add(hidden)
  }
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const colors = new Map()
  const compatibleColors = value => value.replace(/(?:color(?:-mix)?|oklab|oklch|lab|lch)\([^)]*\)/g, color => {
    if (!colors.has(color)) {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      colors.set(color, `rgba(${r}, ${g}, ${b}, ${a / 255})`)
    }
    return colors.get(color)
  })
  const properties = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'box-shadow', 'text-shadow']
  const pseudoStyles = []
  for (const [index, node] of [root, ...root.querySelectorAll('*')].entries()) {
    const style = view.getComputedStyle(node)
    for (const property of properties) {
      const value = style.getPropertyValue(property)
      const converted = compatibleColors(value)
      if (converted !== value) node.style.setProperty(property, converted, 'important')
    }
    for (const pseudo of ['::before', '::after']) {
      const computed = view.getComputedStyle(node, pseudo)
      if (!computed.content || ['none', 'normal'].includes(computed.content)) continue
      const declarations = properties.flatMap(property => {
        const value = computed.getPropertyValue(property), converted = compatibleColors(value)
        return converted === value ? [] : [`${property}:${converted}!important`]
      })
      if (declarations.length) {
        node.setAttribute('data-box-capture', index)
        pseudoStyles.push(`[data-box-capture="${index}"]${pseudo}{${declarations.join(';')}}`)
      }
    }
  }
  const styles = document.createElement('style')
  styles.textContent = pseudoStyles.join('\n')
  document.head.append(styles)

  // html2canvas does not paint writing-mode. Preserve the browser's actual glyph positions.
  const vertical = [...root.querySelectorAll('.ledger-name-tab > h3, .ledger-prof-tab > span, .ledger-status-button > span')].map(node => {
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
