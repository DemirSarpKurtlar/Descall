package com.descall.app.share;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * "Paylaş > Descall" send job: the same JSON shape and state machine as
 * src/lib/share/shareModel.js (createJob / reduceJob / summarizeJob), so the share page can
 * draw a snapshot from the worker exactly like one from its own engine. Mutates in place.
 */
public final class ShareJob {
  public static final int UNDO_SECONDS = 10;

  public final JSONObject json;

  public ShareJob(JSONObject json) {
    this.json = json;
  }

  public String id() { return json.optString("id", ""); }
  public JSONArray items() { return arr(json, "items"); }
  public JSONArray targets() { return arr(json, "targets"); }
  public String text() { return json.optString("text", ""); }
  public boolean silent() { return json.optBoolean("silent", false); }
  public long sendAt() { return json.isNull("sendAt") ? 0L : json.optLong("sendAt", 0L); }
  public String quality() { return json.optString("quality", "high"); }
  public boolean stripLocation() { return json.optBoolean("stripLocation", true); }

  static JSONArray arr(JSONObject o, String k) {
    JSONArray a = o.optJSONArray(k);
    if (a == null) {
      a = new JSONArray();
      put(o, k, a);
    }
    return a;
  }

  static void put(JSONObject o, String k, Object v) {
    try {
      o.put(k, v == null ? JSONObject.NULL : v);
    } catch (JSONException ignored) {
      // keys are constants
    }
  }

  static boolean has(JSONArray a, int v) {
    for (int i = 0; i < a.length(); i++) if (a.optInt(i, Integer.MIN_VALUE) == v) return true;
    return false;
  }

  static void remove(JSONArray a, int v) {
    for (int i = a.length() - 1; i >= 0; i--) if (a.optInt(i, Integer.MIN_VALUE) == v) a.remove(i);
  }

  public JSONObject item(int index) {
    JSONArray a = items();
    for (int i = 0; i < a.length(); i++) {
      JSONObject it = a.optJSONObject(i);
      if (it != null && it.optInt("index", -99) == index) return it;
    }
    return null;
  }

  public JSONObject target(String conv) {
    JSONArray a = targets();
    for (int i = 0; i < a.length(); i++) {
      JSONObject t = a.optJSONObject(i);
      if (t != null && conv.equals(t.optString("conv"))) return t;
    }
    return null;
  }

  static boolean settledStatus(String s) {
    return "sent".equals(s) || "scheduled".equals(s) || "failed".equals(s) || "partial".equals(s);
  }

  // ---- events (shareModel.reduceJob) ------------------------------------------------------

  public void start(long at) {
    put(json, "status", "running");
    put(json, "offline", false);
    if (json.isNull("startedAt") || json.optLong("startedAt", 0) == 0) put(json, "startedAt", at);
  }

  public void offline() {
    put(json, "offline", true);
    if (!"cancelled".equals(json.optString("status"))) put(json, "status", "waiting");
  }

  public void online() {
    put(json, "offline", false);
    if ("waiting".equals(json.optString("status"))) put(json, "status", "running");
  }

  public void upload(int index, long sent, long total) {
    JSONObject it = item(index);
    if (it == null || "uploaded".equals(it.optString("status"))) return;
    put(it, "status", "uploading");
    if (total > 0) put(it, "bytes", total);
    put(it, "sentBytes", Math.max(0, total > 0 ? Math.min(total, sent) : sent));
  }

  public void uploaded(int index, JSONObject res) {
    JSONObject it = item(index);
    if (it == null) return;
    put(it, "status", "uploaded");
    put(it, "url", res.optString("url", null));
    long size = res.optLong("size", 0);
    if (size > 0) put(it, "bytes", size);
    put(it, "sentBytes", it.optLong("bytes", 0));
    put(it, "error", null);
    JSONObject up = new JSONObject();
    put(up, "mediaType", res.optString("mediaType", null));
    put(up, "mimeType", res.optString("mimeType", null));
    put(up, "size", size > 0 ? size : null);
    put(up, "originalName", res.optString("originalName", null));
    put(it, "upload", up);
  }

  public void uploadFailed(int index, String error) {
    JSONObject it = item(index);
    if (it == null) return;
    put(it, "status", "failed");
    put(it, "error", error == null ? "failed" : error);
  }

