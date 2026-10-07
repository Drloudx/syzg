<template>
  <!--
    `data-sticky-filter` 是**约定标记**，不是样式钩子：桌面端由 App.vue 的 updateStickyClipping()
    取它的底边作为裁切基线（--sticky-clip-top），让正文从筛选框下沿整齐消失、不盖到筛选框上方。
    ⚠️ 不要删掉或改名 —— 删了页面级裁切会**静默失效**（不报错，内容直接滚到筛选框上方）。
  -->
  <div class="filter-panel paper-panel" data-sticky-filter :class="{ 'is-filter-collapsed': !expanded }">
    <slot name="search" />
    <div :id="contentId" v-show="expanded" class="ui-filter-content">
      <slot />
    </div>
    <slot name="footer" />
  </div>
</template>

<script setup>
import { provide, readonly, ref, toRef } from 'vue'
import { createFilterPanelId, filterPanelKey } from './filterPanelContext.js'

/**
 * `collapsible=false` 用于「面板里只有搜索框和页签、没有可折叠的筛选项」的页面：
 * 此时隐藏搜索框右侧的收起/展开按钮，内容恒为展开，避免出现收起不了任何东西的按钮。
 */
const props = defineProps({
  collapsible: { type: Boolean, default: true }
})

const expanded = ref(true)
const contentId = createFilterPanelId()
provide(filterPanelKey, {
  expanded: readonly(expanded),
  collapsible: toRef(props, 'collapsible'),
  contentId,
  toggle: () => { expanded.value = !expanded.value }
})
</script>

<style scoped>
.ui-filter-content {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: inherit;
  min-width: 0;
}
</style>
