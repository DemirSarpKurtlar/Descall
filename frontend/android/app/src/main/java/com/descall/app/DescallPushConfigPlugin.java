package com.descall.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells JS whether Firebase is configured in this build. The google-services Gradle
 * plugin (applied only when app/google-services.json exists) generates the
 * google_app_id string. Without it @capacitor/push-notifications' register() throws
 * "Default FirebaseApp is not initialized" on the plugin thread, Capacitor rethrows
 * it and the app crashes, so src/lib/nativePush.js asks first.
 */
@CapacitorPlugin(name = "DescallPushConfig")
public class DescallPushConfigPlugin extends Plugin {
  @PluginMethod
  public void status(PluginCall call) {
    int id = getContext()
      .getResources()
      .getIdentifier("google_app_id", "string", getContext().getPackageName());
    JSObject result = new JSObject();
    result.put("firebase", id != 0);
    call.resolve(result);
  }
}
