package com.descall.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Shared behaviour of the four Descall widgets: render from the cache at once (off the main
 * thread, goAsync), keep the periodic refresh scheduled while any widget exists, ask for a
 * refresh when a widget is placed, and forget a removed widget's options.
 */
public abstract class BaseWidgetProvider extends AppWidgetProvider {
  static final ExecutorService RENDER = Executors.newSingleThreadExecutor();

  abstract int kind();

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    final Context app = context.getApplicationContext();
    final PendingResult pending = goAsync();
    RENDER.execute(() -> {
      try {
        for (int id : ids) WidgetUpdater.update(app, manager, kind(), id);
        WidgetScheduler.ensurePeriodic(app);
        if (WidgetStore.snapshot(app) == null || WidgetRepository.isOld(app)) WidgetScheduler.refreshSoon(app);
      } finally {
        pending.finish();
      }
    });
  }

  @Override
  public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle newOptions) {
    final Context app = context.getApplicationContext();
    final PendingResult pending = goAsync();
    RENDER.execute(() -> {
      try {
        WidgetUpdater.update(app, manager, kind(), id);
      } finally {
        pending.finish();
      }
    });
  }

  @Override
  public void onEnabled(Context context) {
    WidgetScheduler.ensurePeriodic(context.getApplicationContext());
  }

  @Override
  public void onDeleted(Context context, int[] ids) {
    for (int id : ids) WidgetStore.deleteOptions(context, id);
  }

  @Override
  public void onDisabled(Context context) {
    // The last widget of this kind went; stop the periodic refresh when none of ours is left.
    if (WidgetUpdater.count(context) == 0) WidgetScheduler.cancel(context.getApplicationContext());
  }
}
