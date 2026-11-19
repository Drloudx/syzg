# 《深渊之歌》抽卡记录导出工具 (Android 免 Root 版)

基于 Android 官方 `VpnService` 的纯本地环回代理 + 协议直连采样 APK：
- **免 Root、免电脑、免无障碍权限**，仅通过 `VpnService.Builder.addAllowedApplication` 代理《深渊之歌》单个 App；
- 进游戏触发一次请求秒抓会话令牌与逻辑服地址后，直连 `441/442`（`pageSize=100`）约 0.4 秒全量同步伙伴与魔物记录；
- UI 对标大书院当前抽卡分析页面（深色原木顶栏 + 羊皮纸档案卡 + 伙伴/魔物/常规三栏指标卡）。

## 构建 APK

```cmd
cd tools\gacha-exporter-android
gradlew.bat test assembleDebug
```

产物输出：`tools\gacha-exporter-android\app\build\outputs\apk\debug\app-debug.apk`
