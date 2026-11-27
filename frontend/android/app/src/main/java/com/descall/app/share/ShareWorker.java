package com.descall.app.share;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * Runs one share job in the background (WorkManager, network constraint): the Android twin of
 * src/lib/share/shareEngine.js. Every attachment is prepared (quality, location) and uploaded
 * once, then each chat gets one POST /api/native/share/send with a stable clientId (so a retry
 * after a lost answer never sends twice). Offline: the job is saved as "waiting" and WorkManager
 * runs it again when the network is back. Each step is saved and published to an open share
 * page (ShareBus) and to the notification.
 */
public class ShareWorker extends Worker {
  public static final String KEY_JOB = "jobId";

  public ShareWorker(@NonNull Context context, @NonNull WorkerParameters params) {
    super(context, params);
  }

  public static String workName(String jobId) {
    return "descall-share-" + ShareStore.safe(jobId);
  }

  public static void enqueue(Context ctx, String jobId) {
    OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(ShareWorker.class)
      .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
      .setInputData(new Data.Builder().putString(KEY_JOB, jobId).build())
      .addTag("descall-share")
      .build();
    WorkManager.getInstance(ctx).enqueueUniqueWork(workName(jobId), ExistingWorkPolicy.REPLACE, req);
  }

  public static void stop(Context ctx, String jobId) {
    WorkManager.getInstance(ctx).cancelUniqueWork(workName(jobId));
  }

  private Context ctx;
  private String id;
  private JSONObject record;
  private ShareJob job;
  private long lastPublish;

  private void save(boolean fin) {
    JSONObject latest = ShareStore.load(ctx, id);
    // A notification action (undo, draft, remove) wins over this run.
    if (latest == null) return;
    try {
      record.put("job", job.json);
      if (latest.optBoolean("cancel")) record.put("cancel", true);
      record.put("hidden", latest.optBoolean("hidden"));
      record.put("state", latest.optString("state", "running"));
    } catch (JSONException ignored) {
      // constant keys
    }
    ShareStore.save(ctx, id, record);
    ShareBus.publish(job.json, fin);
    ShareNotifier.show(ctx, job, record);
  }

  private void tick() {
    long now = System.currentTimeMillis();
    if (now - lastPublish < 400) return;
    lastPublish = now;
    save(false);
  }

  private boolean stopRequested() {
    if (isStopped()) return true;
    JSONObject latest = ShareStore.load(ctx, id);
    return latest == null || latest.optBoolean("cancel") || "draft".equals(latest.optString("state"));
  }

  private static boolean retryableHttp(ShareHttp.HttpError e) {
    return e.status == 429 || e.status >= 500;
  }

