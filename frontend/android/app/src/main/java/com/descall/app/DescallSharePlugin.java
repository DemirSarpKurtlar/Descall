package com.descall.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;

import androidx.core.content.pm.ShortcutManagerCompat;

import com.descall.app.share.ShareActionReceiver;
import com.descall.app.share.ShareBus;
import com.descall.app.share.ShareJob;
import com.descall.app.share.ShareMedia;
import com.descall.app.share.ShareNotifier;
import com.descall.app.share.ShareShortcuts;
import com.descall.app.share.ShareStore;
import com.descall.app.share.ShareWorker;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Paylaş > Descall" on Android (JS: src/lib/share/shareHost.js, name DescallShare). Lives in
 * DescallShareActivity: hands the shared items to the share page (copied into app storage,
 * thumbnails, exact size per quality), starts the job in DescallShareWorker, forwards its
 * snapshots ("job" events), and runs undo / retry / draft / remove. Direct Share targets come
 * from the page's recent chats (ShareShortcuts).
 */
@CapacitorPlugin(name = "DescallShare")
public class DescallSharePlugin extends Plugin {
  static final int MAX_ITEMS = 10;
  private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"']+", Pattern.CASE_INSENSITIVE);

  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private JSObject payload;
  private String payloadId;
  private final JSONObject files = new JSONObject();
  private final ShareBus.Listener listener = (job, fin) -> {
    try {
      JSObject ev = new JSObject();
      ev.put("job", JSObject.fromJSONObject(job));
      ev.put("final", fin);
      main.post(() -> notifyListeners("job", ev));
    } catch (JSONException ignored) {
      // a snapshot that does not parse is skipped; the next one follows
    }
  };

  @Override
  public void load() {
    ShareBus.add(listener);
    worker.execute(() -> ShareStore.prune(getContext(), System.currentTimeMillis()));
  }

  @Override
  protected void handleOnDestroy() {
    ShareBus.remove(listener);
    worker.shutdown();
    super.handleOnDestroy();
  }

  private void resolveOnMain(PluginCall call, JSObject data) {
    main.post(() -> {
      if (data != null) call.resolve(data);
      else call.resolve();
    });
  }

  // ---- payload --------------------------------------------------------------------------

  static String sourceLabel(Activity a) {
    try {
      Uri ref = Build.VERSION.SDK_INT >= 22 ? a.getReferrer() : null;
      if (ref == null || !"android-app".equals(ref.getScheme())) return null;
      String pkg = ref.getHost();
      if (pkg == null || pkg.equals(a.getPackageName())) return null;
      PackageManager pm = a.getPackageManager();
      ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
      CharSequence label = pm.getApplicationLabel(info);
      return label == null ? null : label.toString();
    } catch (Exception e) {
      return null;
    }
  }

  static List<Uri> streams(Intent in) {
    List<Uri> out = new ArrayList<>();
    if (in == null) return out;
    if (Intent.ACTION_SEND_MULTIPLE.equals(in.getAction())) {
      ArrayList<Parcelable> list = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (list != null) for (Parcelable p : list) if (p instanceof Uri) out.add((Uri) p);
    } else if (Intent.ACTION_SEND.equals(in.getAction())) {
      Parcelable p = in.getParcelableExtra(Intent.EXTRA_STREAM);
      if (p instanceof Uri) out.add((Uri) p);
    }
    ClipData clip = in.getClipData();
    if (clip != null) {
      for (int i = 0; i < clip.getItemCount(); i++) {
        Uri u = clip.getItemAt(i).getUri();
        if (u != null && !out.contains(u)) out.add(u);
      }
    }
    // Never our own private files (a crafted intent could point at the session).
    List<Uri> safe = new ArrayList<>();
    for (Uri u : out) {
      String s = u.getScheme();
      if ("content".equals(s)) safe.add(u);
    }
    return safe;
  }

  @PluginMethod
  public void getPayload(PluginCall call) {
    if (payload != null) {
      call.resolve(payload);
      return;
    }
    final Activity activity = getActivity();
    final Intent in = activity == null ? null : activity.getIntent();
    final Context ctx = getContext();
    worker.execute(() -> {
      JSObject res = new JSObject();
      JSArray items = new JSArray();
      payloadId = "p" + Long.toString(System.currentTimeMillis(), 36) + UUID.randomUUID().toString().substring(0, 6);
      ContentResolver cr = ctx.getContentResolver();
      List<Uri> uris = streams(in);
      int n = 0;
      for (Uri u : uris) {
        if (n >= MAX_ITEMS + 2) break;
        try {
          String name = ShareMedia.nameOf(cr, u);
          String mime = ShareMedia.mimeOf(cr, u, name);
          File dst = new File(ShareStore.inbox(ctx, payloadId), n + "-" + ShareStore.safe(name));
          if (!ShareMedia.copy(cr, u, dst)) continue;
          String kind = ShareMedia.kindOf(mime);
          String id = "a" + n;
          JSObject it = new JSObject();
          it.put("id", id);
          it.put("kind", kind);
          it.put("mime", mime);
          it.put("name", name);
          it.put("size", dst.length());
          JSObject est = new JSObject();
          est.put("original", "image".equals(kind) ? ShareMedia.imageBytes(dst, mime, "original") : dst.length());
          if ("image".equals(kind)) {
            est.put("high", ShareMedia.imageBytes(dst, mime, "high"));
            est.put("saver", ShareMedia.imageBytes(dst, mime, "saver"));
          }
          it.put("estimates", est);
          String thumb = ShareMedia.thumb(dst, kind);
          if (thumb != null) it.put("thumb", thumb);
          if ("video".equals(kind)) {
            it.put("durationMs", ShareMedia.videoDurationMs(dst));
            if (ShareMedia.unsupportedVideo(mime)) it.put("unsupported", true);
          }
          files.put(id, new JSONObject().put("path", dst.getPath()).put("mime", mime).put("name", name));
          items.put(it);
          n++;
        } catch (Exception | OutOfMemoryError ignored) {
          // one unreadable item is left out; the rest go
        }
      }
      String text = in == null ? null : in.getStringExtra(Intent.EXTRA_TEXT);
      String subject = in == null ? null : in.getStringExtra(Intent.EXTRA_SUBJECT);
      if (text != null && !text.trim().isEmpty()) {
        Matcher m = URL.matcher(text);
        if (m.find()) {
          String url = m.group().replaceAll("[),.;!?]+$", "");
          JSObject link = new JSObject();
          link.put("id", "l0");
          link.put("kind", "link");
          link.put("url", url);
          if (subject != null && !subject.trim().isEmpty()) link.put("title", subject.trim());
          items.put(link);
          String rest = text.replace(m.group(), "").trim();
          if (!rest.isEmpty() && (subject == null || !rest.equals(subject.trim()))) {
            JSObject t = new JSObject();
            t.put("id", "t0");
            t.put("kind", "text");
            t.put("text", rest.length() > 2000 ? rest.substring(0, 2000) : rest);
            items.put(t);
          }
        } else {
          JSObject t = new JSObject();
          t.put("id", "t0");
          t.put("kind", "text");
          t.put("text", text.length() > 2000 ? text.substring(0, 2000) : text);
          items.put(t);
        }
      }
      res.put("items", items);
      String label = activity == null ? null : sourceLabel(activity);
      if (label != null) res.put("sourceLabel", label);
      String shortcut = in == null ? null : in.getStringExtra(ShortcutManagerCompat.EXTRA_SHORTCUT_ID);
      String preset = ShareShortcuts.convOf(shortcut);
      if (preset != null) res.put("preset", preset);
      String jobId = in == null ? null : in.getStringExtra(DescallShareActivity.EXTRA_JOB_ID);
      if (jobId != null) {
        JSONObject rec = ShareStore.load(ctx, jobId);
        if (rec != null && rec.optJSONObject("job") != null) {
          try {
            res.put("job", JSObject.fromJSONObject(rec.optJSONObject("job")));
          } catch (JSONException ignored) {
            // shown as a fresh sheet
          }
        }
      }
      payload = res;
      resolveOnMain(call, res);
    });
  }

  // ---- job ------------------------------------------------------------------------------

  @PluginMethod
  public void start(PluginCall call) {
    final JSObject job = call.getObject("job");
    final String apiBase = call.getString("apiBase", "");
    final String token = call.getString("token", "");
    if (job == null || job.getString("id") == null) {
      call.reject("Invalid job");
      return;
    }
    final Context ctx = getContext();
    worker.execute(() -> {
      try {
        String id = job.getString("id");
        JSONObject rec = new JSONObject();
        rec.put("job", new JSONObject(job.toString()));
        rec.put("apiBase", apiBase);
        rec.put("token", token);
        rec.put("payloadId", payloadId == null ? "" : payloadId);
        rec.put("files", new JSONObject(files.toString()));
        rec.put("state", "running");
        ShareStore.save(ctx, id, rec);
        ShareNotifier.show(ctx, new ShareJob(rec.getJSONObject("job")), rec);
        ShareWorker.enqueue(ctx, id);
        JSObject out = new JSObject();
        out.put("id", id);
        resolveOnMain(call, out);
      } catch (Exception e) {
        main.post(() -> call.reject("Could not start"));
      }
    });
  }

  private void withJob(PluginCall call, JobAction action) {
    final String id = call.getString("id");
    if (id == null) {
      call.reject("Missing id");
      return;
    }
    final Context ctx = getContext();
    worker.execute(() -> {
      JSObject out = new JSObject();
      try {
        JSONObject r = action.run(ctx, id);
        if (r != null && r.has("job")) {
          out.put("job", JSObject.fromJSONObject(r.getJSONObject("job")));
          out.put("failed", r.optInt("failed", 0));
        } else if (r != null) {
          out.put("job", JSObject.fromJSONObject(r));
        }
      } catch (Exception ignored) {
        // resolved without a job: the page keeps its last snapshot
      }
      resolveOnMain(call, out);
    });
  }

  interface JobAction {
    JSONObject run(Context ctx, String id) throws Exception;
  }

  @PluginMethod public void cancel(PluginCall call) { withJob(call, ShareActionReceiver::cancel); }
  @PluginMethod public void undo(PluginCall call) { withJob(call, ShareActionReceiver::undo); }
  @PluginMethod public void retry(PluginCall call) { withJob(call, ShareActionReceiver::retry); }
  @PluginMethod public void dropFailed(PluginCall call) { withJob(call, ShareActionReceiver::dropFailed); }
  @PluginMethod public void retryNow(PluginCall call) { withJob(call, (c, id) -> { ShareActionReceiver.retryNow(c, id); return null; }); }
  @PluginMethod public void saveDraft(PluginCall call) { withJob(call, (c, id) -> { ShareActionReceiver.saveDraft(c, id); return null; }); }
  @PluginMethod public void remove(PluginCall call) { withJob(call, (c, id) -> { ShareActionReceiver.remove(c, id); return null; }); }

  @PluginMethod
  public void finish(PluginCall call) {
    call.resolve();
    Activity a = getActivity();
    if (a != null) a.runOnUiThread(a::finish);
  }

  @PluginMethod
  public void openApp(PluginCall call) {
    String url = call.getString("url", "descall://open");
    if (url == null || !url.startsWith("descall://")) url = "descall://open";
    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setClass(getContext(), DescallShortcutActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
    Activity a = getActivity();
    if (a != null) a.runOnUiThread(a::finish);
  }

  @PluginMethod
  public void publishDirectShare(PluginCall call) {
    final JSArray targets = call.getArray("targets", new JSArray());
    final Context ctx = getContext().getApplicationContext();
    worker.execute(() -> {
      try {
        ShareShortcuts.publish(ctx, new JSONArray(targets.toString()));
      } catch (JSONException | RuntimeException ignored) {
        // Direct Share is a nicety
      }
      resolveOnMain(call, null);
    });
  }
}
