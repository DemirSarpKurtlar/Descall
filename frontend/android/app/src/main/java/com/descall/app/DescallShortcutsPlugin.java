package com.descall.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * 4.2: Android launcher shortcuts (src/lib/nativeIntents.js, JS name DescallShortcuts).
 *
 *  - Static shortcuts (res/xml/shortcuts.xml): Yeni mesaj, Rahatsız etme, Arkadaşlar. They
 *    reach MainActivity through DescallShortcutActivity; this plugin turns the action into a
 *    page action ({ id, type }), queued until the page listens (cold start).
 *  - Recent DMs as dynamic shortcuts (setRecentConversations), with the friend's avatar as an
 *    adaptive icon (letters on the accent colour when there is none), long-lived and with a
 *    Person, so Android 11+ treats them as conversations.
 *  - "Ana ekrana ekle" for one DM (pinConversation, Android 8+ launchers that support it).
 *  - Sign-out (clear): dynamic and long-lived shortcuts go; pinned ones stay (the user put
 *    them there) and open the sign-in screen until the user signs in again.
 * ShortcutManagerCompat is a no-op before Android 7.1, so every method is safe on 7.0.
 * Avatars are fetched off the main thread (https only, 5 s, 1 MB cap); nothing is logged.
 */
@CapacitorPlugin(name = "DescallShortcuts")
public class DescallShortcutsPlugin extends Plugin {
  static final String DM_PREFIX = "dm_";
  static final int STATIC_COUNT = 3;
  private static final int ACCENT = 0xFF587AF5;
  private static final int MAX_AVATAR_BYTES = 1024 * 1024;
  private static final long QUEUE_TTL_MS = 90_000L;
  private static final Pattern ID_RE = Pattern.compile("^[0-9A-Za-z-]{1,64}$");
  private static final Pattern USERNAME_RE = Pattern.compile("^[\\p{L}\\p{N}_.-]{1,64}$");

  private final Object lock = new Object();
  private final List<JSObject> queued = new ArrayList<>();
  private final List<Long> queuedAt = new ArrayList<>();
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private final LruCache<String, Bitmap> avatars = new LruCache<>(24);
  private String lastRecentKey = "";

  // ---- shortcut actions -> page -----------------------------------------------------------

  /** Page action type for a forwarded shortcut action, or null. */
  static String actionType(String action) {
    if (DescallShortcutActivity.ACTION_NEW_MESSAGE.equals(action)) return "newMessage";
    if (DescallShortcutActivity.ACTION_TOGGLE_DND.equals(action)) return "toggleDnd";
    if (DescallShortcutActivity.ACTION_OPEN_FRIENDS.equals(action)) return "openFriends";
    return null;
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    if (intent == null) return;
    String type = actionType(intent.getAction());
    if (type == null) return;
    JSObject action = new JSObject();
    action.put("id", UUID.randomUUID().toString());
    action.put("type", type);
    action.put("payload", new JSObject());
    // Consumed once: a configuration change must not run it again.
    intent.setAction(Intent.ACTION_MAIN);
    if (hasListeners("action")) {
      notifyListeners("action", action);
    } else {
      synchronized (lock) {
        queued.add(action);
        queuedAt.add(System.currentTimeMillis());
      }
    }
  }

  @PluginMethod
  public void takePendingActions(PluginCall call) {
    JSArray out = new JSArray();
    long now = System.currentTimeMillis();
    synchronized (lock) {
      for (int i = 0; i < queued.size(); i++) {
        if (now - queuedAt.get(i) <= QUEUE_TTL_MS) out.put(queued.get(i));
      }
      queued.clear();
      queuedAt.clear();
    }
    JSObject res = new JSObject();
    res.put("actions", out);
    call.resolve(res);
  }

  /** iOS waits for the page's answer; Android shortcuts have nobody waiting. */
  @PluginMethod
  public void completeAction(PluginCall call) {
    call.resolve();
  }

  @PluginMethod
  public void getAvailability(PluginCall call) {
    Context ctx = getContext();
    JSObject res = new JSObject();
    res.put("launcherShortcuts", Build.VERSION.SDK_INT >= 25);
    res.put("pinSupported", ShortcutManagerCompat.isRequestPinShortcutSupported(ctx));
    res.put("maxShortcuts", ShortcutManagerCompat.getMaxShortcutCountPerActivity(ctx));
    call.resolve(res);
  }

  // ---- recent DMs -------------------------------------------------------------------------

  static final class Conversation {
    final String id;
    final String username;
    final String name;
    final String avatarUrl;

