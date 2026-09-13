import { ref, watch } from "vue";

// 页面标签独立保存；不可用或过期的缓存不影响页面使用。
export function usePersistedTab(storageKey, defaultTab, allowedTabs) {
  let initialTab = defaultTab;
  try {
    const saved = localStorage.getItem(storageKey);
    if (allowedTabs.includes(saved)) initialTab = saved;
  } catch {
    // 浏览器可能禁用本地存储。
  }
  const activeTab = ref(initialTab);
  watch(activeTab, (tab) => {
    if (!allowedTabs.includes(tab)) return;
    try {
      localStorage.setItem(storageKey, tab);
    } catch {
      // 写入失败时仍允许正常切换标签。
    }
  }, { flush: "sync" });
  return activeTab;
}
