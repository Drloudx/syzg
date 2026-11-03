import { getImageUrl } from './env.js'

/**
 * 房间变体中的 NPC 映射表（包含名称与头像资源名称）
 */
export const ROOM_NPC_MAP = {
  "c0_4_a_c0_4_a_01": [
    {
      "name": "荒野客猎人",
      "icon": ""
    }
  ],
  "c0_4_a_f1A_4": [
    {
      "name": "荒野客猎人",
      "icon": ""
    },
    {
      "name": "绿色史莱姆魔物蛋",
      "icon": ""
    }
  ],
  "c0_6_a_f1A_5": [
    {
      "name": "NPC",
      "icon": "at002_0"
    }
  ],
  "c0_6_a_f1A_6": [
    {
      "name": "神秘的光球",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": "at002_0"
    }
  ],
  "c0_6_a_Battle_0_00_05": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_013"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "c0_6_a_Battle_0_0_01": [
    {
      "name": "艾尔莎",
      "icon": ""
    },
    {
      "name": "契约者",
      "icon": ""
    },
    {
      "name": "契约者",
      "icon": ""
    }
  ],
  "stage_c0_area1_5": [
    {
      "name": "沃夫加",
      "icon": "at012_0"
    }
  ],
  "stage_c0_area1_6": [
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    }
  ],
  "c1_1_a_f1A_1": [
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    }
  ],
  "c1_1_a_f1A_4": [
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "驿站的卫兵",
      "icon": ""
    }
  ],
  "c1_10_a_f1A_2": [
    {
      "name": "队长巴尼",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "海莉",
      "icon": ""
    },
    {
      "name": "莎拉",
      "icon": ""
    },
    {
      "name": "哈萨琳之手",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "哈萨琳之手",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_002"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_010"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_010"
    }
  ],
  "c1_10_a_f1A_5": [
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "海莉",
      "icon": ""
    },
    {
      "name": "莎拉",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_011"
    }
  ],
  "c1_11_a_f1A_4": [
    {
      "name": "缇莎",
      "icon": ""
    },
    {
      "name": "史莱姆1",
      "icon": "avatar_Mon_009"
    },
    {
      "name": "史莱姆2",
      "icon": "avatar_Mon_014"
    },
    {
      "name": "史莱姆3",
      "icon": "avatar_Mon_009"
    }
  ],
  "c1_12_a_f1A_2": [
    {
      "name": "巴尔德",
      "icon": ""
    },
    {
      "name": "缇莎",
      "icon": ""
    }
  ],
  "c1_14_a_f1A_2": [
    {
      "name": "莉拉首座",
      "icon": "avatar_Mon_010"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_037"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_037"
    }
  ],
  "c1_15_a_f1A_5": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_010"
    }
  ],
  "c1_2_a_f1A_4": [
    {
      "name": "受伤的契约者",
      "icon": ""
    },
    {
      "name": "受伤的契约者",
      "icon": ""
    },
    {
      "name": "受伤的契约者",
      "icon": ""
    }
  ],
  "c1_2_a_f1A_3": [
    {
      "name": "受伤的契约者B",
      "icon": ""
    },
    {
      "name": "受伤的契约者C",
      "icon": ""
    },
    {
      "name": "受伤的契约者A",
      "icon": ""
    },
    {
      "name": "菲尔德蕾",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "c1_3_a_f1A_4": [
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "精英角布林",
      "icon": ""
    },
    {
      "name": "契约者1",
      "icon": ""
    },
    {
      "name": "契约者2",
      "icon": ""
    }
  ],
  "c1_4_a_f1A_3": [
    {
      "name": "强作镇定的民兵",
      "icon": ""
    },
    {
      "name": "惊魂未定的民兵",
      "icon": ""
    },
    {
      "name": "民兵1",
      "icon": ""
    },
    {
      "name": "民兵2",
      "icon": ""
    },
    {
      "name": "角布林2",
      "icon": "avatar_Mon_007"
    },
    {
      "name": "角布林1",
      "icon": "avatar_Mon_007"
    },
    {
      "name": "角布林3",
      "icon": "avatar_Mon_008"
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "民兵3",
      "icon": ""
    },
    {
      "name": "民兵4",
      "icon": ""
    },
    {
      "name": "角布林4",
      "icon": "avatar_Mon_007"
    }
  ],
  "c1_4_a_f1A_5": [
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "风车平野农夫",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "c1_5_a_f1A_4": [
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "c1_6_a_f1A_2": [
    {
      "name": "哈手1",
      "icon": "avatar_Mon_056_3"
    },
    {
      "name": "哈手2",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "铸甲匠达尔曼",
      "icon": ""
    },
    {
      "name": "哈手3",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "哈手4",
      "icon": "avatar_Mon_056_4"
    },
    {
      "name": "哈手5",
      "icon": "avatar_Mon_056_2"
    }
  ],
  "c1_7_a_f1A_5": [
    {
      "name": "掌炉者库尔斯",
      "icon": ""
    },
    {
      "name": "武器匠瑟尔妲",
      "icon": ""
    },
    {
      "name": "高炉工乌斯克",
      "icon": ""
    }
  ],
  "c1_9_a_f1A_4": [
    {
      "name": "小孩",
      "icon": ""
    }
  ],
  "c1_9_a_f1A_5": [
    {
      "name": "哈萨琳之手工兵",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "哈萨琳之手队长",
      "icon": "avatar_Mon_056_5"
    }
  ],
  "stage_c1_area1_1": [
    {
      "name": "药剂师琳扎德",
      "icon": ""
    },
    {
      "name": "卫兵盖鲁尔特",
      "icon": ""
    },
    {
      "name": "侍者维丝",
      "icon": ""
    },
    {
      "name": "樵夫萨契",
      "icon": ""
    },
    {
      "name": "卫兵尼尔",
      "icon": ""
    },
    {
      "name": "露比",
      "icon": ""
    },
    {
      "name": "史莱姆1",
      "icon": ""
    },
    {
      "name": "史莱姆2",
      "icon": ""
    },
    {
      "name": "史莱姆3",
      "icon": ""
    },
    {
      "name": "露比",
      "icon": ""
    },
    {
      "name": "演出用艾尔莎",
      "icon": ""
    }
  ],
  "stage_c1_area1_2": [
    {
      "name": "侍者萨利",
      "icon": ""
    },
    {
      "name": "侍者杰米",
      "icon": ""
    },
    {
      "name": "茜塔",
      "icon": "at005_0"
    }
  ],
  "stage_c1_area1_4": [
    {
      "name": "驿站主菲尔德蕾",
      "icon": ""
    },
    {
      "name": "契约官艾尔莎",
      "icon": ""
    },
    {
      "name": "侍者茜塔",
      "icon": ""
    },
    {
      "name": "商人比绍",
      "icon": ""
    },
    {
      "name": "食客德拉斯",
      "icon": ""
    },
    {
      "name": "冒险者瑟加特",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "旅店的桌子",
      "icon": ""
    },
    {
      "name": "舞女夏库塔拉",
      "icon": "at008_0"
    },
    {
      "name": "舞女可可娜",
      "icon": "at009_0"
    },
    {
      "name": "舞台经理拉碧丝",
      "icon": "at007_0"
    },
    {
      "name": "侍者格薇勒",
      "icon": "at028_0"
    },
    {
      "name": "侍者领班梅莉莉",
      "icon": "at027_0"
    },
    {
      "name": "水占师贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "先时学者瓦菲诺",
      "icon": "avatar_Mon_038"
    }
  ],
  "stage_c1_area1_6": [
    {
      "name": "舞女可可娜",
      "icon": "at009_0"
    },
    {
      "name": "舞女夏库塔拉",
      "icon": "at008_0"
    },
    {
      "name": "舞台经理拉碧丝",
      "icon": "at007_0"
    },
    {
      "name": "侍者杰米",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "stage_c1_area1_10": [
    {
      "name": "侍者茜塔",
      "icon": ""
    }
  ],
  "stage_c1_area2_1": [
    {
      "name": "村民",
      "icon": ""
    },
    {
      "name": "茜塔",
      "icon": ""
    },
    {
      "name": "牧人拉尔特",
      "icon": ""
    },
    {
      "name": "商人比绍",
      "icon": ""
    },
    {
      "name": "舞女夏库塔拉",
      "icon": "at008_0"
    },
    {
      "name": "舞台经理拉碧丝",
      "icon": "at007_0"
    },
    {
      "name": "阿茶",
      "icon": ""
    }
  ],
  "stage_c1_area2_2": [
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "村姑勒妮",
      "icon": ""
    }
  ],
  "stage_c1_area2_4": [
    {
      "name": "野生妖精之巢",
      "icon": ""
    }
  ],
  "stage_c1_area2_5": [
    {
      "name": "契约者珍娜",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "stage_c1_area3_1": [
    {
      "name": "掌炉者库尔斯",
      "icon": ""
    },
    {
      "name": "武具匠瑟尔妲",
      "icon": ""
    },
    {
      "name": "铸甲匠达尔曼",
      "icon": ""
    },
    {
      "name": "高炉工桑克斯",
      "icon": ""
    },
    {
      "name": "高炉工乌斯克",
      "icon": ""
    },
    {
      "name": "旅行厨师德拉卡斯",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "小孩",
      "icon": ""
    },
    {
      "name": "小孩",
      "icon": ""
    },
    {
      "name": "小孩",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "演出专用，外观代用",
      "icon": ""
    },
    {
      "name": "演出专用，外观代用",
      "icon": ""
    },
    {
      "name": "演出专用，外观代用",
      "icon": ""
    },
    {
      "name": "演出专用，外观代用",
      "icon": ""
    },
    {
      "name": "演出专用，外观代用",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "被抓挠的痕迹",
      "icon": ""
    }
  ],
  "stage_c1_area3_3": [
    {
      "name": "迦南",
      "icon": "at055_0"
    },
    {
      "name": "铸甲匠达尔曼",
      "icon": ""
    }
  ],
  "stage_c1_area3_4": [
    {
      "name": "见习铁匠达特",
      "icon": ""
    },
    {
      "name": "舞台经理拉碧丝",
      "icon": "at007_0"
    },
    {
      "name": "舞女夏库塔拉",
      "icon": "at008_0"
    }
  ],
  "stage_c1_area3_5": [
    {
      "name": "杂草覆盖的痕迹",
      "icon": ""
    }
  ],
  "stage_c1_area3_6": [
    {
      "name": "堆放的桶子",
      "icon": ""
    },
    {
      "name": "松动的活板门",
      "icon": ""
    }
  ],
  "stage_c1_area4_1": [
    {
      "name": "修业学徒缇莎",
      "icon": ""
    },
    {
      "name": "副座巴尔德",
      "icon": ""
    },
    {
      "name": "修业学徒格兰缇",
      "icon": ""
    },
    {
      "name": "修业学徒梵妮",
      "icon": ""
    },
    {
      "name": "修行者凯帕斯克",
      "icon": ""
    },
    {
      "name": "商人塞勒",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "首座莉拉",
      "icon": "avatar_Mon_010"
    },
    {
      "name": "先时学者瓦菲诺",
      "icon": "avatar_Mon_038"
    },
    {
      "name": "商人比绍",
      "icon": ""
    }
  ],
  "stage_c1_area4_2": [
    {
      "name": "魔物留下的痕迹",
      "icon": ""
    },
    {
      "name": "修业学徒玛姬",
      "icon": ""
    },
    {
      "name": "迦南",
      "icon": "at055_0"
    }
  ],
  "stage_c1_area5_1": [
    {
      "name": "首座莉拉",
      "icon": "avatar_Mon_010"
    }
  ],
  "stage_c1_area5_2": [
    {
      "name": "首座莉拉",
      "icon": "avatar_Mon_010"
    },
    {
      "name": "舞台经理拉碧丝",
      "icon": "at007_0"
    },
    {
      "name": "舞女夏库塔拉",
      "icon": "at008_0"
    }
  ],
  "c2_1_a_f1A_4": [
    {
      "name": "恐怖蟾兽",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "c2_10_a_f1A_4": [
    {
      "name": "哈比巢母",
      "icon": "avatar_Mon_054"
    },
    {
      "name": "哈比狂怒者1",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "哈比狂怒者2",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "哈比狂怒者3",
      "icon": "avatar_Mon_053"
    }
  ],
  "c2_10_a_f1A_5": [
    {
      "name": "哈比巢母1.6倍",
      "icon": "avatar_Mon_054"
    },
    {
      "name": "哈比1",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "哈比2",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "米托菈",
      "icon": "at002_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "剋",
      "icon": "at037_0"
    },
    {
      "name": "光球",
      "icon": ""
    }
  ],
  "c2_2_a_f1A_3": [
    {
      "name": "卡夫",
      "icon": "at023_0"
    },
    {
      "name": "皮塔",
      "icon": "at014_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "c2_3_a_f1A_3": [
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    }
  ],
  "c2_4_a_f1A_3": [
    {
      "name": "马可",
      "icon": ""
    },
    {
      "name": "米拉贝尔村",
      "icon": "at050_0"
    },
    {
      "name": "哈手1",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "哈手2",
      "icon": "avatar_Mon_056_3"
    },
    {
      "name": "哈手3",
      "icon": "avatar_Mon_056_3"
    },
    {
      "name": "哈手4",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "米拉贝尔战（一开始是隐藏的）",
      "icon": "at050_0"
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    }
  ],
  "c2_4_a_f1A_4": [
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "马可",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": "at049_0"
    }
  ],
  "c2_6_a_f1A_1": [
    {
      "name": "狐狸人",
      "icon": "avatar_Mon_056_2"
    },
    {
      "name": "狼人",
      "icon": "avatar_Mon_056_4"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "c2_6_a_f1A_4": [
    {
      "name": "安娜",
      "icon": "at029_0"
    },
    {
      "name": "哈萨林之手",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "哈萨林之手",
      "icon": "avatar_Mon_056_1"
    }
  ],
  "c2_7_a_f1A_3": [
    {
      "name": "卡夫",
      "icon": "at023_0"
    },
    {
      "name": "皮塔",
      "icon": "at014_0"
    },
    {
      "name": "哈比1",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "哈比2",
      "icon": "avatar_Mon_053"
    }
  ],
  "c2_9_a_f1A_4": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_055"
    }
  ],
  "stage_c2_area1_1": [
    {
      "name": "“愚人”卡夫",
      "icon": "at023_0"
    },
    {
      "name": "“独眼”皮塔",
      "icon": "at014_0"
    },
    {
      "name": "“顺风”米莉",
      "icon": ""
    },
    {
      "name": "“沉默者”米卡埃尔",
      "icon": ""
    },
    {
      "name": "“萝卜”阿里特",
      "icon": ""
    },
    {
      "name": "“见钱眼开”康纳",
      "icon": ""
    },
    {
      "name": "“浴缸”瑟尼",
      "icon": ""
    },
    {
      "name": "“车夫”德利特尔",
      "icon": ""
    },
    {
      "name": "“石头”贾马尔",
      "icon": ""
    },
    {
      "name": "“双刃”费萨",
      "icon": ""
    },
    {
      "name": "“铁箭”莱米",
      "icon": ""
    },
    {
      "name": "“情报贩子”马可",
      "icon": ""
    },
    {
      "name": "“老师”希瑟",
      "icon": ""
    },
    {
      "name": "“皮匠”埃达",
      "icon": ""
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_057_2"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "贝拉多娜",
      "icon": "at026_0"
    },
    {
      "name": "小蝙蝠",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "贝拉多娜",
      "icon": "at026_0"
    },
    {
      "name": "小蝙蝠",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "罗伯特",
      "icon": ""
    }
  ],
  "stage_c2_area1_2": [
    {
      "name": "“锈锄”罗尼",
      "icon": ""
    },
    {
      "name": "“工头”罗伯特",
      "icon": ""
    },
    {
      "name": "“淑女”米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "NPC",
      "icon": "at050_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "贝拉多娜",
      "icon": "at026_0"
    },
    {
      "name": "小蝙蝠",
      "icon": "avatar_Mon_055"
    }
  ],
  "stage_c2_area1_3": [
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    }
  ],
  "stage_c2_area1_4": [
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "stage_c2_area1_5": [
    {
      "name": "奇怪的小蝙蝠",
      "icon": "avatar_Mon_055"
    }
  ],
  "stage_c2_area1_7": [
    {
      "name": "贝拉多娜小姐",
      "icon": "at026_0"
    },
    {
      "name": "小蝙蝠",
      "icon": "avatar_Mon_055"
    }
  ],
  "stage_c2_area1_8": [
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "阿迪拉",
      "icon": "at047_0"
    },
    {
      "name": "阿迪拉",
      "icon": "at047_0"
    }
  ],
  "stage_c2_area2_1": [
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    },
    {
      "name": "迈妮娅",
      "icon": "at046_0"
    },
    {
      "name": "阿尔克丝",
      "icon": ""
    },
    {
      "name": "“见钱眼开”康纳",
      "icon": ""
    },
    {
      "name": "村民",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "村民",
      "icon": ""
    }
  ],
  "stage_c2_area2_2": [
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    },
    {
      "name": "巨大的望远镜",
      "icon": ""
    },
    {
      "name": "散落的羽毛",
      "icon": ""
    },
    {
      "name": "堆放的研究资料",
      "icon": ""
    },
    {
      "name": "迈妮娅",
      "icon": "at046_0"
    },
    {
      "name": "阿尔克丝",
      "icon": ""
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    }
  ],
  "stage_c2_area2_3": [
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    }
  ],
  "stage_c2_area3_1": [
    {
      "name": "剋大师",
      "icon": "at037_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "哈比1",
      "icon": "avatar_Mon_054"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "萨拉",
      "icon": "avatar_Mon_048"
    }
  ],
  "stage_c2_area3_2": [
    {
      "name": "阿迪拉",
      "icon": "at047_0"
    },
    {
      "name": "萨拉",
      "icon": "avatar_Mon_048"
    }
  ],
  "stage_c2_area4_1": [
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    },
    {
      "name": "剋大师",
      "icon": "at037_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "帕扎迪恩",
      "icon": "avatar_Mon_042"
    },
    {
      "name": "研究员",
      "icon": ""
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    },
    {
      "name": "米莉",
      "icon": ""
    },
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    }
  ],
  "stage_c2_area4_2": [
    {
      "name": "阿尔克丝",
      "icon": ""
    },
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    },
    {
      "name": "迈妮娅",
      "icon": "at046_0"
    },
    {
      "name": "勘测节点一",
      "icon": ""
    },
    {
      "name": "勘测节点二",
      "icon": ""
    }
  ],
  "stage_c2_area4_3": [
    {
      "name": "阿尔克丝",
      "icon": ""
    },
    {
      "name": "勘测节点三",
      "icon": ""
    },
    {
      "name": "最终勘测节点",
      "icon": ""
    },
    {
      "name": "灾害学者安娜",
      "icon": "at029_0"
    }
  ],
  "c3_1_a_f1A_1": [
    {
      "name": "有鸟马车",
      "icon": ""
    },
    {
      "name": "恐兽",
      "icon": "avatar_Mon_046"
    }
  ],
  "c3_1_a_f1A_4": [
    {
      "name": "鱼布林弹弓",
      "icon": "avatar_Mon_065"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    }
  ],
  "c3_10_a_f1A_4": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_013"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_2"
    }
  ],
  "c3_11_a_f1A_1": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_052"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "c3_11_a_f1A_4": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_2"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "c3_11_a_f1A_6": [
    {
      "name": "NPC",
      "icon": "at041_0"
    },
    {
      "name": "NPC",
      "icon": "at051_0"
    },
    {
      "name": "NPC",
      "icon": "at036_0"
    }
  ],
  "c3_12_a_f1A_1": [
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_1"
    }
  ],
  "c3_2_a_f1A_3": [
    {
      "name": "艾因",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_065"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    }
  ],
  "c3_2_a_f1A_4": [
    {
      "name": "此小队队长",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "阿莱克西亚",
      "icon": "at051_0"
    }
  ],
  "c3_3_a_f1A_4": [
    {
      "name": "NPC",
      "icon": "at036_0"
    },
    {
      "name": "NPC",
      "icon": "at041_0"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "c3_5_a_f1A_1": [
    {
      "name": "NPC",
      "icon": "at033_0"
    },
    {
      "name": "NPC",
      "icon": "at034_0"
    },
    {
      "name": "NPC",
      "icon": "at051_0"
    },
    {
      "name": "NPC",
      "icon": "at036_0"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "对峙露帕的怪1",
      "icon": "avatar_Mon_064"
    },
    {
      "name": "对峙露帕的怪2",
      "icon": "avatar_Mon_062"
    },
    {
      "name": "对峙乌帕的怪3",
      "icon": ""
    },
    {
      "name": "对峙乌帕的怪4",
      "icon": "avatar_Mon_058"
    },
    {
      "name": "对峙乌帕的怪5",
      "icon": ""
    }
  ],
  "c3_6_a_f1A_4": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_013"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_056_2"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_064"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_065"
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "c3_7_a_f1A_1": [
    {
      "name": "跪坐的贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "stage_c3_area1_1": [
    {
      "name": "见习水占师乌帕",
      "icon": "at033_0"
    },
    {
      "name": "水占师贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "见习水占师露帕",
      "icon": "at034_0"
    },
    {
      "name": "渔民格雷米",
      "icon": ""
    },
    {
      "name": "水占师阿拉迪尔",
      "icon": ""
    },
    {
      "name": "水占师吉拉斯",
      "icon": ""
    },
    {
      "name": "商人霍夫尼尔",
      "icon": ""
    },
    {
      "name": "见习水占师乌帕",
      "icon": "at033_0"
    },
    {
      "name": "见习水占师露帕",
      "icon": "at034_0"
    },
    {
      "name": "高阶水占师",
      "icon": ""
    },
    {
      "name": "商人比绍",
      "icon": ""
    },
    {
      "name": "迈妮娅",
      "icon": "at046_0"
    },
    {
      "name": "首座莉拉",
      "icon": "avatar_Mon_010"
    },
    {
      "name": "先时学者瓦菲诺",
      "icon": "avatar_Mon_038"
    },
    {
      "name": "艾茵",
      "icon": ""
    }
  ],
  "stage_c3_area1_3": [
    {
      "name": "大长老丹涅尔",
      "icon": "avatar_Mon_040"
    },
    {
      "name": "图洛德",
      "icon": "avatar_Mon_039"
    },
    {
      "name": "贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "图洛德",
      "icon": "avatar_Mon_039"
    }
  ],
  "stage_c3_area1_5": [
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "渔民克里娅",
      "icon": ""
    },
    {
      "name": "木匠耶沙米尔",
      "icon": ""
    },
    {
      "name": "水占师守卫",
      "icon": ""
    }
  ],
  "stage_c3_area1_6": [
    {
      "name": "探测点",
      "icon": ""
    },
    {
      "name": "黑泥上的脚印",
      "icon": ""
    },
    {
      "name": "约定的地点",
      "icon": ""
    },
    {
      "name": "露帕",
      "icon": "at034_0"
    },
    {
      "name": "阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "乌帕",
      "icon": "at033_0"
    },
    {
      "name": "艾茵",
      "icon": ""
    },
    {
      "name": "闪闪发光的碎片",
      "icon": ""
    },
    {
      "name": "艾尔菲帕",
      "icon": "at045_0"
    },
    {
      "name": "露帕_s_3_3",
      "icon": "at034_0"
    },
    {
      "name": "乌帕_s_3_3",
      "icon": "at033_0"
    }
  ],
  "stage_c3_area1_7": [
    {
      "name": "恐怖蟾兽",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "艾茵",
      "icon": ""
    }
  ],
  "stage_c3_area2_1": [
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "见习水占师乌帕",
      "icon": "at033_0"
    },
    {
      "name": "见习水占师露帕",
      "icon": "at034_0"
    },
    {
      "name": "见习水占师乌帕",
      "icon": "at033_0"
    },
    {
      "name": "艾尔菲帕",
      "icon": "at045_0"
    }
  ],
  "stage_c3_area3_1": [
    {
      "name": "哈萨琳之手佣兵",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "治安队员埃尔戈瓦",
      "icon": ""
    },
    {
      "name": "治安队员奥希娅尔",
      "icon": ""
    },
    {
      "name": "文员拉比尔",
      "icon": ""
    },
    {
      "name": "水占师图塔科",
      "icon": ""
    },
    {
      "name": "女仆莱蒂拉",
      "icon": ""
    },
    {
      "name": "侍者领班梅莉莉",
      "icon": "at027_0"
    },
    {
      "name": "侍者茜塔",
      "icon": ""
    },
    {
      "name": "见习水占师乌帕",
      "icon": "at033_0"
    },
    {
      "name": "见习水占师露帕",
      "icon": "at034_0"
    },
    {
      "name": "货车",
      "icon": ""
    },
    {
      "name": "商人",
      "icon": ""
    }
  ],
  "stage_c3_area3_2": [
    {
      "name": "鲁尼的小弟",
      "icon": ""
    },
    {
      "name": "花商米罗尼娅",
      "icon": ""
    },
    {
      "name": "“捕蛇人”恩塔尔",
      "icon": ""
    },
    {
      "name": "路过的小孩",
      "icon": ""
    },
    {
      "name": "阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    }
  ],
  "stage_c3_area3_3": [
    {
      "name": "埋伏地点",
      "icon": ""
    },
    {
      "name": "阿莱克西娅",
      "icon": "at051_0"
    }
  ],
  "stage_c3_area3_4": [
    {
      "name": "治安队长埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "治安队员萨麦尔",
      "icon": ""
    },
    {
      "name": "治安队员米努娜",
      "icon": ""
    },
    {
      "name": "治安队长埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "送信小孩",
      "icon": ""
    },
    {
      "name": "镇民B",
      "icon": ""
    },
    {
      "name": "镇民A",
      "icon": ""
    },
    {
      "name": "镇民C",
      "icon": ""
    }
  ],
  "stage_c3_area3_5": [
    {
      "name": "《哈萨琳之手反制计划》",
      "icon": ""
    },
    {
      "name": "《大市集货物运输记录》",
      "icon": ""
    },
    {
      "name": "《净水仪式物资调遣书》",
      "icon": ""
    },
    {
      "name": "治安队长埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "水占师贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "塞弗德里克",
      "icon": "avatar_Mon_052"
    }
  ],
  "stage_c3_area3_6": [
    {
      "name": "赛弗德里克",
      "icon": "avatar_Mon_052"
    },
    {
      "name": "水占师贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    }
  ],
  "stage_c3_area3_7": [
    {
      "name": "达玛拉的门卫",
      "icon": ""
    },
    {
      "name": "贝尔卡",
      "icon": "at036_0"
    }
  ],
  "stage_c3_area3_8": [
    {
      "name": "探测点",
      "icon": ""
    }
  ],
  "stage_c3_area4_1": [
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "惊慌失措的老妇",
      "icon": ""
    },
    {
      "name": "贫民罗齐尔",
      "icon": ""
    },
    {
      "name": "贫民凯索尔",
      "icon": ""
    },
    {
      "name": "贫民伊曼纽尔",
      "icon": ""
    },
    {
      "name": "显眼的纸片",
      "icon": ""
    },
    {
      "name": "文员拉比尔",
      "icon": ""
    }
  ],
  "stage_c3_area4_2": [
    {
      "name": "圣女阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "柏莉尔的父亲",
      "icon": ""
    },
    {
      "name": "柏莉尔的母亲",
      "icon": ""
    },
    {
      "name": "埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "阿莱克西娅",
      "icon": "at051_0"
    },
    {
      "name": "像是妹妹的女孩",
      "icon": ""
    },
    {
      "name": "像是姐姐的女孩",
      "icon": ""
    },
    {
      "name": "露帕",
      "icon": "at034_0"
    },
    {
      "name": "乌帕",
      "icon": "at033_0"
    },
    {
      "name": "艾尔菲帕",
      "icon": "at045_0"
    },
    {
      "name": "像是姐姐的女孩",
      "icon": ""
    }
  ],
  "stage_c3_area4_3": [
    {
      "name": "斯通的妹妹",
      "icon": ""
    },
    {
      "name": "艾婕的丈夫",
      "icon": ""
    },
    {
      "name": "布彻的父亲",
      "icon": ""
    }
  ],
  "stage_c3_area4_4": [
    {
      "name": "贫民布鲁莫尔",
      "icon": ""
    }
  ],
  "stage_c3_area4_5": [
    {
      "name": "烧得焦黑的坑洼",
      "icon": ""
    }
  ],
  "stage_c3_area5_1": [
    {
      "name": "贝尔卡",
      "icon": "at036_0"
    },
    {
      "name": "埃迪蒂",
      "icon": "at041_0"
    },
    {
      "name": "巴尼",
      "icon": ""
    },
    {
      "name": "守卫2",
      "icon": ""
    },
    {
      "name": "守卫1",
      "icon": ""
    },
    {
      "name": "失神的佣兵1",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "失神的佣兵2",
      "icon": "avatar_Mon_056_4"
    },
    {
      "name": "失神的佣兵3",
      "icon": "avatar_Mon_056_3"
    },
    {
      "name": "失神的佣兵4",
      "icon": "avatar_Mon_056_2"
    },
    {
      "name": "失神的佣兵5",
      "icon": "avatar_Mon_056_1"
    },
    {
      "name": "艾茵",
      "icon": ""
    },
    {
      "name": "蓝色灵体鬼魂",
      "icon": ""
    }
  ],
  "stage_c3_area5_3": [
    {
      "name": "神秘的陌生人",
      "icon": ""
    }
  ],
  "c4_1_a_f1A_1": [
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "伐木工",
      "icon": ""
    },
    {
      "name": "伐木工1",
      "icon": ""
    },
    {
      "name": "伐木工3",
      "icon": ""
    }
  ],
  "c4_11_a_f1A_3": [
    {
      "name": "护林人",
      "icon": ""
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    }
  ],
  "c4_11_a_f1A_4": [
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "护林人1",
      "icon": ""
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "护林人2",
      "icon": ""
    },
    {
      "name": "哈手1",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "哈手2",
      "icon": "avatar_Mon_056_4"
    },
    {
      "name": "护林人3",
      "icon": ""
    },
    {
      "name": "护林人7",
      "icon": ""
    },
    {
      "name": "护林人6",
      "icon": ""
    },
    {
      "name": "护林人4",
      "icon": ""
    },
    {
      "name": "护林人5",
      "icon": ""
    },
    {
      "name": "辛普拉长子",
      "icon": "avatar_Mon_033"
    }
  ],
  "c4_12_a_f1A_3": [
    {
      "name": "艾伦瑟",
      "icon": ""
    }
  ],
  "c4_14_a_f1A_3": [
    {
      "name": "艾伦瑟",
      "icon": ""
    },
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "嘉莉缇",
      "icon": "at025_0"
    }
  ],
  "c4_15_a_f1A_1": [
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "护林人4",
      "icon": ""
    },
    {
      "name": "护林人2",
      "icon": ""
    },
    {
      "name": "护林人3",
      "icon": ""
    },
    {
      "name": "护林人1",
      "icon": ""
    },
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    }
  ],
  "c4_15_a_f1A_3": [
    {
      "name": "嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    }
  ],
  "c4_2_a_f1A_4": [
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "守林人5",
      "icon": ""
    },
    {
      "name": "守林人1",
      "icon": ""
    },
    {
      "name": "守林人2",
      "icon": ""
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "守林人3",
      "icon": ""
    },
    {
      "name": "守林人4",
      "icon": ""
    },
    {
      "name": "守林人6",
      "icon": ""
    },
    {
      "name": "守林人7",
      "icon": ""
    }
  ],
  "c4_2_a_f2A_1": [
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    }
  ],
  "c4_3_a_f1A_1": [
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "幽灵",
      "icon": ""
    }
  ],
  "c4_3_a_f1A_4": [
    {
      "name": "冷静下来的蕈人",
      "icon": "avatar_Mon_017"
    }
  ],
  "c4_4_a_f1A_1": [
    {
      "name": "冷静下来的蕈人",
      "icon": "avatar_Mon_016"
    }
  ],
  "c4_4_a_f1A_2": [
    {
      "name": "神色奇怪的蕈人",
      "icon": "avatar_Mon_016"
    },
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    }
  ],
  "c4_5_a_f1A_1": [
    {
      "name": "枯萎蕈人1",
      "icon": "avatar_Mon_020"
    },
    {
      "name": "枯萎蕈人2",
      "icon": "avatar_Mon_021"
    },
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    },
    {
      "name": "好蕈人",
      "icon": "avatar_Mon_016"
    }
  ],
  "c4_7_a_f1A_3": [
    {
      "name": "布斯波乌尔",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    }
  ],
  "c4_9_a_f1A_3": [
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "护林人",
      "icon": ""
    }
  ],
  "stage_c4_area1_1": [
    {
      "name": "宴会大师嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "护林人副将特比约恩",
      "icon": ""
    },
    {
      "name": "荒野大厨露比特",
      "icon": "at062_0"
    },
    {
      "name": "巨木侍女依萝娜",
      "icon": ""
    },
    {
      "name": "音乐家奥斯帕克",
      "icon": ""
    },
    {
      "name": "护林人古德里克",
      "icon": ""
    },
    {
      "name": "舞者格拉尼哆",
      "icon": "avatar_Mon_016"
    },
    {
      "name": "巨木侍女英格薇尔德",
      "icon": ""
    },
    {
      "name": "护林人莫多尔夫",
      "icon": ""
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    },
    {
      "name": "路人1",
      "icon": ""
    },
    {
      "name": "契约官艾尔莎",
      "icon": ""
    },
    {
      "name": "形迹可疑的神秘人",
      "icon": ""
    }
  ],
  "stage_c4_area1_2": [
    {
      "name": "树冠守望者芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "宴会大师嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "护林人1",
      "icon": ""
    }
  ],
  "stage_c4_area1_3": [
    {
      "name": "炼药师约伦德",
      "icon": ""
    },
    {
      "name": "占卜师哈尔卡特拉",
      "icon": ""
    },
    {
      "name": "布宴者梅尔科卡",
      "icon": ""
    }
  ],
  "stage_c4_area1_4": [
    {
      "name": "灵魂先知艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "厨师维罗莎",
      "icon": ""
    },
    {
      "name": "商人卡巴希尔",
      "icon": ""
    }
  ],
  "stage_c4_area1_5": [
    {
      "name": "因瓦尔布",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "典狱长菲奥努拉",
      "icon": ""
    }
  ],
  "stage_c4_area1_6": [
    {
      "name": "树冠守望者芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    }
  ],
  "stage_c4_area1_7": [
    {
      "name": "你的座位",
      "icon": ""
    },
    {
      "name": "宴会大师嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "契约官艾尔莎",
      "icon": ""
    },
    {
      "name": "厨师卡勒米哆",
      "icon": "avatar_Mon_017"
    },
    {
      "name": "宴堂的食客",
      "icon": ""
    },
    {
      "name": "宴堂的旅客",
      "icon": ""
    },
    {
      "name": "宴堂的顾客",
      "icon": ""
    }
  ],
  "stage_c4_area2_1": [
    {
      "name": "大师布拉格乌尔",
      "icon": "avatar_Mon_018"
    },
    {
      "name": "学者里恩尼菈",
      "icon": ""
    },
    {
      "name": "威格迪哆",
      "icon": "avatar_Mon_016"
    },
    {
      "name": "托格拉哆",
      "icon": "avatar_Mon_016"
    },
    {
      "name": "萨拉",
      "icon": "avatar_Mon_048"
    },
    {
      "name": "报信的蕈人",
      "icon": "avatar_Mon_016"
    }
  ],
  "stage_c4_area2_2": [
    {
      "name": "奥德吉哆",
      "icon": "avatar_Mon_017"
    },
    {
      "name": "赛尔瓦哆",
      "icon": "avatar_Mon_016"
    }
  ],
  "stage_c4_area2_3": [
    {
      "name": "索洛罗哆",
      "icon": "avatar_Mon_017"
    }
  ],
  "stage_c4_area2_4": [
    {
      "name": "烧焦的痕迹",
      "icon": ""
    },
    {
      "name": "萨拉",
      "icon": "avatar_Mon_048"
    }
  ],
  "stage_c4_area2_5": [
    {
      "name": "枯萎大师布斯波乌尔",
      "icon": ""
    }
  ],
  "stage_c4_area3_1": [
    {
      "name": "树冠守望者芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "护林人阿纳伊尔",
      "icon": ""
    },
    {
      "name": "猎人艾米阿尔",
      "icon": ""
    },
    {
      "name": "德鲁伊哈尔贝塔",
      "icon": ""
    },
    {
      "name": "猎人赫里奥夫",
      "icon": ""
    },
    {
      "name": "护林人哈尔贝娜",
      "icon": ""
    },
    {
      "name": "护林人3",
      "icon": ""
    },
    {
      "name": "护林人2",
      "icon": ""
    },
    {
      "name": "护林人1",
      "icon": ""
    }
  ],
  "stage_c4_area4_1": [
    {
      "name": "鹿灵艾伦瑟",
      "icon": ""
    },
    {
      "name": "巨木侍女伊尔萨",
      "icon": ""
    },
    {
      "name": "巨木侍女阿碧约格",
      "icon": ""
    },
    {
      "name": "树冠守望者芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "艾伦瑟",
      "icon": ""
    }
  ],
  "stage_c4_area4_2": [
    {
      "name": "幽灵雅拉德",
      "icon": ""
    }
  ],
  "stage_c4_area5_1": [
    {
      "name": "灵魂先知艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "树冠守望者芭杜尔",
      "icon": "at015_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "新鲜的踩踏痕迹",
      "icon": ""
    }
  ],
  "stage_c4_area5_3": [
    {
      "name": "奇怪的大锅",
      "icon": ""
    },
    {
      "name": "护林人A",
      "icon": ""
    },
    {
      "name": "护林人B",
      "icon": ""
    },
    {
      "name": "嘉莉缇",
      "icon": "at025_0"
    },
    {
      "name": "巨木侍女A",
      "icon": ""
    },
    {
      "name": "巨木侍女B",
      "icon": ""
    }
  ],
  "c5_13_a_f1A_4": [
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "米托拉",
      "icon": "at002_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "主人公",
      "icon": "at001_0"
    }
  ],
  "c5_2_a_f1A_4": [
    {
      "name": "奥格",
      "icon": "at066_0"
    },
    {
      "name": "接待员1",
      "icon": ""
    },
    {
      "name": "接待员2",
      "icon": ""
    },
    {
      "name": "接待员3",
      "icon": ""
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    }
  ],
  "stage_c5_area1_1": [
    {
      "name": "雪域探险家奥格",
      "icon": "at066_0"
    },
    {
      "name": "文艺系学生阿莱琳娜",
      "icon": ""
    },
    {
      "name": "货殖系学生缪夏",
      "icon": ""
    },
    {
      "name": "药化系学生赫尔薇",
      "icon": ""
    },
    {
      "name": "战术系学生琪拉",
      "icon": ""
    },
    {
      "name": "文艺系学生普普罗",
      "icon": ""
    },
    {
      "name": "博物系教授本诺",
      "icon": ""
    },
    {
      "name": "匠艺系学生斯坎达",
      "icon": ""
    },
    {
      "name": "阿莱琳娜的父亲",
      "icon": ""
    },
    {
      "name": "“浴缸”瑟尼",
      "icon": ""
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    },
    {
      "name": "平坦的石板路",
      "icon": ""
    },
    {
      "name": "米托拉",
      "icon": "at002_0"
    },
    {
      "name": "奥格",
      "icon": "at066_0"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "幽灵",
      "icon": ""
    },
    {
      "name": "掘冰芙洛波",
      "icon": "avatar_Mon_085"
    },
    {
      "name": "姆姆",
      "icon": ""
    },
    {
      "name": "雷素",
      "icon": ""
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "文艺系学生普雅雅",
      "icon": ""
    }
  ],
  "stage_c5_area1_2": [
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "农野系学生皮皮可",
      "icon": ""
    },
    {
      "name": "雪域探险家露莉亚",
      "icon": ""
    },
    {
      "name": "匠艺系学生梅拉娜",
      "icon": ""
    },
    {
      "name": "战术系学生普洛伦",
      "icon": ""
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    }
  ],
  "stage_c5_area1_3": [
    {
      "name": "忙碌的学者",
      "icon": ""
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "安娜",
      "icon": "at029_0"
    },
    {
      "name": "纪律委员长姆尔努",
      "icon": ""
    },
    {
      "name": "文艺系学生普雅雅",
      "icon": ""
    },
    {
      "name": "土木系教授苏蒂",
      "icon": ""
    },
    {
      "name": "农野系教授乌米",
      "icon": ""
    },
    {
      "name": "战术系教授纳波",
      "icon": ""
    },
    {
      "name": "迈妮娅",
      "icon": "at046_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    }
  ],
  "stage_c5_area1_4": [
    {
      "name": "历史系教授多多维",
      "icon": ""
    },
    {
      "name": "文艺系学生琦莉可",
      "icon": ""
    }
  ],
  "stage_c5_area1_5": [
    {
      "name": "院长乌尔勒",
      "icon": "at065_0"
    },
    {
      "name": "守密人图图基",
      "icon": ""
    }
  ],
  "stage_c5_area1_6": [
    {
      "name": "院长乌尔勒",
      "icon": "at065_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "奥格",
      "icon": "at066_0"
    }
  ],
  "stage_c5_area1_8": [
    {
      "name": "雷素",
      "icon": ""
    },
    {
      "name": "霜火队女",
      "icon": ""
    },
    {
      "name": "霜火队角布林",
      "icon": "avatar_Mon_007"
    },
    {
      "name": "霜火队男",
      "icon": ""
    }
  ],
  "stage_c5_area2_1": [
    {
      "name": "冰原猎人达霍格斯",
      "icon": ""
    },
    {
      "name": "战术系学生布希希",
      "icon": ""
    },
    {
      "name": "秘学系学生阿尔库",
      "icon": ""
    },
    {
      "name": "乌尔勒",
      "icon": "at065_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    }
  ],
  "stage_c5_area2_2": [
    {
      "name": "阿莱琳娜的父亲",
      "icon": ""
    },
    {
      "name": "佣兵3",
      "icon": "avatar_Mon_056_5"
    },
    {
      "name": "佣兵2",
      "icon": "avatar_Mon_056_3"
    },
    {
      "name": "佣兵1",
      "icon": "avatar_Mon_056_1"
    }
  ],
  "stage_c5_area2_3": [
    {
      "name": "原小麦种植点",
      "icon": ""
    }
  ],
  "stage_c5_area2_4": [
    {
      "name": "域外之人？",
      "icon": ""
    },
    {
      "name": "域外之人？",
      "icon": ""
    },
    {
      "name": "域外之人？",
      "icon": ""
    }
  ],
  "stage_c5_area3_1": [
    {
      "name": "雪域探险家奥格",
      "icon": "at066_0"
    },
    {
      "name": "货殖系学生库皮",
      "icon": ""
    },
    {
      "name": "侍者杜杜亚",
      "icon": ""
    },
    {
      "name": "文艺系教授迪莉",
      "icon": ""
    },
    {
      "name": "货殖系学生弗兰佐茨",
      "icon": ""
    },
    {
      "name": "“浴缸”瑟尼",
      "icon": ""
    },
    {
      "name": "阿娜洛洁",
      "icon": "at043_0"
    }
  ],
  "stage_c5_area3_4": [
    {
      "name": "原小麦种植点",
      "icon": ""
    }
  ],
  "stage_c5_area3_5": [
    {
      "name": "大脚雪怪的脚印？",
      "icon": ""
    }
  ],
  "stage_c5_area4_1": [
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "秘学系教授裴裴霍",
      "icon": ""
    },
    {
      "name": "博物系学生塔丽",
      "icon": ""
    },
    {
      "name": "野营的痕迹",
      "icon": ""
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    }
  ],
  "stage_c5_area4_3": [
    {
      "name": "烧焦的痕迹",
      "icon": ""
    },
    {
      "name": "露比",
      "icon": ""
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "怯懦的熔火元素",
      "icon": "avatar_Mon_087"
    },
    {
      "name": "强壮的熔火元素",
      "icon": "avatar_Mon_089"
    },
    {
      "name": "温柔的熔火元素",
      "icon": "avatar_Mon_088"
    },
    {
      "name": "饥饿的熔火元素",
      "icon": "avatar_Mon_087"
    },
    {
      "name": "警惕的熔火元素",
      "icon": "avatar_Mon_088"
    },
    {
      "name": "精神的熔火元素",
      "icon": "avatar_Mon_087"
    },
    {
      "name": "愤怒的熔火元素",
      "icon": "avatar_Mon_089"
    },
    {
      "name": "疲累的熔火元素",
      "icon": "avatar_Mon_088"
    },
    {
      "name": "友善的熔火元素",
      "icon": "avatar_Mon_087"
    },
    {
      "name": "害羞的熔火元素",
      "icon": "avatar_Mon_088"
    }
  ],
  "stage_c5_area5_1": [
    {
      "name": "研究员斯纳尔",
      "icon": ""
    },
    {
      "name": "院长乌尔勒",
      "icon": "at065_0"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "希拉尔德",
      "icon": "avatar_Mon_067"
    },
    {
      "name": "巴赫洛克斯",
      "icon": "avatar_Mon_068"
    }
  ],
  "stage_sp2_area1_1": [
    {
      "name": "德莉",
      "icon": "avatar_Mon_060"
    },
    {
      "name": "露库希安",
      "icon": ""
    },
    {
      "name": "菲娜",
      "icon": "avatar_Mon_059"
    },
    {
      "name": "记述者欧德莱姆",
      "icon": ""
    },
    {
      "name": "总管库库姆",
      "icon": ""
    },
    {
      "name": "侍卫萨宾姆",
      "icon": ""
    },
    {
      "name": "爱恶作剧的幽灵史莱姆",
      "icon": ""
    },
    {
      "name": "奶油布丁史莱姆",
      "icon": ""
    },
    {
      "name": "新兵史莱姆",
      "icon": ""
    },
    {
      "name": "新兵史莱姆",
      "icon": ""
    },
    {
      "name": "新兵史莱姆",
      "icon": ""
    }
  ],
  "stage_sp2_area1_2": [
    {
      "name": "王城护卫史莱姆",
      "icon": ""
    },
    {
      "name": "王城护卫史莱姆",
      "icon": ""
    },
    {
      "name": "闲逛的幽灵史莱姆",
      "icon": ""
    },
    {
      "name": "脏脏兮兮的黏液",
      "icon": ""
    }
  ],
  "stage_sp2_area1_3": [
    {
      "name": "村娘希维姆",
      "icon": ""
    },
    {
      "name": "园丁阿提莱姆",
      "icon": ""
    },
    {
      "name": "园丁伽拉姆",
      "icon": ""
    },
    {
      "name": "奶油布丁史莱姆",
      "icon": ""
    },
    {
      "name": "奶油布丁史莱姆",
      "icon": ""
    },
    {
      "name": "澄黄史莱姆",
      "icon": ""
    },
    {
      "name": "嫩绿史莱姆",
      "icon": ""
    },
    {
      "name": "天青史莱姆",
      "icon": ""
    }
  ],
  "stage_sp2_area1_4": [
    {
      "name": "农夫法尔姆",
      "icon": ""
    },
    {
      "name": "德鲁伊德莱姆",
      "icon": ""
    },
    {
      "name": "天青史莱姆",
      "icon": ""
    },
    {
      "name": "粉红史莱姆",
      "icon": ""
    },
    {
      "name": "史莱姆宝宝",
      "icon": ""
    },
    {
      "name": "弹弹滑滑的黏液",
      "icon": ""
    }
  ],
  "stage_sp2_area1_5": [
    {
      "name": "村娘希维姆",
      "icon": ""
    },
    {
      "name": "表演者乔可姆",
      "icon": ""
    },
    {
      "name": "护育员凯尔姆",
      "icon": ""
    },
    {
      "name": "史莱姆宝宝",
      "icon": ""
    },
    {
      "name": "史莱姆宝宝",
      "icon": ""
    },
    {
      "name": "史莱姆宝宝",
      "icon": ""
    },
    {
      "name": "星云史莱姆",
      "icon": ""
    },
    {
      "name": "布丁史莱姆",
      "icon": ""
    },
    {
      "name": "嫩绿史莱姆",
      "icon": ""
    },
    {
      "name": "澄黄史莱姆",
      "icon": ""
    },
    {
      "name": "暗影史莱姆",
      "icon": ""
    },
    {
      "name": "闪闪发亮的黏液",
      "icon": ""
    }
  ],
  "aseyj_shopB_1": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "aseyj_shopB_2": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "aseyj_shopW_1": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "aseyj_3_zhuxianEnd_f1A_1": [
    {
      "name": "瓦菲诺",
      "icon": "avatar_Mon_038"
    },
    {
      "name": "缇莎",
      "icon": ""
    }
  ],
  "c2csc_shopWhite_1": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "c2csc_shopBlack_2": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "c2csc_shopBlack_1": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "c2csc_shopWhite_2": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "c2_d3_f1A_1": [
    {
      "name": "岩蟾蜍蛮兵",
      "icon": "avatar_Mon_049"
    },
    {
      "name": "哈比狂怒者",
      "icon": "avatar_Mon_053"
    },
    {
      "name": "利齿恐兽",
      "icon": "avatar_Mon_046"
    }
  ],
  "anxtyj_shopBlack_1": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "anxtyj_shopBlack_2": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "anxtyj_shopWhite01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "anxtyj_shopWhite_2": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "c2_d4_f1A_5": [
    {
      "name": "安娜",
      "icon": "at029_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "卡夫",
      "icon": "at023_0"
    },
    {
      "name": "皮塔",
      "icon": "at014_0"
    },
    {
      "name": "黑袍人",
      "icon": "avatar_Mon_068"
    },
    {
      "name": "剋",
      "icon": "at037_0"
    }
  ],
  "c2_d4_f1A_4": [
    {
      "name": "皮塔",
      "icon": "at014_0"
    },
    {
      "name": "卡夫",
      "icon": "at023_0"
    },
    {
      "name": "恐怖蟾兽",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "c2_d4_d_f1A_4": [
    {
      "name": "皮塔",
      "icon": "at014_0"
    },
    {
      "name": "卡夫",
      "icon": "at023_0"
    },
    {
      "name": "恐怖蟾兽",
      "icon": "avatar_Mon_055"
    },
    {
      "name": "菲莉娜",
      "icon": "at049_0"
    },
    {
      "name": "米拉贝尔",
      "icon": "at050_0"
    }
  ],
  "xwtyj_shopBlack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "xwtyj_shopWhite_03": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "xwtyj_shopWhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "xwtyj_shopBlack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "xwtyj_shopWhite_02": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hjyc_shopWhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "c3_d2_1_f1A_1": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_066"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_067"
    },
    {
      "name": "NPC",
      "icon": ""
    },
    {
      "name": "NPC",
      "icon": ""
    }
  ],
  "hjyc_shopBlack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "c3_d2_2_f1A_4": [
    {
      "name": "NPC",
      "icon": "at036_0"
    },
    {
      "name": "NPC",
      "icon": "at041_0"
    },
    {
      "name": "NPC",
      "icon": "at051_0"
    }
  ],
  "hjyc_shopWhite_02": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hjyc_shopWhite_03": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hjyc_shopBlack_03": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "hjyc_shopBlack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "c3_d2_3_f1A_2": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_069"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_039"
    }
  ],
  "c3_d2_3_d_f1A_2": [
    {
      "name": "NPC",
      "icon": "avatar_Mon_069"
    },
    {
      "name": "NPC",
      "icon": "avatar_Mon_039"
    }
  ],
  "csjl_shopwhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "csjl_shopblack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "csjl_shopwhite_02": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "csjl_shopblack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "csjl_boss2": [
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    }
  ],
  "csjl_boss3": [
    {
      "name": "布斯波乌尔",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "蕈兽",
      "icon": "avatar_Mon_023"
    },
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    }
  ],
  "csjl_midBoss1": [
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    }
  ],
  "c4_d1_3_d_f1A_2": [
    {
      "name": "布斯波乌尔",
      "icon": "avatar_Mon_022"
    },
    {
      "name": "蕈兽",
      "icon": "avatar_Mon_023"
    },
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "布拉格乌尔",
      "icon": "avatar_Mon_018"
    }
  ],
  "hrnyj_shopwhite_02": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hrnyj_shopblack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "hrnyj_shopblack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "hrnyj_boss03": [
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "艾伦瑟",
      "icon": "avatar_Mon_080"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "艾伦瑟正常",
      "icon": ""
    }
  ],
  "hrnyj_shopwhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "c4_d2_3_d_f1A_11": [
    {
      "name": "罗姆洛敏",
      "icon": "avatar_Mon_063"
    },
    {
      "name": "艾伦瑟",
      "icon": "avatar_Mon_080"
    },
    {
      "name": "艾薇杜尔",
      "icon": "at053_0"
    },
    {
      "name": "艾伦瑟正常",
      "icon": ""
    }
  ],
  "yfkwqg_enter1": [
    {
      "name": "客人2",
      "icon": ""
    },
    {
      "name": "客人3",
      "icon": ""
    },
    {
      "name": "客人4",
      "icon": ""
    },
    {
      "name": "客人1",
      "icon": ""
    },
    {
      "name": "掘冰芙洛波1",
      "icon": "avatar_Mon_085"
    },
    {
      "name": "掘冰芙洛波2",
      "icon": "avatar_Mon_085"
    },
    {
      "name": "抛雪芙洛波",
      "icon": "avatar_Mon_086"
    },
    {
      "name": "奇瓦",
      "icon": "at019_0"
    }
  ],
  "yfkwqg_shopwhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "yfkwqg_shopblack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "yfkwqg_shopblack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "yfkwqg_boss3": [
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "雪原芙洛波大佬",
      "icon": "avatar_Mon_090"
    }
  ],
  "c5_d1_3_d_f1B_5": [
    {
      "name": "奇瓦",
      "icon": "at019_0"
    },
    {
      "name": "伽拉忒亚",
      "icon": "at064_0"
    },
    {
      "name": "雪原芙洛波大佬",
      "icon": "avatar_Mon_090"
    }
  ],
  "hmtkyj_shopwhite_01": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hmtkyj_boss1": [
    {
      "name": "乌尔勒",
      "icon": "at065_0"
    },
    {
      "name": "米托拉",
      "icon": "at002_0"
    }
  ],
  "hmtkyj_shopblack_01": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "hmtkyj_shopwhite_02": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "hmtkyj_shopblack_02": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "hmtkyj_boss2": [
    {
      "name": "米托拉",
      "icon": "at002_0"
    }
  ],
  "hmtkyj_boss3": [
    {
      "name": "巴赫洛克斯",
      "icon": "avatar_Mon_068"
    },
    {
      "name": "超天界格莉姆",
      "icon": "avatar_Mon_091"
    }
  ],
  "c5_d2_3_d_f1B_5": [
    {
      "name": "巴赫洛克斯",
      "icon": "avatar_Mon_068"
    },
    {
      "name": "超天界格莉姆",
      "icon": "avatar_Mon_091"
    }
  ],
  "hmtkyj_midBoss1": [
    {
      "name": "米托拉",
      "icon": "at002_0"
    }
  ],
  "yzdj_picsaw_bxf1": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "yzdj_picsaw_shopB_flip": [
    {
      "name": "神秘商人莓莓",
      "icon": ""
    }
  ],
  "yzdj_picsaw_shopW_flip": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "yzdj_picsaw_bxf1_copy1": [
    {
      "name": "神秘商人麦麦",
      "icon": ""
    }
  ],
  "yzdj_5_f1A_15": [
    {
      "name": "据点守卫",
      "icon": ""
    },
    {
      "name": "据点守卫",
      "icon": ""
    },
    {
      "name": "据点护卫",
      "icon": ""
    }
  ],
  "yzdj_main_02": [
    {
      "name": "神秘商人",
      "icon": ""
    }
  ]
}

/**
 * 获取指定房间变体的结构化 NPC 列表
 */
export function getRoomNpcs(variantOrId) {
  if (!variantOrId) return []
  const typeId = typeof variantOrId === 'object' ? (variantOrId.typeId || variantOrId.id) : String(variantOrId)
  if (!typeId) return []
  const list = ROOM_NPC_MAP[typeId]
  if (!list || !list.length) return []
  return list.map(npc => ({
    name: npc.name || 'NPC',
    icon: npc.icon || '',
    iconUrl: npc.icon ? getImageUrl(`/images/HeadIconAtals/${npc.icon}.webp`) : ''
  }))
}
