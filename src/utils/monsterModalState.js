import { reactive } from 'vue'

/**
 * 全局怪物详情弹层状态。
 *
 * 与 `itemModalState` 同构：任意页面调用 `openMonsterDetail(id)` 即可弹出怪物详情，
 * **不跳转、不离开当前页面**。用于 `/daily`、`/dungeons`、`/chapters` 里点到怪物名时查看资料。
 *
 * ## 为什么不复用 /monsters 的 URL 方式
 * `MonsterDetailModal` 原本硬绑 `/monsters?id=`：`loadMonster()` 里有
 * `if (route.path !== '/monsters') return`，只能在该页使用。
 * 现在增加可选 `monsterId` prop，传入时优先用它，路由方式保持原样。
 *
 * ## 滚动位置
 * `openMonsterDetail()` 在弹层打开**之前**记下 `.app-container` 的 scrollTop，
 * 由 `MonsterDetailModal` 通过 `UiModal` 的 `restore-scroll-top` 传回去 —— 与物品详情一致。
 * 必须在打开前记：覆盖式弹层会把 `.app-main` 锁为视口高、页面被钳到顶部，
 * 打开后再读就只剩 0。
 */
export const monsterModalState = reactive({
  visible: false,
  /** 要展示的形态 id（`monsters.json` 里 `forms[].id` 或 `summons[].id`） */
  monsterId: '',
  /** 来源关卡或指定的初始等级，null 时默认取怪物配置等级 */
  initialLevel: null,
  /** 场景生命缩放系数（如割草经验本中的 0.3） */
  scaleHp: 1,
  /** 场景攻防缩放系数 */
  scaleAtk: 1,
  /** 打开前的滚动位置，关闭时恢复 */
  savedScrollTop: 0
})

/** 记录滚动位置的容器（与物品详情保持一致） */
function currentScrollTop() {
  if (typeof document === 'undefined') return 0
  return document.querySelector('.app-container')?.scrollTop || 0
}

export function openMonsterDetail(monsterId, savedScrollTop = null, initialLevel = null, options = {}) {
  const id = String(monsterId ?? '').trim()
  if (!id) return
  monsterModalState.savedScrollTop = savedScrollTop == null ? currentScrollTop() : Number(savedScrollTop) || 0
  monsterModalState.monsterId = id
  monsterModalState.initialLevel = initialLevel ? Number(initialLevel) : null
  monsterModalState.scaleHp = options?.scaleHp != null ? Number(options.scaleHp) : (options?.levelScaleHp != null ? Number(options.levelScaleHp) : 1)
  monsterModalState.scaleAtk = options?.scaleAtk != null ? Number(options.scaleAtk) : (options?.levelScale != null ? Number(options.levelScale) : 1)
  monsterModalState.visible = true
}

/**
 * 关闭并清空弹层状态。
 *
 * 目前没有调用方：关闭走的是 `UiModal` 的 `update:visible`（改 `visible` 即可），
 * 其余字段在下次 `openMonsterDetail` 时被整体覆盖。
 * 保留它是为了让「状态机只有一个出口」这件事有落点 —— 一旦将来出现
 * 需要在关闭时清 URL 或清缓存的场景，改这里而不是再加一处 `visible = false`。
 * 若长期无人使用，删除时连同 `savedScrollTop` 一起评估（见下方注释）。
 */
export function closeMonsterDetail() {
  monsterModalState.visible = false
  monsterModalState.monsterId = ''
  monsterModalState.initialLevel = null
  monsterModalState.scaleHp = 1
  monsterModalState.scaleAtk = 1
}
