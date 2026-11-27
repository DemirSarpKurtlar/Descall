package com.descall.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import com.descall.app.widget.CallNotification;
import com.descall.app.widget.WidgetModels;
import com.descall.app.widget.WidgetStore;
import com.descall.app.widget.WidgetUpdater;

/**
 * Keeps the Capacitor WebView / mic session alive while a Descall call is
 * active and the user backgrounds the app. Without a real foreground
 * service Android aggressively freezes the WebView and WebRTC dies.
 *
 * Its notification is the draft B ongoing call notification (widget/CallNotification.java):
 * CallStyle with the face of the person talking, Mute and Leave, an Android 16 Live Update.
 * The call state comes from the page through DescallWidgetsPlugin.setCallState; until the
 * first report the plain title / body of CallKeepAlive.start show.
 */
public class CallForegroundService extends Service {
  public static final String CHANNEL_ID = "descall_call_keepalive";
  public static final int NOTIFICATION_ID = 48021;
  public static final String ACTION_START = "com.descall.app.CALL_KEEPALIVE_START";
  public static final String ACTION_STOP = "com.descall.app.CALL_KEEPALIVE_STOP";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_BODY = "body";
  private static final String PREFS = "descall_call_keepalive";

  private static volatile boolean running;

  /** True while the service is started (the call keeps the app alive). */
  public static boolean isRunning() {
    return running;
  }

  /**
   * Re-post the notification with the latest call state (DescallWidgetsPlugin, CallControlBus).
   * A no-op when the service is not running: only startForeground may create it.
   */
  public static void refreshNotification(Context context) {
    if (!running) return;
    Context c = context.getApplicationContext();
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String title = prefs.getString(EXTRA_TITLE, "Descall");
    String body = prefs.getString(EXTRA_BODY, "");
    try {
      nm.notify(NOTIFICATION_ID, CallNotification.build(c, CHANNEL_ID, title, body, WidgetStore.call(c)));
    } catch (RuntimeException e) {
      // CallStyle refused for this notification: the plain one.
      try {
        nm.notify(NOTIFICATION_ID, CallNotification.build(c, CHANNEL_ID, title, body, null));
      } catch (RuntimeException ignored) {
        // keep what is shown
      }
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null || ACTION_STOP.equals(intent.getAction())) {
      stopForegroundSafely();
      stopSelf();
      return START_NOT_STICKY;
    }

    String title = intent.getStringExtra(EXTRA_TITLE);
    String body = intent.getStringExtra(EXTRA_BODY);
    if (title == null || title.trim().isEmpty()) title = "Descall";
    if (body == null || body.trim().isEmpty()) body = getString(R.string.n_in_progress);
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(EXTRA_TITLE, title).putString(EXTRA_BODY, body).apply();

    ensureChannel();
    Notification notification;
    try {
      notification = CallNotification.build(this, CHANNEL_ID, title, body, WidgetStore.call(this));
    } catch (RuntimeException e) {
      notification = buildNotification(title, body);
    }
    running = true;

    // A CallStyle the system refuses (an OEM rule): the plain notification, then a plain FGS.
    if (!startTyped(notification) && !startTyped(buildNotification(title, body))) {
      try {
        startForeground(NOTIFICATION_ID, buildNotification(title, body));
      } catch (Exception ignored) {
        running = false;
        stopSelf();
        return START_NOT_STICKY;
      }
    }

    return START_STICKY;
  }

  private boolean startTyped(Notification notification) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        );
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  @Override
  public void onDestroy() {
    running = false;
    stopForegroundSafely();
    // The call is over (or the app was stopped): the call widget goes idle with it.
    final Context app = getApplicationContext();
    new Thread(() -> {
      try {
        WidgetStore.setCall(app, WidgetModels.CallState.idle());
        WidgetUpdater.updateCallSurfaces(app);
      } catch (RuntimeException ignored) {
        // widgets are best effort
      }
    }, "descall-call-end").start();
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void stopForegroundSafely() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE);
      } else {
        stopForeground(true);
      }
    } catch (Exception ignored) {
      /* ignore */
    }
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    // Re-creating an existing channel only updates its name and description (the user's
    // settings stay): the name follows the app language.
    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      getString(R.string.n_call_channel),
      NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription(getString(R.string.n_call_channel_desc));
    channel.setShowBadge(false);
    nm.createNotificationChannel(channel);
  }

  private Notification buildNotification(String title, String body) {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch == null) {
      launch = new Intent(this, MainActivity.class);
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

    int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launch, pendingFlags);

    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(R.drawable.ic_w_logo)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(contentIntent)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build();
  }
}
