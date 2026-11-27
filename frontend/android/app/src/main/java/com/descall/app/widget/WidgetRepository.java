package com.descall.app.widget;

import android.content.Context;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * One refresh: /api/native/summary (?activity=1&previews=1: the activity line and the message
 * bubbles) and /api/native/friends?activity=1, avatars for the faces on screen, then every
 * widget is drawn again. Failures keep the last data and say so (offline / error with its
 * time); a 401 or a ban signs the widgets out and drops the stored session.
 */
public final class WidgetRepository {
  static final String CLIENT = "android-widget";
  static final String SUMMARY = "/api/native/summary?activity=1&previews=1";
  static final String FRIENDS = "/api/native/friends?activity=1";
  /** Refreshes closer together than this are skipped (the app may ask on every socket event). */
  static final long MIN_GAP_MS = 20_000L;
  /** Data older than this is fetched again when a widget is drawn by the system. */
  static final long OLD_MS = 15L * 60 * 1000;

  private static final Object LOCK = new Object();
  private static long lastRun;

  private WidgetRepository() {}

  public static boolean isOld(Context c) {
    WidgetModels.Snapshot s = WidgetStore.snapshot(c);
    return s == null || System.currentTimeMillis() - s.savedAt > OLD_MS;
  }

  public static long lastRun() {
    return lastRun;
  }

  /** Blocking; call off the main thread. force skips the minimum gap (a user tap). */
  public static void refresh(Context c, boolean force) {
    synchronized (LOCK) {
      long now = System.currentTimeMillis();
      if (!force && now - lastRun < MIN_GAP_MS) return;
      lastRun = now;
      endStaleCall(c);
      WidgetSessionStore.Session session = WidgetSessionStore.load(c);
      if (session == null) {
        signOut(c);
        return;
      }
      WidgetApi api = new WidgetApi(session, CLIENT);
      JSONObject summary;
      try {
        summary = api.get(SUMMARY);
      } catch (WidgetApi.ApiException e) {
        fail(c, e.failure);
        return;
      }
      JSONObject friends = null;
      try {
        friends = api.get(FRIENDS);
      } catch (WidgetApi.ApiException e) {
        if (e.failure == WidgetApi.Failure.UNAUTHORIZED || e.failure == WidgetApi.Failure.BANNED) {
          fail(c, e.failure);
          return;
        }
        // the summary alone still has online friends
      }
      WidgetModels.Snapshot snap = WidgetModels.fromApi(summary, friends, null, System.currentTimeMillis());
      if (!snap.meId.isEmpty() && !snap.meId.equals(session.userId)) {
        // A token of another account than the one stored: never show its data.
        signOut(c);
        return;
      }
      WidgetStore.saveSnapshot(c, snap);
      WidgetStore.pruneFavorites(c, session.userId, snap);
      WidgetUpdater.updateAll(c);
      List<String> urls = avatarUrls(snap, WidgetStore.favorites(c, session.userId), WidgetStore.call(c));
      int before = cachedCount(c, urls);
      AvatarCache.prefetch(c, urls);
      if (cachedCount(c, urls) != before) WidgetUpdater.updateAll(c);
    }
  }

  static void fail(Context c, WidgetApi.Failure failure) {
    switch (failure) {
      case UNAUTHORIZED:
      case BANNED:
      case SIGNED_OUT:
        signOut(c);
        return;
      case OFFLINE:
      case TIMEOUT:
        WidgetStore.setState(c, WidgetStore.STATE_OFFLINE);
        break;
      default:
        WidgetStore.setState(c, WidgetStore.STATE_ERROR);
        break;
    }
    WidgetUpdater.updateAll(c);
  }

  /** Sign-out (from the app, a revoked token or a ban): no account data stays behind. */
  public static void signOut(Context c) {
    WidgetSessionStore.clear(c);
    WidgetStore.clearAccountData(c);
    AvatarCache.clear(c);
    WidgetUpdater.updateAll(c);
  }

  /** The app died during a call (no service, no page): the call surfaces go idle. */
  static void endStaleCall(Context c) {
    WidgetModels.CallState call = WidgetStore.call(c);
    if (call.active && !com.descall.app.CallForegroundService.isRunning() && !DescallWidgetsPlugin.isAlive()) {
      WidgetStore.setCall(c, WidgetModels.CallState.idle());
    }
  }

  /** The faces the widgets can show, most visible first. */
  static List<String> avatarUrls(WidgetModels.Snapshot s, List<String> favorites, WidgetModels.CallState call) {
    Set<String> out = new LinkedHashSet<>();
    for (WidgetModels.Friend f : WidgetModels.faces(s, favorites, 8, false)) out.add(f.avatarUrl);
    for (WidgetModels.UnreadRow r : s.unread) out.add(r.avatarUrl);
    for (WidgetModels.VoiceRoom r : s.voice) for (WidgetModels.Person p : r.occupants) out.add(p.avatarUrl);
    if (call.active) {
      if (call.me != null) out.add(call.me.avatarUrl);
      if (call.speaker != null) out.add(call.speaker.avatarUrl);
      for (WidgetModels.Person p : call.participants) out.add(p.avatarUrl);
    }
    out.add(s.meAvatarUrl);
    List<String> list = new ArrayList<>();
    for (String u : out) if (u != null && u.startsWith("https://")) list.add(u);
    return list;
  }

  static int cachedCount(Context c, List<String> urls) {
    int n = 0;
    for (String u : urls) if (AvatarCache.fileFor(c, u).exists()) n++;
    return n;
  }
}
