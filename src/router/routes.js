import INDEX from '/src/pages/index.vue'
import WORK_DETAIL from '/src/pages/work/detail.vue'
import CART from '/src/pages/tools/cart.vue'
import INVENTORY from '/src/pages/inventory/index.vue'

// {
//     path: '/',  访问路径
//     text: '作业广场',  导航展示的文本
//     name: 'plaza',  路由名称
//     display: true,   是否展示在导航栏
//     module: 'plaza',  在导航栏中所属的模块
//     icon: "grid", 导航栏上的图标
//     component: INDEX  //引入对应的页面①
//     component: () => import('/src/pages/tools/cart.vue') //引入对应的页面② 这种引入在不访问对应路径时，不会加载js
// },

export const routes = [
    {
        // 作业广场暂时隐藏：/ 重定向到广陵账房；恢复时删除 redirect 并把 display 改回 true
        path: '/',
        redirect: '/cart',
        text: '作业广场',
        name: 'plaza',
        display: false,
        module: 'plaza',
        icon: 'grid',
        component: INDEX,
        meta: {
            title: '作业广场 — YuanHub'
        }
    },
    {
        path: '/work/:id',
        text: '通关作业',
        name: 'detail',
        display: false,
        module: 'work',
        icon: 'file-text',
        component: () => import('/src/pages/work/detail.vue'),
        props: true,
        meta: {
            title: '通关作业 — YuanHub'
        }
    },
    {
        path: '/cart',
        text: '广陵账房 · 礼包计算器',
        name: 'cart',
        display: true,
        module: 'tools',
        icon: 'shopping-cart',
        component: CART,
        meta: {
            title: '广陵账房 · 礼包计算器 — YuanHub'
        }
    },
    {
        path: '/inventory',
        text: '库存',
        name: 'inventory',
        display: true,
        module: 'tools',
        icon: 'package-open',
        component: INVENTORY,
        meta: {
            title: '库存 — YuanHub'
        }
    },
    {
        path: '/operator',
        text: '密探',
        name: 'operator',
        display: true,
        module: 'tools',
        icon: 'users',
        component: () => import('/src/pages/operator/index.vue'),
        meta: {
            title: '密探 — YuanHub'
        }
    },
    {
        path: '/operator/quick',
        text: '快捷导入',
        name: 'operator-quick',
        display: false,
        module: 'tools',
        icon: 'zap',
        component: () => import('/src/pages/operator/quick.vue'),
        meta: {
            title: '快捷导入 — YuanHub'
        }
    },
    {
        path: '/operator/admin',
        text: '密探图鉴管理',
        name: 'operator-admin',
        display: false,
        module: 'tools',
        icon: 'shield',
        component: () => import('/src/pages/operator/admin.vue'),
        meta: {
            title: '密探图鉴管理 — YuanHub',
            requiresAuth: true,
            requiresAdmin: true
        }
    },
    {
        path: '/login',
        text: '登录',
        name: 'login',
        display: false,
        module: 'user',
        icon: 'log-in',
        component: () => import('/src/pages/user/login.vue'),
        meta: {
            title: '登录 — YuanHub'
        }
    },
    {
        path: '/register',
        text: '注册',
        name: 'register',
        display: false,
        module: 'user',
        icon: 'user-plus',
        component: () => import('/src/pages/user/register.vue'),
        meta: {
            title: '注册 — YuanHub'
        }
    },
    {
        path: '/forgot',
        text: '找回密码',
        name: 'forgot',
        display: false,
        module: 'user',
        icon: 'key-round',
        component: () => import('/src/pages/user/forgot.vue'),
        meta: {
            title: '找回密码 — YuanHub'
        }
    },
    {
        path: '/user/profile',
        text: '个人中心',
        name: 'profile',
        display: false,
        module: 'user',
        icon: 'user',
        component: () => import('/src/pages/user/profile.vue'),
        meta: {
            title: '个人中心 — YuanHub',
            requiresAuth: true
        }
    }
]
