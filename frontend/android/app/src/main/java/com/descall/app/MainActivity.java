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
    registerPlugin(DescallHapticsPlugin.class);
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
        // Hand this one back press to the system (finish, or on Android 12+
        // move the root task to the back), then take the next one again.
        // Leaving the callback disabled meant that after the app came back
        // from the background every back gesture left it instead of closing
        // the open sheet or chat.
        setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        setEnabled(true);
      }
    });
  }
}
