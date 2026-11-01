export function quickDraftSignature(checked, form) {
  return JSON.stringify([checked || [], checked?.length ? form : null])
}
