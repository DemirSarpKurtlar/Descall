package com.descall.app.widget;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import com.descall.app.MainActivity;

/**
 * Trampoline for widget taps that open the app (a chat, a voice room to join). Like
 * DescallShortcutActivity: an invisible activity in its own task that forwards a validated
 * copy to MainActivity (singleTask, so a running call survives) and finishes at once.
 * DescallWidgetsPlugin turns ACTION_APP into a page action (openPath / joinVoice).
 */
public class WidgetLaunchActivity extends Activity {
  /** The intent MainActivity should get for a widget tap, or null for "just open the app". */
  static Intent forward(Activity from, Intent in) {
    if (in == null || in.getAction() == null) return null;
    Intent out = new Intent(from, MainActivity.class).setAction(WidgetIntents.ACTION_APP);
    try {
      if (WidgetIntents.ACTION_OPEN.equals(in.getAction())) {
        String path = in.getStringExtra(WidgetIntents.EXTRA_PATH);
        if (!WidgetIntents.isAppPath(path)) return null;
        out.putExtra(WidgetIntents.EXTRA_TYPE, "openPath");
        out.putExtra(WidgetIntents.EXTRA_PATH, path);
        return out;
      }
      if (WidgetIntents.ACTION_JOIN.equals(in.getAction())) {
        String serverId = in.getStringExtra(WidgetIntents.EXTRA_SERVER_ID);
        String channelId = in.getStringExtra(WidgetIntents.EXTRA_CHANNEL_ID);
        if (serverId == null || channelId == null || !WidgetIntents.ID.matcher(serverId).matches()
          || !WidgetIntents.ID.matcher(channelId).matches()) return null;
        String name = in.getStringExtra(WidgetIntents.EXTRA_CHANNEL_NAME);
        out.putExtra(WidgetIntents.EXTRA_TYPE, "joinVoice");
        out.putExtra(WidgetIntents.EXTRA_SERVER_ID, serverId);
        out.putExtra(WidgetIntents.EXTRA_CHANNEL_ID, channelId);
        out.putExtra(WidgetIntents.EXTRA_CHANNEL_NAME, name == null ? "" : name.length() > 80 ? name.substring(0, 80) : name);
        out.putExtra(WidgetIntents.EXTRA_CHANNEL_TYPE, "stage".equals(in.getStringExtra(WidgetIntents.EXTRA_CHANNEL_TYPE)) ? "stage" : "voice");
        return out;
      }
    } catch (RuntimeException ignored) {
      // malformed extras
    }
    return null;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent out = forward(this, getIntent());
    if (out == null) {
      out = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
    }
    out.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    try {
      startActivity(out);
    } catch (RuntimeException ignored) {
      // nothing to bring forward
    }
    finish();
    overridePendingTransition(0, 0);
  }
}
