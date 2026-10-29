<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="hero-pick-card"
    :class="{ 'is-picked': picked }"
    :type="clickable ? 'button' : undefined"
    :title="`${hero.name}｜${hero.jobName} · ${hero.elementName}`"
  >
    <img
      class="hp-card-avatar"
      :src="getImageUrl(`/images/HeroBagPanel/${hero.img}_ka.webp`)"
      :alt="hero.name"
      loading="lazy"
      decoding="async"
      @error="hide"
    >
    <!--
      名字：压在立绘底部。
      配色沿用角色图鉴 `/heroes` 的 `.hero-name-label` —— 米金文字 + 深棕描边，
      不另加底板。比半透明黑条更贴合原作的卡面观感。
    -->
    <span class="hp-card-name">{{ hero.name }}</span>
    <span v-if="picked" class="hp-card-badge">已选</span>
  </component>
</template>

<script setup>
import { getImageUrl } from '../../utils/env'

defineProps({
  /** 角色精简记录（simsData.toHeroRecord 的产物，需要 img） */
  hero: { type: Object, required: true },
  picked: { type: Boolean, default: false },
  clickable: { type: Boolean, default: true },
})

function hide(event) {
  event.target.style.visibility = 'hidden'
}
</script>

<style scoped>
/*
 * 纯立绘卡片：只渲染角色的半身立绘（`HeroBagPanel/<img>_ka.webp`），
 * 不带卡框、底图、名字条、属性/职业图标 —— 这些在调用处单独展示。
 */
.hero-pick-card {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  aspect-ratio: 100 / 132;
  transition: transform .16s ease, filter .16s ease;
  font: inherit;
  color: inherit;
  overflow: hidden;
}
.hero-pick-card:hover {
  transform: translateY(-3px);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .45));
}
.hero-pick-card.is-picked {
  filter: drop-shadow(0 0 4px var(--accent-bright));
}

.hp-card-avatar {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  pointer-events: none;
}

/* 名字：与角色图鉴 .hero-name-label 同款配色（米金字 + 四面深棕描边） */
.hp-card-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  z-index: 2;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  color: #f2e1c3;
  text-shadow:
    -1px -1px 0 #2a1b12,
     1px -1px 0 #2a1b12,
    -1px  1px 0 #2a1b12,
     1px  1px 0 #2a1b12,
     0    2px 2px rgba(0, 0, 0, .8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
  box-sizing: border-box;
  pointer-events: none;
}

.hp-card-badge {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-bright);
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
}
</style>
