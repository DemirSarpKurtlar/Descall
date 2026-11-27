package com.descall.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import com.descall.app.R;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the RemoteViews of draft B ("Yuzler") for the four widgets in their three sizes
 * (2x2 s, 4x2 m, 4x4 l), every state included: first load (skeleton), signed out, failed
 * first load, empty, data, and stale data (offline / failed refresh, with the time it is from).
 *
 * Android 12+ gets all three sizes at once (responsive RemoteViews, the launcher picks while
 * resizing); older versions get the size that matches the widget's current dimensions.
 * Faces are bitmaps from FacePainter, one size per widget kind so the three layouts share
 * the same bitmap objects (RemoteViews sends each distinct bitmap once).
 * Reads only local data: no network here.
 */
public final class WidgetRenderer {
  public static final int KIND_FRIENDS = 0;
  public static final int KIND_UNREAD = 1;
  public static final int KIND_VOICE = 2;
  public static final int KIND_CALL = 3;

  public static final int SIZE_S = 0;
  public static final int SIZE_M = 1;
  public static final int SIZE_L = 2;

  /** Upper bound of one face bitmap: keeps a 4x4 widget well under the binder limit. */
  static final int MAX_FACE_PX = 128;

  private static final int[] FACE = {R.id.face0, R.id.face1, R.id.face2, R.id.face3, R.id.face4, R.id.face5, R.id.face6, R.id.face7};
  private static final int[] NAME = {R.id.name0, R.id.name1, R.id.name2, R.id.name3, R.id.name4, R.id.name5, R.id.name6, R.id.name7};
  private static final int[] ACT = {R.id.act0, R.id.act1, R.id.act2, R.id.act3, R.id.act4, R.id.act5, R.id.act6, R.id.act7};
  private static final int[] HAND = {R.id.hand0, R.id.hand1, R.id.hand2, R.id.hand3, R.id.hand4, R.id.hand5, R.id.hand6, R.id.hand7};
  private static final int[] CELL = {R.id.cell0, R.id.cell1, R.id.cell2, R.id.cell3, R.id.cell4, R.id.cell5, R.id.cell6, R.id.cell7};

  private static final int[] UROW = {R.id.urow0, R.id.urow1, R.id.urow2, R.id.urow3};
  private static final int[] UAV = {R.id.uav0, R.id.uav1, R.id.uav2, R.id.uav3};
  private static final int[] UBUBBLE = {R.id.ububble0, R.id.ububble1, R.id.ububble2, R.id.ububble3};
  private static final int[] UTITLE = {R.id.utitle0, R.id.utitle1, R.id.utitle2, R.id.utitle3};
  private static final int[] UBY = {R.id.uby0, R.id.uby1, R.id.uby2, R.id.uby3};
  private static final int[] UTIME = {R.id.utime0, R.id.utime1, R.id.utime2, R.id.utime3};
  private static final int[] UPREV = {R.id.uprev0, R.id.uprev1, R.id.uprev2, R.id.uprev3};

  private static final int[] VROOM = {R.id.vroom0, R.id.vroom1, R.id.vroom2, R.id.vroom3};
  private static final int[] VCLUSTER = {R.id.vcluster0, R.id.vcluster1, R.id.vcluster2, R.id.vcluster3};
  private static final int[] VNAME = {R.id.vname0, R.id.vname1, R.id.vname2, R.id.vname3};
  private static final int[] VSUB = {R.id.vsub0, R.id.vsub1, R.id.vsub2, R.id.vsub3};
  private static final int[] VSTATUS = {R.id.vstatus0, R.id.vstatus1, R.id.vstatus2, R.id.vstatus3};
  private static final int[] VJOIN = {R.id.vjoin0, R.id.vjoin1, R.id.vjoin2, R.id.vjoin3};
  private static final int[] VJOIN_ICON = {R.id.vjoin0_icon, R.id.vjoin1_icon, R.id.vjoin2_icon, R.id.vjoin3_icon};
  private static final int[] VJOIN_TEXT = {R.id.vjoin0_text, R.id.vjoin1_text, R.id.vjoin2_text, R.id.vjoin3_text};
  private static final int[] VHERE = {R.id.vhere0, R.id.vhere1, R.id.vhere2, R.id.vhere3};
  private static final int[] VHERE_ICON = {R.id.vhere0_icon, R.id.vhere1_icon, R.id.vhere2_icon, R.id.vhere3_icon};
  private static final int[] VHERE_TEXT = {R.id.vhere0_text, R.id.vhere1_text, R.id.vhere2_text, R.id.vhere3_text};

  private static final int[] CTILE = {R.id.ctile0, R.id.ctile1, R.id.ctile2, R.id.ctile3};
  private static final int[] CTILE_FACE = {R.id.ctileface0, R.id.ctileface1, R.id.ctileface2, R.id.ctileface3};
  private static final int[] CTILE_NAME = {R.id.ctilename0, R.id.ctilename1, R.id.ctilename2, R.id.ctilename3};

  private WidgetRenderer() {}

  // ---- entry points ------------------------------------------------------------------------------

  /** Everything one render needs, read once. */
  static final class Ctx {
    final Context c;
    final Resources res;
    final int widgetId;
    final int kind;
    final WidgetStore.Options opts;
    final WidgetTheme theme;
    final WidgetModels.Snapshot s;
    final String state;
    final long stateAt;
    final List<String> favorites;
    final WidgetModels.CallState call;
    final Map<String, List<Long>> waves;
    final float density;
    final float quality;
    final Map<String, Bitmap> bitmaps = new HashMap<>();
    final Map<String, Bitmap> photos = new HashMap<>();

    Ctx(Context c, int kind, int widgetId, float quality) {
      this(c, kind, widgetId, quality, null, null);
    }

