package com.descall.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * 4.2: trampoline for launcher shortcuts (static, dynamic and pinned) and Google Assistant
 * App Actions. A launcher starts a shortcut with FLAG_ACTIVITY_CLEAR_TASK, which would
 * recreate MainActivity (reload the web app, drop a running call). This invisible activity
 * lives in its own task, forwards a validated copy of the intent to MainActivity (singleTask:
 * the running app gets onNewIntent) and finishes at once.
 *
 * Accepted: descall:// VIEW links (recent / pinned DMs, routed by DescallDeepLinkPlugin) and
 * the shortcut actions DescallShortcutsPlugin handles. Anything else just opens the app.
 */
public class DescallShortcutActivity extends Activity {
  static final String ACTION_NEW_MESSAGE = "com.descall.app.action.NEW_MESSAGE";
  static final String ACTION_TOGGLE_DND = "com.descall.app.action.TOGGLE_DND";
  static final String ACTION_OPEN_FRIENDS = "com.descall.app.action.OPEN_FRIENDS";
  static final String ACTION_OPEN_FEATURE = "com.descall.app.action.OPEN_FEATURE";

  /** The action MainActivity should see for an incoming shortcut intent, or null. */
  static String forwardedAction(String action, String feature) {
    if (ACTION_NEW_MESSAGE.equals(action) || ACTION_TOGGLE_DND.equals(action) || ACTION_OPEN_FRIENDS.equals(action)) {
      return action;
    }
    if (ACTION_OPEN_FEATURE.equals(action) && feature != null) {
      // App Actions inline inventory: the matched shortcut id (xml/shortcuts.xml).
      switch (feature) {
        case "new_message": return ACTION_NEW_MESSAGE;
        case "toggle_dnd": return ACTION_TOGGLE_DND;
        case "friends": return ACTION_OPEN_FRIENDS;
        default: return null;
      }
    }
    return null;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent in = getIntent();
    Intent out = new Intent(this, MainActivity.class);
    out.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (in != null) {
      String action = in.getAction();
      Uri data = in.getData();
      String feature = null;
      try {
        feature = in.getStringExtra("feature");
      } catch (RuntimeException ignored) {
        // a malformed extras bundle from another app
      }
      String forwarded = forwardedAction(action, feature);
      if (forwarded != null) {
        out.setAction(forwarded);
      } else if (Intent.ACTION_VIEW.equals(action) && data != null && DescallDeepLinkPlugin.accepts(data)) {
        out.setAction(Intent.ACTION_VIEW);
        out.setData(data);
      } else {
        out.setAction(Intent.ACTION_MAIN);
        out.addCategory(Intent.CATEGORY_LAUNCHER);
      }
    }
    try {
      startActivity(out);
    } catch (RuntimeException ignored) {
      // nothing to bring forward; finishing is all that is left
    }
    finish();
    overridePendingTransition(0, 0);
  }
}
