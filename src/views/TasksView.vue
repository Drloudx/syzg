<template>
  <div class="page-view-container tasks-page">

    <!-- 顶部筛选面板：与物品图鉴一致的 UiSearchInput + UiFilterRow + UiFilterPill -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput v-model="searchQuery" placeholder="搜索任务名称、描述、ID..." />
      </template>

      <!-- 主分类筛选行 -->
      <UiFilterRow label="分类：">
        <UiFilterPill
          v-for="o in typeOptions"
          :key="o.key"
          :active="filterType === o.key"
          @click="selectType(o.key)"
        >
          {{ o.label }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 子分类筛选行（二级） -->
      <UiFilterRow v-if="currentSubOptions.length" label="章节：">
        <UiFilterPill
          v-for="so in currentSubOptions"
          :key="so.key"
          :active="filterSub === so.key"
          @click="filterSub = so.key"
        >
          {{ so.label }}
        </UiFilterPill>

        <template #right>
          <div class="tasks-counter">
            数量：<span class="count-num">{{ filteredTasks.length }}</span> / {{ tasks.length }}
          </div>
        </template>
      </UiFilterRow>

      <!--
        剧情搜索索引的加载/失败状态。索引约 0.84 MB（gzip），首次搜索才拉，
        所以必须让用户知道「正在找剧情」，否则打字后结果迟迟不更新会像卡住。
      -->
      <div v-if="searchQuery.trim() && (dialogSearchLoading || dialogSearchError)" class="dialog-search-note">
        <span v-if="dialogSearchLoading">正在加载剧情文本，稍后会自动把剧情命中的任务一并列出…</span>
        <span v-else>{{ dialogSearchError }}（仍可按任务名与描述搜索）</span>
      </div>
    </UiFilterPanel>

    <!-- 加载 / 错误 -->
    <UiEmptyState v-if="!isDataReady" type="loading" text="正在装配任务数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage">
      <template #action><UiButton @click="loadTasks">重试</UiButton></template>
    </UiEmptyState>

    <!-- 单列窗口化，按实际内容测量每张任务卡片高度。 -->
    <UiVirtualGrid v-else ref="taskGrid" id="tasksGridScroll" class="tasks-card-grid" :items="filteredTasks" :estimate-size="150" wide>
      <template #default="{ item }">
      <UiListRow
        :key="item.id"
        :data-task-id="item.id"
        class="task-list-row"
        clickable
        @click="openDetail(item)"
      >
        <div class="task-card-main">
          <div class="task-card-icon">
            <img
              :src="getImageUrl(`/images/TaskPanel/task_tag${item.type}.webp`)"
              :alt="item.typeLabel"
              class="task-card-icon-img"
              loading="lazy"
              @error="handleImgError"
            />
          </div>
          <div class="task-card-info">
            <div class="task-card-name-row">
              <span class="task-card-name">{{ item.name }}</span>
              <UiTag tone="wood">{{ item.typeLabel }}</UiTag>
              <UiTag tone="wood">{{ item.subLabel }}</UiTag>
              <UiTag v-if="item.close" tone="danger">已下架</UiTag>
            </div>
            <div class="task-card-des">{{ item.des || '（无描述）' }}</div>
            <!--
              剧情命中提示：显示命中片段，让用户知道「这条是因为剧情台词被搜到的」。
              片段在 `dialogHits` 里**预先算好**（每次搜索只算一遍），
              不在模板里重复调用 —— 虚拟网格会反复渲染可见行。
            -->
            <div v-if="dialogHits[item.id]" class="task-card-dialog-hit">
              <span class="task-card-dialog-hit-label">剧情</span>
              <span class="task-card-dialog-hit-text">{{ dialogHits[item.id].snippet }}</span>
            </div>
          </div>
        </div>

        <template #right>
          <div v-if="item.reward.entries.length" class="task-card-rewards">
            <div
              v-for="(rw, rIdx) in item.reward.entries.slice(0, 4)"
              :key="rIdx"
              class="task-card-reward"
              :title="`${rw.name} ×${rw.count}`"
            >
              <img :src="getImageUrl(rw.icon)" :alt="rw.name" class="task-card-reward-icon" loading="lazy" @error="handleImgError" />
              <span class="task-card-reward-count">×{{ rw.count }}</span>
            </div>
          </div>
          <span class="task-card-arrow">›</span>
        </template>
      </UiListRow>
      </template>
      <template #empty><UiEmptyState text="未找到符合条件的任务" /></template>
    </UiVirtualGrid>

    <UiBackToTop scroll-container="#tasksGridScroll" />

    <!-- 详情全屏弹窗 -->
    <UiModal
      v-model:visible="detailVisible"
      :title="selectedTask ? selectedTask.name : '任务详情'"
      max-width="820px"
      scroll-id="taskModalScroll"
      :z-index="2000"
      @close="closeDetail"
    >
      <template v-if="selectedTask">
        <!-- 徽标行 -->
        <div class="detail-badges">
          <UiTag tone="wood">{{ selectedTask.typeLabel }}</UiTag>
          <UiTag tone="wood">{{ selectedTask.subLabel }}</UiTag>
        </div>

        <!-- 接取信息与背景 -->
        <UiSection title="接取信息与背景">
          <UiInfoRow v-if="selectedTask.getTask.npc" label="接取 NPC" :value="npcText(selectedTask.getTask.npc)" />
          <UiInfoRow v-else-if="selectedTask.startNpc" label="起始 NPC" :value="npcText(selectedTask.startNpc)" />
          <UiInfoRow v-if="selectedTask.startLocation" label="起始地点" :value="selectedTask.startLocation" />
          <UiInfoRow label="接取条件" :value="selectedTask.getTask.condition" />
          <UiInfoRow v-if="selectedTask.getTask.title" label="交互对话" :value="selectedTask.getTask.title" />
          <div v-if="selectedTask.getTask.dialog" class="get-task-dialog-row">
            <div class="step-dialog-header">
              <span class="step-dialog-label">任务目标</span>
              <div v-if="!selectedTask.getTask.dialog.isText" class="dialog-actions">
                <UiButton variant="secondary" size="sm" @click="toggleDialog('getTask', selectedTask.getTask.dialog.raw)">
                  {{ dialogOpen['getTask'] ? '▲ 收起剧情文本' : '▼ 展开剧情文本' }}
                </UiButton>
                <span v-if="selectedTask.getTask.dialog.name" class="dialog-name-label">{{ selectedTask.getTask.dialog.name }}</span>
                <span v-if="dialogLoading['getTask']" class="dialog-loading">剧情读取中...</span>
              </div>
              <span v-else class="dialog-raw">{{ selectedTask.getTask.dialog.raw }}</span>
            </div>
            <DialogLines v-if="dialogOpen['getTask'] && dialogContent['getTask']" :lines="dialogContent['getTask']" />
          </div>
          <p class="task-des">{{ selectedTask.des || '（无描述）' }}</p>
          <blockquote v-if="selectedTask.des2" class="des2-quote">
            📜 委托契约书：{{ selectedTask.des2 }}
          </blockquote>
        </UiSection>

        <!-- 完成后直接加入当前任务列表，与仅开放接取资格的 unlockTask 分开。 -->
        <UiSection v-if="selectedTask.addTasks.length" title="后续任务" class="task-follow-up-section">
          <div class="task-follow-up-list chip-group">
            <UiTag v-for="task in selectedTask.addTasks" :key="task.id">{{ task.name }}</UiTag>
          </div>
        </UiSection>

        <!-- 解锁信息 -->
        <UiSection v-if="selectedTask.unlockTasks.length || selectedTask.unlockStages.length" title="解锁信息" class="task-unlock-section">
          <UiInfoRow v-if="selectedTask.unlockTasks.length" label="解锁任务">
            <span class="chip-group">
              <UiTag v-for="ut in selectedTask.unlockTasks" :key="ut.id">{{ ut.name === ut.id ? ut.id : ut.name }}</UiTag>
            </span>
          </UiInfoRow>
          <UiInfoRow v-if="selectedTask.unlockStages.length" label="解锁关卡">
            <span class="chip-group">
              <UiTag v-for="us in selectedTask.unlockStages" :key="us.id">
                {{ us.label }}<template v-if="us.sub">（{{ us.sub }}）</template>
              </UiTag>
            </span>
          </UiInfoRow>
        </UiSection>

        <!-- 任务奖励 -->
        <UiSection title="任务奖励">
          <div v-if="selectedTask.reward.entries.length" class="reward-grid">
            <UiRewardCard
              v-for="(rw, rIdx) in selectedTask.reward.entries"
              :key="rIdx"
              :rule="{ targetName: rw.name, targetImg: getImageUrl(rw.icon), targetQuality: rw.quality, min: rw.count, max: rw.count, typeId: rw.typeId }"
              @click="goToItem(rw.typeId)"
            />
            <UiTag v-for="(txt, tIdx) in selectedTask.reward.text" :key="'t' + tIdx" class="reward-text-chip">{{ txt }}</UiTag>
          </div>
          <p v-else class="empty-value-text">无</p>
        </UiSection>

        <!-- 任务步骤 -->
        <UiSection :title="`任务步骤（${selectedTask.steps.length}）`">
          <div class="step-list">
            <UiAccordion
              v-for="(step, sIdx) in selectedTask.steps"
              :key="sIdx"
              class="step-accordion"
              :model-value="!!openSteps[sIdx]"
              @update:model-value="toggleStep(sIdx)"
            >
              <template #title>
                <span class="step-no">步骤 {{ step.index }}</span>
                <span class="step-title">{{ step.name || '（无名步骤）' }}</span>
                <UiTag tone="accent" class="step-type-tag">{{ step.typeName }}</UiTag>
              </template>

              <div class="step-body">
                <UiInfoRow label="步骤奖励">
                  <span v-if="step.reward.entries.length || step.reward.text.length" class="chip-group">
                    <span
                      v-for="(rw, rIdx) in step.reward.entries"
                      :key="rIdx"
                      class="step-reward-chip clickable"
                      :title="`${rw.name}（点击查看物品）`"
                      @click="goToItem(rw.typeId)"
                    >
                      <img :src="getImageUrl(rw.icon)" class="step-reward-icon" loading="lazy" @error="handleImgError" />
                      ×{{ rw.count }}
                    </span>
                    <UiTag v-for="(txt, tIdx) in step.reward.text" :key="'t' + tIdx" tone="default">{{ txt }}</UiTag>
                  </span>
                  <span v-else>无</span>
                </UiInfoRow>

                <UiInfoRow label="解锁关卡" v-if="step.unlockStages.length">
                  <span class="chip-group">
                    <UiTag v-for="us in step.unlockStages" :key="us.id">{{ us.label }}</UiTag>
                  </span>
                </UiInfoRow>
                <UiInfoRow label="解锁关卡" v-else-if="step.unlockSuppressed">
                  <span class="muted-text">（passStage 不显示）</span>
                </UiInfoRow>

                <UiInfoRow v-for="(d, dIdx) in step.detail" :key="'d' + dIdx" :label="d.label" :value="d.value" />

                <UiInfoRow label="目标" v-if="step.monsters && step.monsters.length">
                  <span class="chip-group">
                    <span
                      v-for="mon in step.monsters"
                      :key="mon.id"
                      class="monster-chip"
                      :class="{ clickable: mon.hasMonsterDetail }"
                      :title="mon.hasMonsterDetail ? `${mon.name}（点击查看怪物）` : mon.name"
                      @click="mon.hasMonsterDetail && goToMonster(mon.id)"
                    >
                      <img
                        v-if="mon.icon"
                        :src="getImageUrl(`/images/PicHandBookPanel_Atlas/${mon.icon}.webp`)"
                        class="monster-icon"
                        loading="lazy"
                        @error="handleImgError"
                      />
                      <span class="monster-name">{{ mon.name }}</span>
                    </span>
                  </span>
                </UiInfoRow>

                <UiInfoRow label="道具" v-if="step.submitItems && step.submitItems.length">
                  <span class="chip-group">
                    <span
                      v-for="it in step.submitItems"
                      :key="it.typeId"
                      class="submit-item-chip clickable"
                      :title="`${it.name}（点击查看物品）`"
                      @click="goToItem(it.typeId)"
                    >
                      <img :src="getImageUrl(it.icon)" class="submit-item-icon" loading="lazy" @error="handleImgError" />
                      <span class="submit-item-name">{{ it.name }}</span>
                      <span class="submit-item-count">×{{ it.count }}</span>
                    </span>
                  </span>
                </UiInfoRow>

                <UiInfoRow v-if="step.des" label="步骤描述" :value="step.des" />

                <div
                  v-for="(dg, dgIdx) in step.dialogs"
                  :key="'dg' + dgIdx"
                  class="step-dialog-row"
                  :data-dialog-block="sIdx + ':' + dgIdx"
                >
                  <div class="step-dialog-header">
                    <span class="step-dialog-label">{{ dg.label }}</span>
                    <div v-if="!dg.meta.isText" class="dialog-actions">
                      <UiButton variant="secondary" size="sm" @click="toggleDialog(sIdx + ':' + dgIdx, dg.meta.raw)">
                        {{ dialogOpen[sIdx + ':' + dgIdx] ? '▲ 收起剧情文本' : '▼ 展开剧情文本' }}
                      </UiButton>
                      <span v-if="dg.meta.name" class="dialog-name-label">{{ dg.meta.name }}</span>
                      <span v-if="dialogLoading[sIdx + ':' + dgIdx]" class="dialog-loading">剧情读取中...</span>
                    </div>
                    <span v-else class="dialog-raw">{{ dg.meta.raw }}</span>
                  </div>
                  <DialogLines v-if="dialogOpen[sIdx + ':' + dgIdx] && dialogContent[sIdx + ':' + dgIdx]" :lines="dialogContent[sIdx + ':' + dgIdx]" />
                </div>
              </div>
            </UiAccordion>
          </div>
        </UiSection>
        <!-- 讨论区归属到具体任务 -->
        <CommentsPanel
          v-if="taskCommentPageKey"
          :page-key="taskCommentPageKey"
          :page-label="selectedTask?.name || ''"
        />
      </template>
    </UiModal>

    <UiBackToTop scroll-container="#taskModalScroll" />
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DialogLines from '../components/TaskDialogLines.vue'
import {
  UiFilterPanel, UiSearchInput,
  UiFilterRow,
  UiFilterPill,
  UiListRow,
  UiEmptyState,
  UiBackToTop,
  UiModal,
  UiSection,
  UiInfoRow,
  UiRewardCard,
  UiTag,
  UiButton,
  UiAccordion
} from '../components/ui/index.js'
import { loadTaskData } from '../utils/taskParser'
import { TASK_TYPE_LABELS, cleanDialogueLine } from '../utils/gameMappings'
import { getImageUrl, handleImageFallback } from '../utils/env'
import { fetchWithFallback, prefetchResourceManifest } from '../utils/request.js'
import UiVirtualGrid from '../components/ui/UiVirtualGrid.vue'
import { isBlacklisted } from '../config/blacklist.js'
import CommentsPanel from '../components/CommentsPanel.vue'
import { buildPageKey, COMMENT_PAGE_PREFIX } from '../utils/commentApi.js'

const route = useRoute()
const router = useRouter()

// ===== 开发者开关：true 时隐藏“已下架”任务（面向公开用户）=====
// 改成 false 则显示已下架任务（卡片上仍带灰色“已下架”徽标）
const HIDE_CLOSED_TASKS = true

const tasks = shallowRef([])
const subOptions = ref({})
const isDataReady = ref(false)
const errorMessage = ref('')
const taskGrid = ref(null)
let loadOperation = 0

const filterType = ref(route.query.type || 'all')
const filterSub = ref(route.query.sub || null)
const searchQuery = ref(route.query.q || '')

/*
 * ─────────── 剧情全文搜索 ───────────
 *
 * 用户要能「用剧情里的原话搜到任务」（如搜「沃夫加」或某句台词）。
 *
 * 🔴 **索引必须懒加载，不能并进 tasks.json 或首屏搜索索引**：
 * 全量剧情正文约 111 万字符 / 2.1 MB raw（gzip 约 0.84 MB），
 * 而 `search-index.json` 是首屏就要下载的。并进去等于让每个冷启动用户
 * 为「可能用不到的剧情搜索」买单。
 *
 * 触发时机：**用户真的在搜索框里打字时**才开始拉，拉之前先给一句轻提示。
 * 拉取失败不影响普通搜索（按任务名/描述仍可用），只是剧情命中为空。
 */
const dialogSearch = shallowRef(null)
const dialogSearchLoading = ref(false)
const dialogSearchError = ref('')
/** 在途的索引加载 Promise；重复调用复用同一个，见 ensureDialogSearch 的说明 */
let dialogSearchPending = null

/**
 * 按需加载剧情索引。**返回在途 Promise**，调用方 `await` 它即可等到数据可用。
 *
 * 🔴 早先的写法是「已在加载中就 `return`」——那对"重复触发时别重复请求"够用，
 * 但调用方 `await` 到的却是 `undefined`，于是紧接着读 `dialogHits` 仍是空。
 * 冷链接（`?task=...&q=...`）正好命中这个时序：watch 先发起加载，
 * `openDetail` 随后调用本函数，被早退挡住 → 详情打开了但**没有定位**。
 * 现在把在途 Promise 存下来复用，语义是"等到加载完成"而不是"别重复加载"。
 *
 * ## 失败会**自动重试一次**（2026-10-07）
 *
 * 索引走 CDN 取（失败才回退包内文件），而 CDN 侧的失败**多半是瞬时的**：
 * 内容刚更新时新旧副本交替、网络抖动、边缘节点切换。实测遇到过
 * 「剧情搜索暂时不可用」，刷新一下就好了 —— 正是这种情况。
 *
 * 所以这里**替用户刷新**：失败后隔一小会儿重试一次。
 * 重试成功用户**什么都不会看到**；两次都失败才显示提示。
 *
 * ⚠️ 只自动重试一次：`fetchWithFallback` 失败时会**清掉缓存条目**，
 * 所以第二次调用是**真的重新发请求**（不是拿同一个失败结果）。
 * 但也不能无限重试 —— 真挂了的话，反复请求只是白烧用户流量与 CDN 额度。
 */
const DIALOG_SEARCH_RETRY_DELAY_MS = 600

const ensureDialogSearch = () => {
  if (dialogSearch.value) return Promise.resolve()
  if (dialogSearchPending) return dialogSearchPending
  dialogSearchLoading.value = true
  dialogSearchError.value = ''
  dialogSearchPending = (async () => {
    try {
      let data
      try {
        data = await fetchWithFallback('data/parsed/dialog-search.json')
      } catch (firstErr) {
        console.warn('剧情索引首次加载失败，自动重试一次：', firstErr)
        await new Promise((r) => setTimeout(r, DIALOG_SEARCH_RETRY_DELAY_MS))
        data = await fetchWithFallback('data/parsed/dialog-search.json')
      }
      dialogSearch.value = data?.tasks || {}
    } catch (err) {
      console.error('加载剧情搜索索引失败:', err)
      /*
       * 文案要说清**怎么办**。早先写的是「剧情搜索暂时不可用」——
       * "暂时"听起来像服务器挂了，而实际上刷新一下多半就好（实测如此），
       * 但提示里没有"刷新"两个字，用户只能干看着、还会怀疑是站点出故障。
       */
      dialogSearchError.value = '剧情搜索加载失败，刷新页面重试'
      // 保持 null（**不是** {}）：{} 是真值，会让下次调用在入口直接返回，
      // 于是"重新搜索"也拿不到数据 —— 只有刷新整页才行（而文案正是这么说的）
      dialogSearch.value = null
    } finally {
      dialogSearchLoading.value = false
      dialogSearchPending = null
    }
  })()
  return dialogSearchPending
}

/**
 * 当前搜索词的**剧情命中**：taskId -> `{ snippet, stepIndex, dialogIndex, lineIndex }`。
 *
 * 预先算成一个 map 而不是在模板里调函数：虚拟网格会反复渲染可见行，
 * 每行都去扫一遍索引是浪费。只有搜索词或索引变化时才重算。
 *
 * 命中位置（步骤/剧情/行）一并算出来，供 `openDetail` 打开详情后
 * **自动展开对应步骤与剧情、并滚到那一行** —— 用户搜到一句话，
 * 点进去就该看见它，而不是自己再翻。
 */
const dialogHits = computed(() => {
  const q = searchQuery.value.trim()
  const hits = {}
  if (!q || !dialogSearch.value) return hits
  for (const [taskId, blocks] of Object.entries(dialogSearch.value)) {
    if (!Array.isArray(blocks)) continue
    outer:
    for (const [bIdx, block] of blocks.entries()) {
      const lines = block?.lines || []
      for (const [lIdx, line] of lines.entries()) {
        const at = String(line).indexOf(q)
        if (at < 0) continue
        // 命中位置前后各取 18 字做摘要，避免卡片被长句撑破
        const start = Math.max(0, at - 18)
        const end = Math.min(line.length, at + q.length + 18)
        hits[taskId] = {
          snippet: `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`,
          // block.key 形如 `步骤下标:剧情下标`，与 dialogOpen 的键一致
          blockKey: block.key,
          blockIndex: bIdx,
          lineIndex: lIdx
        }
        break outer
      }
    }
  }
  return hits
})

const detailVisible = ref(false)
const selectedTask = ref(null)

/** 讨论区归属键：`task:<id>` */
const taskCommentPageKey = computed(() => buildPageKey(COMMENT_PAGE_PREFIX.task, selectedTask.value?.id))
const openSteps = ref({})
const dialogOpen = ref({})
const dialogContent = ref({})
const dialogLoading = ref({})

const typeOptions = computed(() => {
  const opts = [{ key: 'all', label: '全部' }]
  for (let i = 1; i <= 5; i++) {
    opts.push({ key: String(i), label: TASK_TYPE_LABELS[i] })
  }
  return opts
})

const currentSubOptions = computed(() => {
  if (filterType.value === 'all') return []
  // 章节筛选按钮也要过黑名单：否则被隐藏的章节（如第四章/第五章）仍作为按钮出现，
  // 点进去是空列表（任务本身已被 filteredTasks 过滤）——按钮与内容不一致。
  return (subOptions.value[filterType.value] || [])
    .filter(opt => !isBlacklisted(opt.label ?? opt.key ?? opt))
})

const npcText = (npc) => {
  if (!npc) return ''
  return npc.name === '未知' ? `${npc.name}（${npc.id}）` : npc.name
}

const filteredTasks = computed(() => {
  return tasks.value.filter((item) => {
    // 黑名单：任务名/描述里命中关键字即隐藏（本页原先完全没过黑名单）
    if (isBlacklisted({ id: item.id, name: item.name, desc: item.des, tip: item.typeLabel, label: item.subLabel })) return false
    if (filterType.value !== 'all' && String(item.type) !== filterType.value) return false
    if (filterSub.value && item.subKey !== filterSub.value) return false
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      const hit = [item.name, item.id, item.des, item.typeLabel, item.subLabel].some((x) => x && x.toLowerCase().includes(q))
      // 剧情正文命中：索引还没加载完时先按「未命中」处理，加载完会自动重算
      if (!hit && !dialogHits.value[item.id]) return false
    }
    return true
  })
})