    Conversation(String id, String username, String name, String avatarUrl) {
      this.id = id;
      this.username = username;
      this.name = name;
      this.avatarUrl = avatarUrl;
    }
  }

  /** A validated conversation from JS, or null. */
  static Conversation parseConversation(JSONObject o) {
    if (o == null) return null;
    String id = o.optString("id", "");
    String username = o.optString("username", "");
    if (!ID_RE.matcher(id).matches() || !USERNAME_RE.matcher(username).matches()) return null;
    String name = o.optString("name", "").trim();
    if (name.isEmpty()) name = username;
    if (name.length() > 60) name = name.substring(0, 60);
    String avatar = o.optString("avatarUrl", "");
    if (!avatar.startsWith("https://") || avatar.length() > 500) avatar = "";
    return new Conversation(id, username, name, avatar);
  }

  /** How many dynamic shortcuts fit next to the static ones (launchers show about 4-5 in all). */
  static int dynamicSlots(int maxPerActivity, int wanted) {
    return Math.max(0, Math.min(wanted, maxPerActivity - STATIC_COUNT));
  }

  @PluginMethod
  public void setRecentConversations(PluginCall call) {
    JSArray items = call.getArray("items", new JSArray());
    JSObject labels = call.getObject("labels", new JSObject());
    final List<Conversation> list = new ArrayList<>();
    for (int i = 0; i < items.length(); i++) {
      Conversation c = parseConversation(items.optJSONObject(i));
      if (c != null) list.add(c);
    }
    final String openChat = labels.optString("openChat", "{name}");
    final String key = items.toString() + "|" + openChat;
    synchronized (lock) {
      if (key.equals(lastRecentKey)) {
        call.resolve();
        return;
      }
      lastRecentKey = key;
    }
    final Context ctx = getContext().getApplicationContext();
    worker.execute(() -> {
      try {
        int slots = dynamicSlots(ShortcutManagerCompat.getMaxShortcutCountPerActivity(ctx), list.size());
        List<ShortcutInfoCompat> infos = new ArrayList<>();
        for (int i = 0; i < slots; i++) {
          infos.add(buildInfo(ctx, list.get(i), openChat, i));
        }
        ShortcutManagerCompat.setDynamicShortcuts(ctx, infos);
        // 4.3: the replace above drops the Direct Share groups / channels; put them back.
        com.descall.app.share.ShareShortcuts.reapply(ctx);
        resolveOnMain(call, null);
      } catch (RuntimeException e) {
        synchronized (lock) {
          lastRecentKey = "";
        }
        // Rate limited by the launcher, or a launcher without shortcut support.
        resolveOnMain(call, null);
      }
    });
  }

  @PluginMethod
  public void pinConversation(PluginCall call) {
    final Conversation c = parseConversation(call.getData());
    final Context ctx = getContext().getApplicationContext();
    final JSObject res = new JSObject();
    if (c == null) {
      call.reject("Invalid conversation");
      return;
    }
    if (!ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) {
      res.put("supported", false);
      res.put("requested", false);
      call.resolve(res);
      return;
    }
    final String openChat = call.getString("openChat", "{name}");
    worker.execute(() -> {
      boolean requested = false;
      try {
        requested = ShortcutManagerCompat.requestPinShortcut(ctx, buildInfo(ctx, c, openChat, 0), null);
      } catch (RuntimeException ignored) {
        // the launcher refused (background request, policy)
      }
      res.put("supported", true);
      res.put("requested", requested);
      resolveOnMain(call, res);
    });
  }

  @PluginMethod
  public void clear(PluginCall call) {
    final Context ctx = getContext().getApplicationContext();
    synchronized (lock) {
      lastRecentKey = "";
      queued.clear();
      queuedAt.clear();
    }
    worker.execute(() -> {
      try {
        ShortcutManagerCompat.removeAllDynamicShortcuts(ctx);
        List<String> ids = new ArrayList<>();
        for (ShortcutInfoCompat s : ShortcutManagerCompat.getShortcuts(ctx, ShortcutManagerCompat.FLAG_MATCH_CACHED)) {
          if (s.getId().startsWith(DM_PREFIX)) ids.add(s.getId());
        }
        if (!ids.isEmpty()) ShortcutManagerCompat.removeLongLivedShortcuts(ctx, ids);
      } catch (RuntimeException ignored) {
        // nothing published, or the launcher is unavailable
      }
      avatars.evictAll();
      com.descall.app.share.ShareShortcuts.clear(ctx);
      resolveOnMain(call, null);
    });
  }

