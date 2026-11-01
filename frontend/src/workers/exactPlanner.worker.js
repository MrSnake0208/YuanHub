import { solveExactPlanner } from '../data/exactPlanner.js'

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ type: 'progress', message: '正在加载全局最优求解器…' })
    const { default: loadHighs } = await import(/* @vite-ignore */ data.solverUrl)
    const solver = await loadHighs({ locateFile: file => new URL(file, data.solverUrl).href })
    const result = solveExactPlanner(data.input, solver, {
      timeLimitMs: Math.min(120000, Math.max(1000, Number(data.timeLimitMs) || 30000)),
      onProgress: progress => self.postMessage({ type: 'progress', ...progress })
    })
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || '全局最优计算失败' })
  }
}
