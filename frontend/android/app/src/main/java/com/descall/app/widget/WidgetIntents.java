package com.descall.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import java.util.regex.Pattern;

/**
 * Every intent a widget, the call notification or the configuration screen sends, in one
 * place. All PendingIntents are explicit (our own components only) and immutable; each gets
 * a unique data URI so Android never merges two of them (same component, other extras).
 */
public final class WidgetIntents {
  // WidgetActionReceiver (not exported)
  public static final String ACTION_REFRESH = "com.descall.app.widget.REFRESH";
  public static final String ACTION_WAVE = "com.descall.app.widget.WAVE";
  public static final String ACTION_CALL_MUTE = "com.descall.app.widget.CALL_MUTE";
  public static final String ACTION_CALL_DEAFEN = "com.descall.app.widget.CALL_DEAFEN";
  public static final String ACTION_CALL_LEAVE = "com.descall.app.widget.CALL_LEAVE";

  // WidgetLaunchActivity -> MainActivity -> DescallWidgetsPlugin
  public static final String ACTION_OPEN = "com.descall.app.widget.OPEN";
  public static final String ACTION_JOIN = "com.descall.app.widget.JOIN";
  /** What MainActivity receives; DescallWidgetsPlugin turns it into a page action. */
  public static final String ACTION_APP = "com.descall.app.widget.APP_ACTION";

  public static final String EXTRA_PATH = "path";
  public static final String EXTRA_FRIEND_ID = "friendId";
  public static final String EXTRA_FRIEND_NAME = "friendName";
  public static final String EXTRA_SERVER_ID = "serverId";
  public static final String EXTRA_CHANNEL_ID = "channelId";
  public static final String EXTRA_CHANNEL_NAME = "channelName";
  public static final String EXTRA_CHANNEL_TYPE = "channelType";
  public static final String EXTRA_TYPE = "type";

  private static final Pattern PATH = Pattern.compile("^/(direct|groups|servers|friends|calls|activity|settings)(/[\\p{L}\\p{N}_.%-]{1,80}){0,2}$");
  static final Pattern ID = Pattern.compile("^[0-9A-Za-z-]{1,64}$");

  private WidgetIntents() {}

  /** In-app paths only (same rule as nativeIntents.js parseIntentAction openPath). */
  public static boolean isAppPath(String path) {
    return path != null && path.length() <= 200 && PATH.matcher(path).matches();
  }

  static int flags() {
    int f = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
    return f;
  }

  private static Uri tag(String what, int widgetId, String key) {
    return Uri.parse("descall-widget://" + what + "/" + widgetId + "/" + Uri.encode(key == null ? "" : key));
  }

  static PendingIntent open(Context c, int widgetId, String path) {
    if (!isAppPath(path)) path = "/direct";
    Intent i = new Intent(c, WidgetLaunchActivity.class).setAction(ACTION_OPEN).setData(tag("open", widgetId, path));
    i.putExtra(EXTRA_PATH, path);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    return PendingIntent.getActivity(c, 0, i, flags());
  }

  static PendingIntent join(Context c, int widgetId, WidgetModels.VoiceRoom room) {
    Intent i = new Intent(c, WidgetLaunchActivity.class).setAction(ACTION_JOIN).setData(tag("join", widgetId, room.channelId));
    i.putExtra(EXTRA_SERVER_ID, room.serverId);
    i.putExtra(EXTRA_CHANNEL_ID, room.channelId);
    i.putExtra(EXTRA_CHANNEL_NAME, room.channelName);
    i.putExtra(EXTRA_CHANNEL_TYPE, room.type);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    return PendingIntent.getActivity(c, 0, i, flags());
  }

  static PendingIntent configure(Context c, int widgetId) {
    Intent i = new Intent(c, WidgetConfigActivity.class).setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
      .setData(tag("configure", widgetId, ""));
    i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
    i.putExtra(WidgetConfigActivity.EXTRA_FROM_WIDGET, true);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    return PendingIntent.getActivity(c, 0, i, flags());
  }

  static PendingIntent broadcast(Context c, String action, int widgetId, String key) {
    Intent i = new Intent(c, WidgetActionReceiver.class).setAction(action).setData(tag("act", widgetId, action + ":" + key));
    return PendingIntent.getBroadcast(c, 0, i, flags());
  }

  static PendingIntent wave(Context c, int widgetId, WidgetModels.Friend f) {
    Intent i = new Intent(c, WidgetActionReceiver.class).setAction(ACTION_WAVE).setData(tag("wave", widgetId, f.id));
    i.putExtra(EXTRA_FRIEND_ID, f.id);
    i.putExtra(EXTRA_FRIEND_NAME, f.name);
    return PendingIntent.getBroadcast(c, 0, i, flags());
  }

  /** Path of a DM by username ("/direct" when it is unknown). */
  static String dmPath(String username) {
    return username == null || username.isEmpty() ? "/direct" : "/direct/" + Uri.encode(username);
  }

  static String convPath(WidgetModels.UnreadRow r) {
    switch (r.kind) {
      case "dm": return dmPath(r.username);
      case "group": return "/groups/" + Uri.encode(r.targetId());
      case "channel":
        return r.serverId.isEmpty() ? "/servers" : "/servers/" + Uri.encode(r.serverId) + "/" + Uri.encode(r.targetId());
      default: return "/direct";
    }
  }
}