  private void resolveOnMain(PluginCall call, JSObject data) {
    main.post(() -> {
      if (data != null) call.resolve(data);
      else call.resolve();
    });
  }

  private ShortcutInfoCompat buildInfo(Context ctx, Conversation c, String openChatTemplate, int rank) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("descall://dm/" + Uri.encode(c.username)));
    intent.setClass(ctx, DescallShortcutActivity.class);
    IconCompat icon = IconCompat.createWithAdaptiveBitmap(avatarIcon(ctx, c));
    String longLabel = openChatTemplate.contains("{name}") ? openChatTemplate.replace("{name}", c.name) : c.name;
    if (longLabel.length() > 25) longLabel = c.name;
    Person person = new Person.Builder().setName(c.name).setKey(c.id).setIcon(icon).build();
    return new ShortcutInfoCompat.Builder(ctx, DM_PREFIX + c.id)
      .setShortLabel(c.name.length() > 10 ? c.name.substring(0, 10).trim() : c.name)
      .setLongLabel(longLabel)
      .setIcon(icon)
      .setIntent(intent)
      .setPerson(person)
      .setLongLived(true)
      .setRank(rank)
      // 4.3: the same shortcut is a Direct Share target (share sheet first row).
      .setCategories(com.descall.app.share.ShareShortcuts.categories())
      .build();
  }

  // ---- adaptive avatar icon -----------------------------------------------------------------

  /** 108dp adaptive bitmap: the avatar (or initials) inside the 72dp safe zone on the accent colour. */
  private Bitmap avatarIcon(Context ctx, Conversation c) {
    float density = ctx.getResources().getDisplayMetrics().density;
    int size = Math.max(108, Math.round(108 * density));
    Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(out);
    canvas.drawColor(ACCENT);
    float inner = size * 76f / 108f;
    float inset = (size - inner) / 2f;
    RectF dst = new RectF(inset, inset, inset + inner, inset + inner);
    Bitmap photo = c.avatarUrl.isEmpty() ? null : loadAvatar(c.avatarUrl);
    if (photo != null) {
      int side = Math.min(photo.getWidth(), photo.getHeight());
      Rect src = new Rect((photo.getWidth() - side) / 2, (photo.getHeight() - side) / 2,
        (photo.getWidth() + side) / 2, (photo.getHeight() + side) / 2);
      // Full bleed behind the safe zone too, so no accent ring shows on round masks.
      canvas.drawBitmap(photo, src, new RectF(0, 0, size, size), new Paint(Paint.FILTER_BITMAP_FLAG));
    } else {
      Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
      text.setColor(Color.WHITE);
      text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
      text.setTextAlign(Paint.Align.CENTER);
      text.setTextSize(inner * 0.42f);
      String initials = initials(c.name);
      Paint.FontMetrics fm = text.getFontMetrics();
      float y = dst.centerY() - (fm.ascent + fm.descent) / 2f;
      canvas.drawText(initials, dst.centerX(), y, text);
    }
    return out;
  }

  static String initials(String name) {
    String[] parts = name.trim().replaceAll("^@+", "").split("[\\s._-]+");
    StringBuilder sb = new StringBuilder();
    for (String p : parts) {
      if (p.isEmpty()) continue;
      sb.appendCodePoint(p.codePointAt(0));
      if (sb.codePointCount(0, sb.length()) >= 2) break;
    }
    String out = sb.toString().toUpperCase(new Locale("tr", "TR"));
    return out.isEmpty() ? "?" : out;
  }

  private Bitmap loadAvatar(String url) {
    Bitmap cached = avatars.get(url);
    if (cached != null) return cached;
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) new URL(url).openConnection();
      conn.setConnectTimeout(5000);
      conn.setReadTimeout(5000);
      conn.setInstanceFollowRedirects(true);
      if (conn.getResponseCode() != 200) return null;
      try (InputStream in = conn.getInputStream(); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
        byte[] chunk = new byte[16 * 1024];
        int n;
        while ((n = in.read(chunk)) != -1) {
          buf.write(chunk, 0, n);
          if (buf.size() > MAX_AVATAR_BYTES) return null;
        }
        byte[] bytes = buf.toByteArray();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int sample = 1;
        while (bounds.outWidth / (sample * 2) >= 256 && bounds.outHeight / (sample * 2) >= 256) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        if (bmp != null) avatars.put(url, bmp);
        return bmp;
      }
    } catch (Exception e) {
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  @Override
  protected void handleOnDestroy() {
    worker.shutdown();
    super.handleOnDestroy();
  }
}
