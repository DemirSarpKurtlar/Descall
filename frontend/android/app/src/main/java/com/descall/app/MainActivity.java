package com.descall.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen.installSplashScreen(this);
    registerPlugin(CallKeepAlivePlugin.class);
    registerPlugin(DescallDeepLinkPlugin.class);
    registerPlugin(DescallPushConfigPlugin.class);
    super.onCreate(savedInstanceState);

    // The WebView multiplies every CSS font size by the system font scale
    // (1.15-1.3 on many phones), so the fixed-size glass chrome (tab labels,
    // toolbar chips, list rows) overflowed and Android drew bigger, clipped
    // text where the iPhone does not. Text size is the in-app Appearance
    // setting (--ui-font-scale) on both platforms instead.
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setTextZoom(100);
    }

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
        setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
      }
    });
  }
}
