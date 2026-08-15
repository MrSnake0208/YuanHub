import { createRouter, createWebHistory } from 'vue-router'
import PlazaView from './views/PlazaView.vue'
import DetailView from './views/DetailView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'plaza', component: PlazaView },
    { path: '/work/:id', name: 'detail', component: DetailView, props: true }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 0 }
    return savedPosition || { top: 0 }
  }
})

export default router
