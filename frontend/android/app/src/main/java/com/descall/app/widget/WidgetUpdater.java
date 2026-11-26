package com.descall.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * Pushes freshly built RemoteViews to every placed widget. Rendering reads only local data,
 * so this is cheap; call it off the main thread (faces are drawn here).
 */
public final class WidgetUpdater {
  static final Class<?>[] PROVIDERS = {
    FriendsWidgetProvider.class, UnreadWidgetProvider.class, VoiceWidgetProvider.class, CallWidgetProvider.class,
  };

  private WidgetUpdater() {}

  static int kindOf(Class<?> provider) {
    if (provider == FriendsWidgetProvider.class) return WidgetRenderer.KIND_FRIENDS;
    if (provider == UnreadWidgetProvider.class) return WidgetRenderer.KIND_UNREAD;
    if (provider == VoiceWidgetProvider.class) return WidgetRenderer.KIND_VOICE;
    return WidgetRenderer.KIND_CALL;
  }

  public static int[] ids(Context c, Class<?> provider) {
    try {
      return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, provider));
    } catch (RuntimeException e) {
      return new int[0];
    }
  }

  /** How many Descall widgets are on the home screen(s). */
  public static int count(Context c) {
    int n = 0;
    for (Class<?> p : PROVIDERS) n += ids(c, p).length;
    return n;
  }

  public static int kindOfWidget(Context c, int widgetId) {
    for (Class<?> p : PROVIDERS) {
      for (int id : ids(c, p)) if (id == widgetId) return kindOf(p);
    }
    return -1;
  }

  public static void updateAll(Context c) {
    for (Class<?> p : PROVIDERS) updateProvider(c, p);
  }

  /** Call and voice widgets only (a call state change). */
  public static void updateCallSurfaces(Context c) {
    updateProvider(c, CallWidgetProvider.class);
    updateProvider(c, VoiceWidgetProvider.class);
  }

  public static void updateProvider(Context c, Class<?> provider) {
    AppWidgetManager m = AppWidgetManager.getInstance(c);
    int kind = kindOf(provider);
    for (int id : ids(c, provider)) update(c, m, kind, id);
  }

  public static void update(Context c, AppWidgetManager m, int kind, int widgetId) {
    Bundle options = null;
    try {
      options = m.getAppWidgetOptions(widgetId);
    } catch (RuntimeException ignored) {
      // the host is gone; default size
    }
    try {
      m.updateAppWidget(widgetId, WidgetRenderer.build(c, kind, widgetId, options, 1f));
    } catch (RuntimeException | OutOfMemoryError first) {
      // A RemoteViews over the binder limit (many large faces): send smaller faces.
      try {
        RemoteViews lite = WidgetRenderer.build(c, kind, widgetId, options, 0.6f);
        m.updateAppWidget(widgetId, lite);
      } catch (RuntimeException | OutOfMemoryError ignored) {
        // the launcher keeps the previous views
      }
    }
  }
}
