package com.descall.app.widget;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import com.descall.app.CallForegroundService;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Home screen widgets and the call notification, the page's side (JS name DescallWidgets,
 * src/lib/androidWidgets.js + hooks/useAndroidWidgets.js):
 *
 *  - setSession / clearSession: the widgets' own encrypted copy of the session
 *    (WidgetSessionStore), written on sign-in and removed on sign-out;
 *  - requestRefresh: the page saw something change (socket events, at most every 60 s) or
 *    went to the background (at most every 20 s); only when a widget exists. No polling;
 *  - setCallState: the running call (room, who talks, mute) for the call widget and the
 *    ongoing call notification (CallStyle, Android 16 Live Update);
 *  - "action": widget / notification taps for the page (toggleMute, toggleDeafen, leave,
 *    openPath, joinVoice), queued until the page listens (cold start from a widget).
 * The token never comes back out: no method returns it.
 */
@CapacitorPlugin(name = "DescallWidgets")
public class DescallWidgetsPlugin extends Plugin implements CallControlBus.Listener {
  private static final long QUEUE_TTL_MS = 90_000L;
  private static final long CALL_NOTIFY_GAP_MS = 1_000L;
  /** While the app is open the home screen is hidden: socket-driven refreshes stay rare. */
  static final long FOREGROUND_GAP_MS = 60_000L;
  private static volatile boolean alive;

  private final Object lock = new Object();
  private final List<JSObject> queued = new ArrayList<>();
  private final List<Long> queuedAt = new ArrayList<>();
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private boolean refreshScheduled;
  private long lastCallNotify;
  private boolean callNotifyScheduled;

  public static boolean isAlive() {
    return alive;
  }

  @Override
  public void load() {
    super.load();
    alive = true;
    CallControlBus.setListener(this);
  }

  @Override
  protected void handleOnDestroy() {
    alive = false;
    CallControlBus.clearListener(this);
    worker.shutdown();
    super.handleOnDestroy();
  }

  // ---- actions to the page ---------------------------------------------------------------------

  /** Page action for a forwarded widget tap (WidgetLaunchActivity), or null. */
  static JSObject actionFor(Intent intent) {
    if (intent == null || !WidgetIntents.ACTION_APP.equals(intent.getAction())) return null;
    String type = intent.getStringExtra(WidgetIntents.EXTRA_TYPE);
    JSObject payload = new JSObject();
    if ("openPath".equals(type)) {
      String path = intent.getStringExtra(WidgetIntents.EXTRA_PATH);
      if (!WidgetIntents.isAppPath(path)) return null;
      payload.put("path", path);
    } else if ("joinVoice".equals(type)) {
      payload.put("serverId", intent.getStringExtra(WidgetIntents.EXTRA_SERVER_ID));
      payload.put("channelId", intent.getStringExtra(WidgetIntents.EXTRA_CHANNEL_ID));
      payload.put("channelName", intent.getStringExtra(WidgetIntents.EXTRA_CHANNEL_NAME));
      payload.put("type", intent.getStringExtra(WidgetIntents.EXTRA_CHANNEL_TYPE));
    } else {
      return null;
    }
    JSObject action = new JSObject();
    action.put("id", UUID.randomUUID().toString());
    action.put("type", type);
    action.put("payload", payload);
    return action;
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    JSObject action = actionFor(intent);
    if (action == null) return;
    // Consumed once: a configuration change must not run it again.
    intent.setAction(Intent.ACTION_MAIN);
    deliver(action);
  }

  private void deliver(JSObject action) {
    if (hasListeners("action")) {
      notifyListeners("action", action);
    } else {
      synchronized (lock) {
        queued.add(action);
        queuedAt.add(System.currentTimeMillis());
      }
    }
  }

