package com.descall.app.share;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;

import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.descall.app.DescallShortcutActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Direct Share (sharing shortcuts, res/xml/shortcuts.xml <share-target>): the recent chats the
 * share page last saw are long-lived dynamic shortcuts in the share category, so the Android
 * share sheet shows them in its first row and a tap opens DescallShareActivity with that chat
 * already picked. DM shortcuts of DescallShortcutsPlugin carry the same category (one shortcut
 * serves the launcher and the share sheet); groups and channels are added here as "sh_*".
 */
public final class ShareShortcuts {
  public static final String CATEGORY = "com.descall.app.category.SHARE_TARGET";
  public static final String PREFIX = "sh_";
  private static final String PREFS = "descall_share_shortcuts";
  private static final int ACCENT = 0xFF587AF5;
  private static final int MAX = 4;

  private ShareShortcuts() {}

  public static Set<String> categories() {
    return Collections.singleton(CATEGORY);
  }

  /** Conversation of a shortcut id: dm_<id> (launcher DM shortcut) or sh_<type>_<id>. */
  public static String convOf(String shortcutId) {
    if (shortcutId == null) return null;
    if (shortcutId.startsWith("dm_")) return "dm:" + shortcutId.substring(3);
    if (shortcutId.startsWith(PREFIX)) {
      String rest = shortcutId.substring(PREFIX.length());
      int u = rest.indexOf('_');
      if (u > 0) {
        String type = rest.substring(0, u);
        if ("dm".equals(type) || "group".equals(type) || "channel".equals(type)) return type + ":" + rest.substring(u + 1);
      }
    }
    return null;
  }

  /** targets: [{ conv, kind, name, username, serverId }] from the share page (recents first). */
  public static void publish(Context ctx, JSONArray targets) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("targets", targets.toString()).apply();
    reapply(ctx);
  }

  /** Called again after DescallShortcutsPlugin replaces the dynamic shortcuts. */
  public static void reapply(Context ctx) {
    SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    JSONArray targets;
    try {
      targets = new JSONArray(p.getString("targets", "[]"));
    } catch (Exception e) {
      return;
    }
    List<ShortcutInfoCompat> list = new ArrayList<>();
    for (int i = 0; i < targets.length() && list.size() < MAX; i++) {
      JSONObject t = targets.optJSONObject(i);
      if (t == null) continue;
      String conv = t.optString("conv");
      if (!conv.matches("^(dm|group|channel):[0-9A-Za-z-]{1,64}$")) continue;
      String name = t.optString("name", "").trim();
      if (name.isEmpty()) continue;
      if (name.length() > 40) name = name.substring(0, 40);
      String id = PREFIX + conv.replace(':', '_');
      String label = "channel".equals(t.optString("kind")) ? "#" + name : name;
      IconCompat icon = IconCompat.createWithAdaptiveBitmap(letterIcon(ctx, label, "group".equals(t.optString("kind"))));
      Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(ShareNotifier.deepLink(t))).setClass(ctx, DescallShortcutActivity.class);
      ShortcutInfoCompat.Builder b = new ShortcutInfoCompat.Builder(ctx, id)
        .setShortLabel(label.length() > 10 ? label.substring(0, 10).trim() : label)
        .setLongLabel(label)
        .setIcon(icon)
        .setIntent(open)
        .setLongLived(true)
        .setRank(i)
        .setCategories(categories());
      if ("dm".equals(t.optString("kind"))) {
        b.setPerson(new Person.Builder().setName(name).setKey(conv.substring(3)).setIcon(icon).build());
      } else {
        b.setIsConversation();
      }
      list.add(b.build());
    }
    for (ShortcutInfoCompat s : list) {
      try {
        ShortcutManagerCompat.pushDynamicShortcut(ctx, s);
      } catch (RuntimeException ignored) {
        // rate limited or a launcher without shortcut support
      }
    }
  }

  public static void clear(Context ctx) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    try {
      List<String> ids = new ArrayList<>();
      for (ShortcutInfoCompat s : ShortcutManagerCompat.getDynamicShortcuts(ctx)) if (s.getId().startsWith(PREFIX)) ids.add(s.getId());
      if (!ids.isEmpty()) {
        ShortcutManagerCompat.removeDynamicShortcuts(ctx, ids);
        ShortcutManagerCompat.removeLongLivedShortcuts(ctx, ids);
      }
    } catch (RuntimeException ignored) {
      // nothing published
    }
  }

  static Bitmap letterIcon(Context ctx, String name, boolean group) {
    float density = ctx.getResources().getDisplayMetrics().density;
    int size = Math.max(108, Math.round(108 * density));
    Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(out);
    canvas.drawColor(ACCENT);
    Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    text.setColor(Color.WHITE);
    text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
    text.setTextAlign(Paint.Align.CENTER);
    text.setTextSize(size * 0.3f);
    String letters = name.replaceAll("^[#@]+", "").trim();
    letters = letters.isEmpty() ? "?" : new String(Character.toChars(letters.codePointAt(0))).toUpperCase(new Locale("tr", "TR"));
    Paint.FontMetrics fm = text.getFontMetrics();
    canvas.drawText(group ? letters + "+" : letters, size / 2f, size / 2f - (fm.ascent + fm.descent) / 2f, text);
    return out;
  }
}
