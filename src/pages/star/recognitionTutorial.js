export const recognitionGuidance = {
  upload: { id: 'upload', title: '先上传截图', body: '上传主星、辅星或经验星曜原始截图，我会陪你完成第一次识别。', target: '#file-drop-zone', help: 'screenshots' },
  classifying: { id: 'classifying', title: '正在判断截图分类', body: '图片已上传。分类完成后，检查它们所在的池即可。', target: '.thumbnail-card.is-classifying', scroll: 'preserve', help: 'screenshots' },
  classify: { id: 'classify', title: '检查并确认分类', body: '检查截图所在的池；分错了可拖到正确的池。确认本池或一键确认全部后，提示会自动继续。', target: '.import-pool:has(.is-unconfirmed) [data-confirm-pool]', relatedTargets: '[data-confirm-all-pools]', help: 'screenshots' },
  overlap: { id: 'overlap', title: '只标记重复的整行', body: '选择前图和后图，再添加关系。没有重复行就直接开始识别，不用在这里操作。', target: '.overlap-controls:focus-within [data-add-overlap]', scroll: 'preserve', help: 'overlap' },
  start: { id: 'start', title: '可以开始识别了', body: '点击「开始识别」。如果多张截图有重复整行，先添加重叠关系；没有就直接开始。', target: '[data-start-ocr]', help: 'overlap' },
}

// This is a read-only projection of the shipped embed's DOM, not a second workflow.
// Keep selectors covered by the real vendored-embed behavior test.
export function currentRecognitionGuidance(root) {
  const start = root?.querySelector('[data-start-ocr]')
  if (!start || root.querySelector('[role="dialog"], dialog[open]') || start.textContent.includes('取消识别')) return null
  const images = root.querySelectorAll('.thumbnail-card[data-import-image]')
  if (!images.length) return recognitionGuidance.upload
  if (root.querySelector('.thumbnail-card.is-classifying')) return recognitionGuidance.classifying
  if (root.querySelector('.thumbnail-card.is-unconfirmed')) return recognitionGuidance.classify
  const overlap = root.querySelector('.overlap-controls:focus-within [data-add-overlap]:not(:disabled)')
  if (overlap) return recognitionGuidance.overlap
  return start.disabled ? null : recognitionGuidance.start
}

const screenshotCrop = { x: 4, y: 17.5, width: 92, height: 16, aspect: 1260 * .92 / (2844 * .16) }
export const recognitionTutorialExamples = {
  screenshots: [
    { title: '主星截图：分类与完整星石行', src: '/tutorial/star/recognition-main-example.jpg', crops: [{ ...screenshotCrop, label: '保留「主星」分类、整行星石、等级、品质和名称' }], caption: '这里放大了分类与第一整行。实际上传请使用完整原图，保留上下界面，不要裁切、拼接或涂改。' },
    { title: '辅星截图：分类与完整星石行', src: '/tutorial/star/recognition-support-example.jpg', crops: [{ ...screenshotCrop, label: '保留「辅星」分类、整行星石、等级、品质和名称' }], caption: '确认处于辅星页，并保留完整星石行。实际上传完整原图。' },
    { title: '经验星曜截图：品质与数量', src: '/tutorial/star/recognition-exp-example.jpg', crops: [{ ...screenshotCrop, label: '保留经验星石分类，以及每种品质下方的数量' }], caption: '重点是每种品质下方的数量；上传一张完整清晰的经验星曜页面即可。' },
  ],
  overlap: [{ title: '重叠示例：同一整行只计一次', src: '/tutorial/star/recognition-overlap-example.jpg', crops: [
    { x: 1, y: 43, width: 45, height: 11, aspect: 1855 * .45 / (2160 * .11), label: '前图：下方重复行（太阳、太阳、巨门、巨门）' },
    { x: 52, y: 23, width: 45, height: 11, aspect: 1855 * .45 / (2160 * .11), label: '后图：上方同一行，名称、等级、品质与顺序一致' },
  ], caption: '对照框内的四颗星石：前图下方这一整行，又出现在后图上方。选择这两张图添加关系；同名星石不一定是同一颗，不要只凭名称标记。' }],
}

