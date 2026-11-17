import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPetSearchText } from '../../src/utils/petParser.js';

const parsed = JSON.parse(fs.readFileSync('public/data/parsed/pets.json', 'utf8'));

test('魔物 keywords 与 getPetSearchText 覆盖特性名与特性效果', () => {
  const hornGoblin = parsed.pets.find(p => p.name === '角布林');
  assert.ok(hornGoblin, '应当存在角布林');
  assert.ok(hornGoblin.keywords.includes('连戳技巧'), '角布林 keywords 应包含特性名连戳技巧');
  assert.ok(hornGoblin.keywords.includes('物理攻击'), '角布林 keywords 应包含特性效果物理攻击');

  const text = getPetSearchText(hornGoblin);
  assert.ok(text.includes('连戳技巧'), 'getPetSearchText 应提取特性名');
  assert.ok(text.includes('物理攻击'), 'getPetSearchText 应提取特性效果');
});

test('搜索「物理攻击」能正确命中所有包含该加成的魔物特性', () => {
  const matches = parsed.pets.filter(p => getPetSearchText(p).includes('物理攻击'));
  // 至少包含 7 只特性含物理攻击的魔物
  assert.ok(matches.length >= 7, `应当至少匹配 7 只魔物，实际匹配 ${matches.length} 只`);
  const names = matches.map(p => p.name);
  assert.ok(names.includes('角布林'), '应包含角布林');
  assert.ok(names.includes('囊袋恐兽'), '应包含囊袋恐兽');
  assert.ok(names.includes('草原黏团'), '应包含草原黏团');
  assert.ok(names.includes('鱼布林'), '应包含鱼布林');
  assert.ok(names.includes('雷素'), '应包含雷素');
  assert.ok(names.includes('石像鬼'), '应包含石像鬼');
  assert.ok(names.includes('白银迷迷可'), '应包含白银迷迷可');
});

test('复合多词搜索（空格=且）能正确过滤交集', () => {
  const termGroups = ['风', '物理攻击'];
  const matches = parsed.pets.filter(pet => {
    const text = getPetSearchText(pet);
    return termGroups.every(term => text.includes(term));
  });
  assert.ok(matches.length > 0 && matches.length < 20, '应筛选出风属性中带物理攻击的子集');
  assert.ok(matches.every(p => p.elementName === '风' || p.keywords.includes('风')), '命中项必须包含风属性');
});

test('特性表格视图（includeSkills: false）精准匹配特性加成，排除非特性命中', () => {
  const matches = parsed.pets.filter(p => getPetSearchText(p, { includeSkills: false }).includes('物理攻击'));
  assert.equal(matches.length, 7, '特性表格下搜索物理攻击应严格为 7 只特性带物理攻击的魔物');
  const names = matches.map(p => p.name);
  assert.ok(!names.includes('宝石迷迷可'), '特性表格下不应包含特性无关的宝石迷迷可');
  assert.ok(!names.includes('真护之黑龙'), '特性表格下不应包含特性无关的真护之黑龙');
  assert.ok(!names.includes('圣骑士史莱姆'), '特性表格下不应包含特性无关的圣骑士史莱姆');
  assert.ok(!names.includes('源泉猫'), '特性表格下不应包含特性无关的源泉猫');
  assert.ok(matches.every(p => p.trait?.maxText?.includes('物理攻击') || p.trait?.name?.includes('物理攻击')), '每只魔物的特性描述均必须直接包含物理攻击');
});
