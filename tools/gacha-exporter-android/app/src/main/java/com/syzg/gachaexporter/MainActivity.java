package com.syzg.gachaexporter;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity implements VpnCaptureService.StateListener {

    private static final String WIKI_ANALYSIS_URL = "https://syzgwiki.top/#/gacha/analysis";
    private WebView webView;
    private boolean pendingLaunchGameAfterVpn = false;

    private final ActivityResultLauncher<Intent> vpnPermLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (result.getResultCode() == RESULT_OK) {
                    startCaptureService(pendingLaunchGameAfterVpn);
                } else {
                    pendingLaunchGameAfterVpn = false;
                    toast("未授予本地 VPN 代理权限，无法捕获游戏令牌");
                }
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat ctrl = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (ctrl != null) {
            ctrl.setAppearanceLightStatusBars(false); // 深色原木顶栏配白色状态栏文字
            ctrl.setAppearanceLightNavigationBars(true);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#2B1F15"));

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setTextZoom(100);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pushStateToJs(VpnCaptureService.buildStateSnapshotJson());
            }
        });
        webView.addJavascriptInterface(new ExporterBridge(), "AndroidExporter");
        webView.loadUrl("file:///android_asset/index.html");

        requestNotificationPermIfNeeded();
    }

    private void requestNotificationPermIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        VpnCaptureService.addListener(this);
        pushStateToJs(VpnCaptureService.buildStateSnapshotJson());
    }

    @Override
    protected void onPause() {
        VpnCaptureService.removeListener(this);
        super.onPause();
    }

    @Override
    public void onStateChanged(String jsonSnapshot) {
        pushStateToJs(jsonSnapshot);
    }

    private void pushStateToJs(String jsonSnapshot) {
        if (webView == null) return;
        final String escaped = JSONObject.quote(jsonSnapshot);
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.onNativeState && window.onNativeState(" + escaped + ")", null);
            }
        });
    }

    private void startCaptureService(boolean launchGame) {
        Intent svc = new Intent(this, VpnCaptureService.class);
        svc.setAction(VpnCaptureService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }

        if (launchGame) {
            pendingLaunchGameAfterVpn = false;
            webView.postDelayed(this::launchGameApp, 350);
        }
    }

    private void launchGameApp() {
        for (String pkg : VpnCaptureService.GAME_PACKAGES) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return;
            }
        }
        toast("已开启监听，请手动打开《深渊之歌》");
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    public final class ExporterBridge {

        @JavascriptInterface
        public void startMonitorAndGame() {
            runOnUiThread(() -> {
                Intent prep = VpnService.prepare(MainActivity.this);
                if (prep != null) {
                    pendingLaunchGameAfterVpn = true;
                    vpnPermLauncher.launch(prep);
                } else {
                    startCaptureService(true);
                }
            });
        }

        @JavascriptInterface
        public void stopMonitor() {
            runOnUiThread(() -> {
                Intent svc = new Intent(MainActivity.this, VpnCaptureService.class);
                svc.setAction(VpnCaptureService.ACTION_STOP);
                startService(svc);
            });
        }

        @JavascriptInterface
        public void pullAllNow() {
            VpnCaptureService.triggerManualPull(MainActivity.this);
        }

        @JavascriptInterface
        public void clearRecords() {
            VpnCaptureService.clearRecords(MainActivity.this);
        }

        @JavascriptInterface
        public void copyJson() {
            String json = VpnCaptureService.getCachedExportJson(MainActivity.this);
            if (json.isEmpty()) {
                toast("尚未捕获到任何抽卡记录");
                return;
            }
            copyToClipboard(json);
            toast("已复制 JSON 到剪贴板，可前往 Wiki 粘贴导入");
        }

        @JavascriptInterface
        public void exportAndOpenWiki() {
            String json = VpnCaptureService.getCachedExportJson(MainActivity.this);
            if (json.isEmpty()) {
                toast("尚未捕获到任何抽卡记录");
                return;
            }
            copyToClipboard(json);
            toast("记录已复制到剪贴板，正在打开 Wiki 分析页");
            runOnUiThread(() -> {
                Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(WIKI_ANALYSIS_URL));
                startActivity(browser);
            });
        }

        @JavascriptInterface
        public void shareJsonFile() {
            String json = VpnCaptureService.getCachedExportJson(MainActivity.this);
            if (json.isEmpty()) {
                toast("尚未捕获到任何抽卡记录");
                return;
            }
            try {
                File dir = new File(getFilesDir(), "exports");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, "gacha_records.json");
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(json.getBytes(StandardCharsets.UTF_8));
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("application/json");
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(share, "分享或保存 gacha_records.json"));
            } catch (Exception e) {
                toast("分享失败: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public String getInitialState() {
            return VpnCaptureService.buildStateSnapshotJson();
        }
    }

    private void copyToClipboard(String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) {
            cm.setPrimaryClip(ClipData.newPlainText("gacha_records", text));
        }
    }
}
