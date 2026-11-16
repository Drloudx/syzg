import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const content = fs.readFileSync('E:/Desktop/html/md/食谱.md', 'utf8');
const item = JSON.parse(fs.readFileSync('./raw/item.json', 'utf8'));

const nameToId = {};
Object.entries(item.datas).forEach(([k, v]) => {
  if (k.startsWith('item_300')) nameToId[v.name] = k;
});

const targetDir = 'public/images/recipes';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const regex = /(\d+、([\u4e00-\u9fa5]+))[\s\S]*?!\[.*?\]\((.*?)\)/g;
let match;
const tasks = [];
while ((match = regex.exec(content)) !== null) {
  const name = match[2];
  const imgPath = match[3];
  const id = nameToId[name];
  if (!id) {
    console.error('Unknown dish:', name);
    continue;
  }
  tasks.push({ name, id, imgPath });
}

console.log('Found', tasks.length, 'images to convert.');

for (const t of tasks) {
  const outRecipeWebp = path.join(targetDir, `${t.id}.webp`);

  const buf = await sharp(t.imgPath).webp({ quality: 85 }).toBuffer();
  fs.writeFileSync(outRecipeWebp, buf);
  console.log(`Converted: ${t.name} (${t.id}) -> ${buf.length} bytes`);
}
console.log('All 28 images converted successfully!');
