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
 * 打开时记录当前滚动位置，关闭时恢复 —— 与物品详情一致，
 * 否则关掉弹层后列表会跳回顶部。
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

export function closeMonsterDetail() {
  monsterModalState.visible = false
  monsterModalState.monsterId = ''
  monsterModalState.initialLevel = null
  monsterModalState.scaleHp = 1
  monsterModalState.scaleAtk = 1
}
