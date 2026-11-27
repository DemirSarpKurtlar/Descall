package com.descall.app.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Pattern;

/**
 * What the widgets show, parsed from /api/native/summary + /api/native/friends (backend
 * lib/nativeGlance.js shapes) and cached as JSON between refreshes. Lenient: a missing or
 * malformed field is dropped, never thrown. Pure Java, no Android types.
 */
public final class WidgetModels {
  static final Pattern ID = Pattern.compile("^[0-9A-Za-z-]{1,64}$");
  static final Pattern USERNAME = Pattern.compile("^[\\p{L}\\p{N}_.-]{1,64}$");
  static final int MAX_FRIENDS = 200;
  static final int MAX_ROWS = 8;
  static final int MAX_ROOMS = 12;
  static final int MAX_OCCUPANTS = 8;

  private WidgetModels() {}

  static String str(JSONObject o, String key, int max) {
    if (o == null || o.isNull(key)) return "";
    String v = o.optString(key, "").replaceAll("\\s+", " ").trim();
    return v.length() > max ? v.substring(0, max) : v;
  }

  static String https(String url) {
    return url != null && url.startsWith("https://") && url.length() <= 500 && url.indexOf(' ') < 0 ? url : "";
  }

  static String presence(String raw) {
    if ("online".equals(raw) || "idle".equals(raw) || "dnd".equals(raw)) return raw;
    return "offline";
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

  /** First letter only (avatars at widget sizes show one, like the draft). */
  static String letter(String name) {
    String i = initials(name);
    return i.substring(0, i.offsetByCodePoints(0, 1));
  }

  /** A time field that is either epoch ms or an ISO string (the API sends ISO, the cache ms). */
  static long time(JSONObject o, String key) {
    if (o == null || o.isNull(key)) return 0L;
    Object v = o.opt(key);
    if (v instanceof Number) return Math.max(0L, ((Number) v).longValue());
    return parseIso(String.valueOf(v));
  }

  static long parseIso(String iso) {
    if (iso == null || iso.isEmpty()) return 0L;
    String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
    for (String p : patterns) {
      try {
        SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        java.util.Date d = f.parse(iso);
        if (d != null) return d.getTime();
      } catch (Exception ignored) {
        // next pattern
      }
    }
    return 0L;
  }

  // ---- people -------------------------------------------------------------------------------

  public static class Person {
    public final String id;
    public final String name;
    public final String avatarUrl;

    Person(String id, String name, String avatarUrl) {
      this.id = id;
      this.name = name.isEmpty() ? "?" : name;
      this.avatarUrl = avatarUrl;
    }

    static Person parse(JSONObject o) {
      if (o == null) return null;
      String id = str(o, "id", 64);
      if (!ID.matcher(id).matches()) return null;
      String name = str(o, "name", 40);
      if (name.isEmpty()) name = str(o, "displayName", 40);
      if (name.isEmpty()) name = str(o, "username", 40);
      return new Person(id, name, https(str(o, "avatarUrl", 500)));
    }

    JSONObject toJson() throws JSONException {
      return new JSONObject().put("id", id).put("name", name).put("avatarUrl", avatarUrl);
    }
  }

  public static final class Friend extends Person {
    public final String username;
    public final String presence;
    public final String customStatus;
    /** Backend activity line (?activity=1): kind screen|voice|game|music|app|idle|dnd|custom|offline. */
    public String activityKind = "";
    public String activityLabel = "";
    public long activitySince;

    Friend(String id, String username, String name, String avatarUrl, String presence, String customStatus) {
      super(id, name, avatarUrl);
      this.username = username;
      this.presence = presence;
      this.customStatus = customStatus;
    }

    public boolean isOnline() {
      return !"offline".equals(presence);
    }

    static Friend parseFriend(JSONObject o) {
      Person p = Person.parse(o);
      if (p == null) return null;
      String username = str(o, "username", 64);
      if (!USERNAME.matcher(username).matches()) username = "";
      Friend f = new Friend(p.id, username, p.name, p.avatarUrl, presence(str(o, "presence", 16)), str(o, "customStatus", 60));
      JSONObject a = o.optJSONObject("activity");
      if (a != null) {
        String kind = str(a, "kind", 12);
        if (kind.matches("^(screen|voice|game|music|app|idle|dnd|custom|offline)$")) {
          f.activityKind = kind;
          f.activityLabel = str(a, "label", 60);
          f.activitySince = time(a, "since");
        }
      }
      return f;
    }

    @Override
    JSONObject toJson() throws JSONException {
      JSONObject o = super.toJson().put("username", username).put("presence", presence).put("customStatus", customStatus);
      if (!activityKind.isEmpty()) {
        o.put("activity", new JSONObject().put("kind", activityKind).put("label", activityLabel).put("since", activitySince));
      }
      return o;
    }
  }

  // ---- unread -------------------------------------------------------------------------------

  public static final class UnreadRow {
    public final String conv;
    public final String kind;
    public final String title;
    public final int count;
    public String peerId = "";
    public String serverId = "";
    public String username = "";
    public String avatarUrl = "";
    public String preview = "";
    public String by = "";
    public long at;
    public boolean mention;

    UnreadRow(String conv, String kind, String title, int count) {
      this.conv = conv;
      this.kind = kind;
      this.title = title.isEmpty() ? "?" : title;
      this.count = count;
    }

    static UnreadRow parse(JSONObject o) {
      if (o == null) return null;
      String conv = str(o, "conv", 80);
      String kind = str(o, "kind", 12);
      int count = Math.max(0, Math.min(99, o.optInt("count", 0)));
      if (count <= 0 || !conv.matches("^(dm|group|channel):[0-9A-Za-z-]{1,64}$")) return null;
      if (!kind.equals("dm") && !kind.equals("group") && !kind.equals("channel")) return null;
      UnreadRow r = new UnreadRow(conv, kind, str(o, "title", 60), count);
      String peer = str(o, "peerId", 64);
      r.peerId = kind.equals("dm") ? conv.substring(3) : ID.matcher(peer).matches() ? peer : "";
      r.serverId = str(o, "serverId", 64);
      if (!ID.matcher(r.serverId).matches()) r.serverId = "";
      r.username = str(o, "username", 64);
      if (!USERNAME.matcher(r.username).matches()) r.username = "";
      r.avatarUrl = https(str(o, "avatarUrl", 500));
      r.preview = str(o, "preview", 160);
      r.by = str(o, "by", 40);
      r.at = time(o, "at");
      r.mention = o.optBoolean("mention", false);
      return r;
    }

    JSONObject toJson() throws JSONException {
      return new JSONObject().put("conv", conv).put("kind", kind).put("title", title).put("count", count)
        .put("serverId", serverId).put("peerId", peerId).put("username", username).put("avatarUrl", avatarUrl).put("preview", preview).put("by", by)
        .put("at", at).put("mention", mention);
    }

    /** The id part of conv (peer, group or channel id). */
    public String targetId() {
      int i = conv.indexOf(':');
      return i < 0 ? "" : conv.substring(i + 1);
    }
  }

  // ---- voice --------------------------------------------------------------------------------

  public static final class VoiceRoom {
    public final String serverId;
    public final String serverName;
    public final String channelId;
    public final String channelName;
    public final String type;
    public final int count;
    public final List<Person> occupants;

    VoiceRoom(String serverId, String serverName, String channelId, String channelName, String type, int count, List<Person> occupants) {
      this.serverId = serverId;
      this.serverName = serverName.isEmpty() ? "?" : serverName;
      this.channelId = channelId;
      this.channelName = channelName.isEmpty() ? "?" : channelName;
      this.type = type;
      this.count = count;
      this.occupants = occupants;
    }

    static VoiceRoom parse(JSONObject o) {
      if (o == null) return null;
      String serverId = str(o, "serverId", 64);
      String channelId = str(o, "channelId", 64);
      if (!ID.matcher(serverId).matches() || !ID.matcher(channelId).matches()) return null;
      List<Person> occ = new ArrayList<>();
      JSONArray arr = o.optJSONArray("occupants");
      for (int i = 0; arr != null && i < arr.length() && occ.size() < MAX_OCCUPANTS; i++) {
        Person p = Person.parse(arr.optJSONObject(i));
        if (p != null) occ.add(p);
      }
      int count = Math.max(occ.size(), Math.min(999, o.optInt("occupantCount", occ.size())));
      return new VoiceRoom(serverId, str(o, "serverName", 40), channelId, str(o, "channelName", 40),
        "stage".equals(o.optString("type")) ? "stage" : "voice", count, occ);
    }

    JSONObject toJson() throws JSONException {
      JSONArray occ = new JSONArray();
      for (Person p : occupants) occ.put(p.toJson());
      return new JSONObject().put("serverId", serverId).put("serverName", serverName).put("channelId", channelId)
        .put("channelName", channelName).put("type", type).put("occupantCount", count).put("occupants", occ);
    }

    public boolean has(String userId) {
      for (Person p : occupants) if (p.id.equals(userId)) return true;
      return false;
    }
  }

  // ---- snapshot -----------------------------------------------------------------------------

  public static final class Snapshot {
    public String meId = "";
    public String meName = "";
    public String meAvatarUrl = "";
    public String meStatus = "online";
    public final List<Friend> friends = new ArrayList<>();
    public int onlineCount;
    public int unreadTotal;
    public final List<UnreadRow> unread = new ArrayList<>();
    public int unreadConversations;
    public final List<VoiceRoom> voice = new ArrayList<>();
    public long savedAt;

    public Friend friend(String id) {
      for (Friend f : friends) if (f.id.equals(id)) return f;
      return null;
    }

    /** The voice room a friend sits in, or null. */
    public VoiceRoom roomOf(String userId) {
      for (VoiceRoom r : voice) if (r.has(userId)) return r;
      return null;
    }

    public int voicePeople() {
      int n = 0;
      for (VoiceRoom r : voice) n += r.count;
      return n;
    }

    public JSONObject toJson() throws JSONException {
      JSONArray fr = new JSONArray();
      for (Friend f : friends) fr.put(f.toJson());
      JSONArray un = new JSONArray();
      for (UnreadRow r : unread) un.put(r.toJson());
      JSONArray vo = new JSONArray();
      for (VoiceRoom r : voice) vo.put(r.toJson());
      return new JSONObject()
        .put("me", new JSONObject().put("id", meId).put("name", meName).put("avatarUrl", meAvatarUrl).put("status", meStatus))
        .put("friends", fr).put("onlineCount", onlineCount)
        .put("unread", new JSONObject().put("total", unreadTotal).put("conversations", unreadConversations).put("top", un))
        .put("voice", vo).put("savedAt", savedAt);
    }

    /** The cached form written by toJson (same parser as the API: lenient). */
    public static Snapshot fromCache(JSONObject o) {
      if (o == null) return null;
      Snapshot s = new Snapshot();
      JSONObject me = o.optJSONObject("me");
      if (me != null) {
        s.meId = str(me, "id", 64);
        s.meName = str(me, "name", 40);
        s.meAvatarUrl = https(str(me, "avatarUrl", 500));
        s.meStatus = str(me, "status", 16);
      }
      JSONArray fr = o.optJSONArray("friends");
      for (int i = 0; fr != null && i < fr.length() && s.friends.size() < MAX_FRIENDS; i++) {
        Friend f = Friend.parseFriend(fr.optJSONObject(i));
        if (f != null) s.friends.add(f);
      }
      s.onlineCount = Math.max(0, o.optInt("onlineCount", 0));
      JSONObject un = o.optJSONObject("unread");
      if (un != null) {
        s.unreadTotal = Math.max(0, un.optInt("total", 0));
        s.unreadConversations = Math.max(0, un.optInt("conversations", 0));
        JSONArray top = un.optJSONArray("top");
        for (int i = 0; top != null && i < top.length() && s.unread.size() < MAX_ROWS; i++) {
          UnreadRow r = UnreadRow.parse(top.optJSONObject(i));
          if (r != null) s.unread.add(r);
        }
      }
      JSONArray vo = o.optJSONArray("voice");
      for (int i = 0; vo != null && i < vo.length() && s.voice.size() < MAX_ROOMS; i++) {
        VoiceRoom r = VoiceRoom.parse(vo.optJSONObject(i));
        if (r != null) s.voice.add(r);
      }
      s.savedAt = Math.max(0L, o.optLong("savedAt", 0L));
      return s;
    }
  }

  /**
   * /api/native/summary + /api/native/friends (null when that request failed) + the previews
   * the app pushed (conv -> { preview, by, at, mention }) into one snapshot.
   */
  public static Snapshot fromApi(JSONObject summary, JSONObject friendList, Map<String, JSONObject> previews, long now) {
    Snapshot s = new Snapshot();
    JSONObject me = summary.optJSONObject("me");
    if (me != null) {
      s.meId = str(me, "id", 64);
      s.meName = str(me, "name", 40);
      s.meAvatarUrl = https(str(me, "avatarUrl", 500));
      s.meStatus = str(me, "status", 16);
    }
    Map<String, Friend> byId = new HashMap<>();
    JSONArray all = friendList != null ? friendList.optJSONArray("friends") : null;
    if (all == null) {
      JSONObject fr = summary.optJSONObject("friends");
      all = fr != null ? fr.optJSONArray("online") : null;
    }
    for (int i = 0; all != null && i < all.length() && s.friends.size() < MAX_FRIENDS; i++) {
      Friend f = Friend.parseFriend(all.optJSONObject(i));
      if (f != null && !byId.containsKey(f.id)) {
        s.friends.add(f);
        byId.put(f.id, f);
      }
    }
    JSONObject fr = summary.optJSONObject("friends");
    int online = 0;
    for (Friend f : s.friends) if (f.isOnline()) online++;
    s.onlineCount = fr != null && friendList == null ? Math.max(online, fr.optInt("onlineCount", online)) : online;

    JSONObject un = summary.optJSONObject("unread");
    if (un != null) {
      s.unreadTotal = Math.max(0, Math.min(999, un.optInt("total", 0)));
      JSONArray top = un.optJSONArray("top");
      int conversations = 0;
      for (int i = 0; top != null && i < top.length(); i++) {
        UnreadRow r = UnreadRow.parse(top.optJSONObject(i));
        if (r == null) continue;
        conversations++;
        if (s.unread.size() >= MAX_ROWS) continue;
        if (r.kind.equals("dm")) {
          Friend f = byId.get(r.peerId);
          if (f != null) {
            r.username = f.username;
            if (r.avatarUrl.isEmpty()) r.avatarUrl = f.avatarUrl;
          }
        }
        // The backend's bubbles (?previews=1) win; `previews` (conv -> bubble) fills in for an
        // older backend that sends none (tests and future callers; the refresh passes null).
        JSONObject p = previews != null && r.preview.isEmpty() ? previews.get(r.conv) : null;
        if (p != null) {
          r.preview = str(p, "preview", 160);
          if (r.by.isEmpty()) r.by = str(p, "by", 40);
          if (r.at == 0L) r.at = time(p, "at");
          r.mention = r.mention || p.optBoolean("mention", false);
          if (r.avatarUrl.isEmpty()) r.avatarUrl = https(str(p, "avatarUrl", 500));
        }
        s.unread.add(r);
      }
      s.unreadConversations = conversations;
    }
    JSONArray vo = summary.optJSONArray("voice");
    for (int i = 0; vo != null && i < vo.length() && s.voice.size() < MAX_ROOMS; i++) {
      VoiceRoom r = VoiceRoom.parse(vo.optJSONObject(i));
      if (r != null && r.count > 0) s.voice.add(r);
    }
    s.savedAt = now;
    return s;
  }

  /**
   * The faces a friends widget shows, in order: the user's favorites first (in their order,
   * online or not), then online friends by presence; at most max.
   */
  public static List<Friend> faces(Snapshot s, List<String> favorites, int max, boolean onlineOnlyAfterFavorites) {
    List<Friend> out = new ArrayList<>();
    if (s == null) return out;
    for (String id : favorites) {
      Friend f = s.friend(id);
      if (f != null && out.size() < max) out.add(f);
    }
    if (out.size() < max) {
      List<Friend> rest = new ArrayList<>();
      for (Friend f : s.friends) {
        if (out.contains(f)) continue;
        if (onlineOnlyAfterFavorites && !f.isOnline()) continue;
        rest.add(f);
      }
      Collections.sort(rest, (a, b) -> rank(a.presence) - rank(b.presence));
      for (Friend f : rest) {
        if (out.size() >= max) break;
        out.add(f);
      }
    }
    return out;
  }

  /** Online favorites first for the small sizes that say "Online". */
  public static List<Friend> onlineFaces(Snapshot s, List<String> favorites, int max) {
    List<Friend> out = new ArrayList<>();
    if (s == null) return out;
    for (Friend f : faces(s, favorites, MAX_FRIENDS, true)) {
      if (f.isOnline()) out.add(f);
      if (out.size() >= max) break;
    }
    return out;
  }

  static int rank(String presence) {
    switch (presence) {
      case "online": return 0;
      case "idle": return 1;
      case "dnd": return 2;
      default: return 3;
    }
  }

  // ---- the running call (from the app) --------------------------------------------------------

  public static final class CallState {
    public boolean active;
    public String kind = "server";
    public String title = "";
    public String subtitle = "";
    public String serverId = "";
    public String channelId = "";
    public long startedAt;
    public boolean muted;
    public boolean deafened;
    public boolean connecting;
    public Person speaker;
    public Person me;
    public final List<Person> participants = new ArrayList<>();
    public int count;
    public long updatedAt;

    public static CallState idle() {
      return new CallState();
    }

    public static CallState parse(JSONObject o, long now) {
      CallState c = new CallState();
      if (o == null || !o.optBoolean("active", false)) return c;
      c.active = true;
      String kind = str(o, "kind", 10);
      c.kind = kind.equals("dm") || kind.equals("group") ? kind : "server";
      c.title = str(o, "title", 60);
      c.subtitle = str(o, "subtitle", 60);
      c.serverId = str(o, "serverId", 64);
      c.channelId = str(o, "channelId", 64);
      if (!ID.matcher(c.serverId).matches()) c.serverId = "";
      if (!ID.matcher(c.channelId).matches()) c.channelId = "";
      long started = o.optLong("startedAt", 0L);
      c.startedAt = started > 0 && started <= now + 60_000L ? started : now;
      c.muted = o.optBoolean("muted", false);
      c.deafened = o.optBoolean("deafened", false);
      c.connecting = o.optBoolean("connecting", false);
      c.speaker = Person.parse(o.optJSONObject("speaker"));
      c.me = Person.parse(o.optJSONObject("me"));
      JSONArray arr = o.optJSONArray("participants");
      for (int i = 0; arr != null && i < arr.length() && c.participants.size() < MAX_OCCUPANTS; i++) {
        Person p = Person.parse(arr.optJSONObject(i));
        if (p != null) c.participants.add(p);
      }
      c.count = Math.max(c.participants.size() + (c.me != null ? 1 : 0), Math.min(999, o.optInt("count", 0)));
      c.updatedAt = now;
      return c;
    }

    public JSONObject toJson() throws JSONException {
      JSONObject o = new JSONObject().put("active", active);
      if (!active) return o;
      JSONArray arr = new JSONArray();
      for (Person p : participants) arr.put(p.toJson());
      o.put("kind", kind).put("title", title).put("subtitle", subtitle).put("serverId", serverId)
        .put("channelId", channelId).put("startedAt", startedAt).put("muted", muted).put("deafened", deafened)
        .put("connecting", connecting).put("participants", arr).put("count", count);
      if (speaker != null) o.put("speaker", speaker.toJson());
      if (me != null) o.put("me", me.toJson());
      return o;
    }

    /** The face the call surfaces lead with: who is talking, else the first other person. */
    public Person face() {
      if (speaker != null) return speaker;
      if (!participants.isEmpty()) return participants.get(0);
      return me;
    }
  }
}