const sessionSeen = new Set()
export function tutorialStorageKey(userId) {
  return 'yuanhub:star-onboarding:v2:' + (userId == null || userId === '' ? 'guest' : encodeURIComponent(String(userId)))
}
export function tutorialSeen(key, storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage
    return sessionSeen.has(key) || storage?.getItem(key) === 'seen'
  } catch (_) { return sessionSeen.has(key) }
}
export function markTutorialSeen(key, storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage
    if (storage) { storage.setItem(key, 'seen'); return }
  } catch (_) { /* Keep the workspace usable if storage is blocked. */ }
  sessionSeen.add(key)
}
export function finishTutorial(key, reason, storage) {
  if (reason === 'complete' || reason === 'opt-out') markTutorialSeen(key, storage)
}
export function shouldAutoStartTutorial({ ready, importing, seen, hasHistory }) {
  return ready === true && importing === true && seen !== true && hasHistory === false
}

export function resolveTutorialTargets(root, step, viewport) {
  const targets = Array.from(root?.querySelectorAll(step.target) || []).filter(element => element.getBoundingClientRect().width > 0)
  const primary = targets.find(element => {
    const rect = element.getBoundingClientRect()
    return rect.bottom > viewport.top && rect.top < viewport.top + viewport.height
  }) || targets[0] || null
  return { primary, related: step.relatedTargets ? Array.from(root?.querySelectorAll(step.relatedTargets) || []) : [] }
}
export function shouldRevealTutorialTarget(step, rect, viewport) {
  if (!rect || step.scroll === 'preserve') return false
  return rect.bottom <= viewport.top || rect.top >= viewport.top + viewport.height
}
export function clipTutorialRect(rect, viewport, padding = 8) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || rect.right <= viewport.left || rect.left >= viewport.left + viewport.width || rect.bottom <= viewport.top || rect.top >= viewport.top + viewport.height) return null
  const left = Math.max(viewport.left, rect.left - padding), top = Math.max(viewport.top, rect.top - padding)
  const right = Math.min(viewport.left + viewport.width, rect.right + padding), bottom = Math.min(viewport.top + viewport.height, rect.bottom + padding)
  return { left, top, width: right - left, height: bottom - top, right, bottom }
}
export function tutorialCardPosition(target, size, viewport, relatedRects = [], preferredEdge = null) {
  const margin = 12, gap = 12
  const left = viewport.left + margin, top = viewport.top + margin
  const right = viewport.left + viewport.width - margin, bottom = viewport.top + viewport.height - margin
  const width = Math.min(size.width, right - left), height = Math.min(size.height, bottom - top)
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max))
  const make = (x, y, placement) => ({ left: clamp(x, left, right - width), top: clamp(y, top, bottom - height), placement })
  const candidates = target ? [
    make(target.right + gap, target.top, 'right'), make(target.left - gap - width, target.top, 'left'),
    make(target.left, target.bottom + gap, 'bottom'), make(target.left, target.top - gap - height, 'top'),
  ] : []
  candidates.push(make(right - width, bottom - height, 'bottom'), make(right - width, top, 'top'))
  const protectedRects = [target, ...relatedRects].filter(Boolean)
  const collision = candidate => protectedRects.reduce((area, rect) => area + Math.max(0, Math.min(candidate.left + width, rect.right) - Math.max(candidate.left, rect.left)) * Math.max(0, Math.min(candidate.top + height, rect.bottom) - Math.max(candidate.top, rect.top)), 0)
  if (preferredEdge) candidates.sort((a, b) => Number(b.placement === preferredEdge) - Number(a.placement === preferredEdge))
  const result = candidates.find(candidate => collision(candidate) === 0) || candidates.reduce((best, candidate) => collision(candidate) < collision(best) ? candidate : best)
  return { ...result, overlaps: collision(result) > 0 }
}
