PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key   TEXT    NOT NULL,            -- 'item:30047'
  parent_id  INTEGER DEFAULT NULL,        -- 预留楼中楼，一期不使用
  nick       TEXT    NOT NULL,
  email_hash TEXT    DEFAULT NULL,        -- SHA-256，绝不留明文邮箱
  body       TEXT    NOT NULL,
  status     INTEGER NOT NULL DEFAULT 1,  -- 1 正常 / 0 待审 / 2 已隐藏
  created_at INTEGER NOT NULL,            -- Unix 秒
  ip_hash    TEXT    NOT NULL,            -- SHA-256(ip + 服务端盐)，仅限流与追溯
  ua_hash    TEXT    DEFAULT NULL
, token_hash TEXT DEFAULT NULL, review_reason TEXT DEFAULT NULL, avatar TEXT DEFAULT NULL, page_label TEXT DEFAULT NULL, user_id INTEGER DEFAULT NULL, review_note TEXT DEFAULT NULL, moderated_at INTEGER DEFAULT NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(1,'site:general',NULL,'云汐渚梦',NULL,'大家好，欢迎来到深渊大书院，有问题请及时反馈！',1,1791344451,'00b722f7ef4b58f89548cd28334c4b232b479fdbbc9378c925e5b3be1d5a1370','a4bb48293cf10268cc3e6170b58a3c0c3021432f0aa28bf6c57c8b111719b8c3',NULL,NULL,'at053_0','站内讨论区',1,NULL,1791932060010);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(2,'site:general',NULL,'安楠',NULL,'哈喽呀',1,1791946693,'00b722f7ef4b58f89548cd28334c4b232b479fdbbc9378c925e5b3be1d5a1370','49a2e79638c6bc012d7f78b2a8bd3632eeff97de44de4160143b2feec7ed3957',NULL,NULL,'avatar_pet_072','站内讨论区',3,NULL,NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(3,'site:general',NULL,'小小工匠',NULL,'羡慕技术大佬，让企图手打数据做攻略的我望尘莫及🥲',1,1791979648,'2ed5154d244b79d2430282e4bf5681cc8036a0ede1c63f4e9d93d0a8024e10f9','1cfa25aaca9af869ed971c7e9cb495fd98ad546dddf99f4885892610aaf75d68','186f0522c09a828af2ae36a4f5b16a02c90bd28f66ad4ad78ce085462bc8af9a',NULL,'at001_0','站内讨论区',NULL,NULL,NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(4,'site:general',NULL,'莉耶芙大王',NULL,'嗷呜',1,1792031957,'47a5287d634d7071a90518f3750124279f593f95cfc24d6c5beb9add9f66b90c','7c5ede3b21bbb3362fbbf6f02cc7547656174df72bdbcffbdbf772bd4ddf99c1',NULL,NULL,'at064_0','站内讨论区',4,NULL,NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(5,'site:general',NULL,'朝往暮归',NULL,'前排出售瓜子汽水！',1,1792032400,'00b722f7ef4b58f89548cd28334c4b232b479fdbbc9378c925e5b3be1d5a1370','1eca149a625fc9df2142af6b9ee6c4ac8dc10ddf827f40bd28eebf21de02bade',NULL,NULL,'at005a','站内讨论区',5,NULL,NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(6,'site:general',NULL,'格温瑞婭',NULL,'米托拉吉祥物的表情好池沼ww',1,1792146470,'eae7ccbfedd57cc82de989826f55a8e84694fbbd908512f3701ebc3e51d765d8','0bd344b0c35df6194768cf96fa21de8bf7729ee8f2bbb2e21eeba7b741b53119',NULL,NULL,'at026_0','站内讨论区',6,NULL,NULL);
INSERT INTO "comments" ("id","page_key","parent_id","nick","email_hash","body","status","created_at","ip_hash","ua_hash","token_hash","review_reason","avatar","page_label","user_id","review_note","moderated_at") VALUES(7,'site:general',NULL,'双鱼座喵皮',NULL,'哇˶╹ꇴ╹˶！',1,1792152106,'2ed5154d244b79d2430282e4bf5681cc8036a0ede1c63f4e9d93d0a8024e10f9','a94a00a057826597ea9083860027755e17c2a6e0caeb94e28a1c7fb170517d8d',NULL,NULL,'at001_0','站内讨论区',7,NULL,NULL);
CREATE TABLE rate_limits (
  bucket  TEXT    NOT NULL,               -- 'ip:<sha256>:<YYYYMMDDHH>'
  counter INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket)
);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:b547403cf276b4086a7604fdd3bf40c7027ad716329f0a9f2d759ddba266acd7',1792031843);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:0b2e820c30dce85ab8b946a3358624459ef39f3d08665e428880badcb7bf579f',1792565834);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:a3e9a5173b47c205cc32c30bc7ca9e04f5f81a25279b65614e0f284e543c5178',1792031989);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:7773f1419d22026602238b43917d63cdf01005447c2821a2a704aa7b170178b3',1792146368);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:d23f0db3674020c8e2d73d8be9e0a81361a914f739a05a5b8196aef4390997bc',1792151897);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:d09131d88798c886a56662c2b53b393b5c2a15ef40def1e260dbf0125a3cf642',1792151971);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:4a1be0d9665ea8b887296626966b4e83bcdfa05e26152c7a125504fee2c396b2',1792162475);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('authcd:3bd982ec8e68db774ed1e4627ab40c1cf4b02fcd94d7c7cb5d04a4a3a916353f',1792568014);
INSERT INTO "rate_limits" ("bucket","counter") VALUES('loginfail:ip:e6d434675e8144d5ead8492f0a6dbb921848c6e70f78148b76026f743bc4873c:2026102206',1);
CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_no      INTEGER NOT NULL UNIQUE,
  email          TEXT    NOT NULL,
  email_hash     TEXT    NOT NULL UNIQUE,
  nick           TEXT    NOT NULL UNIQUE,
  avatar         TEXT    DEFAULT 'at001_0',
  verifier_hash  TEXT    NOT NULL,
  pw_salt        TEXT    NOT NULL DEFAULT '',
  pw_algo        TEXT    NOT NULL,
  pw_iters       INTEGER NOT NULL,
  pepper_ver     INTEGER NOT NULL DEFAULT 1,
  status         INTEGER NOT NULL DEFAULT 1,
  replies_read_at INTEGER DEFAULT NULL,
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER DEFAULT NULL,
  pw_changed_at  INTEGER DEFAULT NULL