  public void targetSending(String conv) {
    JSONObject t = target(conv);
    if (t == null) return;
    String s = t.optString("status");
    if (!"sent".equals(s) && !"scheduled".equals(s)) put(t, "status", "sending");
  }

  /** results: the server answer with indexes already mapped to job item indexes. */
  public void targetResult(String conv, JSONArray results, boolean textSent, long at) {
    JSONObject t = target(conv);
    if (t == null) return;
    if (textSent) put(t, "textSent", true);
    JSONArray sentItems = arr(t, "sentItems");
    JSONArray failedItems = arr(t, "failedItems");
    JSONArray messageIds = arr(t, "messageIds");
    JSONArray scheduledIds = arr(t, "scheduledIds");
    boolean anyOk = false;
    boolean anyFail = false;
    boolean anyScheduled = false;
    for (int i = 0; i < results.length(); i++) {
      JSONObject r = results.optJSONObject(i);
      if (r == null) continue;
      int index = r.optInt("index", -1);
      String st = r.optString("status");
      if ("sent".equals(st) || "scheduled".equals(st)) {
        anyOk = true;
        if ("scheduled".equals(st)) anyScheduled = true;
        if (index >= 0 && !has(sentItems, index)) sentItems.put(index);
        remove(failedItems, index);
        if (!r.isNull("messageId") && r.has("messageId")) messageIds.put(r.optString("messageId"));
        if (!r.isNull("scheduledId") && r.has("scheduledId")) scheduledIds.put(r.optString("scheduledId"));
      } else {
        anyFail = true;
        if (index >= 0 && !has(failedItems, index)) failedItems.put(index);
        put(t, "reason", r.optString("reason", "failed"));
      }
    }
    String status = anyFail ? (anyOk ? "partial" : "failed") : (anyScheduled && sendAt() > 0 ? "scheduled" : "sent");
    put(t, "status", status);
    put(t, "at", at);
  }

  public void targetFailed(String conv, String reason, long at) {
    JSONObject t = target(conv);
    if (t == null) return;
    put(t, "status", arr(t, "sentItems").length() > 0 ? "partial" : "failed");
    put(t, "reason", reason == null ? "failed" : reason);
    put(t, "at", at);
  }

  public void finish(long at) {
    put(json, "finishedAt", at);
    Summary s = summarize(at);
    put(json, "status", s.phase);
    if (("sent".equals(s.phase) || "scheduled".equals(s.phase)) && !json.optBoolean("undone")) {
      put(json, "undoUntil", at + UNDO_SECONDS * 1000L);
    }
  }

  public void cancel(long at) {
    put(json, "status", "cancelled");
    put(json, "finishedAt", at);
  }

  public void undone() {
    put(json, "undone", true);
    put(json, "status", "undone");
    put(json, "undoUntil", null);
  }

