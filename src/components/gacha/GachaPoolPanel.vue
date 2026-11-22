<template>
  <!-- 窄窗口完整缩放固定坐标控件，宽窗口只延展布景，立绘与按钮保持原比例。 -->
  <GachaStage :backdrop="getImageUrl(customBg || '/images/gacha/gacha_cardbackground_main_output.webp')" fit="height">
    <!-- ── 背景层：prefab `gacha_pool_BG`（深度 0~3）。
         源码 `HeroPoolUI.RefreshPoolBg`：当 `poolTimeConf.poolBg` 存在时（如公主招募
         `gacha_bg_chara060`、幽夜招募 `gacha_bg_chara071`）展示专属背景（1680×1000）
         并隐藏前景工作台 `desk`；否则展示默认工作台 BG_main/BG_main_blured/BG_HL + desk。 ── -->
    <div v-if="customBg" class="g-abs g-layer-bg pool-scenery" :style="gachaPos(0, 0)">
      <img
        :key="customBg"
        :src="getImageUrl(customBg)"
        alt=""
        class="pool-bgcustom"
      />
    </div>
    <template v-else>
      <div class="g-abs g-layer-bg pool-scenery" :style="gachaPos(0, 0)">
        <img
          :src="getImageUrl('/images/gacha/gacha_cardbackground_main_output_blur.webp')"
          alt=""
          class="pool-bgmain"
        />
      </div>
      <div class="g-abs g-layer-bg pool-scenery" :style="gachaPos(0, 0)">
        <img
          :src="getImageUrl('/images/gacha/gacha_cardbackground_main_output_blured.webp')"
          alt=""
          class="pool-bgblur"
        />
      </div>
      <!-- BG_HL：depth 1，TweenAlpha 0.5↔0.65 呼吸（style=2 ping-pong） -->
      <div class="g-abs g-layer-bg pool-scenery" :style="gachaPos(0, 0)">
        <img
          :src="getImageUrl('/images/gacha/gacha_cardbackground_HL_output.webp')"
          alt=""
          class="pool-hl"
        />
      </div>
      <!-- desk：前景桌面，depth 1，scale 1.25 @(0,-18) -->
      <div class="g-abs g-layer-bg pool-foreground" :style="gachaPos(0, -18)">
        <img :src="getImageUrl('/images/gacha/elsa_desk_foreground.webp')" alt="" />
      </div>
    </template>
    <!-- TweenParent/mask：fb_page_black 480×750，prefab RECT(L:0/-100 R:0/380) → 1534 画布中心 (-627,0)，depth 2（左侧压暗） -->
    <div class="g-abs g-layer-bg" :style="gachaPos(-627, 0)">
      <img :src="getImageUrl('/images/InsBattlePanel_Atlas/fb_page_black.webp')" alt="" class="pool-side-mask" />
    </div>
    <!-- Draw/Heros：depth 3，切池时 TweenScale 1.2→1.0 + TweenAlpha 0→1。
         游戏用 `MakePixelPerfect` 按贴图原始像素显示（角色池 1680×1000、魔物蛋池 879×946），
         所以这里不给宽高，避免把竖幅的蛋池主视觉横向拉伸。 -->
    <div class="g-abs g-layer-bg" :style="gachaPos(0, 0)">
      <img
        :key="pool.id"
        :src="getImageUrl(pool.assets.cover)"
        alt=""
        class="pool-cover"
      />
    </div>

    <!-- ── 标题：Title UIAnchor(TopLeft, off=(156,-76)) → 1534×750 画布 (-611,299)，titleHero / titlePetEgg 为 512×152 原画
         （顶边与左边均贴齐画布边缘，与游戏截图一致）。
         prefab 另有 `Title/bg`(com_info_botm 217×24) 与 `Title/Label`（「招募来自各地的伙伴」），
         但源码从不给它们赋值、游戏画面里也不出现，故不渲染。

         **本页新增**：标题图兼作「返回首页」入口（游戏内无此交互）。
         仍用 `g-abs` + `gachaPos` 定位，尺寸由 `.pool-title-art` 决定，布局与纯图片时一致。 ── -->
    <button
      class="g-abs g-layer-interactive g-hit g-focusable pool-title-btn"
      :style="gachaPos(-611, 299)"
      type="button"
      title="返回首页"
      aria-label="返回首页"
      @click="emit('home')"
    >
      <img
        :src="getImageUrl(`/images/HeroPoolPanel_Atlas/${kind === 'hero' ? 'gacha_title_chara' : 'gacha_title_egg'}.webp`)"
        :alt="kind === 'hero' ? '伙伴招募' : '魔物蛋贩售'"
        class="pool-title-art"
      />
    </button>

    <!-- ── 保底提示：RareTip RECT(L:0/44 R:0/72 B:0/78 T:0/106) → 左基准 -723，y=-283，icon_info 28×28 + Label（prefab fontSize=20）。 ── -->
    <div v-if="safeHint" class="g-abs g-layer-ui safe-hint" :style="{ left: 'calc(50% - 723px)', top: 'calc(50% + 283px)' }">
      <img :src="getImageUrl('/images/Common_Atlas/icon_info.webp')" alt="" class="safe-hint__icon" />
      <span class="g-text g-text--md safe-hint__text">{{ safeHint }}</span>
    </div>

    <!-- ── 概率详情 / 记录查询：Rate RECT(L:0/36..188 → -655,-330)、record RECT(L:0/192..344 → -499,-330)，
         com_btn_mini 152×40 sliced；Label 字号 18（prefab）── -->
    <button
      class="g-abs g-layer-interactive g-hit g-focusable g-slice g-slice--btn-mini mini-btn"
      :style="gachaPos(-655, -330)"
      type="button"
      @click="emit('rate')"
    >
      <span class="g-text">概率详情</span>
    </button>
    <button
      class="g-abs g-layer-interactive g-hit g-focusable g-slice g-slice--btn-mini mini-btn"
      :style="gachaPos(-499, -330)"
      type="button"
      @click="emit('record')"
    >
      <span class="g-text">记录查询</span>
    </button>

    <!-- ── 货币条：TopRight off=(-289,-40)，在 1534×750 画布下右移 +100px ──
         行末贴在 design x=562（与音效开关中心 598、✕ 中心 687 保持同距）。 -->
    <div
      class="g-abs g-layer-ui currency-row"
      :style="{ right: 'calc(50% - 562px)', top: 'calc(50% - 335px)', transform: 'translateY(-50%)' }"
    >
      <div
        v-for="slot in currencySlots"
        :key="slot.key"
        class="currency-slot"
      >
        <div class="g-slice g-slice--top-item currency-slot__bg" aria-hidden="true"></div>
      <img :src="getImageUrl(slot.icon)" :alt="slot.name" class="currency-slot__icon" />
      <span
        class="g-text currency-slot__label"
        :class="{ 'g-text--danger': !slot.enough }"
        :title="`${slot.name}：模拟持有 ${slot.hold}${slot.need ? `，本次抽取需要 ${slot.need}` : ''}`"
      >
        {{ slot.hold }}
      </span>
      <button
        class="g-hit g-focusable currency-slot__add"
        type="button"
        :title="`补充模拟${slot.name}`"
        @click="emit('topup', slot.typeId)"
      >
        <img :src="getImageUrl('/images/MainPanel/M_rt_btn_add.webp')" alt="补充" />
      </button>
    </div>

    </div>

    <!-- ── 期次：prefab `periodType` UIAnchor 为 TopRight pixelOffset(-193,-175)，
         在 1534×750 设计画布下中心 (574, 200)，与下方 `exchangeBtn`(-4,-117 → X=570,Y=83)、
         `ChanceUp`(573) 对齐，同时避开 `gacha_chara071` 画面内的「幽夜之影 洛莉安」文字。 ── -->
    <div class="g-abs g-layer-ui" :style="gachaPos(574, 200)">
      <img :src="getImageUrl(`/images/HeroPoolPanel_Atlas/${periodSprite}.webp`)" alt="" class="pool-period" />
    </div>
    <!-- longPeriod (-1,-54)：永久池显示「永·久·开·放」，底板 `gacha_name_stay` 228×32（prefab `longPeriod/bg`） -->
    <div v-if="isPermanent" class="g-abs g-layer-ui period-badge" :style="gachaPos(573, 146)">
      <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_name_stay.webp')" alt="" class="period-badge__bg" />
      <span class="g-text g-text--xs period-badge__text">永·久·开·放</span>
    </div>
    <!-- limitedPeriod (-47,-54) 是 Pivot=Left 的时间文本；其子 bg (+47,0) `gacha_name_limit` 228×32
         实际居中在 (574,146)，与上方 periodType(574,200) 与下方 exchangeBtn(570,83) 对齐。 -->
    <div v-else class="g-abs g-layer-ui period-badge period-badge--limit" :style="gachaPos(574, 146)">
      <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_name_limit.webp')" alt="" class="period-badge__bg" />
      <span class="g-text g-text--sm g-text--gold period-badge__limit-time">{{ remainingText }}</span>
      <span v-if="remainingText !== '已结束'" class="g-text g-text--sm period-badge__limit-over">后结束</span>
    </div>
    <!-- exchangeBtn (-4,-117 relative to periodType → X=570,Y=83)：有礼包入口时显示兑换按钮 -->
    <button
      v-if="hasExchange"
      class="g-abs g-layer-interactive g-hit g-focusable exchange-btn"
      :style="gachaPos(570, 83)"
      type="button"
      :title="`打开礼包：${pool.packDisplay}`"
      @click="emit('exchange')"
    >
      <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_btn_exchange.webp')" alt="礼包兑换" />
    </button>

    <!-- ── 角色 / 魔物蛋 切换：heroTypeTog RECT(L:0/22..190 → -661,233)、petTypeTog RECT(L:0/190..358 → -493,233)，168×84 ── -->
    <button
      class="g-abs g-layer-interactive g-hit g-focusable kind-toggle"
      :style="gachaPos(-661, 233)"
      type="button"
      :aria-pressed="kind === 'hero'"
      @click="emit('update:kind', 'hero')"
    >
      <img :src="getImageUrl(`/images/HeroPoolPanel_Atlas/${kind === 'hero' ? 'gacha_page_chara_on' : 'gacha_page_chara'}.webp`)" alt="角色招募" />
    </button>
    <button
      v-if="petOpen"
      class="g-abs g-layer-interactive g-hit g-focusable kind-toggle"
      :style="gachaPos(-493, 233)"
      type="button"
      :aria-pressed="kind === 'pet'"
      @click="emit('update:kind', 'pet')"
    >
      <img :src="getImageUrl(`/images/HeroPoolPanel_Atlas/${kind === 'pet' ? 'gacha_page_egg_on' : 'gacha_page_egg'}.webp`)" alt="魔物蛋贩售" />
    </button>
    <div v-else class="g-abs g-layer-ui" :style="gachaPos(-493, 233)">
      <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_page_egg_disable.webp')" alt="魔物蛋（未开放）" />
    </div>

    <!-- ── 卡池页签：Toggles UIAnchor(TopLeft, off=(190,-231)) → 1534×750 (-583, 144)，左边缘对齐「伙伴」按钮（−745）。
         prefab 结构：底板 `Common`(gacha_page / gacha_page_sp) + 头像 `Icon` + 选中高光与右菱形标记 `Sprite`(gacha_page_on)。 ── -->
    <button
      v-for="(item, index) in pools"
      :key="item.id"
      class="g-abs g-layer-interactive g-hit g-focusable pool-tab"
      :style="gachaPos(-583, 144 - index * 90)"
      type="button"
      :aria-pressed="item.id === pool.id"
      @click="emit('select-pool', item.id)"
    >
      <div
        class="pool-tab__bg g-slice"
        :class="tabSliceClass(item)"
        aria-hidden="true"
      ></div>
      <img
        :src="getImageUrl(`/images/HeroPoolPanel_Atlas/${item.assets.poolSprite}.webp`)"
        alt=""
        class="pool-tab__icon"
        :class="item.kind === 'hero' ? 'pool-tab__icon--hero' : 'pool-tab__icon--pet'"
      />
      <div
        v-if="item.id === pool.id"
        class="pool-tab__active g-slice g-slice--tab-on"
        aria-hidden="true"
      ></div>
      <span class="g-text g-text--sm pool-tab__label">{{ item.name }}</span>
      <template v-if="tabTime(item)">
        <div class="pool-tab__time-bar">
          <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_page_time.webp')" alt="" class="pool-tab__time-bg" />
          <span class="g-text g-text--xs pool-tab__time">
            <template v-if="tabTime(item) === '已结束'">
              <span class="pool-tab__time-over">已结束</span>
            </template>
            <template v-else>
              <span class="pool-tab__time-val">{{ tabTime(item) }}</span><span class="pool-tab__time-over"> 后结束</span>
            </template>
          </span>
        </div>
      </template>
    </button>

    <!-- ── 指定伙伴：ChanceUp UIAnchor(BottomRight, off=(-94,315)) → 1534 画布 (673,-60)；
         descBg `gacha_up_botm` 400×140 @(-99,-53)（绝对 574,-113）
         desc1 「指定伙伴/指定魔物蛋」 fontSize=28、pivot=Right、右端落在 589
         desc0 「概率提升！」 @(696,-124) ── -->
    <template v-if="upCandidates.length">
      <div class="g-abs g-layer-art up-plate-wrap" :style="gachaPos(574, -113)">
        <img :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_up_botm.webp')" alt="" class="up-plate" />
      </div>
      <div class="g-abs g-layer-ui g-text up-label" :style="gachaPos(589, -124)">
        {{ kind === 'hero' ? '指定伙伴' : '指定魔物蛋' }}
      </div>
      <div class="g-abs g-layer-ui g-text up-label up-boost" :style="gachaPos(696, -124)">概率提升！</div>

      <button
        v-for="(candidate, index) in upCandidates"
        :key="candidate.typeId"
        class="g-abs g-layer-interactive g-hit g-focusable up-slot"
        :style="gachaPos(673 + index * 100, -60)"
        type="button"
        :title="`${candidate.name}（点击查看详情）`"
        @click="emit('open-candidate', candidate)"
      >
        <img :src="getImageUrl(`/images/HeroPoolPanel_Atlas/at_f_${candidate.quality}.webp`)" alt="" class="up-slot__frame" />
        <img :src="getImageUrl(upAvatar(candidate))" :alt="candidate.name" class="up-slot__icon" />
        <!-- 概率提升角标：prefab `chanceUp` = com_up 24×56 @(37.9,0) -->
        <img :src="getImageUrl('/images/Common_Atlas/com_up.webp')" alt="" class="up-slot__badge" />
      </button>
    </template>

    <!-- ── 抽取按钮：Buttons UIAnchor(BottomRight, off=(-267,35)) → 1534 画布 (500,-340)，One (-204,24)、Ten (87,24)。
         **两个按钮精灵不同**：单抽 `com_btn_N_sp`（红 均色 127,48,24）、十连 `com_btn_Y_sp`（青 30,92,103），
         均为 128×72 经 9 宫格拉伸到 292×72；按钮内只有「招募一次/十次」文案。 ── -->
    <button
      v-for="option in drawOptions"
      :key="option.count"
      class="g-abs g-layer-interactive g-hit g-focusable g-slice draw-btn"
      :class="[option.count === 1 ? 'g-slice--btn-n' : 'g-slice--btn-y', { 'g-hit--disabled': !option.enabled }]"
      :style="gachaPos(500 + option.offsetX, -316)"
      type="button"
      :disabled="!option.enabled"
      @click="emit('draw', option.count)"
    >
      <span class="g-text draw-btn__label" :class="{ 'draw-btn__label--ten': option.count === 10 }">{{ option.label }}</span>
    </button>

    <!-- ── 抽取消耗行：在按键**上方**，跟随 Buttons 锚点 (500,-264)。 ── -->
    <div
      v-for="option in drawOptions"
      :key="`cost-${option.count}`"
      class="g-abs g-layer-ui draw-cost"
      :style="gachaPos(500 + option.offsetX, -264)"
    >
      <img class="draw-cost__plate" :src="getImageUrl('/images/HeroPoolPanel_Atlas/gacha_btn_tag.webp')" alt="" />
      <img class="draw-cost__icon" :src="getImageUrl(option.ticket.icon)" alt="" />
      <span class="g-text g-text--md" :class="{ 'g-text--danger': !option.ticket.enough }">{{ option.ticket.text }}</span>
      <template v-if="option.exchange">
        <span class="g-text g-text--md draw-cost__or">或</span>
        <img class="draw-cost__icon" :src="getImageUrl(option.exchange.icon)" alt="" />
        <span class="g-text g-text--md" :class="{ 'g-text--danger': !option.exchange.enough }">{{ option.exchange.text }}</span>
      </template>
    </div>

    <!-- ── 关闭：TopRight off=(-289,-40) + Back(209,0) → 1534 画布 (687,335)，prefab 用的是 com_btn_close（✕） ── -->
    <button
      class="g-abs g-layer-interactive g-hit g-focusable close-btn"
      :style="gachaPos(687, 335)"
      type="button"
      title="返回"
      @click="emit('close')"
    >
      <img :src="getImageUrl('/images/Common_Atlas/com_btn_close.webp')" alt="返回" />
    </button>

    <!-- ── 音效开关（本页新增，游戏内无对应控件）：放在货币条与关闭按钮之间（货币条末 562、✕ 从 637 起，中心 598）。 ── -->
    <button
      class="g-abs g-layer-interactive g-hit g-focusable sound-btn"
      :class="{ 'sound-btn--off': !soundOn }"
      :style="gachaPos(598, 335)"
      type="button"
      :title="soundOn ? '关闭演出音效' : '开启演出音效'"
      @click="emit('toggle-sound')"
    >
      <img
        :src="getImageUrl(soundOn ? '/images/HeroInfoPanel_Atlas/chara_btn_voice.webp' : '/images/HeroInfoPanel_Atlas/chara_btn_voice_press.webp')"
        :alt="soundOn ? '音效开' : '音效关'"
      />
    </button>

    <!-- 模拟数据说明：左边缘对齐「伙伴」按钮（−745）。 -->
    <div class="g-abs g-layer-ui sim-note" :style="{ left: 'calc(50% - 745px)', top: 'calc(50% - 310px)', transform: 'none' }">
      <span class="g-text g-text--xs sim-note__text">
        模拟招募 · 抽卡资源与数据均为本地推演{{ pullCount ? ` · 已抽 ${pullCount} 次` : '' }}
      </span>
      <button
        class="sim-note__reset g-focusable"
        type="button"
        title="清空本地模拟数据（保底、记录、钱包）"
        @click="emit('reset')"
      >
        <span class="g-text g-text--xs">重置</span>
      </button>
    </div>

    <slot />
  </GachaStage>
