<template>
  <aside class="island">
    <div class="brand">
      <div class="brand-mark">M</div>
      <div class="brand-txt">MaaYuan Share<span class="beta">Beta</span><b>作业分享站</b></div>
    </div>
    <nav class="nav">
      <router-link to="/" :class="{ active: $route.path === '/' }"><span class="no">01</span>作业广场</router-link>
      <div class="nav-lb">协作看板 · 快捷跳转</div>
      <a class="ext" href="#" style="--cc:var(--tea)"><span class="dot"></span>出战阵容编辑器<span class="who">BWiki</span></a>
      <a class="ext" href="#" style="--cc:var(--accent)"><span class="dot"></span>操作记录仪<span class="who">辟雍学宫</span></a>
      <a class="ext" href="#" style="--cc:var(--rouge)"><span class="dot"></span>打关跟打<span class="who">YuanAssist</span></a>
      <a class="ext" href="#" style="--cc:var(--yellow-deep)"><span class="dot"></span>Box · 羁绊<span class="who">MAA</span></a>
      <div class="nav-lb">站点</div>
      <a href="#"><span class="no">02</span>关于</a>
    </nav>
    <div class="island-foot">
      <a href="#">登录 / 注册</a> · 简体中文<br>
      <a href="#">创建新作业</a><br>
      <div class="grp">作业制作者交流群<br>1055262891</div>
    </div>
  </aside>
</template>
