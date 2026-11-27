package com.descall.app.widget;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

import com.descall.app.MainActivity;
import com.descall.app.R;

/**
 * The ongoing call notification of draft B: CallStyle with the face of the person talking,
 * "Kaan konusuyor", "Oyun Gecesi · Gece Kusu · 5 kisi", the call timer, a Mute / Unmute
 * button and Leave (hang up) that reach the running page (WidgetActionReceiver ->
 * CallControlBus). While connecting it shows indeterminate progress.
 *
 * Android 16+: the notification asks to be promoted to a Live Update (status bar chip, top
 * of the shade, lock screen; androidx core 1.17 NotificationCompat, a no-op before 16).
 * Connected: the CallStyle itself (an eligible style) with the call timer in the chip;
 * connecting: a progress-centric ProgressStyle (indeterminate) with "Connecting" in the chip.
 */
public final class CallNotification {
  private CallNotification() {}

  static PendingIntent contentIntent(Context c) {
    Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
    if (launch == null) launch = new Intent(c, MainActivity.class);
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return PendingIntent.getActivity(c, 0, launch, WidgetIntents.flags());
  }

  /** Subtitle under the title: room, server, people. */
  static String detail(Context c, WidgetModels.CallState s) {
    StringBuilder sb = new StringBuilder();
    boolean talking = s.speaker != null;
    if (talking && !s.title.isEmpty()) sb.append(s.title);
    if (!s.subtitle.isEmpty()) {
      if (sb.length() > 0) sb.append(" · ");
      sb.append(s.subtitle);
    }
    if (s.count > 1) {
      if (sb.length() > 0) sb.append(" · ");
      sb.append(c.getResources().getQuantityString(R.plurals.w_people_count, s.count, s.count));
    }
    return sb.toString();
  }

  /**
   * @param title / body  the plain texts CallKeepAlive.start passed (used without a call state)
   */
  public static Notification build(Context c, String channelId, String title, String body, WidgetModels.CallState s) {
    NotificationCompat.Builder b = new NotificationCompat.Builder(c, channelId)
      .setSmallIcon(R.drawable.ic_w_logo)
      .setColor(0xFF587AF5)
      .setColorized(false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentIntent(c))
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setRequestPromotedOngoing(true);

    if (s == null || !s.active) {
      return b.setContentTitle(title).setContentText(body).build();
    }
    String room = s.title.isEmpty() ? c.getString(R.string.n_voice_call) : s.title;
    WidgetModels.Person face = s.face();
    String heading = s.speaker != null ? c.getString(R.string.w_talking, s.speaker.name) : room;
    String detail = detail(c, s);
    PendingIntent leave = WidgetIntents.broadcast(c, WidgetIntents.ACTION_CALL_LEAVE, 0, "notification");
    PendingIntent mute = WidgetIntents.broadcast(c, WidgetIntents.ACTION_CALL_MUTE, 0, "notification");
    NotificationCompat.Action muteAction = new NotificationCompat.Action.Builder(
      IconCompat.createWithResource(c, s.muted ? R.drawable.ic_w_mic : R.drawable.ic_w_mic_off),
      c.getString(s.muted ? R.string.n_unmute : R.string.n_mute), mute).build();

    if (s.connecting) {
      b.setContentTitle(room).setContentText(c.getString(R.string.w_connecting)).setProgress(0, 0, true)
        .setShortCriticalText(c.getString(R.string.n_chip_connecting))
        .setStyle(new NotificationCompat.ProgressStyle().setProgressIndeterminate(true))
        .addAction(muteAction)
        .addAction(new NotificationCompat.Action.Builder(IconCompat.createWithResource(c, R.drawable.ic_w_leave),
          c.getString(R.string.n_leave), leave).build());
      return b.build();
    }

    Bitmap photo = face != null ? AvatarCache.get(c, face.avatarUrl) : null;
    Person.Builder person = new Person.Builder().setName(heading).setImportant(true);
    if (face != null) {
      int px = Math.round(64 * c.getResources().getDisplayMetrics().density);
      person.setIcon(IconCompat.createWithBitmap(FacePainter.round(face.id, face.name, photo, Math.min(px, 192))));
      person.setKey(face.id);
    }
    b.setContentTitle(heading)
      .setContentText(detail.isEmpty() ? room : detail)
      .setUsesChronometer(s.startedAt > 0)
      .setShowWhen(s.startedAt > 0)
      .setWhen(s.startedAt > 0 ? s.startedAt : System.currentTimeMillis())
      .addAction(muteAction);
    try {
      b.setStyle(NotificationCompat.CallStyle.forOngoingCall(person.build(), leave));
      return b.build();
    } catch (RuntimeException e) {
      // A device that refuses CallStyle: the same content as a plain notification.
      b.setStyle(null).addAction(new NotificationCompat.Action.Builder(IconCompat.createWithResource(c, R.drawable.ic_w_leave),
        c.getString(R.string.n_leave), leave).build());
      return b.build();
    }
  }
}
