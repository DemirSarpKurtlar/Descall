package com.descall.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Everything the widgets remember between refreshes, in this app's private preferences:
 * the last snapshot (shown at once, with its time, while a refresh runs or when offline),
 * the last failure, the favorite faces (per signed-in user, shared by every friends widget),
 * per-widget options, the waves sent and the running call.
 * No secrets here: the session lives in WidgetSessionStore.
 */
public final class WidgetStore {
  private static final String PREFS = "descall_widgets";
  private static final String K_SNAPSHOT = "snapshot";
  private static final String K_STATE = "state";
  private static final String K_STATE_AT = "state_at";
  private static final String K_FAVORITES = "favorites_";
  private static final String K_PREVIEWS = "previews";
  private static final String K_CALL = "call";
  private static final String K_WIDGET = "widget_";
  private static final String K_WAVES = "waves";
  public static final int MAX_FAVORITES = 8;

  /** Theme of one widget. */
  public static final int THEME_DARK = 0;
  public static final int THEME_DYNAMIC = 1;
  public static final int THEME_LIGHT = 2;

  /** Why the last refresh did not bring new data (shown with the cached data's time). */
  public static final String STATE_OK = "ok";
  public static final String STATE_OFFLINE = "offline";
  public static final String STATE_ERROR = "error";
  public static final String STATE_SIGNED_OUT = "signed_out";
  public static final String STATE_LOADING = "loading";

  private static final Object LOCK = new Object();

  private WidgetStore() {}

