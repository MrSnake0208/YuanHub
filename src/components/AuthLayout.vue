<template>
  <div class="page-auth">
    <IslandSidebar />

    <main id="main-content">
      <div class="auth-wrap">
        <!-- 极简页头：小品牌标 + 标题 + 一句副题（去掉 hero 渐变/胶囊/水印） -->
        <header class="auth-head">
          <div class="auth-brand">
            <span class="brand-mark" aria-hidden="true">♥</span>
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
          YuanHub · 鸢鸢相抱 — MAA × 代号鸢BWiki × 辟雍学府 × YuanAssist
          共同搭建 · 祝各位凹关顺利
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

<style scoped>
.auth-wrap {
  max-width: 560px;
  margin: 0 auto;
  padding: 72px 24px 0;
}

/* ---- 页头：一行小品牌 + 标题 + 副题 ---- */
.auth-head {
  text-align: center;
}
.auth-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.auth-brand .brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--tea);
  color: var(--cream);
  display: grid;
  place-items: center;
  font-family: var(--font-d);
  font-weight: 900;
  font-size: 15px;
}
.auth-brand .brand-name {
  font-family: var(--font-d);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-35);
}
.auth-title {
  margin-top: 22px;
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 34px;
  letter-spacing: 0.1em;
  color: var(--ink);
}
.auth-sub {
  margin-top: 10px;
  font-size: 13px;
  color: var(--ink-60);
}

/* ---- 卡片 ---- */
.auth-sec {
  padding: 36px 0 0;
}
.auth-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 30px 60px -28px rgba(73, 59, 44, 0.3);
  padding: 40px 40px 36px;
  position: relative;
}

/* ---- 一行式页脚 ---- */
.auth-foot {
  margin-top: 72px;
  padding: 20px 0 44px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-35);
  border-top: 1px dashed var(--line);
  line-height: 1.9;
}

@media (max-width: 640px) {
  .auth-wrap {
    padding: 32px 16px 0;
  }
  .auth-title {
    font-size: 28px;
  }
  .auth-card {
    padding: 30px 24px 28px;
    border-radius: 18px;
  }
  .auth-foot {
    margin-top: 48px;
    padding-bottom: calc(32px + env(safe-area-inset-bottom));
  }
}
</style>