  @NonNull
  @Override
  public Result doWork() {
    ctx = getApplicationContext();
    id = getInputData().getString(KEY_JOB);
    if (id == null) return Result.success();
    record = ShareStore.load(ctx, id);
    if (record == null || record.optJSONObject("job") == null) return Result.success();
    if ("draft".equals(record.optString("state"))) return Result.success();
    job = new ShareJob(record.optJSONObject("job"));
    ShareHttp http = new ShareHttp(record.optString("apiBase"), record.optString("token"));
    JSONObject files = record.optJSONObject("files");
    if (files == null) files = new JSONObject();

    job.start(System.currentTimeMillis());
    save(false);

    // 1) Uploads.
    JSONArray items = job.items();
    for (int i = 0; i < items.length(); i++) {
      JSONObject it = items.optJSONObject(i);
      if (it == null) continue;
      String st = it.optString("status");
      if ("uploaded".equals(st) || "dropped".equals(st) || "failed".equals(st)) continue;
      if (stopRequested()) return finishCancelled();
      final int index = it.optInt("index");
      JSONObject src = files.optJSONObject(it.optString("id"));
      if (src == null || !new File(src.optString("path")).exists()) {
        job.uploadFailed(index, "attachment_unavailable");
        save(false);
        continue;
      }
      JSONObject prepared;
      try {
        prepared = ShareMedia.prepare(ctx, id, index, new File(src.optString("path")), src.optString("mime"), src.optString("name"), job.quality(), job.stripLocation());
      } catch (IOException | RuntimeException | OutOfMemoryError e) {
        job.uploadFailed(index, "upload_failed");
        save(false);
        continue;
      }
      final File f = new File(prepared.optString("file"));
      int attempt = 0;
      while (true) {
        try {
          JSONObject res = http.upload(f, prepared.optString("name"), prepared.optString("mime"), (sent, total) -> {
            job.upload(index, sent, total);
            tick();
          });
          job.uploaded(index, res);
          save(false);
          break;
        } catch (ShareHttp.HttpError e) {
          if (e.status == 401) return finishAll("signed_out");
          attempt++;
          if (retryableHttp(e) && attempt < 3) {
            sleep(1000L * attempt);
            continue;
          }
          job.uploadFailed(index, e.code);
          save(false);
          break;
        } catch (IOException e) {
          if (stopRequested()) return finishCancelled();
          return waitForNetwork();
        }
      }
    }

    // 2) One send per chat.
    JSONArray targets = job.targets();
    for (int ti = 0; ti < targets.length(); ti++) {
      JSONObject t = targets.optJSONObject(ti);
      if (t == null) continue;
      String st = t.optString("status");
      if ("sent".equals(st) || "scheduled".equals(st)) continue;
      if (stopRequested()) return finishCancelled();
      String conv = t.optString("conv");
      int[] pending = job.pendingFor(conv);
      JSONArray ready = new JSONArray();
      JSONArray broken = new JSONArray();
      for (int idx : pending) {
        JSONObject it = job.item(idx);
        if (it != null && "uploaded".equals(it.optString("status"))) ready.put(idx);
        else broken.put(idx);
      }
      boolean firstSend = ShareJob.arr(t, "sentItems").length() == 0 && !t.optBoolean("textSent");
      String text = firstSend ? job.text() : "";
      if (ready.length() == 0 && text.isEmpty()) {
        JSONArray results = new JSONArray();
        for (int k = 0; k < broken.length(); k++) results.put(result(broken.optInt(k), "failed", job.item(broken.optInt(k))));
        job.targetResult(conv, results, false, System.currentTimeMillis());
        save(false);
        continue;
      }
      job.targetSending(conv);
      save(false);
      int[] readyIdx = new int[ready.length()];
      JSONArray bodyItems = new JSONArray();
      for (int k = 0; k < ready.length(); k++) {
        readyIdx[k] = ready.optInt(k);
        JSONObject it = job.item(readyIdx[k]);
        JSONObject up = it.optJSONObject("upload");
        JSONObject bi = new JSONObject();
        try {
          bi.put("url", it.optString("url"));
          String kind = it.optString("kind");
          bi.put("mediaType", up != null && !up.isNull("mediaType") ? up.optString("mediaType") : ("image".equals(kind) ? "image" : "video".equals(kind) ? "video" : "file"));
          bi.put("mimeType", up == null ? JSONObject.NULL : up.opt("mimeType"));
          bi.put("size", it.optLong("bytes", 0));
          bi.put("originalName", up != null && !up.isNull("originalName") ? up.optString("originalName") : it.optString("name"));
        } catch (JSONException ignored) {
          // constant keys
        }
        bodyItems.put(bi);
      }
      JSONObject body = new JSONObject();
      try {
        body.put("clientId", job.clientIdFor(ti, readyIdx));
        body.put("conv", conv);
        body.put("text", text);
        body.put("items", bodyItems);
        body.put("silent", job.silent());
        if (job.sendAt() > 0) body.put("sendAt", iso(job.sendAt()));
      } catch (JSONException ignored) {
        // constant keys
      }
      int attempt = 0;
      while (true) {
        try {
          JSONObject res = http.postJson("/api/native/share/send", body);
          JSONArray rs = res.optJSONArray("results");
          JSONArray mapped = new JSONArray();
          boolean ok = false;
          if (rs != null) {
            for (int k = 0; k < rs.length(); k++) {
              JSONObject r = rs.optJSONObject(k);
              if (r == null) continue;
              int ix = r.optInt("index", -1);
              JSONObject m = new JSONObject(r.toString());
              m.put("index", ix >= 0 && ix < readyIdx.length ? readyIdx[ix] : -1);
              mapped.put(m);
              String rst = r.optString("status");
              if ("sent".equals(rst) || "scheduled".equals(rst)) ok = true;
            }
          }
          for (int k = 0; k < broken.length(); k++) mapped.put(result(broken.optInt(k), "failed", job.item(broken.optInt(k))));
          job.targetResult(conv, mapped, !text.isEmpty() && ok, System.currentTimeMillis());
          save(false);
          break;
        } catch (ShareHttp.HttpError e) {
          if (e.status == 401) return finishAll("signed_out");
          attempt++;
          if (retryableHttp(e) && attempt < 3) {
            sleep(1200L * attempt);
            continue;
          }
          job.targetFailed(conv, e.code, System.currentTimeMillis());
          save(false);
          break;
        } catch (IOException e) {
          if (stopRequested()) return finishCancelled();
          return waitForNetwork();
        } catch (JSONException e) {
          job.targetFailed(conv, "failed", System.currentTimeMillis());
          save(false);
          break;
        }
      }
    }

    job.finish(System.currentTimeMillis());
    save(true);
    countdown();
    return Result.success();
  }

