package com.descall.app.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import com.descall.app.R;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Taps that do not open the app (not exported; only our own PendingIntents reach it):
 * refresh, wave at a friend (POST /api/native/wave, the backend's friend / daily limits),
 * and mute / sound / leave for the running call (CallControlBus).
 */
public class WidgetActionReceiver extends BroadcastReceiver {
  private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || intent.getAction() == null) return;
    final Context c = context.getApplicationContext();
    final String action = intent.getAction();
    final String friendId = intent.getStringExtra(WidgetIntents.EXTRA_FRIEND_ID);
    final String friendName = intent.getStringExtra(WidgetIntents.EXTRA_FRIEND_NAME);
    final PendingResult pending = goAsync();
    WORK.execute(() -> {
      try {
        switch (action) {
          case WidgetIntents.ACTION_REFRESH:
            WidgetRepository.refresh(c, true);
            break;
          case WidgetIntents.ACTION_WAVE:
            wave(c, friendId, friendName);
            break;
          case WidgetIntents.ACTION_CALL_MUTE:
            CallControlBus.dispatch(c, "toggleMute");
            break;
          case WidgetIntents.ACTION_CALL_DEAFEN:
            CallControlBus.dispatch(c, "toggleDeafen");
            break;
          case WidgetIntents.ACTION_CALL_LEAVE:
            CallControlBus.dispatch(c, "leave");
            break;
          default:
            break;
        }
      } catch (RuntimeException ignored) {
        // a tap must never crash the app process
      } finally {
        pending.finish();
      }
    });
  }

  static void wave(Context c, String friendId, String friendName) {
    if (friendId == null || !WidgetIntents.ID.matcher(friendId).matches()) return;
    String name = friendName == null || friendName.trim().isEmpty() ? "?" : friendName.trim();
    WidgetSessionStore.Session session = WidgetSessionStore.load(c);
    if (session == null) {
      WidgetRepository.signOut(c);
      return;
    }
    if (WidgetStore.waveState(WidgetStore.waves(c), friendId, System.currentTimeMillis()) != 0) return;
    int message;
    try {
      new WidgetApi(session, WidgetRepository.CLIENT)
        .post("/api/native/wave", new JSONObject().put("to", friendId).put("source", "widget"));
      WidgetStore.recordWave(c, friendId);
      message = R.string.w_wave_sent;
    } catch (WidgetApi.ApiException e) {
      switch (e.failure) {
        case RATE_LIMITED:
          message = R.string.w_wave_limit;
          break;
        case UNAUTHORIZED:
        case BANNED:
          WidgetRepository.signOut(c);
          return;
        case OFFLINE:
        case TIMEOUT:
          message = R.string.w_wave_offline;
          break;
        default:
          message = R.string.w_wave_failed;
          break;
      }
    } catch (Exception e) {
      message = R.string.w_wave_failed;
    }
    WidgetUpdater.updateProvider(c, FriendsWidgetProvider.class);
    final String text = c.getString(message, name);
    new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, text, Toast.LENGTH_SHORT).show());
  }
}
