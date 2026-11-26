package com.descall.app.share;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.descall.app.DescallShareActivity;
import com.descall.app.DescallShortcutActivity;
import com.descall.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The share notification (draft A, Android step 7): progress with Durdur / Gizle, "Gönderildi"
 * with Geri al · N sn and Sohbeti aç, "N öğe gönderilemedi" with Tekrar dene / Ayrıntılar,
 * waiting for the network, and a saved draft with Gönder. One notification per job.
 */
public final class ShareNotifier {
  public static final String CHANNEL = "descall_share";

  private ShareNotifier() {}

  public static int idFor(String jobId) {
    return 0x5A00000 | (jobId.hashCode() & 0xFFFFF);
  }

  static void ensureChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = ctx.getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
    NotificationChannel ch = new NotificationChannel(CHANNEL, ctx.getString(R.string.share_notif_channel), NotificationManager.IMPORTANCE_DEFAULT);
    ch.setShowBadge(false);
    ch.setSound(null, null);
    nm.createNotificationChannel(ch);
  }

  static int flags() {
    return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
  }

  static PendingIntent action(Context ctx, String action, String jobId) {
    Intent i = new Intent(ctx, ShareActionReceiver.class).setAction(action).putExtra(ShareActionReceiver.EXTRA_JOB, jobId);
    i.setData(Uri.parse("descall-share://" + action + "/" + ShareStore.safe(jobId)));
    return PendingIntent.getBroadcast(ctx, idFor(jobId) + action.hashCode(), i, flags());
  }

  static PendingIntent details(Context ctx, String jobId) {
    Intent i = new Intent(ctx, DescallShareActivity.class).putExtra(DescallShareActivity.EXTRA_JOB_ID, jobId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    i.setData(Uri.parse("descall-share://job/" + ShareStore.safe(jobId)));
    return PendingIntent.getActivity(ctx, idFor(jobId), i, flags());
  }

  /** descall:// route of a conversation (src/lib/share/shareModel.js deepLinkFor). */
  public static String deepLink(JSONObject t) {
    if (t == null) return "descall://open";
    String kind = t.optString("kind");
    String conv = t.optString("conv");
    String id = conv.contains(":") ? conv.substring(conv.indexOf(':') + 1) : "";
    if ("dm".equals(kind)) {
      String u = t.optString("username", "");
      return u.isEmpty() || "null".equals(u) ? "descall://friends" : "descall://dm/" + Uri.encode(u);
    }
    if ("group".equals(kind)) return "descall://group/" + Uri.encode(id);
    if ("channel".equals(kind)) return "descall://server/" + Uri.encode(t.optString("serverId")) + "/" + Uri.encode(id);
    return "descall://open";
  }

  static PendingIntent openChat(Context ctx, String jobId, JSONObject target) {
    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink(target))).setClass(ctx, DescallShortcutActivity.class)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    return PendingIntent.getActivity(ctx, idFor(jobId) + 7, i, flags());
  }

  static String names(JSONArray targets, int max) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    for (int i = 0; i < targets.length(); i++) {
      JSONObject t = targets.optJSONObject(i);
      if (t == null) continue;
      String st = t.optString("status");
      if (!"sent".equals(st) && !"scheduled".equals(st)) continue;
      if (n == max) {
        sb.append("…");
        break;
      }
      if (n > 0) sb.append(", ");
      sb.append("channel".equals(t.optString("kind")) ? "#" : "").append(t.optString("name"));
      n++;
    }
    return sb.toString();
  }

  static String reason(Context ctx, String code) {
    int id;
    switch (code == null ? "" : code) {
      case "offline": id = R.string.share_reason_offline; break;
      case "upload_failed": id = R.string.share_reason_upload_failed; break;
      case "signed_out": case "unauthorized": id = R.string.share_reason_signed_out; break;
      case "cancelled": id = R.string.share_reason_cancelled; break;
      case "too_large": id = R.string.share_reason_too_large; break;
      case "type": id = R.string.share_reason_type; break;
      case "no_permission": case "announcement": case "timed_out": case "not_friends": case "blocked": id = R.string.share_reason_no_permission; break;
      case "slowmode": id = R.string.share_reason_slowmode; break;
      case "rate_limited": id = R.string.share_reason_rate_limited; break;
      case "timeout": id = R.string.share_reason_timeout; break;
      default: id = R.string.share_reason_failed;
    }
    return ctx.getString(id);
  }

  static NotificationCompat.Builder base(Context ctx, String jobId) {
    ensureChannel(ctx);
    return new NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_share)
      .setColor(0xFF587AF5)
      .setSubText(ctx.getString(R.string.share_title))
      .setContentIntent(details(ctx, jobId))
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setOnlyAlertOnce(true);
  }

  static void post(Context ctx, String jobId, NotificationCompat.Builder b) {
    try {
      NotificationManagerCompat.from(ctx).notify(idFor(jobId), b.build());
    } catch (SecurityException ignored) {
      // POST_NOTIFICATIONS not granted: the share still goes
    }
  }

  public static void cancel(Context ctx, String jobId) {
    NotificationManagerCompat.from(ctx).cancel(idFor(jobId));
  }

  public static void show(Context ctx, ShareJob job, JSONObject record) {
    String id = job.id();
    ShareJob.Summary s = job.summarize(System.currentTimeMillis());
    android.content.res.Resources r = ctx.getResources();
    String items = r.getQuantityString(R.plurals.share_items, Math.max(1, s.itemCount), Math.max(1, s.itemCount));
    String chats = r.getQuantityString(R.plurals.share_chats, s.targetCount, s.targetCount);
    NotificationCompat.Builder b = base(ctx, id);
    if ("draft".equals(record.optString("state"))) {
      b.setContentTitle(ctx.getString(R.string.share_notif_draft, chats, items))
        .setSilent(true)
        .addAction(0, ctx.getString(R.string.share_notif_sendDraft), action(ctx, ShareActionReceiver.ACTION_SEND_DRAFT, id));
      post(ctx, id, b);
      return;
    }
    switch (s.phase) {
      case "sending": {
        if (record.optBoolean("hidden")) return;
        String sizes = android.text.format.Formatter.formatShortFileSize(ctx, s.sentBytes) + " / " + android.text.format.Formatter.formatShortFileSize(ctx, s.totalBytes);
        b.setContentTitle(r.getQuantityString(R.plurals.share_notif_sending, s.targetCount, s.targetCount))
          .setContentText(items + " · " + sizes + " · %" + s.percent)
          .setProgress(100, s.percent, s.totalBytes == 0)
          .setOngoing(true)
          .setSilent(true)
          .addAction(0, ctx.getString(R.string.share_notif_stop), action(ctx, ShareActionReceiver.ACTION_CANCEL, id))
          .addAction(0, ctx.getString(R.string.share_hide), action(ctx, ShareActionReceiver.ACTION_HIDE, id));
        break;
      }
      case "waiting":
        b.setContentTitle(r.getQuantityString(R.plurals.share_notif_sending, s.targetCount, s.targetCount))
          .setContentText(ctx.getString(R.string.share_notif_waiting))
          .setProgress(100, s.percent, false)
          .setSilent(true)
          .addAction(0, ctx.getString(R.string.share_notif_retry), action(ctx, ShareActionReceiver.ACTION_RETRY_NOW, id))
          .addAction(0, ctx.getString(R.string.share_notif_stop), action(ctx, ShareActionReceiver.ACTION_CANCEL, id));
        break;
      case "sent":
      case "scheduled": {
        JSONObject first = job.targets().optJSONObject(0);
        b.setContentTitle(ctx.getString("scheduled".equals(s.phase) ? R.string.share_scheduled_title : R.string.share_notif_sent))
          .setContentText(names(job.targets(), 3) + " · " + items)
          .setCategory(NotificationCompat.CATEGORY_STATUS)
          .setAutoCancel(true);
        if (s.undoLeft > 0) {
          b.addAction(0, ctx.getString(R.string.share_notif_undo, s.undoLeft), action(ctx, ShareActionReceiver.ACTION_UNDO, id));
          b.setSilent(s.undoLeft < ShareJob.UNDO_SECONDS);
        }
        b.addAction(0, ctx.getString(R.string.share_notif_openChat), openChat(ctx, id, first));
        break;
      }
      case "partial":
      case "failed": {
        String bad = "";
        JSONArray ts = job.targets();
        for (int i = 0; i < ts.length(); i++) {
          JSONObject t = ts.optJSONObject(i);
          if (t != null && ("failed".equals(t.optString("status")) || "partial".equals(t.optString("status")))) {
            bad = ("channel".equals(t.optString("kind")) ? "#" : "") + t.optString("name") + " · " + reason(ctx, t.optString("reason"));
            break;
          }
        }
        int n = Math.max(1, s.failedItems);
        b.setContentTitle("failed".equals(s.phase) ? ctx.getString(R.string.share_failed_hero) : r.getQuantityString(R.plurals.share_notif_failedItems, n, n))
          .setContentText(bad)
          .setCategory(NotificationCompat.CATEGORY_ERROR)
          .addAction(0, ctx.getString(R.string.share_notif_retry), action(ctx, ShareActionReceiver.ACTION_RETRY, id))
          .addAction(0, ctx.getString(R.string.share_notif_details), details(ctx, id));
        break;
      }
      case "undone":
        b.setContentTitle(ctx.getString(R.string.share_undone_hero)).setTimeoutAfter(6000).setAutoCancel(true);
        break;
      default:
        cancel(ctx, id);
        return;
    }
    post(ctx, id, b);
  }
}
