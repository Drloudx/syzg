package com.syzg.gachaexporter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 免 Root 本地 VpnService 采样服务：
 * 仅对《深渊之歌》游戏包名启用隧道，捕获会话令牌与逻辑服地址后，直连 441/442 拉取全量抽卡记录。
 */
public class VpnCaptureService extends VpnService {

    public static final String ACTION_START = "com.syzg.gachaexporter.START";
    public static final String ACTION_STOP = "com.syzg.gachaexporter.STOP";
    public static final String ACTION_PULL_NOW = "com.syzg.gachaexporter.PULL_NOW";
    public static final String ACTION_CLEAR = "com.syzg.gachaexporter.CLEAR";

    public static final String[] GAME_PACKAGES = new String[]{
            "game.taptap.tqpmyrzg",
            "com.taoqipao.myrzg.bilibili"
    };
    private static final String CHANNEL_ID = "syzg_vpn_capture";
    private static final int NOTIF_ID = 202611;

    public interface StateListener {
        void onStateChanged(String jsonSnapshot);
    }

    private static final CopyOnWriteArrayList<StateListener> LISTENERS = new CopyOnWriteArrayList<>();

    // 全局内存态（供 Activity 切换回前台时立即同步）
    private static volatile boolean sVpnRunning = false;
    private static volatile boolean sIsPulling = false;
    private static volatile boolean sHasAutoPulled = false;
    private static volatile String sGamePkg = "";
    private static volatile String sServerHost = "";
    private static volatile int sServerPort = 0;
    private static volatile String sToken = "";
    private static volatile String sUid = "";
    private static volatile String sNickname = "";
    private static volatile String sAvatar = "";
    private static volatile int sHeroServerTotal = 0;
    private static volatile int sPetServerTotal = 0;
    private static volatile long sLastPullMs = 0;
    private static volatile String sLastError = "";
    private static final Map<Long, GachaProtocolClient.GachaItem> sRecords = new LinkedHashMap<>();
    private static final List<String> sLogs = new ArrayList<>();
    private static volatile String sCachedExportJson = "";

    private ParcelFileDescriptor tunInterface;
    private TunForwarder forwarder;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static volatile VpnCaptureService sInstance;

    public static void addListener(StateListener l) {
        if (l != null && !LISTENERS.contains(l)) LISTENERS.add(l);
    }

    public static void removeListener(StateListener l) {
        LISTENERS.remove(l);
    }

    public static boolean isVpnRunning() {
        return sVpnRunning;
    }

    public static String getCachedExportJson(Context ctx) {
        synchronized (sRecords) {
            if (!sCachedExportJson.isEmpty()) return sCachedExportJson;
            if (!sRecords.isEmpty()) {
                sCachedExportJson = GachaProtocolClient.buildExportJson(new ArrayList<>(sRecords.values()), sUid, sNickname, sAvatar);
                return sCachedExportJson;
            }
        }
        return "";
    }

    public static void clearRecords(Context ctx) {
        synchronized (sRecords) {
            sRecords.clear();
            sHeroServerTotal = 0;
            sPetServerTotal = 0;
            sLastPullMs = 0;
            sLastError = "";
            sCachedExportJson = "";
        }
        appendLog("[!] 已清空当前记录缓存，可随时点击【全量抓取】重新同步。");
        notifyListeners();
    }

    public static void triggerManualPull(Context ctx) {
        Intent i = new Intent(ctx, VpnCaptureService.class);
        i.setAction(ACTION_PULL_NOW);
        ctx.startService(i);
    }

    public static String buildStateSnapshotJson() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("vpnRunning", sVpnRunning);
            obj.put("isPulling", sIsPulling);
            obj.put("hasToken", !sToken.isEmpty());
            obj.put("serverHost", sServerHost);
            obj.put("serverPort", sServerPort);
            obj.put("uid", sUid);
            obj.put("nickname", sNickname);
            obj.put("avatar", sAvatar);
            obj.put("heroServerTotal", sHeroServerTotal);
            obj.put("petServerTotal", sPetServerTotal);
            obj.put("lastPullMs", sLastPullMs);
            obj.put("lastError", sLastError);

            JSONArray recArr = new JSONArray();
            synchronized (sRecords) {
                for (GachaProtocolClient.GachaItem it : sRecords.values()) {
                    JSONObject r = new JSONObject();
                    r.put("id", it.id);
                    r.put("typeId", it.typeId);
                    r.put("poolId", it.poolId);
                    recArr.put(r);
                }
            }
            obj.put("records", recArr);