</template>

<script setup>
/**
 * 卡池主页面（游戏 `HeroPoolPanel` + `HeroPoolUI` 的还原）。
 *
 * 布局坐标全部取自原始 prefab（`assets/Android/AssetBundle/prefab/uiprefab/heropoolpanel`），
 * 注释里的 `(x, y)` 即 prefab 中的 Transform 局部坐标（设计画布 1534×750，原点居中）。
 * 组件只负责展示与交互事件，抽卡规则在 `utils/gachaSim.js`，状态在 `stores/gachaState.js`。
 *
 * 与游戏的已知差异（有意为之，见 dev-log）：
 *   - 未实现右上角货币条：余额属于账号数据，静态图鉴不虚构；
 *   - 未实现卡池物品格 `itemTemp`、蜡烛/灯光粒子与 3D 演出，用 CSS 近似；
 *   - 新增「音效开关 / 模拟说明 / 重置」三个本页控件（游戏内无对应元素）。
 */
import { computed, ref } from 'vue'
import GachaStage from './GachaStage.vue'
import { gachaPos, resolveGachaUpAvatar } from '../../utils/gachaLayout'
import { getImageUrl } from '../../utils/env'
import { buildCurrencySlots, buildDrawOptions } from '../../utils/gachaCurrency'
import { getPityConfig } from '../../utils/gachaSim'

