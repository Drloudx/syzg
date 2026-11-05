-- ============================================================
-- 首页内容 5 张表 + 这 6 条公告（2026-11-05）
-- ============================================================
-- 背景：生产库此前从未执行第 12/13 步迁移，notices 等表不存在，
--       线上首页一直走代码兜底；本次补齐结构并写入与本机一致的 6 条公告。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE。
--       重复执行不会覆盖后台已改过的内容。
-- 🔴 只插入这 6 条，不引入本机其余测试数据（site-1044 等）。

CREATE TABLE IF NOT EXISTS notices (
  id             TEXT PRIMARY KEY,
  channel        TEXT NOT NULL,
  tier           TEXT NOT NULL DEFAULT 'normal',
  slot           INTEGER,
  title          TEXT NOT NULL,
  content        TEXT,
  date           TEXT,
  tag_text       TEXT,
  tag_class      TEXT,
  version        TEXT,
  features_json  TEXT,
  source_url     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  show_in_modal  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT,
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS home_notice_slots (
  channel    TEXT    NOT NULL,
  slot       INTEGER NOT NULL,
  notice_id  TEXT,
  updated_at TEXT,
  PRIMARY KEY (channel, slot)
);

CREATE TABLE IF NOT EXISTS home_banners (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  tag_text     TEXT,
  tag_class    TEXT,
  sub_tag      TEXT,
  image_url    TEXT,
  bg_color     TEXT,
  blend_start  TEXT,
  btn_text     TEXT,
  action_type  TEXT,
  action_value TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS home_links (
  section      TEXT NOT NULL,
  slot         INTEGER NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  route        TEXT NOT NULL,
  query_string TEXT,
  icon_source  TEXT DEFAULT 'nav',
  icon_url     TEXT,
  badge_text   TEXT,
  badge_color  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (section, slot)
);

CREATE TABLE IF NOT EXISTS home_heroes (
  slot      INTEGER PRIMARY KEY,
  hero_id   TEXT NOT NULL,
  tip       TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS home_blocks (
  section   TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  subtitle  TEXT,
  rows_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_notices_recent
  ON notices(channel, is_active, date DESC);

-- ------------------------------------------------------------
-- 这 6 条公告（内容逐字取自本机库）
-- ------------------------------------------------------------
INSERT OR IGNORE INTO notices (id, channel, tier, slot, title, content, date, tag_text, tag_class, version, features_json, source_url, is_active, created_at, updated_at, show_in_modal) VALUES
  ('site-5', 'site', 'normal', NULL, '占位测试', '', '2026-11-01', '测试', 'info', NULL, NULL, NULL, 1, '1793558788.0', '1793615330.0', 1),
  ('site-7', 'site', 'normal', NULL, '占位测试', '', '2026-11-01', '测试', 'info', NULL, NULL, NULL, 1, '1793558793.0', '1793615326.0', 1),
  ('site-4', 'site', 'normal', NULL, '大书院学者讨论区交流准则', '<p>欢迎各位探求者在讨论区交流游戏体验、阵容心得。</p><p>请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。</p>', '2026-10-25', '社区', 'gold', NULL, NULL, NULL, 1, '2026-11-01', '1793610704.0', 1),
  ('site-1', 'site', 'normal', NULL, '深渊大书院站点免责声明与服务协议', '<p>本站由玩家独立维护，是非官方资料站，与深渊之歌、淘气泡游戏不存在隶属关系、官方授权或商业代理关系。本站所提及的游戏名称、商标、标志、截图、游戏数据、角色立绘及相关艺术素材，其版权与所有权归各自权利人所有。<br>本网站仅提供粉丝向参考与信息整理服务。</p>', '2026-09-19', '置顶', 'pinned', NULL, NULL, NULL, 1, '2026-11-01', '1793610664.0', 1),
  ('official-6', 'official', 'normal', NULL, '「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放', '<p>荒野测试 正式定档 11.12</p><p>一、全新角色</p><p>新增德莉（5 星）、斯卡莉安（5 星）、洛莉安（5 星）、阿尔克丝（4 星）、修瓦莉（4 星）、诺姿（3 星）等伙伴。</p><p>二、全新活动：洛莉安的幽夜古堡</p><p>秘境挑战「亚空回廊」限时开启！发掘失落的遗器，嵌入强大的法盘，不断探索深入这片奇诡的秘境。可获得独特的神器、传说级装备、契约书、小屋外观等道具。</p><p>三、全新时代</p><p>新增彩虹芭菲公主·德莉（传说）、金鹿的假期·菲莉娜（传说）、阳葵田的守望者·芭杜尔（罕见）、胡萝卜小收获日·米拉贝尔（罕见）、一日侍者·米托拉（罕见）等时装。</p><p>四、全新魔物</p><p>新增圣骑士史莱姆（5 星）、洛莉安的眷属（5 星）、蜂刺骑兵（4 星）、黄金史莱姆（4 星）、粉红史莱姆（3 星）、天青史莱姆（3 星）、幽灵史莱姆（3 星）等魔物。</p><p>五、全新体验</p><p>1. 商业化内容更新：上线驿站补给凭证（月卡）、荒野通行手册（通行证），同步对付费商城进行改版优化。</p><p>2. 开放装扮系统。</p><p>3. 新增小屋外观自定义功能。</p><p>4. 上架全新家具系列。</p><p>5. 优化部分关卡难度曲线，调整关卡体验。</p><p>6. 新增万能突破魔物：新增纯白史莱姆、彩虹史莱姆，可用于任意魔物突破。</p><p>7. 新增万能回忆拼图：新增湛蓝、靛紫、灿金回忆拼图，可替代任意伙伴的对应回忆拼图，完成星阶激活。</p><p>8. 新增角色重置道具：新增成长遗忘药水，使用后即可重置角色等级与技能等级，返还经验书与元素碎片。</p><p>9. 修复若干已知问题。</p><p>注：本素材内容仅供参考，具体请以游戏内实际情况为准。<br><br><a target="_blank" rel="noopener noreferrer" class="rich-link" href="https://www.taptap.cn/moment/864080934587075947?group_id=973894">「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放</a></p>', '2026-11-02', '版本', 'pinned', '「荒野计费测试」', '["✦ 全新角色登场","✦ 全新魔物上线","✦ 全新角色时装","✦ 限时秘境挑战「洛莉安的幽夜古堡」"]', NULL, 1, '1793610245.0', '1793610412.0', 0),
  ('official-5', 'official', 'normal', NULL, '游戏简介', '<h2 style="line-height: 24px;"><strong>游戏简介</strong></h2><p>「那是人类得到的教训，因为人类的狂妄自负而应得的教训」<br>糟糕！<br>失忆之后坠落深渊？<br>还要当异世界的救世主？我吗？？<br>虽然听着很不妙，但我们是一款拥有治愈复古画风的蛮轻松的异世界冒险手游，旅途比您想象中悠闲得多～<br>您将扮演年轻有为却丧失记忆的工匠，因为一次意外而坠落到了深渊（Abyss）。<br>在这里，您邂逅了魔人少女——米托拉，最好的伙伴！<br>你们一起一砖一瓦搭建家园，春种秋收收获满仓；<br>招募天南海北的有趣伙伴，孵化风格各异的神奇魔物；<br>亲手锻造神器，打造专属冒险营地。<br><br>你们一起抵挡狂暴种魔物作乱，再踩着晨光往未知的区域奔跑。<br>散落在深渊间的记忆碎片，正等您慢慢拼凑；<br>沉眠在这片土地下的真相，也等待着您亲手揭开它的面纱。<br><br>来吧，工匠大人。<br>深渊的风，已经静候您多时了。</p><h2 style="line-height: 24px;"><strong>开发者的话</strong></h2><p>大家好！我们是《深渊之歌》的开发团队。在营地的篝火旁，我们怀着激动与忐忑的心情写下这封信，邀请你们一同踏入这片深邃而迷人的无主之地——“深渊”。<br><br>《深渊之歌》的核心魅力：<br><br>故事驱动，浸入深渊：<br>数百年前那场席卷卡露蒂亚的灾难余波未平，而“深渊”——这场风暴的正中心，正是故事的起点。被克里斯汀圣教军追捕的小小工匠意外坠入其中。这里环境严酷，魔物环伺，但也蕴藏着失落的历史、奇异的生灵和无尽的可能。<br><br>魔物伙伴，从敌到友：<br>从一枚“蛋”开始，孵化、培育你的魔物！培育的魔物拥有独立的技能和专属特性，能为你的组队策略带来全新维度。无论是派遣它们去获得收益，还是带着它们在荒野中披荆斩棘，它们都是你最特别的伙伴。<br><br>深度养成，自由构筑：<br>六大职业、四种元素属性，自由组建你的四人冒险小队。通过获取经验、升级技能、解锁回忆拼图，每个角色都能绽放独特光彩。别忘了给你的伙伴们送送礼，解锁他们的专属羁绊剧情和奖励！<br><br>立足荒野，建造家园：<br>从一堆篝火开始，亲手在危机四伏的深渊中开辟一隅安身之所。建造、升级、研究科技、制作材料、开垦田地、烹饪料理、摆放家具，邀请伙伴入住……这里的一切都由你规划，打造你和伙伴们的家园！<br><br>匠魂不息，锻造传说：<br>能工巧匠，亦是真正的勇者！传说级的金色装备和稀有词条，都可以用自己的双手去锻造！为伙伴量身打造契合的装备，组成套装、强化底材、洗练词条、附魔特性……工匠锤每一次的锻打，都让你离深渊的秘密更近一步。<br><br>经营有方，放置生财：<br>深渊求生，资源为王。除了亲自去野地采集，也有更轻松的方法获取材料。发出探索队让闲置的伙伴收集材料和战利品，在冒险之余配置生产计划，让种植、磨坊、轻工、锻造、制药形成产业闭环，在市场中完成订单和买卖交易，用赚取的资金购买资源或强化队伍，群英荟萃指日可待！<br><br>《深渊之歌》倾注了我们的全部热爱。我们一直梦想着创造这样一个世界：它不仅仅是冒险战斗的舞台，更是一个你能够扎根、成长、与伙伴建立深刻羁绊的家园。<br><br>准备好你的行囊，点燃营地的篝火，孵化第一枚魔物蛋，和伙伴一起举起亲手锻造的武器……在卡露蒂亚的深渊之中，你的传奇，正等待书写。让我们在篝火旁相聚，共同谱写这首属于工匠与勇者的“深渊之歌”！</p>', '2026-11-01', '简介', 'info', '', '[]', NULL, 1, '1793562426.0', '1793562793.0', 0);

-- 首页公告插槽：站点位置 1/4 固定，位置 2/3 动态；官方全动态
INSERT OR IGNORE INTO home_notice_slots (channel, slot, notice_id, updated_at) VALUES
  ('official', 1, NULL, '1793554931.0'),
  ('official', 2, NULL, '1793554931.0'),
  ('official', 3, NULL, '1793554931.0'),
  ('official', 4, NULL, '1793554931.0'),
  ('site', 1, 'site-1', '1793554931.0'),
  ('site', 2, NULL, '1793554931.0'),
  ('site', 3, NULL, '1793554931.0'),
  ('site', 4, 'site-4', '1793554931.0');
