package com.descall.app.widget;

import android.content.Context;
import android.content.Intent;

import com.descall.app.CallForegroundService;

/**
 * Mute / sound / leave from a widget or the call notification, to the running page.
 * DescallWidgetsPlugin registers while the WebView lives; the page runs the action with the
 * app's own call handlers (lib/nativeIntents.js runIntentAction) and reports the new state
 * back with setCallState. The widgets and the notification flip at once (optimistic).
 * With no page (the app process lost its WebView) "leave" still ends the call surfaces.
 */
public final class CallControlBus {
  /** Implemented by DescallWidgetsPlugin. */
  public interface Listener {
    /** True when the page received the action. */
    boolean onCallAction(String type);
  }

  private static volatile Listener listener;

  private CallControlBus() {}

  public static void setListener(Listener l) {
    listener = l;
  }

  public static void clearListener(Listener l) {
    if (listener == l) listener = null;
  }

  /** type: toggleMute | toggleDeafen | leave. Call off the main thread (renders widgets). */
  public static void dispatch(Context c, String type) {
    Listener l = listener;
    boolean delivered = l != null && l.onCallAction(type);
    WidgetModels.CallState call = WidgetStore.call(c);
    if (!call.active) {
      WidgetUpdater.updateCallSurfaces(c);
      return;
    }
    if ("leave".equals(type)) {
      WidgetStore.setCall(c, WidgetModels.CallState.idle());
      if (!delivered) stopService(c);
    } else if (delivered && "toggleMute".equals(type)) {
      call.muted = !call.muted;
      WidgetStore.setCall(c, call);
    } else if (delivered && "toggleDeafen".equals(type)) {
      call.deafened = !call.deafened;
      if (call.deafened) call.muted = true;
      WidgetStore.setCall(c, call);
    }
    CallForegroundService.refreshNotification(c);
    WidgetUpdater.updateCallSurfaces(c);
  }

  static void stopService(Context c) {
    try {
      c.stopService(new Intent(c, CallForegroundService.class));
    } catch (RuntimeException ignored) {
      // not running
    }
  }
}