/**
 * 搜索词变化时按需拉取剧情索引。
 *
 * 放在 watch 里而不是 `filteredTasks` 计算属性里：计算属性必须保持纯函数，
 * 在里面发请求会造成「渲染触发副作用」。用 `flush:'post'` 让首帧先渲染
 * 已有的任务名/描述结果，剧情命中随后补上（避免搜索框打字时卡一下）。
 *
 * 🔴 **`immediate: true` 是必需的**：搜索词可能来自 URL（`?q=记忆` 的分享/刷新），
 * 那种情况下 `searchQuery` 在初始化时就已有值、不会触发 change 事件，
 * 不加 immediate 索引永远不加载 —— 表现为"分享出去的搜索链接点开没有剧情命中"。
 */
watch(searchQuery, (q) => {
  if (String(q || '').trim()) ensureDialogSearch()
}, { flush: 'post', immediate: true })


const selectType = (key) => {
  filterType.value = key
  filterSub.value = null
}

const handleImgError = handleImageFallback

// ---------- 详情 ----------
const openDetail = (item) => {
  selectedTask.value = item
  openSteps.value = {}
  dialogOpen.value = {}
  dialogContent.value = {}
  detailVisible.value = true
  router.replace({ query: { ...route.query, task: item.id } })
  // 从搜索结果点进来时，自动展开并滚到命中的那句剧情
  revealDialogHit(item.id)
}

