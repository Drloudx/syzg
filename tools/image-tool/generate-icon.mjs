import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 512x512 精美小清新矢量 SVG
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 背景主卡片渐变：清爽薄荷翡翠绿 -->
    <linearGradient id="bgGrad" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="50%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <!-- 顶部高光弧光 -->
    <linearGradient id="topGlow" x1="256" y1="48" x2="256" y2="220" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>

    <!-- 相片内景天空渐变 -->
    <linearGradient id="skyGrad" x1="256" y1="120" x2="256" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#E0F2FE" />
      <stop offset="60%" stop-color="#ECFDF5" />
      <stop offset="100%" stop-color="#D1FAE5" />
    </linearGradient>

    <!-- 太阳微光渐变 -->
    <radialGradient id="sunGrad" cx="330" cy="190" r="45" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FDE047" />
      <stop offset="80%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </radialGradient>

    <!-- 前景远山渐变 -->
    <linearGradient id="mountainBack" x1="200" y1="210" x2="280" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EE7B7" />
      <stop offset="100%" stop-color="#34D399" />
    </linearGradient>

    <!-- 前景近山渐变 -->
    <linearGradient id="mountainFront" x1="260" y1="230" x2="360" y2="350" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>

    <!-- 羽毛/叶片渐变 -->
    <linearGradient id="leafGrad" x1="330" y1="310" x2="430" y2="420" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="60%" stop-color="#F0FDF4" />
      <stop offset="100%" stop-color="#A7F3D0" />
    </linearGradient>

    <!-- 投影 -->
    <filter id="shadow" x="30" y="30" width="452" height="462" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#064E3B" flood-opacity="0.25" />
    </filter>
    
    <filter id="cardShadow" x="90" y="100" width="332" height="280" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#047857" flood-opacity="0.2" />
    </filter>

    <filter id="leafShadow" x="310" y="290" width="130" height="140" filterUnits="userSpaceOnUse">
      <feDropShadow dx="2" dy="6" stdDeviation="6" flood-color="#064E3B" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- 主外壳圆角矩形 -->
  <rect x="56" y="56" width="400" height="400" rx="92" fill="url(#bgGrad)" filter="url(#shadow)" />
  
  <!-- 顶部玻璃反光质感 -->
  <rect x="56" y="56" width="400" height="200" rx="92" fill="url(#topGlow)" />
  
  <!-- 细腻内描边 -->
  <rect x="57" y="57" width="398" height="398" rx="91" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="3" fill="none" />

  <!-- 白色相框卡片 -->
  <g filter="url(#cardShadow)">
    <rect x="116" y="116" width="280" height="230" rx="28" fill="#FFFFFF" />
    <!-- 照片视窗裁剪区域 -->
    <g clip-path="url(#picClip)">
      <clipPath id="picClip">
        <rect x="126" y="126" width="260" height="210" rx="20" />
      </clipPath>
      
      <!-- 天空底色 -->
      <rect x="126" y="126" width="260" height="210" fill="url(#skyGrad)" />
      
      <!-- 柔和暖阳 -->
      <circle cx="324" cy="186" r="32" fill="url(#sunGrad)" opacity="0.9" />

      <!-- 远山 -->
      <path d="M140 336 L210 240 Q225 220 240 240 L310 336 Z" fill="url(#mountainBack)" opacity="0.85" />

      <!-- 近山 -->
      <path d="M220 336 L290 220 Q305 200 320 220 L400 336 Z" fill="url(#mountainFront)" />

      <!-- 画面底部淡淡的露水倒影/微光 -->
      <rect x="126" y="316" width="260" height="20" fill="#047857" opacity="0.1" />
    </g>
    <!-- 相框细腻内阴影/边框 -->
    <rect x="126" y="126" width="260" height="210" rx="20" stroke="#E2E8F0" stroke-width="1.5" fill="none" />
  </g>

  <!-- 右下角飘逸的小羽毛/清新绿叶（象征极轻、轻量瘦身、WebP压缩） -->
  <g filter="url(#leafShadow)">
    <!-- 叶片/羽毛形状 -->
    <path d="M336 390 C340 330 380 304 424 300 C420 348 396 390 346 404 Z" fill="url(#leafGrad)" />
    <!-- 叶脉/羽轴 -->
    <path d="M338 398 Q375 365 422 302" stroke="#10B981" stroke-width="3" stroke-linecap="round" opacity="0.7" />
    <circle cx="370" cy="340" r="3.5" fill="#34D399" opacity="0.8" />
  </g>
</svg>
`;

async function main() {
  const svgBuffer = Buffer.from(svg.trim());
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of iconSizes) {
    const png = await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: png });
  }

  // 1. 生成 128x128 的高清插图，供界面 UI 中使用
  const bannerPng = await sharp(svgBuffer)
    .resize(96, 96, { fit: 'contain' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(__dirname, 'icon-illustration.png'), bannerPng);
  console.log('Saved icon-illustration.png');

  // 2. 组装为标准的 Windows .ico 文件
  // ICO 头部：
  // 0-1: 0 (reserved)
  // 2-3: 1 (ICO type)
  // 4-5: count
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dirEntries = [];
  const imageBodies = [];

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset

    dirEntries.push(entry);
    imageBodies.push(buffer);
    offset += buffer.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...imageBodies]);
  fs.writeFileSync(path.join(__dirname, 'app.ico'), icoBuffer);
  console.log(`Saved app.ico (${icoBuffer.length} bytes) with sizes: ${iconSizes.join(', ')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
