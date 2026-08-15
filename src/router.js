import { createRouter, createWebHistory } from 'vue-router'
import PlazaView from './views/PlazaView.vue'
import DetailView from './views/DetailView.vue'
import CartView from './views/CartView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'plaza', component: PlazaView, meta: { title: '作业广场 — MaaYuan Share' } },
    { path: '/work/:id', name: 'detail', component: DetailView, props: true, meta: { title: '通关作业 — MaaYuan Share' } },
    { path: '/cart', name: 'cart', component: CartView, meta: { title: '广陵账房 · 礼包计算器 — MaaYuan Share' } }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 0 }
    return savedPosition || { top: 0 }
  }
})

router.afterEach((to) => {
  if (to.meta.title) document.title = to.meta.title
})

export default router
