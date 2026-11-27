package com.descall.app.widget;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** The periodic / on-demand refresh (WidgetScheduler). Never retries on its own: the next period does. */
public class WidgetRefreshWorker extends Worker {
  public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
    super(context, params);
  }

  @NonNull
  @Override
  public Result doWork() {
    Context c = getApplicationContext();
    if (WidgetUpdater.count(c) == 0) {
      WidgetScheduler.cancel(c);
      return Result.success();
    }
    WidgetRepository.refresh(c, false);
    return Result.success();
  }
}