  /** CallControlBus: a widget or notification button for the running call. */
  @Override
  public boolean onCallAction(String type) {
    if (!hasListeners("action")) return false;
    JSObject action = new JSObject();
    action.put("id", UUID.randomUUID().toString());
    action.put("type", type);
    action.put("payload", new JSObject());
    notifyListeners("action", action);
    return true;
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

  /** Nobody waits for the page's answer on Android (iOS App Intents do). */
  @PluginMethod
  public void completeAction(PluginCall call) {
    call.resolve();
  }

  // ---- session ---------------------------------------------------------------------------------

  @PluginMethod
  public void setSession(PluginCall call) {
    final String token = call.getString("token", "");
    final String apiBase = call.getString("apiBase", "");
    final String userId = call.getString("userId", "");
    if (!WidgetSessionStore.isValid(token, userId)) {
      call.reject("Invalid session");
      return;
    }
    final Context c = getContext().getApplicationContext();
    worker.execute(() -> {
      WidgetSessionStore.Session before = WidgetSessionStore.load(c);
      if (before != null && !before.userId.equals(userId)) {
        // Another account: nothing of the previous one may show.
        WidgetStore.clearAccountData(c);
        AvatarCache.clear(c);
      }
      boolean changed = before == null || !before.token.equals(token) || !before.userId.equals(userId)
        || !before.apiBase.equals(WidgetApi.validatedBase(apiBase));
      boolean saved = !changed || WidgetSessionStore.save(c, token, apiBase, userId);
      JSObject res = new JSObject();
      res.put("saved", saved);
      res.put("widgets", WidgetUpdater.count(c));
      main.post(() -> call.resolve(res));
      if (changed && saved && WidgetUpdater.count(c) > 0) {
        WidgetStore.setState(c, WidgetStore.snapshot(c) == null ? WidgetStore.STATE_LOADING : WidgetStore.state(c));
        WidgetRepository.refresh(c, true);
      }
    });
  }

  @PluginMethod
  public void clearSession(PluginCall call) {
    final Context c = getContext().getApplicationContext();
    worker.execute(() -> {
      WidgetRepository.signOut(c);
      main.post(call::resolve);
    });
  }

  // ---- refresh -----------------------------------------------------------------------------

  @PluginMethod
  public void requestRefresh(PluginCall call) {
    final Context c = getContext().getApplicationContext();
    final boolean background = "background".equals(call.getString("reason", ""));
    call.resolve();
    synchronized (lock) {
      if (refreshScheduled && !background) return;
      refreshScheduled = true;
    }
    long gap = background ? WidgetRepository.MIN_GAP_MS : FOREGROUND_GAP_MS;
    long wait = Math.max(0L, WidgetRepository.lastRun() + gap - System.currentTimeMillis());
    main.postDelayed(() -> {
      synchronized (lock) {
        refreshScheduled = false;
      }
      if (worker.isShutdown()) return;
      worker.execute(() -> {
        if (WidgetUpdater.count(c) > 0 && WidgetSessionStore.hasSession(c)) WidgetRepository.refresh(c, false);
      });
    }, wait);
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    final Context c = getContext().getApplicationContext();
    worker.execute(() -> {
      JSObject res = new JSObject();
      JSObject kinds = new JSObject();
      kinds.put("friends", WidgetUpdater.ids(c, FriendsWidgetProvider.class).length);
      kinds.put("unread", WidgetUpdater.ids(c, UnreadWidgetProvider.class).length);
      kinds.put("voice", WidgetUpdater.ids(c, VoiceWidgetProvider.class).length);
      kinds.put("call", WidgetUpdater.ids(c, CallWidgetProvider.class).length);
      res.put("widgets", WidgetUpdater.count(c));
      res.put("kinds", kinds);
      res.put("signedIn", WidgetSessionStore.hasSession(c));
      res.put("state", WidgetStore.state(c));
      WidgetModels.Snapshot s = WidgetStore.snapshot(c);
      res.put("updatedAt", s == null ? 0L : s.savedAt);
      res.put("dynamicColor", WidgetTheme.dynamicAvailable());
      main.post(() -> call.resolve(res));
    });
  }

  // ---- the running call ----------------------------------------------------------------------

  @PluginMethod
  public void setCallState(PluginCall call) {
    final Context c = getContext().getApplicationContext();
    final JSONObject data = call.getData();
    call.resolve();
    worker.execute(() -> {
      WidgetModels.CallState before = WidgetStore.call(c);
      WidgetModels.CallState next = WidgetModels.CallState.parse(data, System.currentTimeMillis());
      // Keep the start time of the same call (the page may not know it after a reload).
      if (next.active && before.active && next.startedAt > before.startedAt
        && next.channelId.equals(before.channelId) && next.title.equals(before.title)) {
        next.startedAt = before.startedAt;
      }
      WidgetStore.setCall(c, next);
      WidgetUpdater.updateCallSurfaces(c);
      scheduleCallNotification(c);
      if (next.active) {
        List<String> urls = new ArrayList<>();
        if (next.speaker != null) urls.add(next.speaker.avatarUrl);
        if (next.me != null) urls.add(next.me.avatarUrl);
        for (WidgetModels.Person p : next.participants) urls.add(p.avatarUrl);
        int before2 = WidgetRepository.cachedCount(c, urls);
        AvatarCache.prefetch(c, urls);
        if (WidgetRepository.cachedCount(c, urls) != before2) {
          WidgetUpdater.updateCallSurfaces(c);
          scheduleCallNotification(c);
        }
      }
    });
  }

  /** The notification follows the speaker, at most once a second (Android drops faster updates). */
  private void scheduleCallNotification(Context c) {
    synchronized (lock) {
      if (callNotifyScheduled) return;
      long wait = Math.max(0L, lastCallNotify + CALL_NOTIFY_GAP_MS - System.currentTimeMillis());
      callNotifyScheduled = true;
      main.postDelayed(() -> {
        synchronized (lock) {
          callNotifyScheduled = false;
          lastCallNotify = System.currentTimeMillis();
        }
        CallForegroundService.refreshNotification(c);
      }, wait);
    }
  }
}
