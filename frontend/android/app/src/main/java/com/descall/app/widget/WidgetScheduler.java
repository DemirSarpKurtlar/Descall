package com.descall.app.widget;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Battery: one periodic refresh every 30 minutes, only with a network and only while a
 * widget exists (cancelled with the last one). Fresher data comes from the running app
 * (DescallWidgetsPlugin, on socket events) without any polling.
 */
public final class WidgetScheduler {
  static final String PERIODIC = "descall_widgets_periodic";
  static final String NOW = "descall_widgets_now";
  static final long PERIOD_MINUTES = 30;

  private WidgetScheduler() {}

  static Constraints constraints() {
    return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
  }

  public static void ensurePeriodic(Context c) {
    try {
      PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(WidgetRefreshWorker.class, PERIOD_MINUTES, TimeUnit.MINUTES)
        .setConstraints(constraints())
        .build();
      WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    } catch (RuntimeException ignored) {
      // WorkManager not initialised (direct boot): the next widget update schedules it
    }
  }

  /** One refresh as soon as there is a network (a placed widget, a tap on "Try again"). */
  public static void refreshSoon(Context c) {
    try {
      OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
        .setConstraints(constraints())
        .build();
      WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP, req);
    } catch (RuntimeException ignored) {
      // see ensurePeriodic
    }
  }

  public static void cancel(Context c) {
    try {
      WorkManager.getInstance(c).cancelUniqueWork(PERIODIC);
      WorkManager.getInstance(c).cancelUniqueWork(NOW);
    } catch (RuntimeException ignored) {
      // nothing scheduled
    }
  }
}