            JSONArray logArr = new JSONArray();
            synchronized (sLogs) {
                for (String line : sLogs) {
                    logArr.put(line);
                }
            }
            obj.put("logs", logArr);
            return obj.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private static void appendLog(String msg) {
        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("HH:mm:ss", Locale.US);
        String line = "[" + sdf.format(new java.util.Date()) + "] " + msg;
        synchronized (sLogs) {
            sLogs.add(line);
            if (sLogs.size() > 120) {
                sLogs.remove(0);
            }
        }
    }

    private static void notifyListeners() {
        String json = buildStateSnapshotJson();
        for (StateListener l : LISTENERS) {
            try { l.onStateChanged(json); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopVpn();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_CLEAR.equals(action)) {
            clearRecords(this);
            return START_NOT_STICKY;
        }
        if (ACTION_PULL_NOW.equals(action)) {
            executor.execute(this::runDirectPull);
            return START_NOT_STICKY;
        }

        startForeground(NOTIF_ID, buildNotification("正在监听游戏会话令牌，请切换到《深渊之歌》..."));
        startVpn();
        return START_STICKY;
    }

    private void startVpn() {
        if (sVpnRunning && tunInterface != null) {
            appendLog("[✓] 本地采样代理已在运行中。");
            notifyListeners();
            return;
        }

        try {
            sHasAutoPulled = false;
            List<String> targetPkgs = resolveGamePackages();
            sGamePkg = targetPkgs.isEmpty() ? "" : targetPkgs.get(0);

            VpnService.Builder builder = new VpnService.Builder();
            builder.setSession("深渊大书院抽卡采样");
            builder.setMtu(1400);
            builder.addAddress("10.8.0.2", 32);
            builder.addRoute("0.0.0.0", 0);
            builder.addDnsServer("223.5.5.5");
            builder.addDnsServer("119.29.29.29");

            if (!targetPkgs.isEmpty()) {
                for (String pkg : targetPkgs) {
                    try {
                        builder.addAllowedApplication(pkg);
                        appendLog("[✓] 已锁定仅代理游戏包: " + pkg);
                    } catch (PackageManager.NameNotFoundException ignored) {}
                }
            } else {
                appendLog("[!] 未检测到官方/B站《深渊之歌》安装包，将尝试全局路由捕获。");
                try { builder.addDisallowedApplication(getPackageName()); } catch (Exception ignored) {}
            }

            tunInterface = builder.establish();
            if (tunInterface == null) {
                appendLog("[×] 建立本地 VPN 通道失败，请重新授权 VPN 权限。");
                sVpnRunning = false;
                notifyListeners();
                stopForeground(true);
                stopSelf();
                return;
            }

            forwarder = new TunForwarder(this, tunInterface.getFileDescriptor(), new TunForwarder.CaptureListener() {
                @Override
                public void onTokenCaptured(String token, String serverIp, int serverPort) {
                    sToken = token;
                    sServerHost = serverIp;
                    sServerPort = serverPort;
                    appendLog("[✓] 已捕获会话令牌 (长度 " + token.length() + ") | 逻辑服 " + serverIp + ":" + serverPort);
                    notifyListeners();
                    if (!sHasAutoPulled && !sIsPulling) {
                        sHasAutoPulled = true;
                        executor.execute(VpnCaptureService.this::runDirectPull);
                    }
                }

                @Override
                public void onPlayerInfoCaptured(String uid, String nickname) {
                    boolean changed = false;
                    if (uid != null && !uid.isEmpty() && !uid.equals(sUid)) {
                        sUid = uid;
                        sAvatar = "";
                        changed = true;
                    }
                    if (nickname != null && !nickname.isEmpty() && !nickname.equals(sNickname)) {
                        sNickname = nickname;
                        changed = true;
                    }
                    if (changed) {
                        appendLog("[✓] 捕获玩家信息: " + (sNickname.isEmpty() ? "小小工匠" : sNickname)
                                + (sUid.isEmpty() ? "" : " (UID: " + sUid + ")"));
                        notifyListeners();
                    }
                }

                @Override
                public void onLog(String message) {
                    appendLog(message);
                    notifyListeners();
                }
            });

            forwarder.start();
            sVpnRunning = true;
            appendLog("[✓] 手机免 Root 本地采样已就绪！请切入游戏触发任意请求（如点开记录查询）。");
            updateNotification("采样监听中：请切入游戏点开记录查询或任意界面");
            notifyListeners();
        } catch (Exception e) {
            appendLog("[×] 启动本地代理失败: " + e.getMessage());
            stopVpn();
        }
    }

    private void runDirectPull() {
        if (sIsPulling) return;
        if (sToken.isEmpty() || sServerHost.isEmpty() || sServerPort <= 0) {
            appendLog("[!] 尚未捕获到会话令牌，请先切入游戏点开一次记录查询或任意界面。");
            notifyListeners();
            return;
        }

        sIsPulling = true;
        sLastError = "";
        notifyListeners();
        appendLog("[→] 正在直连逻辑服 " + sServerHost + ":" + sServerPort + " 全量抓取...");
        notifyListeners();

        try {
            GachaProtocolClient.PullResult result = null;
            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    result = GachaProtocolClient.pullAll(
                            sServerHost,
                            sServerPort,
                            sToken,
                            sUid,
                            sNickname,
                            sAvatar,
                            socket -> protect(socket),
                            msg -> {
                                appendLog(msg);
                                notifyListeners();
                            }
                    );
                    break;
                } catch (Exception attemptEx) {
                    String errMsg = attemptEx.getMessage() != null ? attemptEx.getMessage() : "";
                    if (errMsg.contains("Code=100") && attempt < 2) {
                        long waitMs = (attempt == 0) ? 1200L : 1800L;
                        appendLog(String.format(Locale.CHINA,
                                "[!] 令牌刚初始化/待刷新 (Code=100)，%.1f 秒后自动重试...", waitMs / 1000.0));
                        notifyListeners();
                        Thread.sleep(waitMs);
                        continue;
                    }
                    throw attemptEx;
                }
            }

            synchronized (sRecords) {
                sHeroServerTotal = result.heroTotal;
                sPetServerTotal = result.petTotal;
                sLastPullMs = result.elapsedMs;
                if (!result.uid.isEmpty()) sUid = result.uid;
                if (!result.nickname.isEmpty()) sNickname = result.nickname;
                if (!result.avatar.isEmpty()) sAvatar = result.avatar;
                sRecords.clear();
                for (GachaProtocolClient.GachaItem it : result.items) {
                    sRecords.put(it.id, it);
                }
                sCachedExportJson = GachaProtocolClient.buildExportJson(new ArrayList<>(sRecords.values()), sUid, sNickname, sAvatar);
            }
            saveExportFile(sCachedExportJson);

            String silverNote = result.skippedSilver > 0
                    ? String.format(Locale.CHINA, "（已剔除 %d 条银币池记录）", result.skippedSilver)
                    : "";
            String okMsg = String.format(Locale.CHINA, "[✓] 全部抽卡记录直连同步完成！有效 %d 条%s，耗时 %d ms",
                    sRecords.size(), silverNote, result.elapsedMs);
            appendLog(okMsg);
            updateNotification(String.format(Locale.CHINA, "已全量抓完 %d 条记录（耗时 %dms），点击返回查看",
                    sRecords.size(), result.elapsedMs));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "未知异常";
            if (msg.contains("Code=100")) {
                sLastError = "令牌未就绪或已过期：请在游戏内点一下翻页/界面，再点击下方【重试全量抓取】";
                appendLog("[!] 令牌暂未激活或已过期 (Code=100)：请在游戏【记录查询】点一下翻页后，再点下方【重试全量抓取】。");
            } else {
                sLastError = "抓取失败：" + msg + "（可点下方重试）";
                appendLog("[×] 直连抓取失败: " + msg);
            }
        } finally {
            sIsPulling = false;
            notifyListeners();
        }
    }

    private void saveExportFile(String json) {
        if (json == null || json.isEmpty()) return;
        try {
            File dir = new File(getFilesDir(), "exports");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "gacha_records.json");
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(json.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {}
    }

    private List<String> resolveGamePackages() {
        List<String> found = new ArrayList<>();
        PackageManager pm = getPackageManager();
        for (String pkg : GAME_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                found.add(pkg);
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return found;
    }

    private void stopVpn() {
        sVpnRunning = false;
        if (forwarder != null) {
            try { forwarder.stop(); } catch (Exception ignored) {}
            forwarder = null;
        }
        if (tunInterface != null) {
            try { tunInterface.close(); } catch (Exception ignored) {}
            tunInterface = null;
        }
        appendLog("[!] 已停止本地采样代理。");
        notifyListeners();
        stopForeground(true);
    }

    @Override
    public void onRevoke() {
        stopVpn();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        stopVpn();
        executor.shutdownNow();
        sInstance = null;
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "深渊抽卡采样服务",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? (PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("深渊招募导出工具")
                .setContentText(text)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(text));
    }
}
