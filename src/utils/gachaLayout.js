/**
 * 卡池页面坐标系（游戏原始设计分辨率）。
 *
 * 来源：`game.taptap.tqpmyrzg/assets/Android/AssetBundle/prefab/uiprefab/heropoolpanel`
 * 的 NGUI prefab。原始 Transform 坐标以画面中心为原点，参考分辨率由这些证据确定：
 *   - `background/white` 平铺贴图 1534×750（同 UIPanel 的 `mask`/`fb_page_black` 高 750）
 *   - `TweenParent/mask` 位于 x=-767（左边界）、`TopRight/Back` 位于 (587,335)（右上角）
 *   - `periodType` x=461、`Buttons` 锚点 pixelOffset (-267,35)（右下角）
 * 半宽 767 = 1534/2、半高 375 = 750/2，因此设计画布为 1534×750。
 *
 * 页面按 min(容器宽/1534, 容器高/750) 等比缩放后居中，保证与游戏构图一致且不裁切。
 */

export const GACHA_DESIGN_WIDTH = 1534
export const GACHA_DESIGN_HEIGHT = 750

/** 设计坐标 → CSS 定位（canvas 已固定为 1534×750 且居中，故可直接用百分比 + 偏移）。 */
export function gachaPos(x = 0, y = 0) {
  return {
    left: `calc(50% + ${x}px)`,
    top: `calc(50% - ${y}px)`
  }
}

/** 等比适配缩放比（宽高都要放得下，contain）；尺寸为 0 时回退 1，避免 0 尺寸容器把画布压成 0。 */
export function gachaFitScale(width, height) {
  if (!width || !height) return 1
  return Math.min(width / GACHA_DESIGN_WIDTH, height / GACHA_DESIGN_HEIGHT)
}

/**
 * 仅按高度适配的参考比，用于判断窗口是否因宽度不足而进入窄屏提示。
 * 实际画布缩放由 GachaStage 同时取可用宽、高的较小值，避免固定坐标内容被裁切。
 */
export function gachaFitScaleByHeight(height) {
  if (!height) return 0
  return height / GACHA_DESIGN_HEIGHT
}

/**
 * 解析招募页与概率详情 UP 框内的头像路径（与源码 `HeroPoolUI` / `HeroPoolTips` 一致）：
 * - 伙伴：`heroDataById.Icon` → `HeadIconAtals/at<NNN>_0.webp`（`new_hero_*` 为 `_1.webp`）；
 * - 魔物蛋：`petMonDataById.icon` → `HeadIconAtals/avatar_pet_<NNN>.webp`（不是图鉴全身图 `colect_mon_*`）。
 */
export function resolveGachaUpAvatar(candidate, kind = '') {
  const typeId = String(candidate?.typeId ?? '')
  if (kind === 'hero' || (!kind && typeId.includes('hero'))) {
    const plain = /^hero_0*(\d+)$/.exec(typeId)
    if (plain) return `/images/HeadIconAtals/at${String(plain[1]).padStart(3, '0')}_0.webp`
    const variant = /^new_hero_0*(\d+)$/.exec(typeId)
    if (variant) return `/images/HeadIconAtals/at${String(variant[1]).padStart(3, '0')}_1.webp`
  } else if (kind === 'pet' || typeId.startsWith('pet_')) {
    const petMatch = /^pet_0*(\d+)$/.exec(typeId)
    if (petMatch) return `/images/HeadIconAtals/avatar_pet_${String(petMatch[1]).padStart(3, '0')}.webp`
  }
  return candidate?.icon ?? ''
}