/**
 * 展开命中的步骤与剧情，并把那一行滚进视野。
 *
 * 用户搜一句话就是为了找到它 —— 点进去还要自己翻步骤、找剧情、再往下滚，
 * 等于把搜索的价值又还回去了。这里做成「点开即见」。
 *
 * 三个必须处理的时序问题：
 *  1. 剧情正文是**按需 fetch** 的（`toggleDialog` 内部 await），所以要等它把
 *     `dialogContent` 填好、DOM 渲染出来之后才能定位；
 *  2. 详情弹窗本身是 `UiModal` 内嵌覆盖层，滚动容器是 `#taskModalScroll`，
 *     不是页面 —— 用 `scrollIntoView` 会把外层页面一起滚（项目已知坑）；
 *  3. 只在**用户从搜索结果进入**时定位；正常浏览点开任务时不该乱跳。
 */
const revealDialogHit = async (taskId) => {
  /*
   * 冷链接（`?task=...&q=...`）下索引可能**还在下载**：`openDetail` 由数据加载
   * 完成触发，而索引是并行发起的。这时 `dialogHits` 还是空的，直接返回就会
   * 出现"分享出去的搜索链接点开没有定位"。所以先等索引就绪（失败则静默放弃）。
   */
  if (!dialogSearch.value && searchQuery.value.trim()) {
    await ensureDialogSearch()
  }
  const hit = dialogHits.value[taskId]
  if (!hit) return
  const [stepIndex, dialogIndex] = String(hit.blockKey).split(':').map(Number)
  if (!Number.isFinite(stepIndex) || !Number.isFinite(dialogIndex)) return

  // 1) 展开所属步骤
  openSteps.value = { ...openSteps.value, [stepIndex]: true }

  // 2) 展开该段剧情（内部会按需拉取剧本文件）
  const dg = selectedTask.value?.steps?.[stepIndex]?.dialogs?.[dialogIndex]
  if (dg && !dg.meta?.isText) {
    await toggleDialog(hit.blockKey, dg.meta.raw)
  }

  // 3) 等布局稳定后，把命中行滚进弹窗可视区
  await nextTick()
  const scroller = document.getElementById('taskModalScroll')
  if (!scroller) return
  /*
   * 🔴 两个必须避开的坑（都实测过）：
   *
   * 1. **偏移量用 `getBoundingClientRect()` 相减，不能用 `offsetTop`**。
   *    `offsetTop` 相对 `offsetParent`，而命中行与滚动容器中间隔着
   *    `.step-accordion` / `.dialog-lines` 等定位元素，相减会偏出可视区。
   *
   * 2. **要等布局稳定再滚**。剧情展开后内容会二次增长 ——
   *    实测 `scrollHeight` 从 1377 涨到 2191（先展开步骤，随后剧情正文把高度撑开）。
   *    若在涨的过程中滚，算出的目标位置在布局稳定后已经不对，
   *    表现为"滚到中间某处、命中行仍在屏幕外"。
   *
   * 因此：逐帧等到 `scrollHeight` 连续两帧不变（布局已稳定），再滚一次。
   */
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  let lastHeight = -1
  for (let i = 0; i < 20; i++) {
    await frame()
    if (scroller.scrollHeight === lastHeight) break
    lastHeight = scroller.scrollHeight
  }

  const target = document.querySelector(
    `[data-dialog-block="${hit.blockKey}"] [data-dialog-line="${hit.lineIndex}"]`
  )
  if (!target) return
  const targetRect = target.getBoundingClientRect()
  const rootRect = scroller.getBoundingClientRect()
  // 居中摆放，留出上下文；与 utils/scrollTarget.alignElementInScrollTarget 同一算法
  const top = scroller.scrollTop + targetRect.top - rootRect.top - (scroller.clientHeight - targetRect.height) / 2
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

const closeDetail = () => {
  detailVisible.value = false
  selectedTask.value = null
  if (route.query.task) {
    const q = { ...route.query }
    delete q.task
    router.replace({ query: q })
  }
}

const goToItem = (typeId) => {
  if (!typeId) return
  router.push({ query: { ...route.query, itemId: typeId } })
}

const goToMonster = (monId) => {
  if (!monId) return
  router.push({ path: '/monsters', query: { id: monId } })
}

const toggleStep = (idx) => {
  openSteps.value[idx] = !openSteps.value[idx]
}

const toggleDialog = async (key, dialogId) => {
  if (dialogOpen.value[key]) {
    dialogOpen.value[key] = false
    return
  }
  if (!dialogContent.value[key]) {
    dialogLoading.value[key] = true
    try {
      const tryFetch = async (name) => {
        try {
          return await fetchWithFallback(`data/taskDialogs/${encodeURIComponent(name)}.json`)
        } catch (e) {
          return null
        }
      }
      // 每个剧情入口只加载自己那一个剧本文件（分段事件已在解析时拆成多个入口）
      const direct = await tryFetch(dialogId)
      const listExps = direct ? direct.exps || [] : []
      dialogContent.value[key] = listExps
        .filter((e) => e.key === 'text' || e.key === 'option')
        .map((e) => {
          if (e.key === 'option') {
            return {
              isOption: true,
              options: (e.para.options || []).map((o) => cleanDialogueLine(o.text))
            }
          }
          const cleanedText = cleanDialogueLine(e.para.text || '')
          if (!cleanedText) return null
          let sp = e.para.charaName || ''
          if (sp === '主角' || sp === '[myName]' || sp === '{myName}') sp = '小工匠'
          return { isOption: false, speaker: sp, text: cleanedText }
        })
        .filter(Boolean)
      if (!dialogContent.value[key].length) {
        dialogContent.value[key] = [{ isOption: false, speaker: '', text: '（该剧情无文本内容）' }]
      }
    } catch (err) {
      dialogContent.value[key] = [{ isOption: false, speaker: '', text: `（剧情文件加载失败：${dialogId}）` }]
    } finally {
      dialogLoading.value[key] = false
    }
  }
  dialogOpen.value[key] = true
}


// ---------- 加载 ----------
const loadTasks = async () => {
  const operation = ++loadOperation
  errorMessage.value = ''
  isDataReady.value = false
  try {
    const data = await loadTaskData()
    if (operation !== loadOperation) return
    tasks.value = HIDE_CLOSED_TASKS ? data.tasks.filter((t) => !t.close) : data.tasks
    subOptions.value = data.subOptions
    isDataReady.value = true
    // 任务剧情正文是「展开步骤才取」，取之前要先读 data-taskDialogs 清单（97 KB，最重的一份）。
    // 刻意放在这里（而不是启动时全局预取）：只有进任务页的用户才需要它。
    prefetchResourceManifest('data/taskDialogs/dialog.json')
    // 分享链接直达：?task=<任务id> 自动打开详情
    const taskId = route.query.task
    if (taskId) {
      const item = data.tasks.find((t) => t.id === taskId)
      if (item) {
        await nextTick()
        await taskGrid.value?.scrollToItem(item.id)
        if (operation === loadOperation && route.query.task === taskId) openDetail(item)
      }
    }
  } catch (err) {
    if (operation !== loadOperation) return
    console.error('加载任务数据失败:', err)
    errorMessage.value = '任务数据加载失败，请重试'
    isDataReady.value = true
  }
}

onMounted(loadTasks)
onBeforeUnmount(() => { loadOperation += 1 })

watch([filterType, filterSub, searchQuery], () => {
  const query = {}
  if (filterType.value !== 'all') query.type = filterType.value
  if (filterSub.value) query.sub = filterSub.value
  if (searchQuery.value.trim()) query.q = searchQuery.value.trim()
  if (route.query.task) query.task = route.query.task
  router.replace({ query })
})

/**
 * 外部修改 `q`（分享链接、浏览器前进/后退）时同步搜索框。
 *
 * 🔴 **必须监听，不能只在 setup 里读一次**：本站是 hash 路由，站内跳转
 * （`#/tasks?task=x` → `#/tasks?task=x&q=记忆`）**不会重建组件**，
 * setup 只跑一次，于是 URL 里的新 `q` 永远进不来 ——
 * 表现为"分享出去的搜索链接，对方点开看不到搜索结果"。
 *
 * 只做「URL → 状态」单向同步：反向（状态 → URL）已由下面那个
 * `watch([filterType, filterSub, searchQuery])` 负责，两边都写会打架。
 */
watch(
  () => route.query.q,
  (val) => {
    const next = String(val || '')
    if (next !== searchQuery.value) searchQuery.value = next
  }
)

// 外部修改 task 参数（如浏览器前进/后退、粘贴分享链接）时同步打开/关闭详情
watch(
  () => route.query.task,
  (val) => {
    if (!val) {
      detailVisible.value = false
      selectedTask.value = null
      return
    }
    if (!isDataReady.value) return
    const item = tasks.value.find((t) => t.id === val)
    if (item) openDetail(item)
  }
)
</script>

<style scoped>
.tasks-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  padding: 0 4px;
}

