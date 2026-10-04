export const recognitionTutorialSteps = [
  { id: 'upload', title: '导入截图', body: '可以手动上传，也可以接收 MaaYuan 自动采集的截图。\n手动上传请使用原始截图，不要裁剪、拼接或涂改，并保留上下界面。', target: '.file-picker-panel', exampleAction: 'screenshots', exampleLabel: '查看截图示例' },
  { id: 'classify', title: '检查分类', body: '系统会自动推荐截图分类。\n如果分错了，拖到正确的池里即可。', target: '.import-pools' },
  { id: 'confirm', title: '确认分类', body: '可以逐池点击「确认本池」，也可以使用下方的「一键确认全部分类」。', target: '[data-confirm-pool]', relatedTargets: '[data-confirm-pool], [data-confirm-all-pools]' },
  { id: 'overlap', title: '重复行标记', body: '多张截图有同一整行星石时，补充前后两张图的重叠关系。\n没有重复就直接跳过。', target: '.overlap-grid', exampleAction: 'overlap', exampleLabel: '查看重叠示例' },
  { id: 'start', title: '开始识别', body: '完成前面的检查后，点击「开始识别」。', target: '[data-start-ocr]' },
  { id: 'progress', title: '查看识别进度', body: '识别进度会显示在这里。第一次模型下载会比较缓慢。\n完成后会进入背包整理，再核对识别结果。', target: '#import-progress-panel' },
]

export const recognitionTutorialExamples = {
  screenshots: [
    { title: '主星截图示例', src: '/tutorial/star/recognition-main-example.jpg' },
    { title: '辅星截图示例', src: '/tutorial/star/recognition-support-example.jpg' },
    { title: '经验星曜截图示例', src: '/tutorial/star/recognition-exp-example.jpg' },
  ],
  overlap: [{ title: '重叠示例', src: '/tutorial/star/recognition-overlap-example.jpg', caption: '紫色框部分是两张截图中重复出现的同一整行。选择前一张和后一张后，添加关系即可。' }],
}

export function tutorialStepIndex(index, delta) {
  return Math.max(0, Math.min(recognitionTutorialSteps.length - 1, index + delta))
}

const sessionSeen = new Set()
export function tutorialStorageKey(userId) {
  return 'yuanhub:star-recognition:v1:' + (userId == null || userId === '' ? 'guest' : encodeURIComponent(String(userId)))
}
export function tutorialSeen(key, storage = globalThis.localStorage) {
  try { return sessionSeen.has(key) || storage?.getItem(key) === 'seen' } catch (_) { return sessionSeen.has(key) }
}
export function markTutorialSeen(key, storage = globalThis.localStorage) {
  sessionSeen.add(key)
  try { storage?.setItem(key, 'seen') } catch (_) { /* Storage failure never blocks the workspace. */ }
}
export function shouldAutoStartTutorial({ ready, importing, seen, hasHistory }) {
  return ready === true && importing === true && seen !== true && hasHistory === false
}

export function resolveTutorialTargets(root, step, viewportHeight) {
  const targets = Array.from(root?.querySelectorAll(step.target) || []).filter(element => element.getBoundingClientRect().width > 0)
  // Prefer a confirm button already visible; never scroll to every related button.
  const primary = targets.find(element => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom < viewportHeight * 0.65
  }) || targets[0] || null
  return { primary, related: step.relatedTargets ? Array.from(root?.querySelectorAll(step.relatedTargets) || []) : [] }
}

export function clipTutorialRect(rect, viewport, padding = 8) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || rect.right <= viewport.left || rect.left >= viewport.left + viewport.width || rect.bottom <= viewport.top || rect.top >= viewport.top + viewport.height) return null
  const left = Math.max(viewport.left, rect.left - padding), top = Math.max(viewport.top, rect.top - padding)
  const right = Math.min(viewport.left + viewport.width, rect.right + padding), bottom = Math.min(viewport.top + viewport.height, rect.bottom + padding)
  return { left, top, width: right - left, height: bottom - top, right, bottom }
}

export function tutorialCardPosition(target, size, viewport, relatedRects = []) {
  const margin = 12, gap = 16
  const left = viewport.left + margin, top = viewport.top + margin
  const right = viewport.left + viewport.width - margin, bottom = viewport.top + viewport.height - margin
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2))
  const height = Math.min(size.height, Math.max(0, viewport.height - margin * 2))
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)))
  let x = right - width, y = bottom - height, placement = 'fallback'
  if (target) {
    if (target.right + gap + width <= right) { x = target.right + gap; y = target.top; placement = 'right' }
    else if (target.left - gap - width >= left) { x = target.left - gap - width; y = target.top; placement = 'left' }
    else if (target.bottom + gap + height <= bottom) { x = target.left; y = target.bottom + gap; placement = 'bottom' }
    else if (target.top - gap - height >= top) { x = target.left; y = target.top - gap - height; placement = 'top' }
    // An oversized target occupies the viewport. Keep navigation accessible.
  }
  x = clamp(x, left, right - width)
  y = clamp(y, top, bottom - height)
  const overlapsRelated = candidateY => relatedRects.some(rect => x < rect.right && x + width > rect.left && candidateY < rect.bottom && candidateY + height > rect.top)
  if (overlapsRelated(y)) {
    const candidates = relatedRects.flatMap(rect => [rect.bottom + gap, rect.top - gap - height])
      .filter(candidate => candidate >= top && candidate + height <= bottom && !overlapsRelated(candidate))
      .sort((a, b) => Math.abs(a - y) - Math.abs(b - y))
    y = candidates[0] ?? y
  }
  return { left: x, top: y, placement }
}

export function clampTutorialLift(lift, viewportHeight, cardHeight, safeArea = {}) {
  const top = Math.max(0, safeArea.top || 0), bottom = Math.max(0, safeArea.bottom || 0)
  return Math.max(0, Math.min(lift, 140, Math.max(0, viewportHeight - cardHeight - 24 - top - bottom)))
}
