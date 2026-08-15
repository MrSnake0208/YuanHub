import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'

// 滚动出现指令：进入视口时加上 .in（复刻原站 IntersectionObserver 动效）
const reveal = {
  mounted(el, binding) {
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

const app = createApp(App)
app.directive('reveal', reveal)
app.use(router)
app.mount('#app')
