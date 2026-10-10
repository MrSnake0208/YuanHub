// Manual activation keeps arrow navigation from loading data or discarding drafts.
export function onWorkspaceTabKeydown(event) {
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
  const index = tabs.indexOf(event.target);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
}

export function onWorkspaceTabFocus(event) {
  if (event.type === 'focusout' && event.currentTarget.contains(event.relatedTarget)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
  const entry = event.type === 'focusin' ? event.target
    : tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0];
  tabs.forEach(tab => { tab.tabIndex = tab === entry ? 0 : -1; });
}
