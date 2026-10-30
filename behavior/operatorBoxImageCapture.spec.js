import { afterEach, expect, it, vi } from 'vitest'
import { prepareOperatorBoxImage } from '../src/utils/operatorBoxImageCapture.js'

afterEach(() => vi.restoreAllMocks())

it('converts modern computed colors and pseudo gradients only on the capture subtree', () => {
  const root = document.createElement('section'), card = document.createElement('article')
  root.append(card)
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), getImageData: () => ({ data: [255, 253, 246, 128] }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => ({
    content: pseudo === '::after' ? '""' : 'none',
    getPropertyValue: property => property === 'background-image' && pseudo === '::after'
      ? 'linear-gradient(color(srgb 1 .99 .96 / .5), transparent)'
      : property === 'color' ? 'color(srgb 1 .99 .96 / .5)' : '',
  }))
  prepareOperatorBoxImage(document, root)
  expect(card.style.color).toBe('rgba(255, 253, 246, 0.502)')
  expect(document.head.lastChild.textContent).toContain('linear-gradient(rgba(255, 253, 246, 0.5019607843137255), transparent)')
  expect(document.body.style.color).toBe('')
  document.head.lastChild.remove()
})

it('uses measured glyph positions for vertical names, including a supplementary Unicode character', () => {
  const root = document.createElement('section')
  root.innerHTML = '<div class="ledger-name-tab"><h3>徐𠮷</h3></div>'
  const name = root.querySelector('h3')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ writingMode: 'vertical-rl', content: 'none', getPropertyValue: () => '' })
  vi.spyOn(name, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 10, width: 26, height: 70 })
  const starts = []
  vi.spyOn(document, 'createRange').mockImplementation(() => ({
    setStart: (_, start) => starts.push(start), setEnd: vi.fn(),
    getBoundingClientRect: () => ({ left: 51, top: 10 + (starts.length - 1) * 35, width: 24, height: 32 }),
  }))
  prepareOperatorBoxImage(document, root)
  expect(starts).toEqual([0, 1])
  expect(name.textContent).toBe('徐𠮷')
  expect([...name.children].map(glyph => [glyph.style.left, glyph.style.top])).toEqual([['1px', '0px'], ['1px', '35px']])
  expect(name.style.height).toBe('70px')
  document.head.lastChild.remove()
})

it('refreshes the portrait overlay from the desktop clone instead of retaining mobile pseudo styles', () => {
  const root = document.createElement('section')
  root.innerHTML = '<picture class="ledger-portrait ___html2canvas___pseudoelement_after"><html2canvaspseudoelement style="height:10px"></html2canvaspseudoelement></picture>'
  const portrait = root.firstElementChild, overlay = portrait.firstElementChild
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
    if (node === portrait && pseudo === '::after' && !portrait.classList.contains('___html2canvas___pseudoelement_after')) {
      return { 0: 'position', 1: 'height', length: 2, getPropertyValue: key => key === 'position' ? 'absolute' : '258px' }
    }
    return { content: 'none', getPropertyValue: () => '' }
  })
  prepareOperatorBoxImage(document, root)
  expect(overlay.style.position).toBe('absolute')
  expect(overlay.style.height).toBe('258px')
  expect(portrait.classList.contains('___html2canvas___pseudoelement_after')).toBe(true)
  document.head.lastChild.remove()
})
