package com.descall.app;

import android.app.ActivityManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.splashscreen.SplashScreen;
import com.descall.app.widget.DescallWidgetsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  /** Upper bound for holding the system splash; boot never waits longer on it. */
  private static final long SPLASH_MAX_MS = 1500L;
  private static final long SPLASH_POLL_MS = 40L;
  private static final long SPLASH_FADE_MS = 180L;

  /**
   * True once the web boot splash (index.html #boot-splash, same #1E1F22 surface and
   * centered logo) can paint: its markup exists and every render-blocking stylesheet
   * has loaded. Before that the WebView would show an empty dark frame, so the logo
   * blinked out between the system splash and the web splash.
   */
  private static final String WEB_SPLASH_READY_JS =
    "(function(){try{var d=document;if(!d.body||location.href==='about:blank')return false;" +
    "if(!d.getElementById('boot-splash')&&!d.querySelector('.descall-boot-splash'))" +
    "return d.readyState!=='loading';" +
    "var l=d.querySelectorAll('link[rel=stylesheet]');" +
    "for(var i=0;i<l.length;i++){if(!l[i].sheet)return false;}return true;}catch(e){return true;}})()";

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private boolean webSplashReady = false;
  private long splashDeadline = 0L;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
    splashDeadline = SystemClock.uptimeMillis() + SPLASH_MAX_MS;
    splashScreen.setKeepOnScreenCondition(() -> !webSplashReady && SystemClock.uptimeMillis() < splashDeadline);
    // Cross-fade into the web splash instead of cutting to it.
    splashScreen.setOnExitAnimationListener(provider -> {
      View view = provider.getView();
      view.animate().alpha(0f).setDuration(SPLASH_FADE_MS).withEndAction(provider::remove).start();
    });

    registerPlugin(CallKeepAlivePlugin.class);
    registerPlugin(DescallDeepLinkPlugin.class);
    registerPlugin(DescallPushConfigPlugin.class);
    registerPlugin(DescallHapticsPlugin.class);
    registerPlugin(DescallShortcutsPlugin.class);
    registerPlugin(DescallPasskeyPlugin.class);
    // Home screen widgets + the ongoing call notification (draft B, widget/ package).
    registerPlugin(DescallWidgetsPlugin.class);
    super.onCreate(savedInstanceState);

    // Edge to edge on every Android version, the layout Android 15+ already
    // enforces (and the one the app is built for: Capacitor SystemBars passes
    // the insets to env(safe-area-inset-*) like iOS). On Android 14 and lower
    // the post-splash theme otherwise left opaque black AppCompat status and
    // navigation bars over the app's own top / bottom colors, switching from
    // the #1E1F22 splash bars to black at the handoff. Light icons to start
    // with; SystemBars (style DARK) and src/lib/androidSystemBars.js keep them
    // in step with the in-app theme.
    EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));

    tuneWebView();
    pollWebSplash();

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (getBridge() == null || getBridge().getWebView() == null) {
          finishActivity();
          return;
        }
        getBridge().getWebView().evaluateJavascript(
          "(function(){try{return window.__descallAndroidBack?window.__descallAndroidBack():'exit';}catch(e){return 'exit';}})()",
          value -> {
            if (value != null && value.contains("handled")) return;
            runOnUiThread(this::finishActivity);
          }
        );
      }

      private void finishActivity() {
        // Hand this one press to the default handler. Since Android 12 that only
        // moves the task to the back and the activity lives on, so the callback is
        // re-enabled: otherwise after returning to the app the first back press
        // exited instead of closing the open sheet / going back in the app.
        setEnabled(false);
        try {
          getOnBackPressedDispatcher().onBackPressed();
        } finally {
          setEnabled(true);
        }
      }
    });
  }

  @Override
  public void onDestroy() {
    mainHandler.removeCallbacksAndMessages(null);
    super.onDestroy();
  }

  /**
   * WebView settings Capacitor's Bridge does not set (it already handles the
   * background color, zoom, mixed content and debug-only remote debugging).
   */
  private void tuneWebView() {
    if (getBridge() == null) return;
    WebView webView = getBridge().getWebView();
    if (webView == null) return;
    WebSettings settings = webView.getSettings();

    // Layouts are designed in CSS px like the iOS app (WKWebView ignores the
    // system text size too); a 130% system font otherwise overflowed fixed rows.
    settings.setTextZoom(100);

    // Inner scrollers handle their own overscroll (CSS overscroll-behavior). The
    // native stretch / glow on the root WebView redraws the whole page through
    // an extra layer and pulled fixed chrome (tab bar, composer) along with it.
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Keep the renderer at foreground importance in the background as well: a
      // voice call keeps running there (CallForegroundService).
      webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }

    // The single full-screen WebView is the case pre-raster is meant for: tiles
    // stay rastered while another window covers it (permission prompt, share
    // sheet, notification shade) and when the app returns from the background,
    // so the first frame back is not blank. Costs tile memory, so not on
    // low-RAM devices.
    ActivityManager activityManager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
    boolean lowRam = activityManager != null && activityManager.isLowRamDevice();
    if (!lowRam) {
      settings.setOffscreenPreRaster(true);
    }
  }

  /**
   * Polls on a fixed beat until the web splash can paint, then lets the system
   * splash go. Not chained on the callback: an evaluation that is still pending
   * when the first navigation commits may never answer. Bounded by SPLASH_MAX_MS
   * (also enforced by the keep condition), so a slow or failed page load never
   * holds the splash.
   */
  private void pollWebSplash() {
    if (webSplashReady) return;
    if (SystemClock.uptimeMillis() >= splashDeadline || getBridge() == null || getBridge().getWebView() == null) {
      webSplashReady = true;
      return;
    }
    getBridge().getWebView().evaluateJavascript(WEB_SPLASH_READY_JS, value -> {
      if ("true".equals(value)) webSplashReady = true;
    });
    mainHandler.postDelayed(this::pollWebSplash, SPLASH_POLL_MS);
  }
}
