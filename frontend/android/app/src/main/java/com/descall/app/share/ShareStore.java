package com.descall.app.share;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * App-private files of the share target ("files/share"): the shared originals copied out of
 * the sending app while its URI grant is valid (inbox/), and one record per job (jobs/<id>.json:
 * the job snapshot, the API origin and the session token the worker sends with). Same sandbox
 * as the WebView's own session storage; nothing here is logged. Records go once the job is
 * finished and its undo window is over (prune()).
 */
public final class ShareStore {
  private static final Object LOCK = new Object();
  private static final long KEEP_FINISHED_MS = 24L * 60 * 60 * 1000;
  private static final long KEEP_DRAFT_MS = 14L * 24 * 60 * 60 * 1000;

  private ShareStore() {}

  public static File root(Context ctx) {
    File d = new File(ctx.getFilesDir(), "share");
    if (!d.exists()) d.mkdirs();
    return d;
  }

  public static File inbox(Context ctx, String payloadId) {
    File d = new File(new File(root(ctx), "inbox"), safe(payloadId));
    if (!d.exists()) d.mkdirs();
    return d;
  }

  public static File work(Context ctx, String jobId) {
    File d = new File(new File(root(ctx), "work"), safe(jobId));
    if (!d.exists()) d.mkdirs();
    return d;
  }

  public static String safe(String s) {
    String v = String.valueOf(s).replaceAll("[^A-Za-z0-9_-]", "");
    return v.isEmpty() ? "x" : (v.length() > 80 ? v.substring(0, 80) : v);
  }

  private static File jobFile(Context ctx, String id) {
    File d = new File(root(ctx), "jobs");
    if (!d.exists()) d.mkdirs();
    return new File(d, safe(id) + ".json");
  }

  /** { job, apiBase, token, files: { itemId: { path, mime, name, kind } }, state, cancel, hidden } */
  public static JSONObject load(Context ctx, String id) {
    synchronized (LOCK) {
      File f = jobFile(ctx, id);
      if (!f.exists()) return null;
      try (InputStream in = new FileInputStream(f)) {
        byte[] buf = new byte[(int) Math.min(f.length(), 4 * 1024 * 1024)];
        int off = 0;
        int n;
        while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
        return new JSONObject(new String(buf, 0, off, StandardCharsets.UTF_8));
      } catch (IOException | JSONException e) {
        return null;
      }
    }
  }

  public static void save(Context ctx, String id, JSONObject record) {
    synchronized (LOCK) {
      File f = jobFile(ctx, id);
      File tmp = new File(f.getPath() + ".tmp");
      try (FileOutputStream out = new FileOutputStream(tmp)) {
        out.write(record.toString().getBytes(StandardCharsets.UTF_8));
        out.getFD().sync();
      } catch (IOException e) {
        return;
      }
      if (!tmp.renameTo(f)) {
        f.delete();
        tmp.renameTo(f);
      }
    }
  }

  public static void delete(Context ctx, String id) {
    synchronized (LOCK) {
      JSONObject rec = load(ctx, id);
      jobFile(ctx, id).delete();
      deleteTree(new File(new File(root(ctx), "work"), safe(id)));
      if (rec != null) {
        String payload = rec.optString("payloadId", "");
        if (!payload.isEmpty()) deleteTree(new File(new File(root(ctx), "inbox"), safe(payload)));
      }
    }
  }

  public static List<String> ids(Context ctx) {
    List<String> out = new ArrayList<>();
    File[] list = new File(root(ctx), "jobs").listFiles();
    if (list == null) return out;
    for (File f : list) {
      String n = f.getName();
      if (n.endsWith(".json")) out.add(n.substring(0, n.length() - 5));
    }
    return out;
  }

  /** Drops finished jobs after a day, drafts after two weeks, and inboxes nobody uses. */
  public static void prune(Context ctx, long now) {
    List<String> keepInbox = new ArrayList<>();
    for (String id : ids(ctx)) {
      JSONObject rec = load(ctx, id);
      if (rec == null) {
        jobFile(ctx, id).delete();
        continue;
      }
      JSONObject job = rec.optJSONObject("job");
      long finished = job == null || job.isNull("finishedAt") ? 0 : job.optLong("finishedAt", 0);
      long created = job == null ? 0 : job.optLong("createdAt", 0);
      boolean draft = "draft".equals(rec.optString("state"));
      if ((finished > 0 && now - finished > KEEP_FINISHED_MS) || (draft && now - created > KEEP_DRAFT_MS)) {
        delete(ctx, id);
      } else {
        keepInbox.add(safe(rec.optString("payloadId", "")));
      }
    }
    File[] inboxes = new File(root(ctx), "inbox").listFiles();
    if (inboxes == null) return;
    for (File d : inboxes) {
      if (keepInbox.contains(d.getName())) continue;
      if (now - d.lastModified() > 6L * 60 * 60 * 1000) deleteTree(d);
    }
  }

  static void deleteTree(File f) {
    if (f == null || !f.exists()) return;
    File[] kids = f.listFiles();
    if (kids != null) for (File k : kids) deleteTree(k);
    f.delete();
  }
}
