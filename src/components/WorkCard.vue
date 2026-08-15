<template>
  <router-link v-if="work.detailId" :to="'/work/' + work.detailId" class="work has-detail">
    <span class="rank">{{ rank }}</span>
    <div>
      <div class="w-tags">
        <span class="tg cat">{{ work.cat }} · {{ work.sub }}</span>
        <span class="tg site">{{ work.site }}</span>
        <span class="tg src">搬运</span>
      </div>
      <h3>{{ work.title }}<span class="go">查看阵容详情 →</span></h3>
      <p class="ex">{{ work.ex }}</p>
    </div>
    <div class="w-side">
      <div class="team-row">
        <div v-for="n in work.team" :key="n" class="member">
          <span class="av"><img loading="lazy" :src="AV[n]" :alt="n"></span>
          <span class="nm">{{ n }}</span>
        </div>
      </div>
      <div class="w-meta">
        <span class="lk">赞 <b>{{ work.likes }}</b></span>
        <span>阅 <b>{{ work.views }}</b></span>
        <span>{{ work.days }} 天前</span>
        <span class="au">{{ work.author }}</span>
      </div>
    </div>
  </router-link>
  <div v-else class="work">
    <span class="rank">{{ rank }}</span>
    <div>
      <div class="w-tags">
        <span class="tg cat">{{ work.cat }} · {{ work.sub }}</span>
        <span class="tg site">{{ work.site }}</span>
        <span class="tg src">搬运</span>
      </div>
      <h3>{{ work.title }}</h3>
      <p class="ex">{{ work.ex }}</p>
    </div>
    <div class="w-side">
      <div class="team-row">
        <div v-for="n in work.team" :key="n" class="member">
          <span class="av"><img loading="lazy" :src="AV[n]" :alt="n"></span>
          <span class="nm">{{ n }}</span>
        </div>
      </div>
      <div class="w-meta">
        <span class="lk">赞 <b>{{ work.likes }}</b></span>
        <span>阅 <b>{{ work.views }}</b></span>
        <span>{{ work.days }} 天前</span>
        <span class="au">{{ work.author }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { AV } from '../data/avatars.js'

defineProps({
  work: { type: Object, required: true },
  rank: { type: String, required: true }
})
</script>