    /** opts / favorites: the unsaved choices of the settings screen's live preview. */
    Ctx(Context c, int kind, int widgetId, float quality, WidgetStore.Options opts, List<String> favorites) {
      this.c = c;
      this.res = c.getResources();
      this.widgetId = widgetId;
      this.kind = kind;
      this.opts = opts != null ? opts : WidgetStore.options(c, widgetId);
      this.theme = WidgetTheme.of(this.opts.theme);
      this.s = WidgetStore.snapshot(c);
      this.state = WidgetStore.state(c);
      this.stateAt = WidgetStore.prefs(c).getLong("state_at", 0L);
      this.favorites = favorites != null ? favorites : WidgetStore.favorites(c, s != null ? s.meId : "");
      this.call = WidgetStore.call(c);
      this.waves = WidgetStore.waves(c);
      this.density = res.getDisplayMetrics().density;
      this.quality = quality;
    }

    int px(float dp) {
      return Math.max(24, Math.min(Math.round(MAX_FACE_PX * quality), Math.round(dp * density * quality)));
    }

    Bitmap photo(String url) {
      if (url == null || url.isEmpty()) return null;
      if (photos.containsKey(url)) return photos.get(url);
      Bitmap b = AvatarCache.get(c, url);
      photos.put(url, b);
      return b;
    }

    Bitmap face(WidgetModels.Person p, float dp, FacePainter.Deco deco) {
      int size = px(dp);
      String key = "f|" + p.id + "|" + p.avatarUrl + "|" + size + "|" + deco.key();
      Bitmap b = bitmaps.get(key);
      if (b == null) {
        b = FacePainter.face(p.id, p.name, photo(p.avatarUrl), size, deco);
        bitmaps.put(key, b);
      }
      return b;
    }

    Bitmap cluster(WidgetModels.VoiceRoom room, float dp, String speakingId) {
      int size = px(dp);
      String key = "c|" + room.channelId + "|" + size + "|" + speakingId;
      Bitmap b = bitmaps.get(key);
      if (b == null) {
        List<Bitmap> ph = new ArrayList<>();
        for (WidgetModels.Person p : room.occupants) ph.add(photo(p.avatarUrl));
        b = FacePainter.cluster(room.occupants, ph, size, speakingId);
        bitmaps.put(key, b);
      }
      return b;
    }
  }

