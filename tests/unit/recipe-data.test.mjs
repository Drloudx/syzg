import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GENERIC_FOOD_TYPE_MAP, getRecipePreviewPath, PREVIEW_AVAILABLE_IDS } from '../../src/utils/recipeUtils.js';
import { RECIPE_SOURCE_CONFIG } from '../../src/utils/recipeData.js';
import { NAV_ROUTES } from '../../src/config/navRoutes.js';

test('通用食材分类名称符合最新规范（肉类/蔬菜/水果/菌菇）', () => {
  assert.equal(GENERIC_FOOD_TYPE_MAP['1'].name, '肉类');
  assert.equal(GENERIC_FOOD_TYPE_MAP['2'].name, '蔬菜');
  assert.equal(GENERIC_FOOD_TYPE_MAP['3'].name, '水果');
  assert.equal(GENERIC_FOOD_TYPE_MAP['4'].name, '菌菇');
});

test('食谱预览路径指向 public/images/recipes/ 目录', () => {
  const p = getRecipePreviewPath('item_30022');
  assert.equal(p, '/recipes/item_30022.webp');
});

test('美味炖菜来源文案为「完成成就「战场美食家」获取」', () => {
  assert.equal(RECIPE_SOURCE_CONFIG['item_30035'].text, '完成成就「战场美食家」获取');
});

test('果香肉酱通心粉与武僧火锅标注无法直接制作的特殊说明', () => {
  const noteExpected = '不能通过食材直接做，需要从解锁配方后点击右下角料理食谱再这里点击食谱做';
  assert.equal(RECIPE_SOURCE_CONFIG['item_30040'].craftNote, noteExpected);
  assert.equal(RECIPE_SOURCE_CONFIG['item_30042'].craftNote, noteExpected);
});

test('28 款料理的新版预览图均已生成到 public/images/recipes/ 且大小正常，不含冗余 _prev 文件', () => {
  const recipesDir = path.resolve('public/images/recipes');
  assert.ok(fs.existsSync(recipesDir), 'recipes 目录应存在');

  const files = fs.readdirSync(recipesDir);
  assert.equal(files.length, 28, '新目录应仅有 28 款料理的图片');
  assert.ok(!files.some(f => f.includes('_prev')), '新目录不应含有带 _prev 的文件名');

  for (const id of PREVIEW_AVAILABLE_IDS) {
    const filePath = path.join(recipesDir, `${id}.webp`);
    assert.ok(fs.existsSync(filePath), `图片 ${filePath} 应存在`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 5000, `图片 ${id}.webp 体积应大于 5KB (实际 ${stat.size}B)`);
  }
});

test('旧目录 public/images/menu_prev/ 已被彻底移除', () => {
  const oldDir = path.resolve('public/images/menu_prev');
  assert.ok(!fs.existsSync(oldDir), '旧目录 menu_prev 应已被删除');
});

test('解析产物中的食谱包含正确的品阶属性 quality', () => {
  const parsed = JSON.parse(fs.readFileSync('public/data/parsed/recipes.json', 'utf8'));
  const roast = parsed.recipes.find(r => r.id === 'item_30022');
  const hotpot = parsed.recipes.find(r => r.id === 'item_30040');
  const feast = parsed.recipes.find(r => r.id === 'item_30054');
  assert.equal(roast.quality, 1);
  assert.equal(hotpot.quality, 2);
  assert.equal(feast.quality, 4);
});

test('导航路由中已配置「食谱查询」', () => {
  const recipeRoute = NAV_ROUTES.find(r => r.path === '/recipes');
  assert.ok(recipeRoute, '/recipes 路由应存在');
  assert.equal(recipeRoute.name, '食谱查询');
});

test('需解锁的食谱共有 5 款（珍菇翡翠白玉汤、美味炖菜、武僧火锅、香炸酥肉、果香肉酱通心粉）', () => {
  const parsed = JSON.parse(fs.readFileSync('public/data/parsed/recipes.json', 'utf8'));
  const unlockRecipes = parsed.recipes.filter(r => !!r.sourceInfo);
  assert.equal(unlockRecipes.length, 5, '需解锁食谱应恰好为 5 款');
  const unlockIds = unlockRecipes.map(r => r.id).sort();
  assert.deepEqual(unlockIds, ['item_30034', 'item_30035', 'item_30040', 'item_30041', 'item_30042']);
});
