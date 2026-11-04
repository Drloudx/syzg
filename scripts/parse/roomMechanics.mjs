import { readJson } from './shared.mjs';

/**
 * 房间战斗特殊机制构建器（增援 / 破盾 / 坚守解谜）
 */

const MONSTER_ICON_MAP = {
  '070_1': 'avatar_Mon_070_1',
  '070_1a': 'avatar_Mon_070_1a',
  '070_2': 'avatar_Mon_070_2',
  '070_2a': 'avatar_Mon_070_2a'
};

const rawMonData = readJson('mon.json');
const DEFAULT_MON_MAP = rawMonData?.datas || rawMonData || {};

const rawBuffData = readJson('buff.json');
const DEFAULT_BUFF_MAP = rawBuffData?.datas || rawBuffData || {};

export function buildRoomMechanics(roomTypeId, roomRaw, options = {}) {
  const monMap = options.monMap && Object.keys(options.monMap).length > 0 ? options.monMap : DEFAULT_MON_MAP;
  const buffMap = options.buffMap && Object.keys(options.buffMap).length > 0 ? options.buffMap : DEFAULT_BUFF_MAP;

  const battleData = roomRaw?.battleData || {};
  const triggers = battleData.triggers || [];
  const monRounds = battleData.monRounds || [];

  const roundMap = new Map();
  for (const r of monRounds) {
    if (r && r.roundId) roundMap.set(r.roundId, r.mons || []);
  }

  const mechanics = [];

  // 1. 扫描破盾 / 减伤机制（changeMonBuff 带有减伤 Buff）
  for (const t of triggers) {
    const actions = t.actions || [];
    for (const a of actions) {
      if (a.actionType === 'changeMonBuff' && a.actionPara?.remove === true) {
        const buffId = a.actionPara?.buffID;
        const buff = buffMap[buffId];
        if (buff) {
          const damAdd = buff.para?.damAddValue;
          const reducePct = damAdd ? Math.round(Math.abs(Number(damAdd)) * 100) : null;
          const tip = t.triggerPara?.tip || '与场地交互物互动破除防御';
          
          let title = '破盾机制';
          // 策划在 buff.json 中给 zhuxian2_9 填写的内部名字是「神圣之力」，但实机视觉和关卡提示都是「神秘红晶」
          const isCrystal = tip.includes('红晶') || buffId === 'zhuxian2_9' || buff.buffName === '神圣之力';
          const shieldName = isCrystal ? '神秘红晶护盾' : (buff.buffName || '减伤护盾');

          let summary = isCrystal
            ? `战斗开始时，Boss 受神秘红晶庇护${reducePct ? `，受到伤害降低 ${reducePct}%` : '，处于无敌状态'}。`
            : `战斗开始时，Boss 获得「${shieldName}」增益${reducePct ? `，受到伤害降低 ${reducePct}%` : '，处于无敌状态'}。`;

          mechanics.push({
            type: 'damageReduce',
            title,
            summary,
            target: tip,
            effect: isCrystal
              ? `破除神秘红晶护盾${reducePct ? `，解除 ${reducePct}% 伤害减免` : '，解除无敌状态'}`
              : `永久移除「${shieldName}」效果${reducePct ? `，解除 ${reducePct}% 伤害减免` : '，解除无敌状态'}`
          });
        }
      }
    }
  }

  // 2. 扫描无限增援 / 循环刷怪机制（gotoAndPlay + createAnRoundMon）
  for (const t of triggers) {
    const actions = t.actions || [];
    const hasLoop = actions.some(a => a.actionType === 'gotoAndPlay');
    const createMonActions = actions.filter(a => a.actionType === 'createAnRoundMon');

    if (hasLoop && createMonActions.length > 0) {
      let interval = 0;
      for (const a of actions) {
        if (a.actionType === 'wait' && a.actionPara?.time) {
          interval += Number(a.actionPara.time);
        }
      }

      const unitMap = new Map();
      for (const cma of createMonActions) {
        const rid = cma.actionPara?.roundId;
        const mons = roundMap.get(rid) || [];
        for (const m of mons) {
          const tid = String(m.typeId || '');
          if (!tid) continue;
          const existing = unitMap.get(tid) || { typeId: tid, count: 0 };
          existing.count += 1;
          unitMap.set(tid, existing);
        }
      }

      const units = Array.from(unitMap.values()).map(u => {
        const monInfo = monMap[u.typeId] || {};
        let displayName = monInfo.name || monInfo.monDes || u.typeId;
        if (u.typeId === '070_2a' || u.typeId === '070_2') displayName = '治安队防暴盾兵';
        else if (u.typeId === '070_1' || u.typeId === '070_1a') displayName = '治安队员';

        let iconName = monInfo.icon || MONSTER_ICON_MAP[u.typeId] || `avatar_Mon_${u.typeId}`;
        return {
          typeId: u.typeId,
          name: displayName,
          count: u.count,
          iconUrl: `/images/HeadIconAtals/${iconName}.webp`
        };
      });

      const isHoldPuzzle = triggers.some(tr => tr.comment?.includes('胜利') && tr.triggerPara?.tip?.includes('石柱'));
      const isCarriage = roomTypeId.includes('carriage');
      const isEditi = roomTypeId.includes('c3_11');

      let title = '持续增援';
      let summary = '';
      let rule = `${interval > 0 ? `每 ${interval} 秒刷新 1 波增援` : '周期性刷新增援'} · 持续循环触发`;
      let clearCondition = '';

      if (isEditi) {
        title = '治安队持续增援';
        summary = '埃迪蒂交战期间，市政厅警报每 5 秒持续增援治安部队，击败埃迪蒂后停止增援。';
        rule = '每 5 秒刷新 1 波增援 · 埃迪蒂在场期间循环触发';
      } else if (isHoldPuzzle) {
        title = '坚守解谜';
        summary = '解谜期间处于坚守模式，敌人将周期性持续袭击。';
        rule = `${interval > 0 ? `每 ${interval} 秒刷新 1 波敌人` : '周期性刷新敌人'} · 寻找石柱期间循环触发`;
        clearCondition = '寻找并激活正确的石柱解开谜题，解开后停止增援并结算胜利';
      } else if (isCarriage) {
        title = '护送遇袭';
        summary = '商队马车行进期间，沿途强盗将无限波次刷新袭击马车。';
        rule = `${interval > 0 ? `每 ${interval} 秒刷新 1 波伏击` : '周期性刷新伏击'} · 护送期间循环触发`;
      } else {
        title = '战场增援';
        summary = '本区域处于防守/增援警备状态，敌人将周期性进行兵力支援。';
        rule = `${interval > 0 ? `每 ${interval} 秒刷新 1 波增援` : '周期性刷新增援'} · 战斗期间循环触发`;
      }

      mechanics.push({
        type: 'reinforcement',
        title,
        summary,
        rule,
        units,
        clearCondition
      });
    }
  }

  return mechanics;
}