  /** The RemoteViews for one widget, all sizes on Android 12+. quality < 1 shrinks the faces. */
  public static RemoteViews build(Context c, int kind, int widgetId, Bundle options, float quality) {
    Ctx x = new Ctx(c, kind, widgetId, quality);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Map<SizeF, RemoteViews> map = new HashMap<>();
      map.put(new SizeF(100f, 100f), buildSized(x, SIZE_S));
      map.put(new SizeF(250f, 100f), buildSized(x, SIZE_M));
      map.put(new SizeF(250f, 250f), buildSized(x, SIZE_L));
      return new RemoteViews(map);
    }
    return buildSized(x, sizeFor(options));
  }

  /** One size with unsaved options, for the settings screen (RemoteViews.apply in-app). */
  public static RemoteViews buildPreview(Context c, int kind, int widgetId, int size, WidgetStore.Options opts, List<String> favorites) {
    return buildSized(new Ctx(c, kind, widgetId, 1f, opts, favorites), size);
  }

  /** Size class from the widget's dp size (portrait width, landscape height). */
  public static int sizeFor(Bundle options) {
    if (options == null) return SIZE_M;
    int w = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
    int h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
    return sizeFor(w, h);
  }

  static int sizeFor(int widthDp, int heightDp) {
    if (widthDp <= 0) return SIZE_M;
    if (widthDp < 250) return SIZE_S;
    return heightDp >= 250 ? SIZE_L : SIZE_M;
  }

  static RemoteViews buildSized(Ctx x, int size) {
    if (x.kind != KIND_CALL || !x.call.active) {
      if (WidgetStore.STATE_SIGNED_OUT.equals(x.state) || !WidgetSessionStore.hasSession(x.c)) return signedOut(x);
      if (x.s == null) {
        if (WidgetStore.STATE_LOADING.equals(x.state)) return skeleton(x);
        return failed(x);
      }
    }
    switch (x.kind) {
      case KIND_FRIENDS: return friends(x, size);
      case KIND_UNREAD: return unread(x, size);
      case KIND_VOICE: return voice(x, size);
      default: return call(x, size);
    }
  }

  // ---- shared pieces ---------------------------------------------------------------------------

  static RemoteViews base(Ctx x, int layout) {
    RemoteViews rv = new RemoteViews(x.c.getPackageName(), layout);
    rv.setInt(android.R.id.background, "setBackgroundResource", x.theme.background());
    return rv;
  }

  static int kindTitle(int kind) {
    switch (kind) {
      case KIND_FRIENDS: return R.string.widget_friends_label;
      case KIND_UNREAD: return R.string.widget_unread_label;
      case KIND_VOICE: return R.string.widget_voice_label;
      default: return R.string.widget_call_label;
    }
  }

  static String defaultPath(int kind) {
    switch (kind) {
      case KIND_FRIENDS: return "/friends";
      case KIND_UNREAD: return "/direct";
      case KIND_VOICE: return "/servers";
      default: return "/calls";
    }
  }

  static void header(Ctx x, RemoteViews rv, String title, String meta) {
    rv.setTextViewText(R.id.w_title, title);
    x.theme.text(rv, R.id.w_title, WidgetTheme.TEXT);
    x.theme.tint(rv, R.id.w_logo, WidgetTheme.ACCENT);
    if (meta != null) {
      rv.setTextViewText(R.id.w_meta, meta);
      x.theme.text(rv, R.id.w_meta, WidgetTheme.TEXT2);
    }
    stale(x, rv);
  }

  /** "Offline · 21:40" style marker when the data shown is not fresh; tap to refresh. */
  static void stale(Ctx x, RemoteViews rv) {
    boolean offline = WidgetStore.STATE_OFFLINE.equals(x.state);
    boolean error = WidgetStore.STATE_ERROR.equals(x.state);
    if ((!offline && !error) || x.s == null) {
      rv.setViewVisibility(R.id.w_stale, View.GONE);
      rv.setViewVisibility(R.id.w_stale_icon, View.GONE);
      return;
    }
    String time = DateFormat.getTimeFormat(x.c).format(new java.util.Date(x.s.savedAt > 0 ? x.s.savedAt : x.stateAt));
    rv.setTextViewText(R.id.w_stale, time);
    rv.setViewVisibility(R.id.w_stale, View.VISIBLE);
    rv.setViewVisibility(R.id.w_stale_icon, View.VISIBLE);
    rv.setImageViewResource(R.id.w_stale_icon, offline ? R.drawable.ic_w_offline : R.drawable.ic_w_refresh);
    x.theme.text(rv, R.id.w_stale, WidgetTheme.TEXT3);
    x.theme.tint(rv, R.id.w_stale_icon, WidgetTheme.TEXT3);
    String desc = x.res.getString(offline ? R.string.w_stale_offline : R.string.w_stale_error, time);
    rv.setContentDescription(R.id.w_stale, desc);
    rv.setOnClickPendingIntent(R.id.w_stale, WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_REFRESH, x.widgetId, "stale"));
    rv.setOnClickPendingIntent(R.id.w_stale_icon, WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_REFRESH, x.widgetId, "stale"));
  }

  static void empty(Ctx x, RemoteViews rv, int icon, String title, String sub) {
    rv.setViewVisibility(R.id.w_content, View.GONE);
    rv.setViewVisibility(R.id.w_empty_box, View.VISIBLE);
    rv.setImageViewResource(R.id.w_empty_icon, icon);
    x.theme.tint(rv, R.id.w_empty_icon, WidgetTheme.TEXT3);
    rv.setTextViewText(R.id.w_empty_title, title);
    x.theme.text(rv, R.id.w_empty_title, WidgetTheme.TEXT);
    rv.setTextViewText(R.id.w_empty_sub, sub);
    x.theme.text(rv, R.id.w_empty_sub, WidgetTheme.TEXT2);
  }

  static RemoteViews message(Ctx x, int icon, String title, String sub, String button, android.app.PendingIntent action) {
    RemoteViews rv = base(x, R.layout.widget_message);
    rv.setTextViewText(R.id.w_title, x.res.getString(kindTitle(x.kind)));
    x.theme.text(rv, R.id.w_title, WidgetTheme.TEXT);
    x.theme.tint(rv, R.id.w_logo, WidgetTheme.ACCENT);
    rv.setImageViewResource(R.id.w_empty_icon, icon);
    x.theme.tint(rv, R.id.w_empty_icon, icon == R.drawable.ic_w_logo ? WidgetTheme.ACCENT : WidgetTheme.TEXT3);
    rv.setTextViewText(R.id.w_empty_title, title);
    x.theme.text(rv, R.id.w_empty_title, WidgetTheme.TEXT);
    rv.setTextViewText(R.id.w_empty_sub, sub);
    x.theme.text(rv, R.id.w_empty_sub, WidgetTheme.TEXT2);
    rv.setTextViewText(R.id.w_empty_btn, button);
    x.theme.accentButton(rv, R.id.w_empty_btn);
    x.theme.onAccentText(rv, R.id.w_empty_btn);
    rv.setOnClickPendingIntent(R.id.w_empty_btn, action);
    rv.setOnClickPendingIntent(android.R.id.background, action);
    return rv;
  }

  static RemoteViews signedOut(Ctx x) {
    return message(x, R.drawable.ic_w_logo, x.res.getString(R.string.w_signed_out), x.res.getString(R.string.w_signed_out_sub),
      x.res.getString(R.string.w_sign_in), WidgetIntents.open(x.c, x.widgetId, defaultPath(x.kind)));
  }

  static RemoteViews failed(Ctx x) {
    boolean offline = WidgetStore.STATE_OFFLINE.equals(x.state);
    return message(x, offline ? R.drawable.ic_w_offline : R.drawable.ic_w_refresh,
      x.res.getString(offline ? R.string.w_offline : R.string.w_error), x.res.getString(R.string.w_error_sub),
      x.res.getString(R.string.w_retry), WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_REFRESH, x.widgetId, "retry"));
  }

  static RemoteViews skeleton(Ctx x) {
    RemoteViews rv = base(x, R.layout.widget_skeleton);
    x.theme.tint(rv, R.id.w_logo, WidgetTheme.ACCENT);
    rv.setInt(R.id.sk_title, "setBackgroundResource", x.theme.skeleton(false));
    int[] faces = {R.id.sk_face0, R.id.sk_face1, R.id.sk_face2, R.id.sk_face3};
    int[] lines = {R.id.sk_line0, R.id.sk_line1, R.id.sk_line2, R.id.sk_line3};
    for (int i = 0; i < 4; i++) {
      rv.setInt(faces[i], "setBackgroundResource", x.theme.skeleton(true));
      rv.setInt(lines[i], "setBackgroundResource", x.theme.skeleton(false));
    }
    rv.setContentDescription(android.R.id.background, x.res.getString(R.string.w_loading));
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId, defaultPath(x.kind)));
    return rv;
  }

  static String plural(Ctx x, int id, int n) {
    return x.res.getQuantityString(id, n, n);
  }

  static String presenceLabel(Ctx x, String presence) {
    switch (presence) {
      case "online": return x.res.getString(R.string.w_presence_online);
      case "idle": return x.res.getString(R.string.w_presence_idle);
      case "dnd": return x.res.getString(R.string.w_presence_dnd);
      default: return x.res.getString(R.string.w_presence_offline);
    }
  }

  /**
   * What a friend is doing: the backend's activity line (?activity=1: screen share, voice room,
   * game, music, app, idle, dnd, status, last seen), else the voice room they sit in, their
   * status text, or their presence.
   */
  static String activity(Ctx x, WidgetModels.Friend f) {
    String label = f.activityLabel;
    switch (f.activityKind) {
      case "screen": return x.res.getString(R.string.w_act_screen);
      case "voice": if (!label.isEmpty()) return x.res.getString(R.string.w_in_voice, label); break;
      case "game": if (!label.isEmpty()) return x.res.getString(R.string.w_act_game, label); break;
      case "music": if (!label.isEmpty()) return x.res.getString(R.string.w_act_music, label); break;
      case "app":
      case "custom": if (!label.isEmpty()) return label; break;
      case "idle":
        return f.activitySince > 0 ? presenceLabel(x, "idle") + " \u00b7 " + shortAgo(x, f.activitySince) : presenceLabel(x, "idle");
      case "dnd": return presenceLabel(x, "dnd");
      case "offline": if (f.activitySince > 0) return ago(x, f.activitySince); break;
      default: break;
    }
    WidgetModels.VoiceRoom room = x.s != null ? x.s.roomOf(f.id) : null;
    if (room != null) return x.res.getString(R.string.w_in_voice, room.channelName);
    if (f.isOnline() && !f.customStatus.isEmpty()) return f.customStatus;
    return presenceLabel(x, f.presence);
  }

  /** "12 dk" / "2 sa" (no "ago"), for "Bosta · 12 dk". */
  static String shortAgo(Ctx x, long at) {
    long min = Math.max(1, (System.currentTimeMillis() - at) / 60_000L);
    if (min < 60) return x.res.getString(R.string.w_minutes, (int) min);
    return x.res.getString(R.string.w_hours, (int) Math.min(99, min / 60));
  }

  static String ago(Ctx x, long at) {
    if (at <= 0) return "";
    long min = Math.max(0, (System.currentTimeMillis() - at) / 60_000L);
    if (min < 1) return x.res.getString(R.string.w_just_now);
    if (min < 60) return x.res.getString(R.string.w_minutes_ago, (int) min);
    long h = min / 60;
    if (h < 24) return x.res.getString(R.string.w_hours_ago, (int) h);
    return DateFormat.getDateFormat(x.c).format(new java.util.Date(at));
  }

  // ---- friends -----------------------------------------------------------------------------------

  static RemoteViews friends(Ctx x, int size) {
    int layout = size == SIZE_S ? R.layout.widget_friends_s : size == SIZE_M ? R.layout.widget_friends_m : R.layout.widget_friends_l;
    RemoteViews rv = base(x, layout);
    WidgetModels.Snapshot s = x.s;
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId, "/friends"));
    int slots = size == SIZE_L ? 8 : 4;
    List<WidgetModels.Friend> faces = size == SIZE_L
      ? WidgetModels.faces(s, x.favorites, 8, false)
      : WidgetModels.onlineFaces(s, x.favorites, 4);
    if (size == SIZE_S) stale(x, rv);
    else if (size == SIZE_M) header(x, rv, x.res.getString(R.string.w_online), plural(x, R.plurals.w_people_count, s.onlineCount));
    else header(x, rv, x.res.getString(R.string.w_favorites), plural(x, R.plurals.w_online_count, s.onlineCount));

    if (faces.isEmpty()) {
      boolean none = s.friends.isEmpty();
      empty(x, rv, R.drawable.ic_w_users,
        x.res.getString(none ? R.string.w_empty_friends_none : R.string.w_empty_friends),
        x.res.getString(none ? R.string.w_empty_friends_none_sub : R.string.w_empty_friends_sub));
      return rv;
    }
    boolean showAct = x.opts.showActivity;
    boolean canWave = x.opts.waveButton;
    long now = System.currentTimeMillis();
    for (int i = 0; i < slots; i++) {
      if (i >= faces.size()) {
        rv.setViewVisibility(CELL[i], View.INVISIBLE);
        continue;
      }
      WidgetModels.Friend f = faces.get(i);
      rv.setViewVisibility(CELL[i], View.VISIBLE);
      rv.setImageViewBitmap(FACE[i], x.face(f, 56f, FacePainter.Deco.presence(f.presence)));
      rv.setTextViewText(NAME[i], f.name);
      x.theme.text(rv, NAME[i], WidgetTheme.TEXT);
      String act = activity(x, f);
      if (size != SIZE_S) {
        rv.setViewVisibility(ACT[i], showAct ? View.VISIBLE : View.GONE);
        rv.setTextViewText(ACT[i], act);
        x.theme.text(rv, ACT[i], WidgetTheme.TEXT2);
      }
      rv.setContentDescription(CELL[i], f.name + ", " + presenceLabel(x, f.presence) + (showAct && !act.equals(presenceLabel(x, f.presence)) ? ", " + act : ""));
      rv.setOnClickPendingIntent(CELL[i], WidgetIntents.open(x.c, x.widgetId, WidgetIntents.dmPath(f.username)));
      if (size == SIZE_L) {
        int state = WidgetStore.waveState(x.waves, f.id, now);
        boolean waved = state == 1;
        boolean show = canWave && state != 2;
        rv.setViewVisibility(HAND[i], show ? View.VISIBLE : View.GONE);
        if (show) {
          rv.setInt(HAND[i], "setBackgroundResource", x.theme.hand());
          rv.setImageViewResource(HAND[i], waved ? R.drawable.ic_w_check : R.drawable.ic_w_hand);
          x.theme.tint(rv, HAND[i], waved ? WidgetTheme.SUCCESS : WidgetTheme.TEXT2);
          rv.setContentDescription(HAND[i], x.res.getString(waved ? R.string.w_cd_waved : R.string.w_cd_wave, f.name));
          if (!waved) rv.setOnClickPendingIntent(HAND[i], WidgetIntents.wave(x.c, x.widgetId, f));
        }
      }
    }
    if (size == SIZE_L) {
      rv.setInt(R.id.edit_ring, "setBackgroundResource", x.theme.dashed());
      x.theme.tint(rv, R.id.edit_icon, WidgetTheme.TEXT2);
      rv.setTextViewText(R.id.edit_label, x.res.getString(R.string.w_edit));
      x.theme.text(rv, R.id.edit_label, WidgetTheme.TEXT2);
      rv.setContentDescription(R.id.cell8, x.res.getString(R.string.w_cd_edit));
      rv.setOnClickPendingIntent(R.id.cell8, WidgetIntents.configure(x.c, x.widgetId));
    }
    return rv;
  }

  // ---- unread ------------------------------------------------------------------------------------

  static String rowPreview(Ctx x, WidgetModels.UnreadRow r) {
    if (!r.preview.isEmpty()) return r.preview;
    return plural(x, R.plurals.w_new_messages, r.count);
  }

  static WidgetModels.Person rowPerson(WidgetModels.UnreadRow r) {
    String id = r.kind.equals("dm") ? r.peerId : r.targetId();
    return new WidgetModels.Person(id, r.kind.equals("dm") ? r.title : r.title.replace("#", ""), r.avatarUrl);
  }

  static RemoteViews unread(Ctx x, int size) {
    int layout = size == SIZE_S ? R.layout.widget_unread_s : size == SIZE_M ? R.layout.widget_unread_m : R.layout.widget_unread_l;
    RemoteViews rv = base(x, layout);
    WidgetModels.Snapshot s = x.s;
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId, "/direct"));
    if (size == SIZE_S) {
      stale(x, rv);
      x.theme.tint(rv, R.id.w_logo, WidgetTheme.ACCENT);
    } else if (size == SIZE_M) {
      header(x, rv, plural(x, R.plurals.w_new_messages, s.unreadTotal), plural(x, R.plurals.w_chats, s.unreadConversations));
    } else {
      header(x, rv, x.res.getString(R.string.w_new_messages_title), s.unreadTotal > 99 ? "99+" : String.valueOf(s.unreadTotal));
      rv.setTextColor(R.id.w_meta, 0xFFFFFFFF);
      rv.setViewVisibility(R.id.w_meta, s.unreadTotal > 0 ? View.VISIBLE : View.GONE);
    }
    if (s.unread.isEmpty()) {
      empty(x, rv, R.drawable.ic_w_check, x.res.getString(R.string.w_empty_unread), x.res.getString(R.string.w_empty_unread_sub));
      if (size == SIZE_L) rv.setViewVisibility(R.id.w_footer, View.GONE);
      return rv;
    }
    int rows = size == SIZE_S ? 1 : size == SIZE_M ? 2 : 4;
    for (int i = 0; i < rows; i++) {
      if (i >= s.unread.size()) {
        if (size != SIZE_S) rv.setViewVisibility(UROW[i], View.GONE);
        continue;
      }
      WidgetModels.UnreadRow r = s.unread.get(i);
      rv.setImageViewBitmap(UAV[i], x.face(rowPerson(r), 48f, FacePainter.Deco.count(r.count)));
      rv.setTextViewText(UTITLE[i], r.title);
      x.theme.text(rv, UTITLE[i], WidgetTheme.TEXT);
      rv.setInt(UBUBBLE[i], "setBackgroundResource", x.theme.bubble(r.mention));
      if (size == SIZE_S) {
        String when = ago(x, r.at);
        rv.setTextViewText(UTIME[i], when.isEmpty() ? plural(x, R.plurals.w_new_messages, r.count) : when);
        x.theme.text(rv, UTIME[i], WidgetTheme.TEXT2);
        rv.setTextViewText(UPREV[i], rowPreview(x, r));
        x.theme.text(rv, UPREV[i], WidgetTheme.TEXT);
      } else {
        boolean showBy = !r.by.isEmpty() && !r.kind.equals("dm");
        rv.setViewVisibility(UBY[i], showBy && size == SIZE_M ? View.VISIBLE : View.GONE);
        if (showBy) {
          rv.setTextViewText(UBY[i], "· " + r.by);
          x.theme.text(rv, UBY[i], WidgetTheme.TEXT2);
        }
        String prev = rowPreview(x, r);
        if (size == SIZE_L && showBy && !r.preview.isEmpty()) prev = r.by + ": " + prev;
        rv.setTextViewText(UPREV[i], prev);
        x.theme.text(rv, UPREV[i], WidgetTheme.TEXT2);
        if (size == SIZE_L) {
          rv.setTextViewText(UTIME[i], ago(x, r.at));
          x.theme.text(rv, UTIME[i], WidgetTheme.TEXT3);
        }
      }
      int target = size == SIZE_S ? android.R.id.background : UROW[i];
      rv.setOnClickPendingIntent(target, WidgetIntents.open(x.c, x.widgetId, WidgetIntents.convPath(r)));
      rv.setContentDescription(target, r.title + ", " + plural(x, R.plurals.w_new_messages, r.count) + (r.preview.isEmpty() ? "" : ", " + r.preview));
    }
    if (size == SIZE_L) {
      int shown = Math.min(4, s.unread.size());
      int remaining = Math.max(0, s.unreadConversations - shown);
      String more = "";
      if (remaining > 0) {
        String next = s.unread.size() > shown ? s.unread.get(shown).title : "";
        if (next.isEmpty()) more = plural(x, R.plurals.w_more_chats, remaining);
        else if (remaining == 1) more = x.res.getString(R.string.w_more_one, next);
        else more = x.res.getQuantityString(R.plurals.w_more_named, remaining - 1, next, remaining - 1);
      }
      rv.setTextViewText(R.id.w_more, more);
      x.theme.text(rv, R.id.w_more, WidgetTheme.TEXT2);
      rv.setInt(R.id.w_reply, "setBackgroundResource", x.theme.pill());
      x.theme.tint(rv, R.id.w_reply_icon, WidgetTheme.TEXT);
      rv.setTextViewText(R.id.w_reply_text, x.res.getString(R.string.w_reply));
      x.theme.text(rv, R.id.w_reply_text, WidgetTheme.TEXT);
      rv.setOnClickPendingIntent(R.id.w_reply, WidgetIntents.open(x.c, x.widgetId, WidgetIntents.convPath(s.unread.get(0))));
    }
    return rv;
  }

  // ---- voice -------------------------------------------------------------------------------------

  static List<WidgetModels.VoiceRoom> rooms(Ctx x) {
    List<WidgetModels.VoiceRoom> out = new ArrayList<>();
    if (x.s == null) return out;
    for (WidgetModels.VoiceRoom r : x.s.voice) {
      if (x.opts.servers.isEmpty() || x.opts.servers.contains(r.serverId)) out.add(r);
    }
    return out;
  }

  static boolean isMine(Ctx x, WidgetModels.VoiceRoom r) {
    return x.call.active && r.channelId.equals(x.call.channelId);
  }

  static String names(Ctx x, WidgetModels.VoiceRoom r) {
    List<WidgetModels.Person> o = r.occupants;
    if (o.isEmpty()) return plural(x, R.plurals.w_people_count, r.count);
    if (o.size() == 1 || r.count == 1) return o.get(0).name;
    if (r.count == 2 && o.size() >= 2) return x.res.getString(R.string.w_names_two, o.get(0).name, o.get(1).name);
    return x.res.getQuantityString(R.plurals.w_names_more, r.count - 2, o.get(0).name, o.get(1).name, r.count - 2);
  }

  static void joinOrHere(Ctx x, RemoteViews rv, int i, WidgetModels.VoiceRoom r) {
    boolean mine = isMine(x, r);
    rv.setViewVisibility(VJOIN[i], mine ? View.GONE : View.VISIBLE);
    rv.setViewVisibility(VHERE[i], mine ? View.VISIBLE : View.GONE);
    if (mine) {
      rv.setTextViewText(VHERE_TEXT[i], x.res.getString(R.string.w_here));
      x.theme.text(rv, VHERE_TEXT[i], WidgetTheme.SUCCESS);
      x.theme.tint(rv, VHERE_ICON[i], WidgetTheme.SUCCESS);
      rv.setOnClickPendingIntent(VHERE[i], WidgetIntents.open(x.c, x.widgetId, "/servers/" + r.serverId + "/" + r.channelId));
    } else {
      x.theme.accentButton(rv, VJOIN[i]);
      rv.setTextViewText(VJOIN_TEXT[i], x.res.getString(R.string.w_join));
      x.theme.onAccentText(rv, VJOIN_TEXT[i]);
      x.theme.onAccentTint(rv, VJOIN_ICON[i]);
      rv.setContentDescription(VJOIN[i], x.res.getString(R.string.w_cd_join, r.channelName));
      rv.setOnClickPendingIntent(VJOIN[i], WidgetIntents.join(x.c, x.widgetId, r));
    }
  }

  static RemoteViews voice(Ctx x, int size) {
    int layout = size == SIZE_S ? R.layout.widget_voice_s : size == SIZE_M ? R.layout.widget_voice_m : R.layout.widget_voice_l;
    RemoteViews rv = base(x, layout);
    List<WidgetModels.VoiceRoom> rooms = rooms(x);
    int people = 0;
    for (WidgetModels.VoiceRoom r : rooms) people += r.count;
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId, "/servers"));
    if (size == SIZE_S) stale(x, rv);
    else if (size == SIZE_M) header(x, rv, x.res.getString(R.string.w_who_in_voice), plural(x, R.plurals.w_people_count, people));
    else header(x, rv, x.res.getString(R.string.w_who_in_voice),
      plural(x, R.plurals.w_channels, rooms.size()) + " · " + plural(x, R.plurals.w_people_count, people));
    if (rooms.isEmpty()) {
      empty(x, rv, R.drawable.ic_w_wave, x.res.getString(R.string.w_empty_voice), x.res.getString(R.string.w_empty_voice_sub));
      return rv;
    }
    String speaker = x.call.active && x.call.speaker != null ? x.call.speaker.id : "";
    int slots = size == SIZE_S ? 1 : size == SIZE_M ? 2 : 4;
    for (int i = 0; i < slots; i++) {
      if (i >= rooms.size()) {
        rv.setViewVisibility(VROOM[i], size == SIZE_M ? View.INVISIBLE : View.GONE);
        continue;
      }
      WidgetModels.VoiceRoom r = rooms.get(i);
      boolean mine = isMine(x, r);
      rv.setViewVisibility(VROOM[i], View.VISIBLE);
      if (size != SIZE_S) rv.setInt(VROOM[i], "setBackgroundResource", x.theme.chip());
      rv.setImageViewBitmap(VCLUSTER[i], x.cluster(r, 52f, mine ? speaker : ""));
      rv.setTextViewText(VNAME[i], r.channelName);
      x.theme.text(rv, VNAME[i], WidgetTheme.TEXT);
      String sub = size == SIZE_S ? plural(x, R.plurals.w_people_count, r.count)
        : size == SIZE_M ? r.serverName : r.serverName + " · " + plural(x, R.plurals.w_people_count, r.count);
      rv.setTextViewText(VSUB[i], sub);
      x.theme.text(rv, VSUB[i], WidgetTheme.TEXT2);
      if (size == SIZE_L) {
        boolean talking = mine && x.call.speaker != null;
        rv.setTextViewText(VSTATUS[i], talking ? x.res.getString(R.string.w_talking, x.call.speaker.name) : names(x, r));
        x.theme.text(rv, VSTATUS[i], talking ? WidgetTheme.SUCCESS : WidgetTheme.TEXT3);
      }
      joinOrHere(x, rv, i, r);
      rv.setContentDescription(VROOM[i], r.channelName + ", " + r.serverName + ", " + names(x, r));
      rv.setOnClickPendingIntent(VROOM[i], mine
        ? WidgetIntents.open(x.c, x.widgetId, "/servers/" + r.serverId + "/" + r.channelId)
        : WidgetIntents.join(x.c, x.widgetId, r));
    }
    if (size == SIZE_S) {
      WidgetModels.VoiceRoom r = rooms.get(0);
      rv.setImageViewBitmap(R.id.vserver0, FacePainter.serverTile(r.serverId, r.serverName, x.px(18f)));
      rv.setTextViewText(R.id.vservername0, r.serverName);
      x.theme.text(rv, R.id.vservername0, WidgetTheme.TEXT2);
      rv.setTextViewText(R.id.w_more, rooms.size() > 1 ? plural(x, R.plurals.w_more_channels, rooms.size() - 1) : "");
      x.theme.text(rv, R.id.w_more, WidgetTheme.TEXT2);
    }
    return rv;
  }

  // ---- call --------------------------------------------------------------------------------------

  static void callButtons(Ctx x, RemoteViews rv, boolean withDeafen) {
    WidgetModels.CallState call = x.call;
    rv.setInt(R.id.cmute, "setBackgroundResource", x.theme.pill());
    rv.setImageViewResource(R.id.cmute_icon, call.muted ? R.drawable.ic_w_mic_off : R.drawable.ic_w_mic);
    if (call.muted) rv.setInt(R.id.cmute_icon, "setColorFilter", 0xFFFF7B7B);
    else x.theme.tint(rv, R.id.cmute_icon, WidgetTheme.TEXT);
    rv.setContentDescription(R.id.cmute, x.res.getString(call.muted ? R.string.w_cd_unmute : R.string.w_cd_mute));
    rv.setOnClickPendingIntent(R.id.cmute, WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_CALL_MUTE, x.widgetId, "mute"));
    if (withDeafen) {
      rv.setInt(R.id.cdeafen, "setBackgroundResource", x.theme.pill());
      rv.setImageViewResource(R.id.cdeafen_icon, call.deafened ? R.drawable.ic_w_headphones_off : R.drawable.ic_w_headphones);
      if (call.deafened) rv.setInt(R.id.cdeafen_icon, "setColorFilter", 0xFFFF7B7B);
      else x.theme.tint(rv, R.id.cdeafen_icon, WidgetTheme.TEXT);
      rv.setContentDescription(R.id.cdeafen, x.res.getString(call.deafened ? R.string.w_cd_undeafen : R.string.w_cd_deafen));
      rv.setOnClickPendingIntent(R.id.cdeafen, WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_CALL_DEAFEN, x.widgetId, "deafen"));
    }
    rv.setInt(R.id.cleave_icon, "setColorFilter", 0xFFFFFFFF);
    rv.setContentDescription(R.id.cleave, x.res.getString(R.string.w_cd_leave));
    rv.setOnClickPendingIntent(R.id.cleave, WidgetIntents.broadcast(x.c, WidgetIntents.ACTION_CALL_LEAVE, x.widgetId, "leave"));
  }

  static void chrono(Ctx x, RemoteViews rv, int role) {
    WidgetModels.CallState call = x.call;
    boolean show = !call.connecting && call.startedAt > 0;
    rv.setViewVisibility(R.id.cchrono, show ? View.VISIBLE : View.GONE);
    if (show) {
      long base = SystemClock.elapsedRealtime() - Math.max(0L, System.currentTimeMillis() - call.startedAt);
      rv.setChronometer(R.id.cchrono, base, null, true);
      x.theme.text(rv, R.id.cchrono, role);
    }
  }

  static String roomLine(Ctx x, String text) {
    if (x.call.connecting) return x.res.getString(R.string.w_connecting);
    return text.isEmpty() ? "" : text + " · ";
  }

  static RemoteViews idleCall(Ctx x, RemoteViews rv, int size) {
    rv.setViewVisibility(R.id.w_content, View.GONE);
    rv.setViewVisibility(R.id.w_idle, View.VISIBLE);
    List<WidgetModels.VoiceRoom> rooms = rooms(x);
    WidgetModels.VoiceRoom top = rooms.isEmpty() ? null : rooms.get(0);
    rv.setTextViewText(R.id.w_idle_title, x.res.getString(R.string.w_call_idle));
    x.theme.text(rv, R.id.w_idle_title, WidgetTheme.TEXT);
    if (top != null) {
      rv.setImageViewBitmap(R.id.w_idle_face, x.cluster(top, 78f, ""));
      rv.setTextViewText(R.id.w_idle_sub, top.channelName + " · " + plural(x, R.plurals.w_people_count, top.count));
      rv.setViewVisibility(R.id.w_idle_join, View.VISIBLE);
      x.theme.accentButton(rv, R.id.w_idle_join);
      rv.setTextViewText(R.id.w_idle_join_text, x.res.getString(R.string.w_join));
      x.theme.onAccentText(rv, R.id.w_idle_join_text);
      x.theme.onAccentTint(rv, R.id.w_idle_join_icon);
      rv.setContentDescription(R.id.w_idle_join, x.res.getString(R.string.w_cd_join, top.channelName));
      rv.setOnClickPendingIntent(R.id.w_idle_join, WidgetIntents.join(x.c, x.widgetId, top));
    } else {
      WidgetModels.Person me = x.s != null && !x.s.meId.isEmpty() ? new WidgetModels.Person(x.s.meId, x.s.meName, x.s.meAvatarUrl) : null;
      if (me != null) rv.setImageViewBitmap(R.id.w_idle_face, x.face(me, 78f, FacePainter.Deco.none()));
      else rv.setImageViewResource(R.id.w_idle_face, R.drawable.ic_w_logo);
      rv.setTextViewText(R.id.w_idle_sub, x.res.getString(R.string.w_call_idle_sub));
      rv.setViewVisibility(R.id.w_idle_join, View.GONE);
    }
    x.theme.text(rv, R.id.w_idle_sub, WidgetTheme.TEXT2);
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId, "/servers"));
    stale(x, rv);
    return rv;
  }

  static RemoteViews call(Ctx x, int size) {
    int layout = size == SIZE_S ? R.layout.widget_call_s : size == SIZE_M ? R.layout.widget_call_m : R.layout.widget_call_l;
    RemoteViews rv = base(x, layout);
    WidgetModels.CallState call = x.call;
    if (size != SIZE_L) {
      rv.setViewVisibility(R.id.w_stale, View.GONE);
      rv.setViewVisibility(R.id.w_stale_icon, View.GONE);
    }
    if (!call.active) {
      if (x.s == null) {
        if (WidgetStore.STATE_SIGNED_OUT.equals(x.state) || !WidgetSessionStore.hasSession(x.c)) return signedOut(x);
        return WidgetStore.STATE_LOADING.equals(x.state) ? skeleton(x) : failed(x);
      }
      return idleCall(x, rv, size);
    }
    rv.setViewVisibility(R.id.w_content, View.VISIBLE);
    rv.setViewVisibility(R.id.w_idle, View.GONE);
    rv.setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(x.c, x.widgetId,
      !call.serverId.isEmpty() && !call.channelId.isEmpty() ? "/servers/" + call.serverId + "/" + call.channelId : "/calls"));
    WidgetModels.Person face = call.face();
    boolean talking = call.speaker != null;
    String title = call.title.isEmpty() ? x.res.getString(R.string.n_voice_call) : call.title;
    if (size == SIZE_S || size == SIZE_M) {
      if (face != null) rv.setImageViewBitmap(R.id.cface, x.face(face, 78f, talking ? FacePainter.Deco.speaking() : FacePainter.Deco.none()));
      else rv.setImageViewResource(R.id.cface, R.drawable.ic_w_logo);
    }
    if (size == SIZE_S) {
      rv.setTextViewText(R.id.cline1, talking ? x.res.getString(R.string.w_talking, call.speaker.name) : title);
      x.theme.text(rv, R.id.cline1, WidgetTheme.TEXT);
      rv.setTextViewText(R.id.cline2, roomLine(x, talking ? title : call.subtitle));
      x.theme.text(rv, R.id.cline2, WidgetTheme.TEXT2);
      chrono(x, rv, WidgetTheme.TEXT2);
      callButtons(x, rv, false);
    } else if (size == SIZE_M) {
      rv.setTextViewText(R.id.cname, face != null ? face.name : "");
      x.theme.text(rv, R.id.cname, WidgetTheme.TEXT);
      rv.setTextViewText(R.id.ctalking, talking ? x.res.getString(R.string.w_talking_short) : "");
      x.theme.text(rv, R.id.ctalking, WidgetTheme.TEXT2);
      rv.setTextViewText(R.id.cline1, title);
      x.theme.text(rv, R.id.cline1, WidgetTheme.TEXT);
      rv.setTextViewText(R.id.cline2, roomLine(x, call.subtitle));
      x.theme.text(rv, R.id.cline2, WidgetTheme.TEXT2);
      chrono(x, rv, WidgetTheme.TEXT2);
      List<WidgetModels.Person> people = new ArrayList<>();
      if (call.me != null) people.add(call.me);
      people.addAll(call.participants);
      if (people.isEmpty()) {
        rv.setViewVisibility(R.id.cstack, View.GONE);
      } else {
        List<Bitmap> ph = new ArrayList<>();
        for (WidgetModels.Person p : people) ph.add(x.photo(p.avatarUrl));
        rv.setImageViewBitmap(R.id.cstack, FacePainter.stack(people, ph, x.px(26f), 6));
        rv.setContentDescription(R.id.cstack, plural(x, R.plurals.w_people_count, Math.max(call.count, people.size())));
      }
      callButtons(x, rv, true);
    } else {
      rv.setTextViewText(R.id.cline1, title);
      x.theme.text(rv, R.id.cline1, WidgetTheme.TEXT);
      x.theme.tint(rv, R.id.w_logo, WidgetTheme.ACCENT);
      chrono(x, rv, WidgetTheme.SUCCESS);
      List<WidgetModels.Person> others = new ArrayList<>(call.participants);
      if (others.isEmpty() && call.me != null) others.add(call.me);
      for (int i = 0; i < 4; i++) {
        if (i >= others.size()) {
          rv.setViewVisibility(CTILE[i], View.INVISIBLE);
          continue;
        }
        WidgetModels.Person p = others.get(i);
        boolean speaking = call.speaker != null && call.speaker.id.equals(p.id);
        rv.setViewVisibility(CTILE[i], View.VISIBLE);
        rv.setInt(CTILE[i], "setBackgroundResource", speaking ? x.theme.speakingTile() : x.theme.chip());
        rv.setImageViewBitmap(CTILE_FACE[i], x.face(p, 78f, FacePainter.Deco.none()));
        rv.setTextViewText(CTILE_NAME[i], p.name);
        rv.setContentDescription(CTILE[i], speaking ? x.res.getString(R.string.w_talking, p.name) : p.name);
      }
      rv.setViewVisibility(R.id.ctilerow1, others.size() > 2 ? View.VISIBLE : View.GONE);
      if (call.me != null) rv.setImageViewBitmap(R.id.cme, x.face(call.me, 78f, FacePainter.Deco.none()));
      rv.setTextViewText(R.id.cmeline, x.res.getString(R.string.w_you) + " · "
        + x.res.getString(call.muted ? R.string.w_mic_off : R.string.w_mic_on));
      x.theme.text(rv, R.id.cmeline, WidgetTheme.TEXT2);
      callButtons(x, rv, true);
    }
    return rv;
  }
}
