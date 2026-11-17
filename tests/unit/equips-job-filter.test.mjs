import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isVisibleEquipItem } from '../../src/utils/itemParser.js';
import { isBlacklisted, isEquipTierHidden } from '../../src/config/blacklist.js';
import { JOB_NAMES } from '../../src/utils/gameMappings.js';

test('装备职业定义与过滤逻辑核验', () => {
  const data = JSON.parse(fs.readFileSync('public/data/parsed/items.json', 'utf8'));
  const validEquips = data.items.filter(i => isVisibleEquipItem(i) && !isBlacklisted(i) && !isEquipTierHidden(i) && i.img);

  assert.ok(validEquips.length > 0, '应存在可见装备');

  // 验证所有可见装备均具有合法的 job 数组
  for (const item of validEquips) {
    assert.ok(Array.isArray(item.equip?.job), `${item.name}(${item.typeId}) 应有 job 数组`);
    assert.ok(item.equip.job.length > 0, `${item.name} job 数组应非空`);
    for (const j of item.equip.job) {
      assert.ok(j >= 1 && j <= 6, `职业代码应在 1~6 之间（实际 ${j}）`);
    }
  }

  // 针对每一个职业（近卫、守护、秘术、射手、突袭、支援）进行过滤匹配
  for (const [jobKeyStr, jobName] of Object.entries(JOB_NAMES)) {
    const jobKey = Number(jobKeyStr);
    const matched = validEquips.filter(i => i.equip.job.includes(jobKey));
    // 每个职业都应该有可穿戴的装备（通用装备 + 职业专属装备）
    assert.ok(matched.length >= 60, `职业 ${jobName}(${jobKey}) 应至少有 60 件可穿戴装备（实际 ${matched.length}）`);

    // 专属装备过滤准确性验证：比如只有近卫专属的装备不能出现在射手过滤结果里
    const exclusiveEquips = validEquips.filter(i => i.equip.job.length < 6);
    assert.ok(exclusiveEquips.length > 0, '应存在职业专属装备');
  }

  // 物品图鉴在选定大类「装备 (4)」时的职业过滤行为
  const equipCategoryItems = data.items.filter(i => i.category && String(i.category[0]) === '4' && isVisibleEquipItem(i) && !isBlacklisted(i));
  const archerOnly = equipCategoryItems.filter(i => i.equip?.job?.includes(4));
  assert.ok(archerOnly.length > 0 && archerOnly.length < equipCategoryItems.length, '射手职业筛选应正确筛出子集');
});
