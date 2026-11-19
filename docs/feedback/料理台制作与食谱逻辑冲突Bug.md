# Bug 反馈：料理台制作与食谱逻辑冲突（「武僧火锅」「果香肉酱通心粉」在料理台 100% 无法制作，仅能通过食谱点击制作）

> **最新核对版本**：**1.7.15**（最新公测热更包 `codeVersion: 53A8B2B890B44C33604DAA6029316138`）  
> **核对日期**：2026-11-18  
> **类型**：客户端代码与配置协同 Bug  
> **状态**：**1.7.15 最新热更版本依然存在，尚未修复**  

---

## 一、现象

玩家完成相应任务并解锁料理配方后：

1. **通过「食谱图鉴」点击制作**：可以正常投入材料并成功烹饪出「武僧火锅」和「果香肉酱通心粉」；
2. **在「料理台」直接投入材料制作**：即使投入完全正确的食材（或任意 4 格食材组合），**料理台永远无法烹饪出这两道料理**，必然被截断降级为「山野风干肉」或「香炸酥肉」！

全游戏中通过任务/物品解锁的特定食谱共有 5 个（`hiddenMenu: false`），其余 3 个（如猪骨浓汤、香炸酥肉）均可在料理台自由放入材料制作，**唯独这 2 个只能通过食谱制作，无法在料理台自由烹饪**。

| 料理名称 | 道具 ID | 任务配方要求 | 料理台自由制作实机结果 | 食谱界面点击制作实机结果 |
|---|---|---|---|---|
| **武僧火锅** | `item_30040` | 风干肉×1 + 菌菇类×1 + 肉类×1 | **100% 变成「山野风干肉」** | 正常制作成功 |
| **果香肉酱通心粉** | `item_30042` | 面粉×1 + 风干肉×1 + 浆果类×1 | **100% 变成「香炸酥肉」** | 正常制作成功 |

---

## 二、复现步骤

### 用例 1：武僧火锅复现
1. 账号已完成任务「禅武同一，虎啸除心魔」获得「武僧火锅食谱」；
2. 走向料理台，手动放入食材：**风干肉×1、地菇×1、兽肉×1**；
3. 界面预览与制作结果**必定显示为「山野风干肉」**，无法做出「武僧火锅」；
4. 无论第 4 格填入任何其他食材，均无法做出「武僧火锅」；
5. 返回背包或营地，打开食谱界面，选中「武僧火锅」点击制作，却能成功制作。

### 用例 2：果香肉酱通心粉复现
1. 账号已完成任务「香甜美食在哪里」获得「果香肉酱通心粉食谱」；
2. 走向料理台，手动放入食材：**面粉×1、风干肉×1、浆果×1**；
3. 界面预览与制作结果**必定显示为「香炸酥肉」**，无法做出「果香肉酱通心粉」；
4. 返回食谱界面，选中「果香肉酱通心粉」点击制作，却能成功制作。

---

## 三、代码与配置根因定位

本 Bug 是由于客户端 `CookData.cs` 中的**严格等级递增判定**与 `menu.json` 中的**料理顺序及等级配置**共同导致的。

### 1. 料理台制作的匹配算法存在缺陷

在 `Assembly-CSharp\CookData.cs` 第 105~120 行：

```csharp
public static MenuItemConf CheckItemToMenuData(List<CookItem> cookItems, out int num, out List<FoodItem> foodItems)
{
    num = 0;
    MenuItemConf menuItemConf = null;
    foodItems = null;
    foreach (KeyValuePair<string, MenuItemConf> item in GameDataManager.clientConfig.menuConf)
    {
        // ⚠ 致命判定条件：menuItemConf.level < item.Value.level
        if (CheckFoodByMenu(item.Value, cookItems, out var num2, out var foodItems2) 
            && CheckIsUnLock(item.Value) 
            && (menuItemConf == null || menuItemConf.level < item.Value.level))
        {
            menuItemConf = item.Value;
            num = num2;
            foodItems = foodItems2;
        }
    }
    return menuItemConf;
}
```

- 该方法是**料理台自由放入食材**时调用的匹配方法；
- 逻辑为：顺序遍历 `menuConf` 字典中的所有菜谱，当发现食材满足某道菜时，只有**新菜谱的 `level` 严格大于（`<`）当前候选菜谱的 `level`**，才会替换为新菜谱！

---

### 2. 「武僧火锅」被「山野风干肉」拦截的原因

查阅 `menu.json` 中的菜谱定义：

```json
"item_30037": {
    "typeId": "item_30037",
    "name": "1风干肉+1菌菇类",
    "level": 2,                         ← 等级为 2
    "itemTypeId": "item_30037",         // 山野风干肉
    "food": [{ "typeId": "item_10089", "num": 1 }], // 风干肉
    "foodType": [{ "type": "4", "num": 1 }]         // 菌菇类
},
...
"item_30040": {
    "typeId": "item_30040",
    "name": "1风干+1肉+1菌菇类",
    "level": 2,                         ← 同样为 2！
    "itemTypeId": "item_30040",         // 武僧火锅
    "food": [{ "typeId": "item_10089", "num": 1 }], // 风干肉
    "foodType": [
        { "type": "4", "num": 1 },      // 菌菇类
        { "type": "1", "num": 1 }       // 肉类
    ]
}
```