/* ---------- 任务列表（UiCardGrid 内通栏行布局） ---------- */
.tasks-card-grid :deep(.ui-card-grid) {
  grid-template-columns: minmax(0, 1fr);
  align-content: flex-start;
  gap: 6px;
}
.tasks-card-grid :deep(.ui-list-row) {
  background-color: var(--panel-list-background);
}
.task-list-row {
  grid-column: 1 / -1;
}
.task-card-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.task-card-icon {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-card-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.task-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.task-card-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.task-card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}
.task-card-des {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
/*
 * 剧情命中行：用强调色与前面加标签，与「任务描述」区分开 ——
 * 否则用户会以为那句话是任务描述的一部分。
 */
.task-card-dialog-hit {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--accent-ink);
  word-break: break-word;
}
.task-card-dialog-hit-label {
  flex: 0 0 auto;
  padding: 0 4px;
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-ink);
  background: var(--paper-solid);
}
.task-card-dialog-hit-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dialog-search-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}
.task-card-rewards {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.task-card-reward {
  display: flex;
  align-items: center;
  gap: 3px;
}
.task-card-reward-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.task-card-reward-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}
.task-card-arrow {
  color: var(--text-faint);
  font-size: 20px;
  line-height: 1;
}

/* ---------- 详情 ---------- */
.detail-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.task-des {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
  text-shadow: none;
  -webkit-font-smoothing: antialiased;
}
.des2-quote {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: rgba(138, 106, 31, 0.10);
  border-left: 3px solid var(--gold);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 剧情对话独立行（满宽，消除左侧空隙） */
.step-dialog-row,
.get-task-dialog-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 2px;
  border-bottom: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.45));
  width: 100%;
  box-sizing: border-box;
}
.step-dialog-row:last-child {
  border-bottom: none;
}
.step-dialog-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.step-dialog-label {
  flex: 0 0 75px;
  width: 75px;
  flex-shrink: 0;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-muted, #6b5134);
  white-space: nowrap;
}