  public void retry() {
    put(json, "status", "running");
    put(json, "finishedAt", null);
    put(json, "undoUntil", null);
    JSONArray its = items();
    for (int i = 0; i < its.length(); i++) {
      JSONObject it = its.optJSONObject(i);
      if (it != null && "failed".equals(it.optString("status"))) {
        put(it, "status", "pending");
        put(it, "sentBytes", 0);
        put(it, "error", null);
      }
    }
    JSONArray ts = targets();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t == null) continue;
      String s = t.optString("status");
      if (!"sent".equals(s) && !"scheduled".equals(s)) {
        put(t, "status", "queued");
        put(t, "reason", null);
      }
    }
  }

  public void dropFailed(long at) {
    JSONArray its = items();
    for (int i = 0; i < its.length(); i++) {
      JSONObject it = its.optJSONObject(i);
      if (it != null && "failed".equals(it.optString("status"))) put(it, "status", "dropped");
    }
    JSONArray ts = targets();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t != null && "partial".equals(t.optString("status")) && arr(t, "sentItems").length() > 0) {
        put(t, "failedItems", new JSONArray());
        put(t, "status", "sent");
      }
    }
    finish(at);
  }

  /** Item indexes this target still needs (not sent, not dropped). */
  public int[] pendingFor(String conv) {
    JSONObject t = target(conv);
    if (t == null) return new int[0];
    JSONArray sent = arr(t, "sentItems");
    JSONArray its = items();
    int[] tmp = new int[its.length()];
    int n = 0;
    for (int i = 0; i < its.length(); i++) {
      JSONObject it = its.optJSONObject(i);
      if (it == null || "dropped".equals(it.optString("status"))) continue;
      int idx = it.optInt("index");
      if (!has(sent, idx)) tmp[n++] = idx;
    }
    int[] out = new int[n];
    System.arraycopy(tmp, 0, out, 0, n);
    return out;
  }

  // ---- summary (shareModel.summarizeJob) --------------------------------------------------

  public static final class Summary {
    public String phase;
    public int percent;
    public long totalBytes;
    public long sentBytes;
    public int itemCount;
    public int targetCount;
    public int done;
    public int failedTargets;
    public int partialTargets;
    public int failedItems;
    public int undoLeft;
  }

  public Summary summarize(long now) {
    Summary s = new Summary();
    JSONArray its = items();
    JSONArray ts = targets();
    int uploaded = 0;
    for (int i = 0; i < its.length(); i++) {
      JSONObject it = its.optJSONObject(i);
      if (it == null || "dropped".equals(it.optString("status"))) continue;
      long b = it.optLong("bytes", 0);
      s.totalBytes += b;
      s.sentBytes += Math.min(b, it.optLong("sentBytes", 0));
      s.itemCount++;
      if ("uploaded".equals(it.optString("status"))) uploaded++;
    }
    boolean settled = true;
    boolean allScheduled = ts.length() > 0;
    Set<Integer> failedSet = new HashSet<>();
    for (int i = 0; i < ts.length(); i++) {
      JSONObject t = ts.optJSONObject(i);
      if (t == null) continue;
      String st = t.optString("status");
      if ("sent".equals(st) || "scheduled".equals(st)) s.done++;
      if ("failed".equals(st)) s.failedTargets++;
      if ("partial".equals(st)) s.partialTargets++;
      if (!settledStatus(st)) settled = false;
      if (!"scheduled".equals(st)) allScheduled = false;
      JSONArray f = arr(t, "failedItems");
      for (int k = 0; k < f.length(); k++) failedSet.add(f.optInt(k));
    }
    s.targetCount = ts.length();
    s.failedItems = failedSet.size();
    double up = s.totalBytes > 0 ? (double) s.sentBytes / s.totalBytes : (s.itemCount > 0 ? (double) uploaded / s.itemCount : 1);
    double send = s.targetCount > 0 ? (double) (s.done + s.failedTargets + s.partialTargets) / s.targetCount : 1;
    int p = (int) Math.round((s.itemCount > 0 ? up * 0.8 + send * 0.2 : send) * 100);
    if (!settled) p = Math.min(p, 99);
    s.percent = Math.max(0, Math.min(100, p));
    String status = json.optString("status");
    if ("cancelled".equals(status)) s.phase = "cancelled";
    else if (json.optBoolean("undone")) s.phase = "undone";
    else if (!settled) s.phase = json.optBoolean("offline") || "waiting".equals(status) ? "waiting" : "sending";
    else if (s.failedTargets == s.targetCount) s.phase = "failed";
    else if (s.failedTargets > 0 || s.partialTargets > 0) s.phase = "partial";
    else if (allScheduled) s.phase = "scheduled";
    else s.phase = "sent";
    long undoUntil = json.isNull("undoUntil") ? 0 : json.optLong("undoUntil", 0);
    s.undoLeft = undoUntil > 0 ? (int) Math.max(0, Math.ceil((undoUntil - now) / 1000.0)) : 0;
    return s;
  }

  /** clientId for one send: stable per job, target and item set (POST /share/send is idempotent). */
  public String clientIdFor(int targetIndex, int[] indexes) {
    StringBuilder set = new StringBuilder();
    for (int i = 0; i < indexes.length; i++) {
      if (i > 0) set.append('_');
      set.append(indexes[i]);
    }
    String raw = id() + "-" + targetIndex + "-" + (indexes.length == 0 ? "t" : set.toString());
    String clean = raw.replaceAll("[^A-Za-z0-9_-]", "");
    return clean.length() > 80 ? clean.substring(0, 80) : clean;
  }
}
