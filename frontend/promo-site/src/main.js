import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initPwaInstall } from './pwaInstall.js'

// 尽早捕获浏览器安装事件；宣传页与未来主站共用同一 YuanHub PWA 身份。
initPwaInstall()

// 宣传页的 Service Worker 只维持安装生命周期，不缓存宣传内容，
// 以便未来正式主站接管同一域名时可以直接替换当前页面。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (error) {
      console.warn('[PWA] 宣传页 Service Worker 注册失败：', error)
    })
  })
}

createApp(App).mount('#app')
