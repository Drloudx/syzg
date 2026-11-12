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
INSERT INTO "sessions" ("token_hash","user_id","expires_at","created_at","last_seen_at","ua_hash","ip_hash") VALUES('7b6a490a40b28a6bf631298e462196a7cb094fb0d662a16726a885dc858d9fc2',1,1796481166000,1793116939,1793889166,'19619c180434820677c5d591b970f33cbcc25d0b2a6cd2b30445e6fb84c00944','7ff765e448dfbf41d1e10734220beb9579d1c6b2eab4b549b4b0ad1856258878');
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
CREATE TABLE notices (
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
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('site-5','site','normal',NULL,'占位测试','','2026-11-01','测试','info',NULL,NULL,NULL,1,1,'1793558788.0','1793615330.0');
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('site-7','site','normal',NULL,'占位测试','','2026-11-01','测试','info',NULL,NULL,NULL,1,1,'1793558793.0','1793615326.0');
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('site-4','site','normal',NULL,'大书院学者讨论区交流准则','<p>欢迎各位探求者在讨论区交流游戏体验、阵容心得。</p><p>请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。</p>','2026-10-25','社区','gold',NULL,NULL,NULL,1,1,'2026-11-01','1793610704.0');
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('site-1','site','normal',NULL,'深渊大书院站点免责声明与服务协议','<p>本站由玩家独立维护，是非官方资料站，与深渊之歌、淘气泡游戏不存在隶属关系、官方授权或商业代理关系。本站所提及的游戏名称、商标、标志、截图、游戏数据、角色立绘及相关艺术素材，其版权与所有权归各自权利人所有。<br>本网站仅提供粉丝向参考与信息整理服务。</p>','2026-09-19','置顶','pinned',NULL,NULL,NULL,1,1,'2026-11-01','1793610664.0');
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('official-6','official','normal',NULL,'「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放','<p>荒野测试 正式定档 11.12</p><p>一、全新角色</p><p>新增德莉（5 星）、斯卡莉安（5 星）、洛莉安（5 星）、阿尔克丝（4 星）、修瓦莉（4 星）、诺姿（3 星）等伙伴。</p><p>二、全新活动：洛莉安的幽夜古堡</p><p>秘境挑战「亚空回廊」限时开启！发掘失落的遗器，嵌入强大的法盘，不断探索深入这片奇诡的秘境。可获得独特的神器、传说级装备、契约书、小屋外观等道具。</p><p>三、全新时代</p><p>新增彩虹芭菲公主·德莉（传说）、金鹿的假期·菲莉娜（传说）、阳葵田的守望者·芭杜尔（罕见）、胡萝卜小收获日·米拉贝尔（罕见）、一日侍者·米托拉（罕见）等时装。</p><p>四、全新魔物</p><p>新增圣骑士史莱姆（5 星）、洛莉安的眷属（5 星）、蜂刺骑兵（4 星）、黄金史莱姆（4 星）、粉红史莱姆（3 星）、天青史莱姆（3 星）、幽灵史莱姆（3 星）等魔物。</p><p>五、全新体验</p><p>1. 商业化内容更新：上线驿站补给凭证（月卡）、荒野通行手册（通行证），同步对付费商城进行改版优化。</p><p>2. 开放装扮系统。</p><p>3. 新增小屋外观自定义功能。</p><p>4. 上架全新家具系列。</p><p>5. 优化部分关卡难度曲线，调整关卡体验。</p><p>6. 新增万能突破魔物：新增纯白史莱姆、彩虹史莱姆，可用于任意魔物突破。</p><p>7. 新增万能回忆拼图：新增湛蓝、靛紫、灿金回忆拼图，可替代任意伙伴的对应回忆拼图，完成星阶激活。</p><p>8. 新增角色重置道具：新增成长遗忘药水，使用后即可重置角色等级与技能等级，返还经验书与元素碎片。</p><p>9. 修复若干已知问题。</p><p>注：本素材内容仅供参考，具体请以游戏内实际情况为准。<br><br><a target="_blank" rel="noopener noreferrer" class="rich-link" href="https://www.taptap.cn/moment/864080934587075947?group_id=973894">「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放</a></p>','2026-11-02','版本','pinned','「荒野计费测试」','["✦ 全新角色登场","✦ 全新魔物上线","✦ 全新角色时装","✦ 限时秘境挑战「洛莉安的幽夜古堡」"]',NULL,1,0,'1793610245.0','1793610412.0');
INSERT INTO "notices" ("id","channel","tier","slot","title","content","date","tag_text","tag_class","version","features_json","source_url","is_active","show_in_modal","created_at","updated_at") VALUES('official-5','official','normal',NULL,'游戏简介','<h2 style="line-height: 24px;"><strong>游戏简介</strong></h2><p>「那是人类得到的教训，因为人类的狂妄自负而应得的教训」<br>糟糕！<br>失忆之后坠落深渊？<br>还要当异世界的救世主？我吗？？<br>虽然听着很不妙，但我们是一款拥有治愈复古画风的蛮轻松的异世界冒险手游，旅途比您想象中悠闲得多～<br>您将扮演年轻有为却丧失记忆的工匠，因为一次意外而坠落到了深渊（Abyss）。<br>在这里，您邂逅了魔人少女——米托拉，最好的伙伴！<br>你们一起一砖一瓦搭建家园，春种秋收收获满仓；<br>招募天南海北的有趣伙伴，孵化风格各异的神奇魔物；<br>亲手锻造神器，打造专属冒险营地。<br><br>你们一起抵挡狂暴种魔物作乱，再踩着晨光往未知的区域奔跑。<br>散落在深渊间的记忆碎片，正等您慢慢拼凑；<br>沉眠在这片土地下的真相，也等待着您亲手揭开它的面纱。<br><br>来吧，工匠大人。<br>深渊的风，已经静候您多时了。</p><h2 style="line-height: 24px;"><strong>开发者的话</strong></h2><p>大家好！我们是《深渊之歌》的开发团队。在营地的篝火旁，我们怀着激动与忐忑的心情写下这封信，邀请你们一同踏入这片深邃而迷人的无主之地——“深渊”。<br><br>《深渊之歌》的核心魅力：<br><br>故事驱动，浸入深渊：<br>数百年前那场席卷卡露蒂亚的灾难余波未平，而“深渊”——这场风暴的正中心，正是故事的起点。被克里斯汀圣教军追捕的小小工匠意外坠入其中。这里环境严酷，魔物环伺，但也蕴藏着失落的历史、奇异的生灵和无尽的可能。<br><br>魔物伙伴，从敌到友：<br>从一枚“蛋”开始，孵化、培育你的魔物！培育的魔物拥有独立的技能和专属特性，能为你的组队策略带来全新维度。无论是派遣它们去获得收益，还是带着它们在荒野中披荆斩棘，它们都是你最特别的伙伴。<br><br>深度养成，自由构筑：<br>六大职业、四种元素属性，自由组建你的四人冒险小队。通过获取经验、升级技能、解锁回忆拼图，每个角色都能绽放独特光彩。别忘了给你的伙伴们送送礼，解锁他们的专属羁绊剧情和奖励！<br><br>立足荒野，建造家园：<br>从一堆篝火开始，亲手在危机四伏的深渊中开辟一隅安身之所。建造、升级、研究科技、制作材料、开垦田地、烹饪料理、摆放家具，邀请伙伴入住……这里的一切都由你规划，打造你和伙伴们的家园！<br><br>匠魂不息，锻造传说：<br>能工巧匠，亦是真正的勇者！传说级的金色装备和稀有词条，都可以用自己的双手去锻造！为伙伴量身打造契合的装备，组成套装、强化底材、洗练词条、附魔特性……工匠锤每一次的锻打，都让你离深渊的秘密更近一步。<br><br>经营有方，放置生财：<br>深渊求生，资源为王。除了亲自去野地采集，也有更轻松的方法获取材料。发出探索队让闲置的伙伴收集材料和战利品，在冒险之余配置生产计划，让种植、磨坊、轻工、锻造、制药形成产业闭环，在市场中完成订单和买卖交易，用赚取的资金购买资源或强化队伍，群英荟萃指日可待！<br><br>《深渊之歌》倾注了我们的全部热爱。我们一直梦想着创造这样一个世界：它不仅仅是冒险战斗的舞台，更是一个你能够扎根、成长、与伙伴建立深刻羁绊的家园。<br><br>准备好你的行囊，点燃营地的篝火，孵化第一枚魔物蛋，和伙伴一起举起亲手锻造的武器……在卡露蒂亚的深渊之中，你的传奇，正等待书写。让我们在篝火旁相聚，共同谱写这首属于工匠与勇者的“深渊之歌”！</p>','2026-11-01','简介','info','','[]',NULL,1,0,'1793562426.0','1793562793.0');
CREATE TABLE home_notice_slots (
  channel    TEXT    NOT NULL,
  slot       INTEGER NOT NULL,
  notice_id  TEXT,
  updated_at TEXT,
  PRIMARY KEY (channel, slot)
);
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('official',1,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('official',2,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('official',3,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('official',4,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('site',1,'site-1','1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('site',2,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('site',3,NULL,'1793554931.0');
INSERT INTO "home_notice_slots" ("channel","slot","notice_id","updated_at") VALUES('site',4,'site-4','1793554931.0');
CREATE TABLE home_banners (
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
CREATE TABLE home_links (
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
CREATE TABLE home_heroes (
  slot      INTEGER PRIMARY KEY,
  hero_id   TEXT NOT NULL,
  tip       TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE home_blocks (
  section   TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  subtitle  TEXT,
  rows_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
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
CREATE INDEX idx_notices_recent
  ON notices(channel, is_active, date DESC);
