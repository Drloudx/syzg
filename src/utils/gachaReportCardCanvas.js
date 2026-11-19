/**
 * 离线生成「深渊大书院 招募分析报告」高清分享卡片
 * 包含玩家概览、生涯评分、卡池指标、5星收藏图鉴与抽卡历史瀑布流长图
 * 纯 Canvas 2D 绘制，零 foreignObject 污染，全平台（Web + Android）绝对稳定。
 */

/** 预加载单张图片（支持带 crossOrigin） */
function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 绘制圆角矩形路径 */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/** 格式化日期 MM-DD */
function formatShortDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${m}-${date}`
}

/** 格式化卡池时间跨度 MM.DD ~ MM.DD */
function resolveBannerDateRange(banner) {
  if (!banner || !banner.firstAt || !banner.lastAt) return '近期开放'
  const d1 = new Date(banner.firstAt)
  const d2 = new Date(banner.lastAt)
  const f1 = `${String(d1.getMonth() + 1).padStart(2, '0')}.${String(d1.getDate()).padStart(2, '0')}`
  const f2 = `${String(d2.getMonth() + 1).padStart(2, '0')}.${String(d2.getDate()).padStart(2, '0')}`
  return `${f1} ~ ${f2}`
}

/** 抽卡进度条阶梯宽度计算（8% 基础宽度 + (p / 36) * 92%，确保 2 抽与 4 抽有明显可辨长短） */
function resolveBarWidthRatio(pullCount) {
  const p = Number(pullCount) || 1
  if (p <= 1) return 0.105
  if (p >= 36) return 1.0
  return (8 + (p / 36) * 92) / 100
}

/** 抽卡进度条配色方案 */
function resolveBarColors(pullCount) {
  if (pullCount <= 18) {
    return {
      gradient: ['#00d084', '#10b981'],
      textColor: '#08170e'
    }
  }
  if (pullCount <= 28) {
    return {
      gradient: ['#f59e0b', '#fbbf24'],
      textColor: '#1a1204'
    }
  }
  return {
    gradient: ['#ef4444', '#dc2626'],
    textColor: '#ffffff'
  }
}

/** 绘制带斜向斑马纹的抽卡进度条 */
function drawStripedBar(ctx, x, y, width, height, radius, gradientColors, text, textColor = '#ffffff') {
  ctx.save()
  roundRect(ctx, x, y, width, height, radius)
  ctx.clip()

  // 1. 渐变底色
  const grad = ctx.createLinearGradient(x, y, x + width, y)
  grad.addColorStop(0, gradientColors[0])
  grad.addColorStop(1, gradientColors[1])
  ctx.fillStyle = grad
  ctx.fillRect(x, y, width, height)

  // 2. 45° 斜向条纹覆盖（严格等价于 CSS repeating-linear-gradient(45deg, #fff 0, #fff 10px, transparent 10px, transparent 20px)）
  // CSS 45° 渐变条纹向右下方倾斜（\ 走向），横向跨度为 10*√2 ≈ 14.14px，步长为 20*√2 ≈ 28.28px
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  const stripeWidth = 10 * Math.SQRT2
  const step = 20 * Math.SQRT2
  for (let sx = x - height - step; sx < x + width + step; sx += step) {
    ctx.beginPath()
    ctx.moveTo(sx, y)
    ctx.lineTo(sx + stripeWidth, y)
    ctx.lineTo(sx + stripeWidth + height, y + height)
    ctx.lineTo(sx + height, y + height)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // 3. 抽数文字标签
  ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillStyle = textColor
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 8, y + height / 2)

  ctx.restore()
}

export async function renderGachaReportCard({
  playerData = {},
  avatarUrl = '',
  formattedCost = '0',
  costIconUrl = '',
  analysis = {},
  overviewTags = [],
  formattedExportDate = '',
  resolveAvatarSrc = () => '',
  banners = [],
  showFourStar = true
}) {
  const W = 720
  const pad = 20
  const innerW = W - pad * 2 // 680

  // 1. 精确测算各卡池卡片高度（与实际绘制 100% 对应，杜绝底部悬空大面积留白）
  const goldCollection = analysis?.overview?.goldCollection || []
  const avatarSize = 44
  const avatarGap = 8
  const itemsPerRow = Math.floor(innerW / (avatarSize + avatarGap))
  const collectionRows = Math.ceil(goldCollection.length / itemsPerRow)

  const effectiveBanners = banners && banners.length > 0 ? banners : (analysis?.banners || [])
  const bannerLayouts = effectiveBanners.map(banner => {
    let innerH = 14 // 卡片上内边距
    innerH += 22   // 标题行高
    innerH += 8    // 标题下方间隙

    if (banner.upHeroes && banner.upHeroes.length > 0) {
      innerH += 24 // 当期 UP 头像高
      innerH += 10 // 间隙
    }

    const hasPity = banner.pityCount > 0
    const golds = banner.golds || []

    if (hasPity || golds.length > 0) {
      if (hasPity) {
        innerH += 38 // 问号头像 38px
        innerH += 8  // 行间隙
      }
      for (const gold of golds) {
        const hasPurples = showFourStar && gold.purples && gold.purples.length > 0
        innerH += hasPurples ? 54 : 38
        innerH += 8 // 行间隙
      }
    } else {
      innerH += 32 // 暂无五星
      innerH += 8
    }

    innerH += 6 // 底部微调内边距
    return {
      cardH: innerH,
      hasPity,
      golds
    }
  })

  // 综合总高度严格对应每个环节的实际累加
  let calculatedH = 20 // 顶部安全边距
  calculatedH += 72   // 玩家身份行
  calculatedH += 12   // 间隙
  calculatedH += 42   // 关键统计横幅
  calculatedH += 12   // 间隙
  calculatedH += 32   // 当前版本胶囊行
  calculatedH += 10   // 间隙
  calculatedH += 106  // 三大卡池指标卡片
  calculatedH += 10   // 间隙

  if (overviewTags.length > 0) {
    calculatedH += 22 + 10 // 标签行高度与间距
  }

  if (goldCollection.length > 0) {
    calculatedH += 22 + collectionRows * (avatarSize + avatarGap) + 14 // 5星图鉴
  }

  if (effectiveBanners.length > 0) {
    calculatedH += 28 // 抽卡历史模块标题栏
    for (const bl of bannerLayouts) {
      calculatedH += bl.cardH + 12 // 单卡池高度 + 卡片间距
    }
  }

  calculatedH += 18 // 卡片到底部水印的紧凑呼吸间距（消除空档）
  calculatedH += 20 // 水印文字高度
  calculatedH += 20 // 底部边缘留白

  const totalH = Math.round(calculatedH)

  // 2. 收集并并发预加载所有图片
  const imageUrlSet = new Set()
  if (avatarUrl) imageUrlSet.add(avatarUrl)
  if (costIconUrl) imageUrlSet.add(costIconUrl)

  for (const item of goldCollection) {
    const src = resolveAvatarSrc(item)
    if (src) imageUrlSet.add(src)
  }

  for (const b of effectiveBanners) {
    if (b.upHeroes) {
      for (const hId of b.upHeroes) {
        const src = resolveAvatarSrc({ typeId: hId })
        if (src) imageUrlSet.add(src)
      }
    }
    if (b.golds) {
      for (const g of b.golds) {
        const src = resolveAvatarSrc(g)
        if (src) imageUrlSet.add(src)
        if (showFourStar && g.purples) {
          for (const p of g.purples) {
            const pSrc = resolveAvatarSrc(p)
            if (pSrc) imageUrlSet.add(pSrc)
          }
        }
      }
    }
  }

  const imageMap = new Map()
  await Promise.all(
    Array.from(imageUrlSet).map(async (url) => {
      const img = await loadImg(url)
      if (img) imageMap.set(url, img)
    })
  )

  const getImg = (src) => imageMap.get(src) || null

  // 3. 创建高分屏 2x Canvas
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(totalH * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  // 4. 背景底板（仿复古羊皮纸，双层木纹描边）
  ctx.fillStyle = '#efe3ca'
  roundRect(ctx, 0, 0, W, totalH, 16)
  ctx.fill()

  // 外边框
  ctx.strokeStyle = '#8f7351'
  ctx.lineWidth = 2.5
  roundRect(ctx, 1.25, 1.25, W - 2.5, totalH - 2.5, 15)
  ctx.stroke()

  // 内微细金线
  ctx.strokeStyle = 'rgba(143, 115, 81, 0.25)'
  ctx.lineWidth = 1
  roundRect(ctx, 6, 6, W - 12, totalH - 12, 11)
  ctx.stroke()

  let curY = 20

  // 5. 玩家身份首行 (头像 + 昵称 + UID + 右侧书院印章)
  const avSize = 56
  const avX = pad
  const avY = curY
  const userAvatarImg = getImg(avatarUrl)

  // 头像圆底
  ctx.save()
  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#d9c6a6'
  ctx.fill()
  if (userAvatarImg) {
    ctx.clip()
    ctx.drawImage(userAvatarImg, avX, avY, avSize, avSize)
  }
  ctx.restore()

  // 头像金属金框
  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.strokeStyle = '#8f7351'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // 昵称
  ctx.fillStyle = '#3e2a14'
  ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(playerData.nickname || '小小工匠', avX + avSize + 12, avY + 6)

  // UID 胶囊
  const uidText = `UID: ${playerData.uid || '未录入'}`
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const uidW = ctx.measureText(uidText).width + 16
  const uidY = avY + 34
  roundRect(ctx, avX + avSize + 12, uidY, uidW, 18, 9)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(143, 115, 81, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#6b5134'
  ctx.textBaseline = 'middle'
  ctx.fillText(uidText, avX + avSize + 20, uidY + 9)

  // 右侧印章徽标：「✦ 大书院数据分析」
  const brandText = '✦ 大书院数据分析'
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif'
  const brandW = ctx.measureText(brandText).width + 16
  roundRect(ctx, W - pad - brandW, avY + 12, brandW, 22, 6)
  ctx.fillStyle = 'rgba(143, 115, 81, 0.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(143, 115, 81, 0.45)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#6b5134'
  ctx.fillText(brandText, W - pad - brandW + 8, avY + 23)

  curY += 72

  // 6. 关键统计横幅 (总消耗 | 生涯评分)
  const statsH = 42
  roundRect(ctx, pad, curY, innerW, statsH, 8)
  ctx.fillStyle = 'rgba(143, 115, 81, 0.08)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(143, 115, 81, 0.25)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 中间分割线
  ctx.beginPath()
  ctx.moveTo(W / 2, curY + 8)
  ctx.lineTo(W / 2, curY + statsH - 8)
  ctx.strokeStyle = 'rgba(143, 115, 81, 0.25)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 左格：总消耗
  ctx.font = 'bold 12px sans-serif'
  ctx.fillStyle = '#6b5134'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('总消耗', pad + 40, curY + statsH / 2)

  let costX = pad + 90
  const costIconImg = getImg(costIconUrl)
  if (costIconImg) {
    ctx.drawImage(costIconImg, costX, curY + (statsH - 18) / 2, 18, 18)
    costX += 22
  }
  ctx.font = '900 17px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = '#92400e'
  ctx.fillText(formattedCost, costX, curY + statsH / 2)

  // 右格：生涯评分
  ctx.font = 'bold 12px sans-serif'
  ctx.fillStyle = '#6b5134'
  ctx.fillText('生涯评分', W / 2 + 40, curY + statsH / 2)

  const luckTitle = analysis?.overview?.luck?.title || '寻常旅人'
  const ratingClass = analysis?.overview?.luck?.ratingClass || 'normal'
  let luckColor = '#15803d'
  if (ratingClass === 'godly') luckColor = '#b45309'
  else if (ratingClass === 'lucky') luckColor = '#0369a1'
  else if (ratingClass === 'unlucky' || ratingClass === 'bottom') luckColor = '#b91c1c'

  ctx.font = '900 16px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = luckColor
  ctx.fillText(luckTitle, W / 2 + 105, curY + statsH / 2)

  curY += statsH + 12

  // 7. 版本胶囊与统计印章行（100% 像素级复刻界面 .luck-pill-badge 与 .stamp-watermark-box）
  const pillH = 32

  // 7.1 左侧当前版本胶囊
  ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const luckTitleStr = `《${luckTitle}》`
  const titleW = ctx.measureText(luckTitleStr).width
  const prefixW = 20
  const pillW = Math.round(14 + prefixW + 8 + titleW + 14)

  // 135° 线性渐变背景
  const pillGrad = ctx.createLinearGradient(pad, curY, pad + pillW, curY + pillH)
  let pillTextColor = '#ffffff'
  let pillBorderColor = 'rgba(255, 255, 255, 0.45)'

  if (ratingClass === 'godly') {
    pillGrad.addColorStop(0, '#c49438')
    pillGrad.addColorStop(1, '#d8af56')
    pillTextColor = '#2b1f15'
    pillBorderColor = 'rgba(255, 255, 255, 0.5)'
  } else if (ratingClass === 'lucky') {
    pillGrad.addColorStop(0, '#075985')
    pillGrad.addColorStop(1, '#0284c7')
    pillTextColor = '#ffffff'
    pillBorderColor = 'rgba(255, 255, 255, 0.45)'
  } else if (ratingClass === 'normal') {
    pillGrad.addColorStop(0, '#166534')
    pillGrad.addColorStop(1, '#15803d')
    pillTextColor = '#ffffff'
    pillBorderColor = 'rgba(255, 255, 255, 0.45)'
  } else {
    pillGrad.addColorStop(0, '#991b1b')
    pillGrad.addColorStop(1, '#b91c1c')
    pillTextColor = '#ffffff'
    pillBorderColor = 'rgba(255, 255, 255, 0.45)'
  }

  // 绘制胶囊外层立体投影与渐变底色
  ctx.save()
  let shadowColor = 'rgba(7, 89, 133, 0.35)'
  if (ratingClass === 'godly') shadowColor = 'rgba(196, 148, 56, 0.35)'
  else if (ratingClass === 'normal') shadowColor = 'rgba(22, 101, 52, 0.35)'
  else if (ratingClass === 'unlucky' || ratingClass === 'bottom') shadowColor = 'rgba(153, 27, 27, 0.35)'

  ctx.shadowColor = shadowColor
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  roundRect(ctx, pad, curY, pillW, pillH, 8)
  ctx.fillStyle = pillGrad
  ctx.fill()
  ctx.restore()

  // 细白高光半透描边
  ctx.strokeStyle = pillBorderColor
  ctx.lineWidth = 1.2
  roundRect(ctx, pad + 0.6, curY + 0.6, pillW - 1.2, pillH - 1.2, 7.5)
  ctx.stroke()

  // 竖排“当前\n版本”前缀
  ctx.font = '900 8.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = pillTextColor
  ctx.globalAlpha = 0.92
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const prefixCenterX = pad + 14 + prefixW / 2
  ctx.fillText('当前', prefixCenterX, curY + 10.5)
  ctx.fillText('版本', prefixCenterX, curY + 21.5)
  ctx.globalAlpha = 1.0

  // 称号大字《天选之子》
  ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = pillTextColor
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(luckTitleStr, pad + 14 + prefixW + 8, curY + pillH / 2)

  // 7.2 右侧水印印章（双行对齐：大书院统计自 + 日期）
  const stampSubText = '大书院统计自'
  const stampDateText = formattedExportDate || '2026年'
  ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif'
  const subW = ctx.measureText(stampSubText).width
  ctx.font = '800 11px -apple-system, BlinkMacSystemFont, sans-serif'
  const dateW = ctx.measureText(stampDateText).width
  const stampBoxW = Math.max(subW, dateW) + 20
  const stampBoxH = pillH
  const stampBoxX = W - pad - stampBoxW

  roundRect(ctx, stampBoxX, curY, stampBoxW, stampBoxH, 6)
  ctx.fillStyle = 'rgba(143, 115, 81, 0.06)'
  ctx.fill()
  ctx.strokeStyle = '#8f7351'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 2])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = '#8a6d4d'
  ctx.fillText(stampSubText, W - pad - 10, curY + 10.5)

  ctx.font = '800 11px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = '#3e2a14'
  ctx.fillText(stampDateText, W - pad - 10, curY + 22)

  curY += pillH + 10

  // 8. 三大卡池指标卡片 (伙伴 / 魔物 / 常规)
  const colW = Math.round((innerW - 16) / 3) // ~221
  const colH = 106
  const pools = [
    {
      title: '伙伴',
      pulls: analysis?.heroLimited?.pulls || 0,
      sub1Lbl: '出卡数/歪',
      sub1Parts: {
        left: `${analysis?.heroLimited?.upCount || 0}`,
        leftColor: '#15803d',
        slash: '/',
        right: `${analysis?.heroLimited?.offCount || 0}`,
        rightColor: '#b91c1c'
      },
      sub2Lbl: 'UP平均',
      sub2Val: analysis?.heroLimited?.avgUpPulls || '--',
      sub2Color: '#15803d'
    },
    {
      title: '魔物',
      pulls: analysis?.petLimited?.pulls || 0,
      sub1Lbl: '出卡数/歪',
      sub1Parts: {
        left: `${analysis?.petLimited?.upCount || 0}`,
        leftColor: '#15803d',
        slash: '/',
        right: `${analysis?.petLimited?.offCount || 0}`,
        rightColor: '#b91c1c'
      },
      sub2Lbl: 'UP平均',
      sub2Val: analysis?.petLimited?.avgUpPulls || '--',
      sub2Color: '#15803d'
    },
    {
      title: '常规',
      pulls: analysis?.standard?.pulls || 0,
      sub1Lbl: '伙伴/魔物',
      sub1Parts: {
        left: `${analysis?.standard?.heroGoldCount || 0}`,
        leftColor: '#15803d',
        slash: '/',
        right: `${analysis?.standard?.petGoldCount || 0}`,
        rightColor: '#b45309'
      },
      sub2Lbl: '5星平均',
      sub2Val: analysis?.standard?.avgGoldPulls || '--',
      sub2Color: '#15803d'
    }
  ]

  for (let i = 0; i < 3; i++) {
    const p = pools[i]
    const cX = pad + i * (colW + 8)
    const cY = curY

    roundRect(ctx, cX, cY, colW, colH, 10)
    ctx.fillStyle = 'rgba(246, 239, 227, 0.7)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(143, 115, 81, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#6b5134'
    ctx.font = 'bold 12.5px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(p.title, cX + colW / 2, cY + 8)

    // 抽数
    ctx.fillStyle = '#3e2a14'
    ctx.font = '900 23px -apple-system, BlinkMacSystemFont, sans-serif'
    const pullStr = `${p.pulls}`
    const pullNumW = ctx.measureText(pullStr).width
    ctx.fillText(pullStr, cX + colW / 2 - 8, cY + 27)

    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#6b5134'
    ctx.fillText('抽', cX + colW / 2 + pullNumW / 2 + 2, cY + 36)

    // 分隔线
    ctx.beginPath()
    ctx.moveTo(cX + 12, cY + 62)
    ctx.lineTo(cX + colW - 12, cY + 62)
    ctx.strokeStyle = 'rgba(143, 115, 81, 0.15)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 底部双指标
    const half = colW / 2
    ctx.font = '900 13px sans-serif'
    if (p.sub1Parts) {
      const { left, leftColor, slash = '/', right, rightColor } = p.sub1Parts
      const leftW = ctx.measureText(left).width
      const slashW = ctx.measureText(slash).width
      const rightW = ctx.measureText(right).width
      const totalW = leftW + slashW + rightW
      const startX = cX + half / 2 - totalW / 2

      ctx.textAlign = 'left'
      ctx.fillStyle = leftColor
      ctx.fillText(left, startX, cY + 70)

      ctx.fillStyle = '#8a6d4d'
      ctx.fillText(slash, startX + leftW, cY + 70)

      ctx.fillStyle = rightColor
      ctx.fillText(right, startX + leftW + slashW, cY + 70)
      ctx.textAlign = 'center'
    } else {
      ctx.fillStyle = p.sub1Color || '#3e2a14'
      ctx.fillText(p.sub1Val, cX + half / 2, cY + 70)
    }
    ctx.font = '600 10px sans-serif'
    ctx.fillStyle = '#8a6d4d'
    ctx.fillText(p.sub1Lbl, cX + half / 2, cY + 87)

    ctx.font = '900 13px sans-serif'
    ctx.fillStyle = p.sub2Color
    ctx.fillText(p.sub2Val, cX + half + half / 2, cY + 70)
    ctx.font = '600 10px sans-serif'
    ctx.fillStyle = '#8a6d4d'
    ctx.fillText(p.sub2Lbl, cX + half + half / 2, cY + 87)
  }

  curY += colH + 10

  // 9. 标签行（与页面轻量羊皮纸实体标签同步，无图标、配色轻盈契合UI）
  if (overviewTags.length > 0) {
    let tagX = pad
    const tagH = 22
    for (const t of overviewTags) {
      const isGold = t.type === 'tag-gold'
      const isEmerald = t.type === 'tag-emerald'
      const isAmber = t.type === 'tag-amber'
      const isDanger = t.type === 'tag-danger'

      const displayText = t.text

      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
      const tagW = Math.round(ctx.measureText(displayText).width + 16)

      let tagBgColor = '#fff8e7'
      let tagBorderColor = '#d49a3d'
      let tagTextColor = '#8c4a00'

      if (isGold) {
        tagBgColor = '#fff8e7'
        tagBorderColor = '#d49a3d'
        tagTextColor = '#8c4a00'
      } else if (isEmerald) {
        tagBgColor = '#f0f9f3'
        tagBorderColor = '#2ea366'
        tagTextColor = '#146c36'
      } else if (isAmber) {
        tagBgColor = '#fff5ec'
        tagBorderColor = '#e06d2d'
        tagTextColor = '#b43b02'
      } else if (isDanger) {
        tagBgColor = '#fef2f2'
        tagBorderColor = '#dc2626'
        tagTextColor = '#991b1b'
      } else {
        tagBgColor = '#f7f3eb'
        tagBorderColor = '#8f7351'
        tagTextColor = '#5a3e1b'
      }

      // 4px 圆角实体矩形标签
      roundRect(ctx, tagX, curY, tagW, tagH, 4)
      ctx.fillStyle = tagBgColor
      ctx.fill()

      // 细致边框
      ctx.strokeStyle = tagBorderColor
      ctx.lineWidth = 1
      roundRect(ctx, tagX + 0.5, curY + 0.5, tagW - 1, tagH - 1, 3.5)
      ctx.stroke()

      // 墨色文字
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillStyle = tagTextColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(displayText, tagX + tagW / 2, curY + tagH / 2)

      tagX += tagW + 8
    }
    curY += tagH + 10
  }

  // 10. 5星伙伴和魔物收藏
  if (goldCollection.length > 0) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#3e2a14'
    ctx.fillText('5星伙伴和魔物', pad, curY)

    const sumText = `共获得限定5星 ${analysis?.overview?.limitedGoldCount || 0}个，常驻5星 ${analysis?.overview?.standardGoldCount || 0}个：`
    ctx.font = '600 11px sans-serif'
    ctx.fillStyle = '#6b5134'
    ctx.fillText(sumText, pad + 105, curY + 1.5)

    curY += 22

    for (let idx = 0; idx < goldCollection.length; idx++) {
      const item = goldCollection[idx]
      const col = idx % itemsPerRow
      const row = Math.floor(idx / itemsPerRow)
      const itX = pad + col * (avatarSize + avatarGap)
      const itY = curY + row * (avatarSize + avatarGap)
      const itImg = getImg(resolveAvatarSrc(item))

      ctx.save()
      ctx.beginPath()
      ctx.arc(itX + avatarSize / 2, itY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#dfceb3'
      ctx.fill()
      if (itImg) {
        ctx.clip()
        ctx.drawImage(itImg, itX, itY, avatarSize, avatarSize)
      }
      ctx.restore()

      // 金色圆环边框
      ctx.beginPath()
      ctx.arc(itX + avatarSize / 2, itY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
      ctx.strokeStyle = '#c49438'
      ctx.lineWidth = 2
      ctx.stroke()

      // 数量角标 (大于1显示)
      if (item.count > 1) {
        const badgeR = 8
        const bX = itX + avatarSize - badgeR + 2
        const bY = itY + badgeR - 2
        ctx.beginPath()
        ctx.arc(bX, bY, badgeR, 0, Math.PI * 2)
        ctx.fillStyle = '#c49438'
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${item.count}`, bX, bY)
      }
    }

    curY += collectionRows * (avatarSize + avatarGap) + 14
  }

  // 11. 抽卡历史（瀑布流长图卡片列表）
  if (effectiveBanners.length > 0) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = '#3e2a14'
    ctx.fillText('抽卡历史', pad, curY)

    const totalPullCount = effectiveBanners.reduce((s, b) => s + (b.pulls || 0), 0)
    const totalGoldCount = effectiveBanners.reduce((s, b) => s + (b.golds?.length || 0), 0)
    const historySubText = `共 ${totalPullCount} 抽 · 出金 ${totalGoldCount} 次`
    ctx.font = '600 11.5px sans-serif'
    ctx.fillStyle = '#6b5134'
    ctx.fillText(historySubText, pad + 76, curY + 2)

    curY += 28

    for (let bIdx = 0; bIdx < effectiveBanners.length; bIdx++) {
      const banner = effectiveBanners[bIdx]
      const layout = bannerLayouts[bIdx] || { cardH: 90 }
      const bCardH = layout.cardH
      const cardX = pad
      const cardY = curY

      // 卡池外底板
      roundRect(ctx, cardX, cardY, innerW, bCardH, 10)
      ctx.fillStyle = 'rgba(246, 239, 227, 0.72)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(143, 115, 81, 0.35)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      let bInnerY = cardY + 14

      // A. 卡池头部标题条（彩色抽数药丸 + 卡池名 + 充裕间隔 + 日期范围）
      let pillBg = '#15803d'
      if (banner.poolKind === 'hero_limited') pillBg = '#6366f1'
      else if (banner.poolKind === 'pet_limited') pillBg = '#d97706'
      else if (banner.poolKind === 'pet_standard' || banner.poolKind === 'pet') pillBg = '#557574'
      else if (banner.poolKind === 'hero_standard') pillBg = '#15803d'

      const pillText = `${banner.pulls || 0} 抽`
      ctx.font = 'bold 11px sans-serif'
      const pillW = ctx.measureText(pillText).width + 14
      roundRect(ctx, cardX + 14, bInnerY, pillW, 20, 5)
      ctx.fillStyle = pillBg
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pillText, cardX + 14 + pillW / 2, bInnerY + 10)

      // 卡池名称：字体加大到 15.5px，并在此字体下精准测算宽度
      ctx.font = 'bold 15.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillStyle = '#3e2a14'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      let poolNameText = banner.poolName || '招募卡池'
      poolNameText = poolNameText.replace(/特别贩售/g, '魔物常规').replace(/魔物蛋池|魔物蛋/g, '魔物限定')
      const poolNameW = ctx.measureText(poolNameText).width
      const nameX = cardX + 14 + pillW + 12
      ctx.fillText(poolNameText, nameX, bInnerY + 10)

      // 日期范围：保持 16px 充裕呼吸间隔，不再挤压粘连
      const dateRangeStr = resolveBannerDateRange(banner)
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillStyle = '#8a6d4d'
      ctx.fillText(dateRangeStr, nameX + poolNameW + 16, bInnerY + 10)

      bInnerY += 22 + 8

      // B. 当期 UP 角色头像行
      if (banner.upHeroes && banner.upHeroes.length > 0) {
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = '#3e2a14'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('当期UP:', cardX + 14, bInnerY + 12)

        let upX = cardX + 14 + 50
        const upAvSize = 24
        for (const hId of banner.upHeroes) {
          const upImg = getImg(resolveAvatarSrc({ typeId: hId }))
          ctx.save()
          ctx.beginPath()
          ctx.arc(upX + upAvSize / 2, bInnerY + 12, upAvSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = '#dfceb3'
          ctx.fill()
          if (upImg) {
            ctx.clip()
            ctx.drawImage(upImg, upX, bInnerY, upAvSize, upAvSize)
          }
          ctx.restore()

          ctx.beginPath()
          ctx.arc(upX + upAvSize / 2, bInnerY + 12, upAvSize / 2, 0, Math.PI * 2)
          ctx.strokeStyle = '#c49438'
          ctx.lineWidth = 1.5
          ctx.stroke()

          upX += upAvSize + 8
        }
        bInnerY += 24 + 10
      }

      // C. 瀑布流出金条
      const hasGolds = banner.golds && banner.golds.length > 0
      const hasPity = banner.pityCount > 0

      if (hasGolds || hasPity) {
        const itemAvSize = 38
        const leftAvColW = 44
        const trackX = cardX + 14 + leftAvColW + 8
        const trackW = innerW - 28 - leftAvColW - 8 // 可用抽条宽度

        // 顶端垫抽项
        if (hasPity) {
          const pityAvX = cardX + 14
          const pityAvY = bInnerY

          // 问号头像
          ctx.save()
          ctx.beginPath()
          ctx.arc(pityAvX + itemAvSize / 2, pityAvY + itemAvSize / 2, itemAvSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = '#dfceb3'
          ctx.fill()
          ctx.strokeStyle = '#c49438'
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.font = 'bold 18px sans-serif'
          ctx.fillStyle = '#6b5134'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('?', pityAvX + itemAvSize / 2, pityAvY + itemAvSize / 2)
          ctx.restore()

          // 垫抽条
          const pityColors = resolveBarColors(banner.pityCount)
          const barRatio = resolveBarWidthRatio(banner.pityCount)
          const barW = Math.max(56, Math.min(trackW, Math.round(trackW * barRatio)))
          const barY = pityAvY + (itemAvSize - 24) / 2

          drawStripedBar(
            ctx,
            trackX,
            barY,
            barW,
            24,
            6,
            pityColors.gradient,
            `已垫 ${banner.pityCount} 抽`,
            pityColors.textColor
          )

          bInnerY += itemAvSize + 8
        }

        // 历史出金项
        for (const gold of (banner.golds || [])) {
          const goldAvX = cardX + 14
          const goldAvY = bInnerY
          const hasPurples = showFourStar && gold.purples && gold.purples.length > 0
          const rowH = hasPurples ? 54 : 38

          // 5星头像
          const goldImg = getImg(resolveAvatarSrc(gold))
          ctx.save()
          ctx.beginPath()
          ctx.arc(goldAvX + itemAvSize / 2, goldAvY + itemAvSize / 2, itemAvSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = '#dfceb3'
          ctx.fill()
          if (goldImg) {
            ctx.clip()
            ctx.drawImage(goldImg, goldAvX, goldAvY, itemAvSize, itemAvSize)
          }
          ctx.restore()

          // 金色金属圈
          ctx.beginPath()
          ctx.arc(goldAvX + itemAvSize / 2, goldAvY + itemAvSize / 2, itemAvSize / 2, 0, Math.PI * 2)
          ctx.strokeStyle = '#d8af56'
          ctx.lineWidth = 2
          ctx.stroke()

          // 角标状态：单角标设计；歪的 New 改为红色，不显示歪
          const isLimited = banner.poolKind === 'hero_limited' || banner.poolKind === 'pet_limited'
          let badgeText = ''
          let badgeBg = '#d97706' // 默认 New 为琥珀橙
          if (isLimited && !gold.isUp && gold.isNew) {
            badgeText = 'New'
            badgeBg = '#dc2626' // 歪的 New 变红
          } else if (isLimited && !gold.isUp) {
            badgeText = '歪'
            badgeBg = '#dc2626' // 纯歪
          } else if (gold.isNew) {
            badgeText = 'New'
            badgeBg = '#d97706'
          }

          if (badgeText) {
            ctx.font = 'bold 9px sans-serif'
            const bw = ctx.measureText(badgeText).width + 8
            const bh = 14
            roundRect(ctx, goldAvX - 3, goldAvY - 3, bw, bh, 3)
            ctx.fillStyle = badgeBg
            ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(badgeText, goldAvX - 3 + bw / 2, goldAvY - 3 + bh / 2)
          }

          // 出金日期（挂在头像下方）
          if (hasPurples) {
            const dateStr = formatShortDate(gold.at)
            ctx.font = 'bold 11px sans-serif'
            ctx.fillStyle = '#7c6246'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillText(dateStr, goldAvX + itemAvSize / 2, goldAvY + itemAvSize + 2)
          }

          // 出金彩色进度条
          const goldColors = resolveBarColors(gold.pullCount)
          const barRatio = resolveBarWidthRatio(gold.pullCount)
          const barW = Math.max(50, Math.min(trackW, Math.round(trackW * barRatio)))
          const barY = goldAvY + (hasPurples ? 2 : (itemAvSize - 24) / 2)

          drawStripedBar(
            ctx,
            trackX,
            barY,
            barW,
            24,
            6,
            goldColors.gradient,
            `${gold.pullCount} 抽`,
            goldColors.textColor
          )

          // 挂载的 4 星小头像
          if (hasPurples) {
            let purpX = trackX
            const purpY = barY + 24 + 4
            const purpSize = 20
            for (const p of gold.purples) {
              const pImg = getImg(resolveAvatarSrc(p))
              ctx.save()
              ctx.beginPath()
              ctx.arc(purpX + purpSize / 2, purpY + purpSize / 2, purpSize / 2, 0, Math.PI * 2)
              ctx.fillStyle = '#d9c6a6'
              ctx.fill()
              if (pImg) {
                ctx.clip()
                ctx.drawImage(pImg, purpX, purpY, purpSize, purpSize)
              }
              ctx.restore()

              // 紫色金属框
              ctx.beginPath()
              ctx.arc(purpX + purpSize / 2, purpY + purpSize / 2, purpSize / 2, 0, Math.PI * 2)
              ctx.strokeStyle = '#a855f7'
              ctx.lineWidth = 1.5
              ctx.stroke()

              purpX += purpSize + 6
            }
          }

          bInnerY += rowH + 8
        }
      } else {
        // 该卡池暂无五星
        roundRect(ctx, cardX + 14, bInnerY, innerW - 28, 30, 6)
        ctx.strokeStyle = 'rgba(143, 115, 81, 0.4)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#8a6d4d'
        ctx.font = '600 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('该卡池暂无五星', cardX + innerW / 2, bInnerY + 15)
      }

      curY += bCardH + 12
    }
  }

  // 12. 页脚书院水印（紧随上方内容 18px，字号增大至 13.5px 加粗，彻底消除空旷感）
  curY += 18
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillStyle = '#7c6246'
  ctx.fillText('✦ 深渊大书院 · syzgwiki.top ✦', W / 2, curY + 10)

  return canvas
}
