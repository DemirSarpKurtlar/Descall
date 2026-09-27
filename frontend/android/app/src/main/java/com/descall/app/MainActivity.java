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
    super.onCreate(savedInstanceState);

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