const props = defineProps({
  /** 当前大类：hero（角色）或 pet（魔物蛋）。 */
  kind: { type: String, default: 'hero' },
  /** 当前大类下的卡池列表（用于页签）。 */
  pools: { type: Array, default: () => [] },
  /** 当前选中的卡池。 */
  pool: { type: Object, required: true },
  /** 模拟运行时（保底计数），未抽过为 null。 */
  runtime: { type: Object, default: null },
  /** 模拟累计抽取次数，仅用于展示。 */
  pullCount: { type: Number, default: 0 },
  /** 魔物蛋入口是否开放（对应 `UIManager.GuidePanel.CheckPetOpen()`）。 */
  petOpen: { type: Boolean, default: true },
  /** 演出音效开关状态。 */
  soundOn: { type: Boolean, default: true },
  /** 模拟钱包持有量：typeId → 数量（货币与消耗券共用）。 */
  wallet: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'update:kind', 'select-pool', 'rate', 'record', 'draw',
  'close', 'exchange', 'open-candidate', 'toggle-sound', 'reset', 'topup', 'home'
])

/** 指定伙伴 / 指定魔物蛋：候选里 isUp 的项。 */
const upCandidates = computed(() =>
  (props.pool.tiers ?? []).flatMap(tier => tier.candidates ?? []).filter(item => item.isUp)
)

