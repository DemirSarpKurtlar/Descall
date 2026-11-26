package com.descall.app.share;

import org.json.JSONObject;

import java.util.concurrent.CopyOnWriteArrayList;

/** Job snapshots from the worker / notification actions to an open share page (DescallSharePlugin). */
public final class ShareBus {
  public interface Listener {
    void onJob(JSONObject job, boolean fin);
  }

  private static final CopyOnWriteArrayList<Listener> LISTENERS = new CopyOnWriteArrayList<>();

  private ShareBus() {}

  public static void add(Listener l) { LISTENERS.addIfAbsent(l); }

  public static void remove(Listener l) { LISTENERS.remove(l); }

  public static void publish(JSONObject job, boolean fin) {
    for (Listener l : LISTENERS) {
      try {
        l.onJob(job, fin);
      } catch (RuntimeException ignored) {
        // a closed page
      }
    }
  }
}