, role INTEGER NOT NULL DEFAULT 0, ban_note TEXT DEFAULT NULL, moderation_read_at INTEGER DEFAULT NULL, replies_read_id INTEGER DEFAULT NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(1,10000,'1965161643@qq.com','0b2e820c30dce85ab8b946a3358624459ef39f3d08665e428880badcb7bf579f','云汐渚梦','at053_0','a6df6a9467a1e406317534b18c317f3e5bb71085a44dba0aad2e73f3974a50a1','2f3cf1bb6cf9e10217c1ed70526208098f9121009f24a814940579843266bd4c','client-pbkdf2-sha256',600000,1,1,NULL,1791316861,1793116939,NULL,2,NULL,1791946743822,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(2,10001,'2772127576@qq.com','2ee11b4ffcd5301910c112631d7c174510726b9ae0fa819c33d54c4855a1fdd9','mio','at001_0','372f11b659870633291a32fa7d4dbcaa3946a1c2ec8bee742aa45c9e1cd32e91','741c341990ad3ac75069d9b5ccc3e8169c19be7226d0f21dfb2d24d8f33f490c','client-pbkdf2-sha256',600000,1,1,NULL,1791400878,1791400878,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(3,10002,'2990937744@qq.com','0216020eed31e9a649623f8e13847b6809d007ee0a2ed47d2f36e29b214d2c7d','安楠','avatar_pet_072','f8a2764a2b1b57abd021bfb14c0d9172d2d8f8462395969b6707adef297fa676','bd322feecc1a6158bee7bc2359e41f8c3760d257854037079facaa916d33617c','client-pbkdf2-sha256',600000,1,1,NULL,1791946660,1791946660,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(4,10003,'995768072@qq.com','b547403cf276b4086a7604fdd3bf40c7027ad716329f0a9f2d759ddba266acd7','莉耶芙大王','at064_0','7019f344ec8eb7a96d663ac04b54ab567ffa99dcefbae7fab88d8539cedbf31e','b05259eb0ae53291f4e839f88ede8d50615dbbe84b141ad605d9b91e717b48bd','client-pbkdf2-sha256',600000,1,1,NULL,1792031863,1792031863,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(5,10004,'2192496258@qq.com','a3e9a5173b47c205cc32c30bc7ca9e04f5f81a25279b65614e0f284e543c5178','朝往暮归','at005a','96c7f48dbc1eda6d3b42fd380393d7b55f59df0491584566188435ad252cb522','aaf04a5b82b4b15c406c4f39a9509e147e03a93379e5ddeb2b7bd1777ee2ec5d','client-pbkdf2-sha256',600000,1,1,NULL,1792032084,1792032084,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(6,10005,'2373055958@qq.com','7773f1419d22026602238b43917d63cdf01005447c2821a2a704aa7b170178b3','格温瑞婭','at026_0','bd88fa265a0a1a458af6bcc5ae28fe37ec7bf71d745aab0383f3212aac22c544','cefd8e37e475044905aa1d517235d174630238b04a25050d3481c17135f508cb','client-pbkdf2-sha256',600000,1,1,NULL,1792146412,1792146412,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(7,10006,'jianningchen6@qq.com','d09131d88798c886a56662c2b53b393b5c2a15ef40def1e260dbf0125a3cf642','双鱼座喵皮','at001_0','de917754fa3f3409c2a20d4cb9f5f6caa245a13ee71e0fa5bb920b031744ad30','81dac2216c13ee96910f10f597d7def7ac9db11969164e6b612465464998bfc5','client-pbkdf2-sha256',600000,1,1,NULL,1792152018,1792152018,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(8,10007,'xiaobaierdao123@163.com','4a1be0d9665ea8b887296626966b4e83bcdfa05e26152c7a125504fee2c396b2','小白二刀','at001_0','b54b9dc3c51870fb0438a0d6be582ab225864af79629cd7005b9bf46c52cfa5b','53fbe6cc678a61a5f46470e3e5c9601e8feed4c068344258ee79956cf1ab6402','client-pbkdf2-sha256',600000,1,1,NULL,1792162496,1792650971,NULL,0,NULL,NULL,NULL);
INSERT INTO "users" ("id","public_no","email","email_hash","nick","avatar","verifier_hash","pw_salt","pw_algo","pw_iters","pepper_ver","status","replies_read_at","created_at","last_login_at","pw_changed_at","role","ban_note","moderation_read_at","replies_read_id") VALUES(9,10008,'15511349513@163.com','3bd982ec8e68db774ed1e4627ab40c1cf4b02fcd94d7c7cb5d04a4a3a916353f','武道大宗师','at037_0','32c28c1f391bbb99dec2ba7cead769a1c7da74ad3cf5813b869e3fa74e3fc435','0522f7fc2011160df25bcf411b9c07227b72f04b5d7fa25f120ecaf63260d2fa','client-pbkdf2-sha256',600000,1,1,NULL,1792568040,1792568040,NULL,0,NULL,NULL,NULL);
CREATE TABLE auth_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,
  code_hash  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO "auth_codes" ("id","email_hash","purpose","code_hash","expires_at","created_at") VALUES(14,'d23f0db3674020c8e2d73d8be9e0a81361a914f739a05a5b8196aef4390997bc','register','6ac62a2b49c3007c08d3409fae4f3eab6ae4a8bfd3c48f486a439c0b1eca8086',1792152497,1792151897);
INSERT INTO "auth_codes" ("id","email_hash","purpose","code_hash","expires_at","created_at") VALUES(17,'0b2e820c30dce85ab8b946a3358624459ef39f3d08665e428880badcb7bf579f','register','9f159f4df4e677eea9047a6506c90000f760dffcfc890f034948d298a538707b',1792566434,1792565834);
CREATE TABLE captchas (
  id         TEXT    PRIMARY KEY,
  answer     TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER DEFAULT NULL,
  ua_hash      TEXT    DEFAULT NULL,
  ip_hash      TEXT    DEFAULT NULL
);
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('a51b50bdfa25d7e229cd92e3c7119027cc1f210448ce1813e19c725d722651b1',1,1794794891000,1791344503,1792202891,'9f804c39082c4459f0fd8fbbd3f48bc2392f7f1092413105c2b38ebeb5c9a974','5a4cc7e9d4df4a47e41e7637e4c5b8bb0f829b2a80492ba41c6d2da9d58cf0e5');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('a70948ef1417796bef187a6ef4579d7f0f0d43d80a465b236ca0497818101fb9',2,1793992878000,1791400878,1791400878,'f391921ca4698cc45405676459f645ba96b2e9495e76e094966837e2cb6f5a83','d0cfa2971f173f2ee7234597e08b032801ed205509919aa20fc5faa78ff75d00');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('ffda30b1f71f49e8c1def17412d9de3fd283e52d83e2f5311b47cd3076e380e2',4,1794623863000,1792031863,1792031863,'7c5ede3b21bbb3362fbbf6f02cc7547656174df72bdbcffbdbf772bd4ddf99c1','ac678d7f2a9fad6c83d8e387224cae4907b05c596398db666fd9f013504acd9f');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('2fb2cf8452c08ec057b837a8247a1a8452da35c7d14dff293ea8c0a887e0fe5b',1,1795103286000,1792031938,1792511286,'49a2e79638c6bc012d7f78b2a8bd3632eeff97de44de4160143b2feec7ed3957','4a44815112ef89be90c699701b170def61086f2b8775ab2e876e8238649c833c');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('ad74c333aac890f59002137066072e0e4646261138cbd184843bccd1b3670d3c',5,1794797984000,1792032084,1792205984,'6f27987cedc708ca612465e3acf435fe7f59c1fb0b47bfd10ac42f159861c642','4a44815112ef89be90c699701b170def61086f2b8775ab2e876e8238649c833c');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('cdd67e9b5376e95e591301f03d108b5751c825b80f3972361e0e498eb6b20044',6,1794815622000,1792146412,1792223622,'0bd344b0c35df6194768cf96fa21de8bf7729ee8f2bbb2e21eeba7b741b53119','d0cfa2971f173f2ee7234597e08b032801ed205509919aa20fc5faa78ff75d00');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('6caecc1ffeb72a6783031926ec38fee970bcae99765e23e7a1c1ba25a364d852',7,1794744018000,1792152018,1792152018,'a94a00a057826597ea9083860027755e17c2a6e0caeb94e28a1c7fb170517d8d','dbfa2675b31654b0307254836e6a36742a95351f4ae110e53c6283d06d21eb73');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('0766232fce8ea9fd436319dc47352556df49c51e9795e6fc15dbd55bf2a5bbb5',8,1794754496000,1792162496,1792162496,'c7b7572743c13be71d7c822e55b9a169434f9c6f9cd5cf9afcb9aac25ec9bb1b','327f7ff277b8d3987c5dcdae599770fc14f954b2c401e75d748f026db3c671a3');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('526e25f4df19c965a181c917d12d317a6b1d20d73905a4aa1561f7588d4ad026',9,1795595242000,1792568040,1793003242,'6dcdc679c1f335be6297a17e6b8b706879aeab00a7712601103f14d5b51a3ccd','4a44815112ef89be90c699701b170def61086f2b8775ab2e876e8238649c833c');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('f79bade75defdfa70cc4a006729e54c78deb3b0e009f82d749fa177456600983',8,1795242971000,1792650971,1792650971,'49a2e79638c6bc012d7f78b2a8bd3632eeff97de44de4160143b2feec7ed3957','e6d434675e8144d5ead8492f0a6dbb921848c6e70f78148b76026f743bc4873c');
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('7b6a490a40b28a6bf631298e462196a7cb094fb0d662a16726a885dc858d9fc2',1,1796235494000,1793116939,1793643494,'19619c180434820677c5d591b970f33cbcc25d0b2a6cd2b30445e6fb84c00944','7ff765e448dfbf41d1e10734220beb9579d1c6b2eab4b549b4b0ad1856258878');
CREATE TABLE admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER NOT NULL,           -- 操作者的 users.id（内部 id，不外露）
  actor_nick  TEXT    NOT NULL,           -- 快照：操作者当时的昵称（改名后仍可追溯）
  actor_role  INTEGER NOT NULL,           -- 快照：操作时的角色
  action      TEXT    NOT NULL,           -- 'ban' | 'unban' | 'user_delete' | 'comment_hide'
                                          -- | 'comment_show' | 'comment_delete' | 'role_set'
  target_type TEXT    NOT NULL,           -- 'user' | 'comment'
  target_id   INTEGER NOT NULL,           -- 目标的内部 id
  detail      TEXT    DEFAULT NULL,       -- 补充信息（如角色变更 "1 -> 2"、评论正文摘要）
  created_at  INTEGER NOT NULL
);
INSERT INTO "admin_audit" ("id","actor_id","actor_nick","actor_role","action","target_type","target_id","detail","created_at") VALUES(1,1,'云汐渚梦',2,'review_keywords_set','keyword',0,'自定义词 3 条；停用类别 无；含 政治敏感',1793117060);
CREATE TABLE review_note_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,   -- 小的排前面（界面按此顺序出 chip）
  created_at INTEGER NOT NULL
);
INSERT INTO "review_note_presets" ("id","text","sort_order","created_at") VALUES(1,'重复发帖',0,1791571412);
INSERT INTO "review_note_presets" ("id","text","sort_order","created_at") VALUES(2,'与主题无关',1,1791571412);
INSERT INTO "review_note_presets" ("id","text","sort_order","created_at") VALUES(3,'外链待确认',2,1791571412);
INSERT INTO "review_note_presets" ("id","text","sort_order","created_at") VALUES(4,'需要更多上下文',3,1791571412);
CREATE TABLE review_keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT    NOT NULL,            -- 普通关键词（非正则）；匹配时会被转义
  category   TEXT    NOT NULL,            -- 命中原因（如「赌博」）；可为代码基线没有的新类别
  created_at INTEGER NOT NULL
);
INSERT INTO "review_keywords" ("id","text","category","created_at") VALUES(1,'64','政治敏感',1793117060);
INSERT INTO "review_keywords" ("id","text","category","created_at") VALUES(2,'六4','政治敏感',1793117060);
INSERT INTO "review_keywords" ("id","text","category","created_at") VALUES(3,'6四','政治敏感',1793117060);
CREATE TABLE review_category_flags (
  category   TEXT    PRIMARY KEY,         -- 代码基线里的类别名
  created_at INTEGER NOT NULL
);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('users',9);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('comments',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('auth_codes',18);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('review_note_presets',4);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('review_keywords',3);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('admin_audit',1);
CREATE INDEX idx_comments_page
  ON comments(page_key, status, created_at DESC);
CREATE INDEX idx_auth_codes_lookup ON auth_codes(email_hash, purpose, created_at DESC);
CREATE INDEX idx_sessions_user   ON sessions(user_id);
CREATE INDEX idx_comments_user   ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_admin_audit_time   ON admin_audit(created_at DESC);
CREATE INDEX idx_admin_audit_actor  ON admin_audit(actor_id, created_at DESC);
CREATE UNIQUE INDEX idx_review_note_presets_text ON review_note_presets(text);
CREATE UNIQUE INDEX idx_review_keywords_text ON review_keywords(category, text);
CREATE INDEX idx_review_keywords_category ON review_keywords(category);
CREATE INDEX idx_comments_user_moderated ON comments(user_id, moderated_at);
CREATE INDEX idx_comments_status_id
  ON comments(status, id DESC);
CREATE INDEX idx_sessions_last_seen ON sessions(last_seen_at);
CREATE INDEX idx_sessions_created  ON sessions(created_at);