  private static JSONObject result(int index, String status, JSONObject item) {
    JSONObject r = new JSONObject();
    try {
      r.put("index", index);
      r.put("status", status);
      r.put("reason", item == null || item.isNull("error") ? "upload_failed" : item.optString("error", "upload_failed"));
    } catch (JSONException ignored) {
      // constant keys
    }
    return r;
  }

  static String iso(long ms) {
    java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT);
    f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    return f.format(new java.util.Date(ms));
  }

  private static void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  /** Lost the network mid-way: keep the job, show "waiting", run again when it is back. */
  private Result waitForNetwork() {
    job.offline();
    save(false);
    return Result.retry();
  }

  private Result finishAll(String reason) {
    JSONArray ts = job.targets();
    long now = System.currentTimeMillis();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t != null && !ShareJob.settledStatus(t.optString("status"))) job.targetFailed(t.optString("conv"), reason, now);
    }
    job.finish(now);
    save(true);
    return Result.success();
  }

  private Result finishCancelled() {
    JSONObject latest = ShareStore.load(ctx, id);
    if (latest == null || "draft".equals(latest.optString("state"))) return Result.success();
    return finishAll("cancelled");
  }

  /** Counts the undo window down in the notification, then leaves "Gönderildi · Sohbeti aç". */
  private void countdown() {
    for (int i = 0; i < ShareJob.UNDO_SECONDS; i++) {
      if (isStopped()) return;
      JSONObject latest = ShareStore.load(ctx, id);
      if (latest == null || latest.optJSONObject("job") == null || latest.optJSONObject("job").optBoolean("undone")) return;
      ShareJob.Summary s = job.summarize(System.currentTimeMillis());
      if (s.undoLeft <= 0) break;
      if (s.undoLeft % 2 == 0 || s.undoLeft <= 3) ShareNotifier.show(ctx, job, latest);
      sleep(1000);
    }
    JSONObject latest = ShareStore.load(ctx, id);
    if (latest != null && latest.optJSONObject("job") != null && !latest.optJSONObject("job").optBoolean("undone")) {
      ShareNotifier.show(ctx, new ShareJob(latest.optJSONObject("job")), latest);
    }
    ShareStore.prune(ctx, System.currentTimeMillis());
  }
}
