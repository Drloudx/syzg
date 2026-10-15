<template>
  <!--
    头像选择弹窗。`z-index` 说明见 `CaptchaDialog.vue`：账号弹窗已经在 12000，
    嵌套弹窗必须更高一档。
  -->
  <UiModal
    :visible="visible"
    title="选择头像"
    max-width="520px"
    :z-index="13000"
    teleport-to="body"
    @update:visible="onClose"
  >
    <!-- 当前选择：放最上面，选完不用回头找自己选了哪个 -->
    <div class="picker-current">
      <img v-if="currentPath" :src="getImageUrl(currentPath)" :alt="currentName" class="picker-current-img" />
      <div class="picker-current-text">
        <span class="picker-current-title">{{ currentName }}</span>
        <span class="picker-current-hint">当前选中的头像</span>
      </div>
    </div>

    <UiEmptyState v-if="avatarCatalogState === 'loading'" type="loading" text="头像加载中…" />
    <p v-else-if="avatarCatalogState === 'error'" class="picker-hint">
      头像列表暂时加载不出来。可以先跳过，稍后在个人中心设置。
    </p>
    <template v-else>
      <UiAccordion
        v-for="group in avatarGroups"
        :key="group.key"
        class="avatar-group"
        :title="`${group.label}（${group.items.length}）`"
        :model-value="expanded.has(group.key)"
        @update:model-value="(v) => toggle(group.key, v)"
      >
        <div class="avatar-grid">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="avatar-cell"
            :class="{ active: (modelValue || DEFAULT_AVATAR) === item.id }"
            :title="item.name"
            @click="pick(item.id)"
          >
            <img :src="getImageUrl(item.path)" :alt="item.name" loading="lazy" />
          </button>
        </div>
      </UiAccordion>
    </template>

    <template #footer>
      <UiButton @click="onClose">完成</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
/**
 * 头像选择弹窗。
 *
 * ## 为什么要有它
 *
 * 头像清单有 **13 个分组、几百张图**。直接铺在注册表单里（折叠面板）的话，
 * 即使全部收起也占掉一大块，把"邮箱 / 验证码 / 注册按钮"挤到需要滚动 ——
 * 注册页变成了"先看一堆头像"。
 *
 * 放进弹窗后，主表单只剩一行「头像 + 当前选择 + 选择按钮」。
 *
 * ## 选中即生效，不设"确定/取消"
 *
 * 点一个头像立刻写回 `modelValue`（`update:modelValue`），底部只有「完成」
 * 用来关窗。理由：头像没有"改错了"的代价（随时能再改），
 * 为它加一层确认反而多一次点击。
 */

import { computed, ref, watch } from 'vue'

import { DEFAULT_AVATAR } from '../config/auth.js'
import {
  avatarCatalogState,
  avatarEntry,
  avatarGroups,
  loadAvatarCatalog
} from '../utils/avatarCatalog.js'
import { getImageUrl } from '../utils/env.js'
import { UiAccordion, UiButton, UiEmptyState, UiModal } from './ui/index.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** 选中的头像 ID（空串回退默认女主） */
  modelValue: { type: String, default: '' },
  /** 备用昵称 */
  nick: { type: String, default: '' }
})

const emit = defineEmits(['update:visible', 'update:modelValue'])

/*
 * 默认**全部收起**：13 个分组全展开会把弹窗撑成一条长列表，
 * 用户还得先滚过一堆才能找到自己要的那类。
 */
const expanded = ref(new Set())

const activeId = computed(() => props.modelValue || DEFAULT_AVATAR)
const currentPath = computed(() => avatarEntry(activeId.value)?.path || '')
const currentName = computed(() => avatarEntry(activeId.value)?.name || '希尔（女主）')

function toggle(key, on) {
  const next = new Set(expanded.value)
  if (on) next.add(key)
  else next.delete(key)
  expanded.value = next
}

function pick(id) {
  emit('update:modelValue', id || DEFAULT_AVATAR)
}

function onClose() {
  emit('update:visible', false)
}

// 每次打开都确保清单已加载；未选头像时默认女主
watch(
  () => props.visible,
  (open) => {
    if (open) {
      loadAvatarCatalog()
      if (!props.modelValue) {
        emit('update:modelValue', DEFAULT_AVATAR)
      }
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.picker-current {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 10px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  background: var(--paper-solid, #d9c6a6);
}

.picker-current-img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.picker-current-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.picker-current-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.picker-current-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.picker-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- 头像网格 ----------
   这几条原本在 `AccountModal.vue` 里（scoped，不外泄）。头像选择整体搬进本组件，
   样式也跟着搬 —— 留在原处会变成"没人用的死样式"，而且新组件根本拿不到。 */

.avatar-group {
  margin-top: 6px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 6px;
}

.avatar-cell {
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  line-height: 0;
}

.avatar-cell img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 5px;
}

.avatar-cell.active {
  border-color: #c8a06a;
  background: rgba(200, 160, 106, 0.2);
}
</style>