/** 期次贴图：原表 `imgTitle`（gacha_name_chara / _sp / gacha_name_egg / _sp）。 */
const periodSprite = computed(() => props.pool.assets?.titleSprite || 'gacha_name_chara')

/** 永久池判定：游戏按 `closeTimeSpan - now` 是否 ≥365 天选择 longPeriod 或倒计时。 */
const isPermanent = computed(() => {
  const closes = Number(props.pool.closesAt)
  if (!Number.isFinite(closes)) return true
  return (closes - Date.now()) / 86400000 >= 365
})

/**
 * 限时池倒计时文案：严格对齐源码 `ExtentionMethod.TimeFormat3`——**只输出单一时间单位**
 * （≥1 天只显示「N 天」，不足 1 天显示「N 小时」，再不足显示「N 分钟」），
 * 绝不出现「X 天 Y 小时」这种拼接。
 */
const remainingText = computed(() => {
  const closes = Number(props.pool.closesAt)
  if (!Number.isFinite(closes)) return ''
  const remain = closes - Date.now()
  if (remain <= 0) return '已结束'
  const mins = Math.floor(remain / 60000)
  if (mins < 60) return '1 分钟'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.floor(hours / 24)
  return `${days} 天`
})

/** 有礼包入口才显示兑换按钮（对应 `exchangeBtn.SetActive(!string.IsNullOrEmpty(packDisplay))`）。 */
const hasExchange = computed(() => Boolean(props.pool.packDisplay))

