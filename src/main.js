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
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) {
          el.classList.add('in')
          io.unobserve(el)
        }
      })
    }, { threshold: 0.12 })
    io.observe(el)
    el.__revealIO = io
  },
  unmounted(el) {
    if (el.__revealIO) el.__revealIO.disconnect()
  }
}

// 挂载前先恢复登录态（store/auth.js 在模块加载时已同步从 localStorage 恢复，
// init() 仅作幂等收口，保证刷新页面后导航守卫/侧边栏拿到的状态正确）
authInit()
const app = createApp(App)
app.directive('reveal', reveal)
app.use(router)
app.mount('#app')
