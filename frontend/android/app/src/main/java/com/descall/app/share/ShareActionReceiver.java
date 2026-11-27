package com.descall.app.share;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Share notification buttons and the share page's controls end up here (ShareActions):
 * Durdur, Gizle, Geri al, Tekrar dene, Şimdi tekrar dene, Taslak gönder; plus remove from
 * the queue and "skip what failed". Network work runs off the main thread (goAsync).
 */
public class ShareActionReceiver extends BroadcastReceiver {
  public static final String EXTRA_JOB = "com.descall.app.share.JOB";
  public static final String ACTION_CANCEL = "com.descall.app.share.CANCEL";
  public static final String ACTION_HIDE = "com.descall.app.share.HIDE";
  public static final String ACTION_UNDO = "com.descall.app.share.UNDO";
  public static final String ACTION_RETRY = "com.descall.app.share.RETRY";
  public static final String ACTION_RETRY_NOW = "com.descall.app.share.RETRY_NOW";
  public static final String ACTION_SEND_DRAFT = "com.descall.app.share.SEND_DRAFT";

  @Override
  public void onReceive(Context context, Intent intent) {
    final String id = intent == null ? null : intent.getStringExtra(EXTRA_JOB);
    final String action = intent == null ? null : intent.getAction();
    if (id == null || action == null) return;
    final Context ctx = context.getApplicationContext();
    final PendingResult pending = goAsync();
    new Thread(() -> {
      try {
        switch (action) {
          case ACTION_CANCEL: cancel(ctx, id); break;
          case ACTION_HIDE: hide(ctx, id); break;
          case ACTION_UNDO: undo(ctx, id); break;
          case ACTION_RETRY: retry(ctx, id); break;
          case ACTION_RETRY_NOW: retryNow(ctx, id); break;
          case ACTION_SEND_DRAFT: sendDraft(ctx, id); break;
          default: break;
        }
      } finally {
        pending.finish();
      }
    }, "descall-share-action").start();
  }

  static void set(JSONObject o, String k, Object v) {
    try {
      o.put(k, v);
    } catch (JSONException ignored) {
      // constant keys
    }
  }

  private static void store(Context ctx, String id, JSONObject rec, ShareJob job, boolean fin) {
    set(rec, "job", job.json);
    ShareStore.save(ctx, id, rec);
    ShareBus.publish(job.json, fin);
    ShareNotifier.show(ctx, job, rec);
  }

  /** Durdur: stops the worker; what already went stays (and can be undone from the sheet). */
  public static JSONObject cancel(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return null;
    set(rec, "cancel", true);
    ShareStore.save(ctx, id, rec);
    ShareWorker.stop(ctx, id);
    ShareJob job = new ShareJob(rec.optJSONObject("job"));
    JSONArray ts = job.targets();
    long now = System.currentTimeMillis();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t != null && !ShareJob.settledStatus(t.optString("status"))) job.targetFailed(t.optString("conv"), "cancelled", now);
    }
    job.finish(now);
    store(ctx, id, rec, job, true);
    return job.json;
  }

  public static void hide(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return;
    set(rec, "hidden", true);
    ShareStore.save(ctx, id, rec);
    ShareNotifier.cancel(ctx, id);
  }

  /** Geri al: removes what this job delivered (POST /share/undo per chat). → { job, failed } */
  public static JSONObject undo(Context ctx, String id) {
    JSONObject out = new JSONObject();
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return out;
    ShareJob job = new ShareJob(rec.optJSONObject("job"));
    ShareHttp http = new ShareHttp(rec.optString("apiBase"), rec.optString("token"));
    int failed = 0;
    JSONArray ts = job.targets();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t == null) continue;
      JSONArray mids = ShareJob.arr(t, "messageIds");
      JSONArray sids = ShareJob.arr(t, "scheduledIds");
      if (mids.length() == 0 && sids.length() == 0) continue;
      JSONObject body = new JSONObject();
      set(body, "conv", t.optString("conv"));
      set(body, "messageIds", mids);
      set(body, "scheduledIds", sids);
      try {
        JSONObject res = http.postJson("/api/native/share/undo", body);
        failed += res.optInt("failed", 0);
      } catch (Exception e) {
        failed += mids.length() + sids.length();
      }
    }
    job.undone();
    store(ctx, id, rec, job, true);
    set(out, "job", job.json);
    set(out, "failed", failed);
    return out;
  }

  /** Tekrar dene: failed parts go back to the queue; what arrived is not sent again. */
  public static JSONObject retry(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return null;
    ShareJob job = new ShareJob(rec.optJSONObject("job"));
    job.retry();
    rec.remove("cancel");
    set(rec, "state", "running");
    set(rec, "hidden", false);
    store(ctx, id, rec, job, false);
    ShareWorker.enqueue(ctx, id);
    return job.json;
  }

  public static void retryNow(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return;
    ShareWorker.enqueue(ctx, id);
  }

  public static JSONObject dropFailed(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return null;
    ShareJob job = new ShareJob(rec.optJSONObject("job"));
    job.dropFailed(System.currentTimeMillis());
    store(ctx, id, rec, job, true);
    return job.json;
  }

  /** Taslak olarak kaydet: kept on the phone, nothing goes until "Gönder" in the notification. */
  public static void saveDraft(Context ctx, String id) {
    JSONObject rec = ShareStore.load(ctx, id);
    if (rec == null) return;
    set(rec, "state", "draft");
    ShareStore.save(ctx, id, rec);
    ShareWorker.stop(ctx, id);
    ShareNotifier.show(ctx, new ShareJob(rec.optJSONObject("job")), rec);
  }

  public static void sendDraft(Context ctx, String id) {
    retry(ctx, id);
  }

  public static void remove(Context ctx, String id) {
    ShareWorker.stop(ctx, id);
    ShareNotifier.cancel(ctx, id);
    ShareStore.delete(ctx, id);
  }
}