  static SharedPreferences prefs(Context c) {
    return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  // ---- snapshot ------------------------------------------------------------------------------

  public static WidgetModels.Snapshot snapshot(Context c) {
    String raw = prefs(c).getString(K_SNAPSHOT, null);
    if (raw == null) return null;
    try {
      return WidgetModels.Snapshot.fromCache(new JSONObject(raw));
    } catch (Exception e) {
      return null;
    }
  }

  public static void saveSnapshot(Context c, WidgetModels.Snapshot s) {
    try {
      prefs(c).edit().putString(K_SNAPSHOT, s.toJson().toString()).putString(K_STATE, STATE_OK)
        .putLong(K_STATE_AT, System.currentTimeMillis()).apply();
    } catch (Exception ignored) {
      // a snapshot that cannot be written is shown once and fetched again next time
    }
  }

  public static String state(Context c) {
    return prefs(c).getString(K_STATE, STATE_LOADING);
  }

  public static void setState(Context c, String state) {
    prefs(c).edit().putString(K_STATE, state).putLong(K_STATE_AT, System.currentTimeMillis()).apply();
  }

  /** Sign-out: data, call and waves go; widget options (theme) stay. */
  public static void clearAccountData(Context c) {
    SharedPreferences p = prefs(c);
    SharedPreferences.Editor e = p.edit().remove(K_SNAPSHOT).remove(K_PREVIEWS).remove(K_CALL).remove(K_WAVES)
      .putString(K_STATE, STATE_SIGNED_OUT);
    e.apply();
  }

  // ---- favorites (per user) --------------------------------------------------------------------

  public static List<String> favorites(Context c, String userId) {
    List<String> out = new ArrayList<>();
    if (userId == null || userId.isEmpty()) return out;
    try {
      JSONArray arr = new JSONArray(prefs(c).getString(K_FAVORITES + userId, "[]"));
      for (int i = 0; i < arr.length() && out.size() < MAX_FAVORITES; i++) {
        String id = arr.optString(i, "");
        if (WidgetModels.ID.matcher(id).matches() && !out.contains(id)) out.add(id);
      }
    } catch (Exception ignored) {
      // empty list
    }
    return out;
  }

  public static void setFavorites(Context c, String userId, List<String> ids) {
    if (userId == null || userId.isEmpty()) return;
    JSONArray arr = new JSONArray();
    for (String id : ids) {
      if (arr.length() >= MAX_FAVORITES) break;
      if (WidgetModels.ID.matcher(id).matches()) arr.put(id);
    }
    prefs(c).edit().putString(K_FAVORITES + userId, arr.toString()).apply();
  }

  /** Friends that are gone (unfriended, deleted) leave the favorites by themselves. */
  public static void pruneFavorites(Context c, String userId, WidgetModels.Snapshot s) {
    if (s == null || s.friends.isEmpty()) return;
    List<String> fav = favorites(c, userId);
    List<String> kept = new ArrayList<>();
    for (String id : fav) if (s.friend(id) != null) kept.add(id);
    if (kept.size() != fav.size()) setFavorites(c, userId, kept);
  }

  // ---- per widget ---------------------------------------------------------------------------

  public static final class Options {
    public int theme = THEME_DARK;
    public boolean showActivity = true;
    public boolean waveButton = true;
    /** Voice widget: only these servers (empty = all). */
    public final List<String> servers = new ArrayList<>();
  }

  public static Options options(Context c, int widgetId) {
    Options o = new Options();
    try {
      JSONObject j = new JSONObject(prefs(c).getString(K_WIDGET + widgetId, "{}"));
      int theme = j.optInt("theme", THEME_DARK);
      o.theme = theme == THEME_DYNAMIC || theme == THEME_LIGHT ? theme : THEME_DARK;
      o.showActivity = j.optBoolean("activity", true);
      o.waveButton = j.optBoolean("wave", true);
      JSONArray s = j.optJSONArray("servers");
      for (int i = 0; s != null && i < s.length() && o.servers.size() < 50; i++) {
        String id = s.optString(i, "");
        if (WidgetModels.ID.matcher(id).matches()) o.servers.add(id);
      }
    } catch (Exception ignored) {
      // defaults
    }
    return o;
  }

  public static void setOptions(Context c, int widgetId, Options o) {
    try {
      JSONArray s = new JSONArray();
      for (String id : o.servers) s.put(id);
      JSONObject j = new JSONObject().put("theme", o.theme).put("activity", o.showActivity).put("wave", o.waveButton).put("servers", s);
      prefs(c).edit().putString(K_WIDGET + widgetId, j.toString()).commit();
    } catch (Exception ignored) {
      // keep the old options
    }
  }

  public static void deleteOptions(Context c, int widgetId) {
    prefs(c).edit().remove(K_WIDGET + widgetId).apply();
  }

  // ---- the running call ----------------------------------------------------------------------

  public static WidgetModels.CallState call(Context c) {
    try {
      String raw = prefs(c).getString(K_CALL, null);
      if (raw == null) return WidgetModels.CallState.idle();
      JSONObject j = new JSONObject(raw);
      WidgetModels.CallState s = WidgetModels.CallState.parse(j, System.currentTimeMillis());
      if (s.active) s.startedAt = j.optLong("startedAt", s.startedAt);
      return s;
    } catch (Exception e) {
      return WidgetModels.CallState.idle();
    }
  }

  public static void setCall(Context c, WidgetModels.CallState s) {
    try {
      prefs(c).edit().putString(K_CALL, s.toJson().toString()).commit();
    } catch (Exception ignored) {
      // the next report from the app writes it again
    }
  }

  // ---- waves (backend lib/friendWave.js limits: 5 per friend and 20 in all per 24 hours) -------

  public static final int WAVES_PER_FRIEND = 5;
  public static final int WAVES_PER_DAY = 20;
  static final long DAY_MS = 24L * 60 * 60 * 1000;
  /** After a wave the hand shows a check for this long (the backend allows one a minute). */
  public static final long WAVED_MS = 60L * 60 * 1000;

  /** friend id -> wave times of the last 24 hours (oldest first). */
  public static Map<String, List<Long>> waves(Context c) {
    Map<String, List<Long>> out = new HashMap<>();
    long from = System.currentTimeMillis() - DAY_MS;
    try {
      JSONObject j = new JSONObject(prefs(c).getString(K_WAVES, "{}"));
      Iterator<String> keys = j.keys();
      while (keys.hasNext()) {
        String k = keys.next();
        JSONArray arr = j.optJSONArray(k);
        List<Long> times = new ArrayList<>();
        for (int i = 0; arr != null && i < arr.length(); i++) {
          long at = arr.optLong(i, 0L);
          if (at > from) times.add(at);
        }
        if (!times.isEmpty()) out.put(k, times);
      }
    } catch (Exception ignored) {
      // none
    }
    return out;
  }

  public static void recordWave(Context c, String friendId) {
    synchronized (LOCK) {
      Map<String, List<Long>> all = waves(c);
      List<Long> list = all.get(friendId);
      if (list == null) {
        list = new ArrayList<>();
        all.put(friendId, list);
      }
      list.add(System.currentTimeMillis());
      JSONObject j = new JSONObject();
      try {
        for (Map.Entry<String, List<Long>> e : all.entrySet()) j.put(e.getKey(), new JSONArray(e.getValue()));
      } catch (Exception ignored) {
        return;
      }
      prefs(c).edit().putString(K_WAVES, j.toString()).apply();
    }
  }

  public static int wavesTotal(Map<String, List<Long>> waves) {
    int n = 0;
    for (List<Long> l : waves.values()) n += l.size();
    return n;
  }

  /** The hand of one friend: 0 = can wave, 1 = just waved / friend limit (check), 2 = hidden. */
  public static int waveState(Map<String, List<Long>> waves, String friendId, long now) {
    List<Long> mine = waves.get(friendId);
    if (mine != null && !mine.isEmpty()) {
      if (now - mine.get(mine.size() - 1) < WAVED_MS || mine.size() >= WAVES_PER_FRIEND) return 1;
    }
    return wavesTotal(waves) >= WAVES_PER_DAY ? 2 : 0;
  }

  static long dayStart(long now) {
    java.util.Calendar cal = java.util.Calendar.getInstance();
    cal.setTimeInMillis(now);
    cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
    cal.set(java.util.Calendar.MINUTE, 0);
    cal.set(java.util.Calendar.SECOND, 0);
    cal.set(java.util.Calendar.MILLISECOND, 0);
    return cal.getTimeInMillis();
  }
}