/** 卡池专属背景（来自 `heroPoolTime.poolBg`，如 `gacha_bg_chara060` / `gacha_bg_chara071`）。 */
const customBg = computed(() => props.pool?.assets?.bg || '')

/** 保底提示：对应 `HeroPoolUI.RefreshSafe`，文案与源码逐字一致（`$"{text}{safe}次后必为5星{text2}！"`）。 */
const safeHint = computed(() => {
  const config = getPityConfig(props.pool)
  if (!config.topSafe) return ''
  const pity = Number(props.runtime?.pity?.[config.topRank] ?? 0)
  const left = Math.max(config.topSafe - pity, 0)
  const noun = props.kind === 'hero' ? '伙伴' : '魔物'
  const verb = props.kind === 'hero' ? '招募' : '购买'
  if (left <= 1) return `本次${verb}必为5星${noun}！`
  return `${verb}${left}次后必为5星${noun}！`
})

/** 页签底图：永久池用 gacha_page、限时池用 gacha_page_sp（对应 HeroPoolUI.Init）；选中态用 gacha_page_on。 */
function tabSprite(item) {
  const closes = Number(item.closesAt)
  const permanent = !Number.isFinite(closes) || (closes - Date.now()) / 86400000 >= 365
  return permanent ? 'gacha_page' : 'gacha_page_sp'
}

