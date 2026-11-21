package com.descall.app;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Crisp system haptics for the web layer (src/lib/fluid/haptics.js).
 *
 * @capacitor/haptics drives the Vibrator with 50-100 ms waveforms, which feels
 * like a buzz, not a tap. View.performHapticFeedback plays the device's tuned
 * click / tick effects and follows the system "Touch feedback" switch, the
 * same way UIKit feedback generators follow the iOS haptics setting.
 *
 * Exposed as a synchronous JavaScript interface (window.DescallHaptics.perform)
 * instead of a plugin method, so a tap reaches the UI thread without the
 * Capacitor message queue and its promise round trip. It is added in load(),
 * which the Bridge runs before the first page load, so it exists at boot.
 */
@CapacitorPlugin(name = "DescallHaptics")
public class DescallHapticsPlugin extends Plugin {

  @Override
  public void load() {
    WebView view = getBridge() != null ? getBridge().getWebView() : null;
    if (view == null) return;
    view.addJavascriptInterface(new HapticsInterface(view), "DescallHaptics");
  }

  static int constantFor(String kind) {
    if ("selection".equals(kind)) {
      return Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
    }
    if ("light".equals(kind)) return HapticFeedbackConstants.KEYBOARD_TAP;
    if ("success".equals(kind)) {
      return Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
    }
    if ("warning".equals(kind) || "error".equals(kind)) {
      return Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
    }
    // medium / rigid: long-press menus, drag start, tab lift.
    return HapticFeedbackConstants.LONG_PRESS;
  }

  private static final class HapticsInterface {
    private final WebView view;

    HapticsInterface(WebView view) {
      this.view = view;
    }

    @JavascriptInterface
    public boolean perform(String kind) {
      final int constant = constantFor(kind);
      view.post(() -> view.performHapticFeedback(constant));
      return true;
    }
  }
}
