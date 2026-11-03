/**
 * 章节锁定产物：public/data/parsed/chapter-lock.json
 *
 * 输出「只可能从第四、五章获得的物品 id」集合，供构建期与运行时共用。
 *
 * 判据与验证见 `scripts/parse/chapterLock.mjs` 文件头。核心是**扫描全部来源表**
 * （reward / petPool / menu / shop / itemExchange / formula / task），
 * 只在「有 c4/c5 来源且无任何其他来源」时才算锁定，避免误伤：
 *   - 蛋（petPool 常驻卡池）
 *   - 料理（menu 食谱）
 *   - 通用事件奖励（event_e_sp2）
 *
 * 独立成产物而不是塞进 items.json 的原因：
 *   1) 物品构建器（src/utils/itemParser.js）不必知道章节概念
 *   2) 规则变更只需重跑这一份，不牵动 items 主产物
 *   3) 页面可按需加载
 */
import { buildChapterLock } from './chapterLock.mjs'
import { readJson } from './shared.mjs'

export function buildChapterLockFile() {
  const locked = buildChapterLock({ readJson })
  return {
    file: 'parsed/chapter-lock.json',
    data: {
      schemaVersion: 1,
      /* 说明用途，避免被误当成「全部隐藏物品」 */
      note: '只可能从第四/五章获得的物品 id；手写黑名单见 src/config/blacklist.js',
      hiddenChapters: [4, 5],
      ids: [...locked].sort()
    }
  }
}
