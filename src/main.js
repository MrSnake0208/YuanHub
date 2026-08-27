import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { init as authInit } from '@/store/auth.js'
import './styles/main.css'

// 滚动出现指令：进入视口时加上 .in（复刻原站 IntersectionObserver 动效）
const reveal = {
  mounted(el, binding) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('rv', 'in')
      return
    }
    const delay = binding.value && binding.value.delay ? binding.value.delay : 0
    if (delay) el.style.transitionDelay = delay + 'ms'
    el.classList.add('rv')
    const isEffectivelyHidden = () => {
      let node = el
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return true
        node = node.parentElement
      }
      return false
    }
    const startIntersectionObserver = () => {
      if (el.__revealIO || isEffectivelyHidden()) return false
      const io = new IntersectionObserver(es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            el.classList.add('in')
            io.unobserve(el)
          }
        })
      // 提前触发，避免移动端固定工具栏把主内容推到视口下方后长时间保持透明。
      }, { threshold: 0.12, rootMargin: '0px 0px 360px 0px' })
      io.observe(el)
      el.__revealIO = io
      return true
    }

    // v-show 的面板在挂载时可能仍是 display:none，等待面板切换为可见后再建立观察器。
    if (!startIntersectionObserver()) {
      const visibilityObserver = new MutationObserver(() => {
        if (startIntersectionObserver()) {
          visibilityObserver.disconnect()
          el.__revealVisibilityObserver = null
        }
      })
      visibilityObserver.observe(el.parentElement || document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true })
      el.__revealVisibilityObserver = visibilityObserver
    }
  },
  unmounted(el) {
    if (el.__revealIO) el.__revealIO.disconnect()
    if (el.__revealVisibilityObserver) el.__revealVisibilityObserver.disconnect()
  }
}

// 挂载前先恢复登录态（store/auth.js 在模块加载时已同步从 localStorage 恢复，
// init() 仅作幂等收口，保证刷新页面后导航守卫/侧边栏拿到的状态正确）
authInit()
const app = createApp(App)
app.directive('reveal', reveal)
app.use(router)
app.mount('#app')
