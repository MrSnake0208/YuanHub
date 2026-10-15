<template>
  <div class="page-auth">
    <IslandSidebar />

    <main id="main-content">
      <div class="auth-wrap">
        <!-- 极简页头：小品牌标 + 标题 + 一句副题（去掉 hero 渐变/胶囊/水印） -->
        <header class="auth-head">
          <div class="auth-brand">
            <img class="brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
            <span class="brand-name">YuanHub</span>
          </div>
          <h1 class="auth-title">{{ title }}</h1>
          <p class="auth-sub">{{ sub }}</p>
        </header>

        <!-- 认证卡片 -->
        <section class="auth-sec">
          <div class="auth-card" v-reveal>
            <slot />
          </div>
        </section>

        <!-- 一行式页脚 -->
        <footer class="auth-foot">
          YuanHub · 鸢鸢相抱 — MaaYuan × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建 ·
          祝各位凹关顺利
        </footer>
      </div>
    </main>
  </div>
</template>

<script setup>
import IslandSidebar from "./IslandSidebar.vue";

defineProps({
  title: { type: String, required: true },
  sub: { type: String, default: "" },
});
</script>

<style src="../styles/auth-fieldsDesktop.css"></style>
<style src="../styles/auth-fieldsMobile.css"></style>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* ---- 页头：一行小品牌 + 标题 + 副题 ---- */
.auth-brand .brand-name {
  color: var(--ink-35);
}
.auth-title {
  color: var(--ink);
}
.auth-sub {
  color: var(--ink-60);
}

/* ---- 卡片 ---- */
.auth-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 30px 60px -28px rgba(73, 59, 44, 0.3);
}

/* ---- 一行式页脚 ---- */
.auth-foot {
  color: var(--ink-35);
  border-top: 1px dashed var(--line);
}

@media (max-width: 640px) {
  .auth-card {
    border-radius: 18px;
  }
}
</style>
<style scoped src="./authLayoutDesktop.css"></style>
<style scoped src="./authLayoutMobile.css"></style>
