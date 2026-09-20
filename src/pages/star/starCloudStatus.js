/** The visible status must reflect writer activity before the steady ready state. */
export function starCloudFeedback(state) {
  if (state?.loading) return { message: '正在读取云端星石状态…', error: '' }
  const failure = state?.writer?.error || state?.error
  if (failure) return { message: '', error: '星石云端保存失败，请重试。' }
  if (state?.replacing || state?.writer?.saving) return { message: '正在保存星石云端状态…', error: '' }
  if (state?.writer?.pending) return { message: '正在等待保存星石云端状态…', error: '' }
  if (state?.ready) return { message: '星石云端状态已保存', error: '' }
  return { message: '', error: '' }
}