/* 详情弹窗与步骤内所有 label 固定宽度（75px），确保右侧内容垂直基准线绝对对齐 */
:deep(.ui-info-row__label) {
  flex: 0 0 75px;
  width: 75px;
  flex-shrink: 0;
}

/* UiInfoRow 值插槽内布局：全左对齐 */
.chip-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 4px;
  text-align: left;
}
.task-follow-up-list {
  min-height: 30px;
  padding: 1px 2px 7px;
  box-sizing: border-box;
}
.info-slot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
  width: 100%;
  text-align: left;
}
.dialog-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.dialog-raw {
  display: block;
  width: 100%;
  text-align: left;
}
.dialog-name-label {
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-word;
}
.dialog-loading {
  font-size: 12px;
  color: var(--text-muted);
}
.muted-text {
  color: var(--text-muted);
}
.empty-value-text {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

/* 步骤内部全部左对齐 */
.step-body :deep(.ui-info-row) {
  justify-content: flex-start;
}
.step-body :deep(.ui-info-row__value) {
  text-align: left;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
}

/* 奖励网格 */
.reward-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.reward-text-chip {
  justify-self: start;
}

/* 步骤折叠块 */
.step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step-accordion :deep(.ui-accordion__title) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.step-no {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-ink);
  margin-top: 1px;
}
.step-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  text-align: left;
  line-height: 1.45;
  word-break: break-word;
  white-space: normal;
}
.step-type-tag {
  flex-shrink: 0;
  margin-top: 1px;
}
.step-body {
  display: flex;
  flex-direction: column;
}
.step-reward-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 2px 6px 2px 0;
}
.step-reward-chip.clickable {
  cursor: pointer;
}
.step-reward-chip.clickable:hover {
  color: var(--accent-ink);
}
.step-reward-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

/* 狩猎目标：怪物小图标 */
.monster-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 2px 10px 2px 0;
}
.monster-chip.clickable {
  cursor: pointer;
}
.monster-chip.clickable:hover .monster-name {
  color: var(--accent-ink);
}
.monster-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
}
.monster-name {
  font-size: 13px;
  color: var(--text-main);
}

/* 提交/获取道具：图标 + 名称 + 数量 */
.submit-item-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 2px 10px 2px 0;
}
.submit-item-chip.clickable {
  cursor: pointer;
}
.submit-item-chip.clickable:hover .submit-item-name {
  color: var(--accent-ink);
}
.submit-item-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex-shrink: 0;
}
.submit-item-name {
  font-size: 13px;
  color: var(--text-main);
}
.submit-item-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

/* 手机端适配 */
@media (max-width: 640px) {
  .task-list-row {
    flex-wrap: wrap;
  }
  .task-list-row :deep(.ui-list-row__right) {
    width: 100%;
    justify-content: space-between;
    border-top: 1px dashed var(--border-soft);
    padding-top: 6px;
  }
  .step-accordion :deep(.ui-accordion__head) {
    align-items: flex-start;
    padding: 8px 10px;
  }
}
</style>