/** 页签底板类：按池次固定用 `gacha_page`（常驻）或 `gacha_page_sp`（限时），选中高光叠在 `.pool-tab__active`。 */
function tabSliceClass(item) {
  return tabSprite(item) === 'gacha_page' ? 'g-slice--tab' : 'g-slice--tab-sp'
}

/** 页签倒计时：永久池不显示；限时池按源码 `HeroPoolUI` + `ExtentionMethod.TimeFormat5` 输出单级单位（N天 / N小时 / 1分钟）。 */
function tabTime(item) {
  const closes = Number(item.closesAt)
  if (!Number.isFinite(closes)) return ''
  const remain = closes - Date.now()
  if (remain <= 0) return '已结束'
  if ((remain / 86400000) >= 365) return ''
  const mins = Math.floor(remain / 60000)
  if (mins < 60) return '1分钟'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时`
  return `${Math.floor(hours / 24)}天`
}

/** 单抽 / 十连按钮与货币条：与招募结果一览共用同一构建器（utils/gachaCurrency.js）。 */
const drawOptions = computed(() => buildDrawOptions(props.pool, props.wallet, props.kind))
const currencySlots = computed(() => buildCurrencySlots(props.pool, props.wallet, props.kind))

const upAvatar = candidate => resolveGachaUpAvatar(candidate, props.kind)
</script>

<style scoped>
.pool-scenery {
  width: max(100%, 1680px);
  height: 1000px;
  overflow: hidden;
}

.pool-bgcustom {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 两张模糊纹理共用主图裁切框（次级模糊边略外扩），角色立绘不拉伸。 */
.pool-bgmain,
.pool-bgblur {
  position: absolute;
  width: calc(100% * 2048 / 1680);
  height: calc(100% * 1024 / 1000);
  left: calc(-100% * 184 / 1680);
  top: calc(-100% * 12 / 1000);
  max-width: none;
}

/* BG_main_blured：1024×512，prefab 里 scale=(2,2) */
.pool-bgblur {
  opacity: 0.55;
}

.pool-hl {
  width: 100%;
  height: 100%;
  animation: gacha-breathe 2.4s ease-in-out infinite;
  pointer-events: none;
}

/* Draw/Heros：按贴图原始像素显示（角色池 1680×1000、魔物蛋池 879×946），
   依赖 MakePixelPerfect 语义，不做拉伸 */
.pool-cover {
  animation: gacha-scale-in 0.5s ease-out both;
  pointer-events: none;
}

.pool-foreground {
  width: max(100%, 2100px);
  height: 1250px;
  pointer-events: none;
}

.pool-foreground img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  opacity: 0.9;
}

.pool-side-mask {
  width: 480px;
  height: 750px;
  opacity: 0.72;
}

.pool-title-art {
  width: 512px;
  height: 152px;
}

/* 标题图兼作返回首页入口：按钮自身不撑尺寸，由内部 512×152 图决定，
   与纯图片时盒模型完全一致（深色/窄屏切换不得产生位移）。 */
.pool-title-btn {
  padding: 0;
  border: 0;
  background: none;
  line-height: 0;
}

.pool-title-plate {
  width: 217px;
  height: 24px;
  /* prefab `Title/bg` 的 UISprite mPivot=3 → Left：从 (-274.7,336.9) 向右展开 */
  left: calc(50% - 274.7px);
  transform: translateY(-50%);
}

.safe-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 左边缘锚定（左对齐），不再做水平居中 */
  transform: translateY(-50%);
  white-space: nowrap;
  /* prefab UILabel #49693: mEffectStyle=2 (Outline), mEffectColor=#000000 */
  text-shadow: -1px 0 0 #000, 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000;
}

/* 货币槽：bg 位于 -23（pivot=Left，向右展开），icon @0，Label @61，add @119。
   内容宽 162、槽间距 152（item→ke）与 169（ke→payKe），prefab 中相邻槽本就轻微交叠，
   NGUI 靠 mDepth（add=7 > 下一个槽的 bg=5）保证「+」可点；DOM 里改用 pointer-events：
   容器与背景不接收事件，只有 add 按钮可点，避免后一个槽挡住前一个槽的按钮。 */
/* 货币槽改为**行内统一布局**：图标 → 数字 → 「+」，间距固定。
   prefab 的 Label 是 90 宽居中框，3 位数在框内居中后比 5 位数更靠右，
   导致「契约书的数量偏右」，与氪金/神晶/银币不统一；行内布局让数字左边缘
   与图标的间距对所有槽一致。底牌按内容宽度 9 宫格拉伸。 */
/* 货币条槽位样式已抽到 assets/gacha.css（与招募结果一览共用，见 utils/gachaCurrency.js） */

.safe-hint__icon {
  width: 22px;
  height: 22px;
}

.mini-btn {
  width: 152px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  /* prefab UILabel：概率详情/记录查询 = #cfba96（ColorString[2]）18px。
     注意：此元素自带 border-image（g-slice--btn-mini），不能写 `border` 简写——
     简写会把 border-image 一起重置掉（精灵消失，切片测试会抓到）。 */
  color: #cfba96;
}

.mini-btn .g-text {
  color: var(--gacha-ink-gold);
}

/* 期次贴图 312×76 */
.pool-period {
  width: 312px;
  height: 76px;
  pointer-events: none;
}

/* 永久开放 / 限时倒计时的底板：gacha_name_stay / gacha_name_limit 228×32 */
.period-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 228px;
  height: 32px;
}

.period-badge__bg {
  position: absolute;
  inset: 0;
  width: 228px;
  height: 32px;
}

.period-badge__text {
  position: relative;
  /* prefab UILabel：永·久·开·放 = #cfba96（ColorString[2]）18px */
  color: #cfba96;
  white-space: nowrap;
}

/* 限时倒计时：底板 `gacha_name_limit` 228×32 左侧自带时钟图标（x=43..60）。
   prefab `limitedPeriod`（Pivot=Left, #ffd270）落在距底板左缘 67px（贴近时钟右侧）；
   子项 `over`（"后结束", Pivot=Left, #cfba96）相对 `limitedPeriod` 偏移 +64px → 距左缘 131px。 */
.period-badge--limit {
  display: block;
}

.period-badge__limit-time,
.period-badge__limit-over {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
}

.period-badge__limit-time {
  left: 66px;
}

.period-badge__limit-over {
  left: 131px;
  color: #cfba96;
}

.exchange-btn {
  border: 0;
  width: 260px;
  height: 72px;
  background: none;
  padding: 0;
}

.exchange-btn img { width: 260px; height: 72px; }

.kind-toggle {
  border: 0;
  width: 168px;
  height: 84px;
  background: none;
  padding: 0;
}

.kind-toggle img { width: 168px; height: 84px; }

/* 卡池页签：底图 128×84 经 9 宫格拉伸到 324×84（与 prefab mWidth 一致）；
   Icon 是**宽幅头像牌**（gacha_at_chara*_0 为 165×66、pet 为 184×84），
   必须按原图自然尺寸放在 -70 处，压成方块会把头像挤扁。 */
.pool-tab {
  border: 0;
  width: 324px;
  height: 84px;
  background: none;
  padding: 0;
  display: block;
  overflow: hidden;
}

.pool-tab__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.pool-tab__active {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.pool-tab__icon {
  position: absolute;
  left: calc(50% - 70px);
  top: 50%;
  transform: translate(-50%, -50%);
  /* 页签头像牌按卡池类型分开定尺寸（用户口径）：
     魔物蛋页签 height 84（贴图原生 184×84，蛋对位于贴图中段，左右为透明边距——
     底板边框从透明边距透出，层级天然高于图片）；伙伴页签维持 66 高、left −64。 */
  height: 84px;
  width: auto;
  z-index: 2;
}

.pool-tab__icon--hero {
  height: 66px;
  left: calc(50% - 64px);
}

.pool-tab__label {
  position: absolute;
  left: calc(50% + 62px);
  top: 50%;
  width: 152px;
  transform: translate(-50%, -50%);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 4;
  /* prefab UILabel #49708: fontSize=26, mColor=#e6d2af */
  font-size: 26px;
  font-weight: 600;
  color: #e6d2af;
}

/* 页签顶部倒计时：prefab `TimeIcon` pos=(81,30) `gacha_page_time` 128×20（左端自带时钟图标，
   左缘落在 x=+17，时钟图标起于 +18，与下方 4 字池名左缘 +18 对齐；
   纵坐标因底板顶部含 6px 外边距，取 -27px 使上缘与页签外框齐平不外溢）；
   `Time` pos=(42,30) pivot=Left，相对底板左缘偏移 42-17=25px。 */
.pool-tab__time-bar {
  position: absolute;
  left: calc(50% + 81px);
  top: calc(50% - 27px);
  transform: translate(-50%, -50%);
  width: 128px;
  height: 20px;
  display: flex;
  align-items: center;
  z-index: 4;
}

.pool-tab__time-bg {
  position: absolute;
  inset: 0;
  width: 128px;
  height: 20px;
}

.pool-tab__time {
  position: relative;
  padding-left: 25px;
  white-space: nowrap;
}

/* 源码 HeroPoolUI.cs:432：时长用 ColorString[1](#f8eedc)，「后结束」用 ColorString[2](#cfba96) */
.pool-tab__time-val {
  color: var(--gacha-ink);
}

.pool-tab__time-over {
  color: var(--gacha-ink-gold);
}

/* 指定伙伴区块：底板 400×140；`指定伙伴` 为 28px、右端贴 489（prefab pivot=Right） */
.up-plate {
  width: 400px;
  height: 140px;
}

/* 底板左端渐隐：游戏里这块底板左边缘是淡出的，硬边矩形会像一条横带切过立绘 */
.up-plate-wrap {
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 26%, #000 100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 26%, #000 100%);
}

.up-label {
  width: 180px;
  font-size: 28px;
  font-weight: 700;
  text-align: right;
  transform: translate(-100%, -50%);
  /* prefab UILabel #49806: 指定伙伴 = #cfba96 (ColorString[2]) */
  color: #cfba96;
}

/* desc0「概率提升！」与 desc1 同一行、同为 fontSize=28（prefab），此处改为居中紧贴内容宽，避免右缘超出 1534 画布 */
.up-boost {
  width: auto;
  text-align: left;
  transform: translate(-50%, -50%);
  /* prefab UILabel #49818: 概率提升！ = #f8eedc (ColorString[1]) */
  color: var(--gacha-ink);
}

.up-slot {
  border: 0;
  width: 100px;
  height: 100px;
  background: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 层级按 prefab 的 mDepth：`icon` 是 6、外框 `at_f_*` 是 7、角标 `com_up` 是 8
   → **外框必须压在头像之上**（头像写在后面会盖住外框）。
   另外外框的开窗偏下，头像要往下挪一点才落在框内（游戏里头顶上方留出一圈金边）。*/
.up-slot__frame {
  position: absolute;
  inset: 0;
  width: 100px;
  height: 100px;
  z-index: 2;
}

.up-slot__icon {
  position: relative;
  /* 头像垫在金环 at_f_N 之下（z-index 1 < 环 2）：prefab `heroPet/icon` 原尺寸为 76×76，
     恰好嵌入金环菱形内窗并避免外框四角溢边。 */
  top: 0;
  z-index: 1;
  width: 76px;
  height: 76px;
  object-fit: contain;
}

/* com_up 24×56 @(37.9, 0)：贴在头像右侧的「概率提升」角标 */
.up-slot__badge {
  position: absolute;
  z-index: 3;
  left: calc(50% + 37.9px);
  top: 50%;
  width: 24px;
  height: 56px;
  transform: translate(-50%, -50%);
}

/* 抽取按钮：com_btn_Y_sp 128×72 经 9 宫格拉伸到 292×72。
   按游戏排版：按钮内只有「招募一次/十次」，消耗行独立浮在按钮上方（见 .draw-cost） */
.draw-btn {
  width: 292px;
  height: 72px;
  padding: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.draw-btn__label {
  position: relative;
  font-size: 24px;
  font-weight: 700;
  /* prefab UILabel：招募/购买一次 = #cfba96（ColorString[2] 米金，配红钮） */
  color: #cfba96;
}

/* 招募/购买十次 = #33dad0（ColorString[6] 青，配青钮） */
.draw-btn__label--ten {
  color: #33dad0;
}

/* 抽取消耗行样式已抽到 assets/gacha.css（与招募结果一览共用） */

.close-btn {
  border: 0;
  width: 100px;
  height: 68px;
  background: none;
  padding: 0;
}

.close-btn img { width: 100px; height: 68px; }

.sound-btn {
  width: 48px;
  height: 48px;
  border: 0;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.sound-btn img {
  width: 48px;
  height: 48px;
}

.sound-btn:active img { filter: brightness(1.15); }

/* 关闭态：灰化变暗（无独立关图标，游戏只有开/按下两态） */
.sound-btn--off img {
  filter: grayscale(1) brightness(0.55);
  opacity: 0.8;
}

/* 重置模拟数据：按用户要求放在抽卡资源下方居中 */
.sim-note__reset {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(248, 238, 220, 0.32);
  background: rgba(20, 14, 8, 0.5);
  cursor: pointer;
}

.sim-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(12, 8, 4, 0.62);
  border: 1px solid rgba(248, 238, 220, 0.22);
  transform: translate(-50%, -50%);
  white-space: nowrap;
  /* 说明条按用户要求浮在画面最上层（高于交互层 60），且不设最大宽度——
     「已抽 N 次」后缀不得被省略号截断。 */
  z-index: 65;
}

/* 自己定义交互态：`.g-hit:active` 带 translate(-50%,-50%)，只适用于 .g-abs 居中元素，
   用在流内按钮上会让它按下时整体位移（用户报告「点重置按钮飞起来」）。 */
.sim-note__reset:hover { filter: brightness(1.15); }
.sim-note__reset:active { transform: scale(0.95); }

.sim-note__text {
  color: var(--gacha-ink-gold);
}

</style>
