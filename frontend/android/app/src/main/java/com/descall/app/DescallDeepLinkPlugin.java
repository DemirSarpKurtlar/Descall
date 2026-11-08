package com.descall.app;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Android twin of ios/App/App/DescallDeepLinkPlugin.swift (same JS name and API).
 * App Links (https://descall.com invite paths, AndroidManifest.xml) and descall://
 * links arrive as VIEW intents: the launch intent (BridgeActivity.load passes it to
 * handleOnNewIntent once plugins exist) or a new intent while the app runs
 * (launchMode singleTask). The latest of our URLs is kept until JS takes it
 * (takePending) and "url" fires so a running app reads it at once.
 * Routing happens in JS (src/lib/deepLinks.js via src/lib/nativeDeepLinks.js).
 */
@CapacitorPlugin(name = "DescallDeepLink")
public class DescallDeepLinkPlugin extends Plugin {
  private final Object lock = new Object();
  private String pending;

  static boolean accepts(Uri uri) {
    if (uri == null) return false;
    String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
    if (scheme.equals("descall")) return true;
    if (!scheme.equals("https")) return false;
    String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
    return host.equals("descall.com") || host.equals("www.descall.com");
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
    Uri uri = intent.getData();
    if (!accepts(uri)) return;
    synchronized (lock) {
      pending = uri.toString();
    }
    notifyListeners("url", new JSObject());
  }

  @PluginMethod
  public void takePending(PluginCall call) {
    String value;
    synchronized (lock) {
      value = pending;
      pending = null;
    }
    JSObject result = new JSObject();
    result.put("url", value == null ? JSONObject.NULL : value);
    call.resolve(result);
  }
}
