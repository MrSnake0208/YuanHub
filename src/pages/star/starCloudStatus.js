function message(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** The visible status must reflect writer activity before the steady ready state. */
export function starCloudFeedback(state) {
  if (state?.loading) return { message: '正在读取云端星石状态…', error: '' }
  const failure = state?.inventory?.error || state?.workspace?.error || state?.error
  if (failure) return { message: '', error: message(failure, '星石云端保存失败；可点击同步背包重试。') }
  if (state?.inventory?.saving || state?.workspace?.saving) return { message: '正在保存星石云端状态…', error: '' }
  if (state?.inventory?.pending || state?.workspace?.pending) return { message: '正在等待保存星石云端状态…', error: '' }
  if (state?.ready) return { message: '星石云端状态已保存', error: '' }
  return { message: '', error: '' }
}
