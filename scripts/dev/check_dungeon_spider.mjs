import { readJson } from '../parse/shared.mjs';

const inst = readJson('instance.json');
const instMap = inst.datas || inst;
console.log('instance yzdj_6_d:', JSON.stringify(instMap['yzdj_6_d'], null, 2));

const battle = readJson('battle.json');
const bMap = battle.datas || battle;
console.log('battle yzdj_6_d:', JSON.stringify(bMap['yzdj_6_d'], null, 2));