1. 玩家放入材料「风干肉 + 菌菇 + 兽肉」；
2. 循环首先遇到排在前面的 `item_30037`（山野风干肉）：
   - 材料中有风干肉和菌菇，`CheckFoodByMenu` 返回 `true`；
   - `menuItemConf` 被赋值为 `item_30037`，此时 `menuItemConf.level = 2`；
3. 循环继续向后，遇到 `item_30040`（武僧火锅）：
   - 虽然材料完全满足武僧火锅；
   - 但是判定条件为 `menuItemConf.level < item.Value.level`，即 **`2 < 2` 为 false**！
4. **武僧火锅被直接跳过，最终结果永远只能是山野风干肉！**

---

### 3. 「果香肉酱通心粉」被「香炸酥肉」拦截的原因

查阅 `item.json` 中风干肉的定义：
```json
"item_10089": {
    "typeId": "item_10089",
    "name": "风干肉",
    "foodType": "1"                     ← 风干肉的分类也是肉类 (1)！
}
```

查阅 `menu.json` 中两者的定义：
```json
"item_30041": {
    "typeId": "item_30041",
    "name": "1面粉+1肉",
    "level": 2,                         ← 等级为 2
    "itemTypeId": "item_30041",         // 香炸酥肉
    "food": [{ "typeId": "item_10024", "num": 1 }], // 面粉
    "foodType": [{ "type": "1", "num": 1 }]         // 肉类
},
"item_30042": {
    "typeId": "item_30042",
    "name": "1风干+1浆果+1面粉",
    "level": 2,                         ← 同样为 2！
    "itemTypeId": "item_30042",         // 果香肉酱通心粉
    "food": [
        { "typeId": "item_10024", "num": 1 }, // 面粉
        { "typeId": "item_10089", "num": 1 }  // 风干肉
    ],
    "foodType": [{ "type": "3", "num": 1 }]   // 浆果类
}
```

1. 玩家放入材料「面粉 + 风干肉 + 浆果」；
2. 循环首先遇到排在前面的 `item_30041`（香炸酥肉）：
   - 材料中有面粉，且风干肉的 `foodType == "1"`（肉类），满足香炸酥肉的配方；
   - `menuItemConf` 被赋值为 `item_30041`，此时 `menuItemConf.level = 2`；
3. 循环继续向后，遇到 `item_30042`（果香肉酱通心粉）：
   - 同样因为 `menuItemConf.level < item.Value.level`（`2 < 2` 为 false）；
4. **果香肉酱通心粉被直接跳过，最终结果永远只能是香炸酥肉！**

---

### 4. 为什么通过「食谱」点击制作却可以成功？

在 `CookMakeUI.cs` 第 464~471 行：
```csharp
if (selectMenuTypeId != null)
{
    // 点击食谱制作时，传入了选中的食谱 ID
    menuConf = CookData.CheckItemToMenuData(list, selectMenuTypeId, out canMakeMax, out list2);
}
else
{
    // 料理台放入食材自由制作时，selectMenuTypeId 为 null
    menuConf = CookData.CheckItemToMenuData(list, out canMakeMax, out list2);
}
```

在 `CookData.cs` 第 90~103 行的重载方法中：
```csharp
public static MenuItemConf CheckItemToMenuData(List<CookItem> cookItems, string menuTypeId, out int num, out List<FoodItem> foodItems)
{
    ...
    // 直接取出目标食谱，不进行全表遍历，也不与其他菜谱比对 level！
    MenuItemConf menuItemConf2 = GameDataManager.clientConfig.menuConf[menuTypeId];
    if (CheckFoodByMenu(menuItemConf2, cookItems, out var num2, out var foodItems2) && CheckIsUnLock(menuItemConf2))
    {
        menuItemConf = menuItemConf2;
    }
    return menuItemConf;
}
```
因此，**当从食谱直接打开时，系统直奔目标食谱判定，绕过了全表遍历竞争与等级判定，因而能够成功制作**。这充分证明了配方设计本身是希望这两种料理能够被制作的，只是料理台的自由匹配逻辑被提前拦截了。

---

## 四、 供参考的排查与处理方向

可参考以下解决思路：

在 `CookData.cs` 的 `CheckItemToMenuData` 中：
当满足多个菜谱且 `level` 相同时，优先选择**消耗原料数量更多**（`food.Count + foodType.Count` 更高）或**已解锁的非隐藏菜谱**（`!item.Value.hiddenMenu`），避免子集料理拦截超集料理。
