package com.descall.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ClipData;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.DragEvent;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.RemoteViews;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;

import com.descall.app.MainActivity;
import com.descall.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Widget settings (draft B "Favori yuzler"), opened when a widget is placed (Android 11 and
 * lower), from the launcher's "Edit" (Android 12+, reconfigurable) and from the friends
 * widget's own Edit cell. A live preview of this widget at its size on top; then, for the
 * friends widget, the faces: tap to pick (up to 8, numbered), long-press and drag to order,
 * the activity line and wave button switches; for the voice widget the servers to show; the
 * colour for every widget. Favorites are per account and shared by all friends widgets.
 * The friend list is the cached one at once, then a fresh /api/native/friends.
 */
public class WidgetConfigActivity extends AppCompatActivity {
  public static final String EXTRA_FROM_WIDGET = "fromWidget";
  private static final int COLUMNS = 4;

  private final ExecutorService bg = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());

  private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
  private int kind = WidgetRenderer.KIND_FRIENDS;
  private int size = WidgetRenderer.SIZE_M;
  private WidgetStore.Options opts;
  private final List<String> picked = new ArrayList<>();
  private final List<WidgetModels.Friend> friends = new ArrayList<>();
  private final List<String[]> servers = new ArrayList<>();
  private String userId = "";
  private boolean signedIn;
  private String draggingId;

  private FrameLayout previewHost;
  private LinearLayout faces;
  private TextView facesLabel;
  private LinearLayout statusRow;
  private TextView status;
  private Button statusAction;
  private View progress;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent in = getIntent();
    widgetId = in == null ? AppWidgetManager.INVALID_APPWIDGET_ID
      : in.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    // Backing out of the first configuration removes the new widget (the system's rule).
    setResult(RESULT_CANCELED, resultIntent());
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish();
      return;
    }
    kind = kindOf(widgetId);
    if (kind < 0) {
      // Exported for the launcher: an id that is not one of our widgets opens nothing.
      finish();
      return;
    }
    try {
      size = WidgetRenderer.sizeFor(AppWidgetManager.getInstance(this).getAppWidgetOptions(widgetId));
    } catch (RuntimeException ignored) {
      size = WidgetRenderer.SIZE_M;
    }
    if (kind == WidgetRenderer.KIND_FRIENDS && size == WidgetRenderer.SIZE_S) size = WidgetRenderer.SIZE_M;
    opts = WidgetStore.options(this, widgetId);
    setContentView(R.layout.activity_widget_config);
    bindStatic();

    WidgetModels.Snapshot cached = WidgetStore.snapshot(this);
    signedIn = WidgetSessionStore.hasSession(this);
    if (cached != null) {
      userId = cached.meId;
      friends.addAll(cached.friends);
      picked.addAll(WidgetStore.favorites(this, userId));
    }
    renderFaces();
    renderPreview();
    if (!signedIn) {
      showStatus(getString(R.string.cfg_signed_out), false, getString(R.string.cfg_open_app), v -> openApp());
    } else {
      load();
    }
  }

  @Override
  protected void onDestroy() {
    bg.shutdownNow();
    main.removeCallbacksAndMessages(null);
    super.onDestroy();
  }

  private Intent resultIntent() {
    return new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
  }

  private int kindOf(int id) {
    int k = WidgetUpdater.kindOfWidget(this, id);
    if (k >= 0) return k;
    try {
      AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
      if (info == null || info.provider == null || !getPackageName().equals(info.provider.getPackageName())) return -1;
      String cls = info.provider.getClassName();
      if (cls.endsWith(".UnreadWidgetProvider")) return WidgetRenderer.KIND_UNREAD;
      if (cls.endsWith(".VoiceWidgetProvider")) return WidgetRenderer.KIND_VOICE;
      if (cls.endsWith(".CallWidgetProvider")) return WidgetRenderer.KIND_CALL;
      if (cls.endsWith(".FriendsWidgetProvider")) return WidgetRenderer.KIND_FRIENDS;
    } catch (RuntimeException ignored) {
      // unknown
    }
    return -1;
  }

  // ---- static parts --------------------------------------------------------------------------

  private void bindStatic() {
    boolean isFriends = kind == WidgetRenderer.KIND_FRIENDS;
    ((TextView) findViewById(R.id.cfg_title)).setText(isFriends ? R.string.cfg_title_friends : R.string.cfg_title_widget);
    Button cancel = findViewById(R.id.cfg_cancel);
    cancel.setText(R.string.cfg_cancel);
    cancel.setOnClickListener(v -> finish());
    Button done = findViewById(R.id.cfg_done);
    done.setText(R.string.cfg_done);
    done.setOnClickListener(v -> save());

    ((TextView) findViewById(R.id.cfg_preview_label)).setText(R.string.cfg_preview);
    previewHost = findViewById(R.id.cfg_preview_host);
    faces = findViewById(R.id.cfg_faces);
    facesLabel = findViewById(R.id.cfg_faces_label);
    statusRow = findViewById(R.id.cfg_status_row);
    status = findViewById(R.id.cfg_status);
    statusAction = findViewById(R.id.cfg_status_action);
    progress = findViewById(R.id.cfg_progress);
    ((TextView) findViewById(R.id.cfg_faces_note)).setText(R.string.cfg_pick_footer);
    findViewById(R.id.cfg_faces_section).setVisibility(isFriends ? View.VISIBLE : View.GONE);
    findViewById(R.id.cfg_toggles).setVisibility(isFriends ? View.VISIBLE : View.GONE);

    ((TextView) findViewById(R.id.cfg_activity_title)).setText(R.string.cfg_show_activity);
    ((TextView) findViewById(R.id.cfg_activity_sub)).setText(R.string.cfg_show_activity_sub);
    ((TextView) findViewById(R.id.cfg_wave_title)).setText(R.string.cfg_wave);
    ((TextView) findViewById(R.id.cfg_wave_sub)).setText(R.string.cfg_wave_sub);
    SwitchCompat activity = findViewById(R.id.cfg_activity);
    SwitchCompat wave = findViewById(R.id.cfg_wave);
    activity.setChecked(opts.showActivity);
    wave.setChecked(opts.waveButton);
    activity.setOnCheckedChangeListener((b, on) -> {
      opts.showActivity = on;
      renderPreview();
    });
    wave.setOnCheckedChangeListener((b, on) -> {
      opts.waveButton = on;
      renderPreview();
    });
    findViewById(R.id.cfg_activity_row).setOnClickListener(v -> activity.toggle());
    findViewById(R.id.cfg_wave_row).setOnClickListener(v -> wave.toggle());

    ((TextView) findViewById(R.id.cfg_color_label)).setText(R.string.cfg_color);
    RadioButton dark = findViewById(R.id.cfg_color_dark);
    RadioButton light = findViewById(R.id.cfg_color_light);
    RadioButton dynamic = findViewById(R.id.cfg_color_dynamic);
    dark.setText(R.string.cfg_color_dark);
    light.setText(R.string.cfg_color_light);
    dynamic.setText(R.string.cfg_color_dynamic);
    boolean dyn = WidgetTheme.dynamicAvailable();
    dynamic.setEnabled(dyn);
    TextView colorNote = findViewById(R.id.cfg_color_note);
    colorNote.setText(dyn ? R.string.cfg_color_note : R.string.cfg_dynamic_unavailable);
    int theme = opts.theme == WidgetStore.THEME_DYNAMIC && !dyn ? WidgetStore.THEME_DARK : opts.theme;
    ((RadioGroup) findViewById(R.id.cfg_color)).check(theme == WidgetStore.THEME_LIGHT ? R.id.cfg_color_light
      : theme == WidgetStore.THEME_DYNAMIC ? R.id.cfg_color_dynamic : R.id.cfg_color_dark);
    ((RadioGroup) findViewById(R.id.cfg_color)).setOnCheckedChangeListener((g, id) -> {
      opts.theme = id == R.id.cfg_color_light ? WidgetStore.THEME_LIGHT
        : id == R.id.cfg_color_dynamic ? WidgetStore.THEME_DYNAMIC : WidgetStore.THEME_DARK;
      renderPreview();
    });

    boolean isVoice = kind == WidgetRenderer.KIND_VOICE;
    findViewById(R.id.cfg_servers_section).setVisibility(isVoice ? View.VISIBLE : View.GONE);
    ((TextView) findViewById(R.id.cfg_servers_label)).setText(R.string.cfg_servers);
    ((TextView) findViewById(R.id.cfg_servers_note)).setText(R.string.cfg_servers_sub);
  }

  private void showStatus(String text, boolean busy, String action, View.OnClickListener onAction) {
    statusRow.setVisibility(text == null ? View.GONE : View.VISIBLE);
    if (text == null) return;
    status.setText(text);
    progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    statusAction.setVisibility(action == null ? View.GONE : View.VISIBLE);
    if (action != null) {
      statusAction.setText(action);
      statusAction.setOnClickListener(onAction);
    }
  }

  private void openApp() {
    Intent i = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    startActivity(i);
  }

  // ---- data ------------------------------------------------------------------------------------

  private void load() {
    if (kind == WidgetRenderer.KIND_FRIENDS) {
      showStatus(friends.isEmpty() ? getString(R.string.cfg_loading) : null, true, null, null);
    }
    bg.execute(() -> {
      WidgetSessionStore.Session session = WidgetSessionStore.load(getApplicationContext());
      if (session == null) {
        main.post(() -> showStatus(getString(R.string.cfg_signed_out), false, getString(R.string.cfg_open_app), v -> openApp()));
        return;
      }
      WidgetApi api = new WidgetApi(session, WidgetRepository.CLIENT);
      final String me = session.userId;
      List<WidgetModels.Friend> fresh = null;
      WidgetApi.Failure failure = null;
      if (kind == WidgetRenderer.KIND_FRIENDS) {
        try {
          JSONObject res = api.get(WidgetRepository.FRIENDS);
          fresh = new ArrayList<>();
          JSONArray arr = res.optJSONArray("friends");
          for (int i = 0; arr != null && i < arr.length(); i++) {
            WidgetModels.Friend f = WidgetModels.Friend.parseFriend(arr.optJSONObject(i));
            if (f != null) fresh.add(f);
          }
        } catch (WidgetApi.ApiException e) {
          failure = e.failure;
        }
      }
      List<String[]> srv = new ArrayList<>();
      if (kind == WidgetRenderer.KIND_VOICE) {
        try {
          JSONObject res = api.get("/api/native/destinations");
          JSONArray arr = res.optJSONArray("destinations");
          for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject d = arr.optJSONObject(i);
            if (d == null || !"server".equals(d.optString("kind"))) continue;
            String id = d.optString("serverId", "");
            if (WidgetModels.ID.matcher(id).matches()) srv.add(new String[] {id, d.optString("title", "?")});
          }
        } catch (WidgetApi.ApiException e) {
          failure = e.failure;
        }
      }
      final List<WidgetModels.Friend> list = fresh;
      final WidgetApi.Failure fail = failure;
      main.post(() -> {
        if (isFinishing()) return;
        if (!me.equals(userId)) {
          userId = me;
          picked.clear();
          picked.addAll(WidgetStore.favorites(this, me));
        }
        if (list != null) {
          friends.clear();
          friends.addAll(list);
          // Favorites of people who are no longer friends drop out.
          List<String> keep = new ArrayList<>();
          for (String id : picked) if (find(id) != null) keep.add(id);
          picked.clear();
          picked.addAll(keep);
        }
        servers.clear();
        servers.addAll(srv);
        renderServers();
        renderFaces();
        renderPreview();
        if (fail == null) {
          showStatus(kind == WidgetRenderer.KIND_FRIENDS && friends.isEmpty() ? getString(R.string.cfg_no_friends) : null, false, null, null);
        } else if (fail == WidgetApi.Failure.UNAUTHORIZED || fail == WidgetApi.Failure.BANNED) {
          showStatus(getString(R.string.cfg_signed_out), false, getString(R.string.cfg_open_app), v -> openApp());
        } else {
          boolean offline = fail == WidgetApi.Failure.OFFLINE || fail == WidgetApi.Failure.TIMEOUT;
          String text = friends.isEmpty() || kind == WidgetRenderer.KIND_VOICE
            ? getString(R.string.cfg_error) : getString(offline ? R.string.cfg_offline : R.string.cfg_error);
          showStatus(text, false, getString(R.string.w_retry), v -> load());
        }
      });
      if (list != null) {
        List<String> urls = new ArrayList<>();
        for (WidgetModels.Friend f : list) urls.add(f.avatarUrl);
        int before = WidgetRepository.cachedCount(getApplicationContext(), urls);
        AvatarCache.prefetch(getApplicationContext(), urls.subList(0, Math.min(urls.size(), 40)));
        if (WidgetRepository.cachedCount(getApplicationContext(), urls) != before) {
          main.post(() -> {
            if (isFinishing()) return;
            renderFaces();
            renderPreview();
          });
        }
      }
    });
  }

  private WidgetModels.Friend find(String id) {
    for (WidgetModels.Friend f : friends) if (f.id.equals(id)) return f;
    return null;
  }

  // ---- faces grid ------------------------------------------------------------------------------

  /** Picked faces first (in their order), then online friends, then the rest. */
  private List<WidgetModels.Friend> ordered() {
    List<WidgetModels.Friend> out = new ArrayList<>();
    for (String id : picked) {
      WidgetModels.Friend f = find(id);
      if (f != null) out.add(f);
    }
    List<WidgetModels.Friend> rest = new ArrayList<>();
    for (WidgetModels.Friend f : friends) if (!picked.contains(f.id)) rest.add(f);
    java.util.Collections.sort(rest, (a, b) -> WidgetModels.rank(a.presence) - WidgetModels.rank(b.presence));
    out.addAll(rest);
    return out;
  }

  private int dp(float v) {
    return Math.round(v * getResources().getDisplayMetrics().density);
  }

  private void renderFaces() {
    if (kind != WidgetRenderer.KIND_FRIENDS) return;
    facesLabel.setText(getString(R.string.cfg_pick_header, picked.size(), WidgetStore.MAX_FAVORITES));
    faces.removeAllViews();
    List<WidgetModels.Friend> list = ordered();
    LinearLayout row = null;
    for (int i = 0; i < list.size(); i++) {
      if (i % COLUMNS == 0) {
        row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        faces.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
      }
      row.addView(cell(list.get(i)), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }
    if (row != null) {
      int pad = COLUMNS - row.getChildCount();
      for (int i = 0; i < pad && i < COLUMNS; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
    }
  }

  private View cell(WidgetModels.Friend f) {
    int order = picked.indexOf(f.id);
    LinearLayout cell = new LinearLayout(this);
    cell.setOrientation(LinearLayout.VERTICAL);
    cell.setGravity(Gravity.CENTER_HORIZONTAL);
    cell.setPadding(0, dp(8), 0, dp(8));

    FrameLayout box = new FrameLayout(this);
    ImageView face = new ImageView(this);
    face.setImageBitmap(FacePainter.face(f.id, f.name, AvatarCache.get(this, f.avatarUrl), dp(52), FacePainter.Deco.presence(f.presence)));
    face.setAlpha(order >= 0 || picked.size() < WidgetStore.MAX_FAVORITES ? 1f : 0.45f);
    box.addView(face, new FrameLayout.LayoutParams(dp(52), dp(52), Gravity.CENTER));
    if (order >= 0) {
      TextView badge = new TextView(this);
      badge.setText(String.valueOf(order + 1));
      badge.setTextColor(0xFFFFFFFF);
      badge.setTextSize(11f);
      badge.setGravity(Gravity.CENTER);
      badge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
      badge.setBackgroundResource(R.drawable.wcfg_badge);
      box.addView(badge, new FrameLayout.LayoutParams(dp(20), dp(20), Gravity.TOP | Gravity.END));
    }
    cell.addView(box, new LinearLayout.LayoutParams(dp(60), dp(56)));

    TextView name = new TextView(this);
    name.setText(f.name);
    name.setTextColor(ContextCompat.getColor(this, R.color.wcfg_text));
    name.setTextSize(12f);
    name.setMaxLines(1);
    name.setEllipsize(android.text.TextUtils.TruncateAt.END);
    name.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    lp.topMargin = dp(4);
    cell.addView(name, lp);

    cell.setContentDescription(order >= 0 ? getString(R.string.cfg_cd_selected, f.name, order + 1) : getString(R.string.cfg_cd_not_selected, f.name));
    cell.setOnClickListener(v -> toggle(f.id));
    if (order >= 0) {
      cell.setOnLongClickListener(v -> {
        draggingId = f.id;
        ClipData data = ClipData.newPlainText("friend", f.id);
        v.startDragAndDrop(data, new View.DragShadowBuilder(box), f.id, 0);
        return true;
      });
      cell.setOnDragListener((v, e) -> onDrag(v, e, f.id));
      if (order > 0) {
        ViewCompat.addAccessibilityAction(cell, getString(R.string.cfg_move_earlier), (view, args) -> {
          move(f.id, order - 1);
          return true;
        });
      }
      if (order < picked.size() - 1) {
        ViewCompat.addAccessibilityAction(cell, getString(R.string.cfg_move_later), (view, args) -> {
          move(f.id, order + 1);
          return true;
        });
      }
    }
    return cell;
  }

  private boolean onDrag(View target, DragEvent e, String targetId) {
    switch (e.getAction()) {
      case DragEvent.ACTION_DRAG_STARTED:
        return draggingId != null;
      case DragEvent.ACTION_DRAG_ENTERED:
        target.setBackgroundResource(R.drawable.wcfg_drop);
        return true;
      case DragEvent.ACTION_DRAG_EXITED:
      case DragEvent.ACTION_DRAG_ENDED:
        target.setBackground(null);
        if (e.getAction() == DragEvent.ACTION_DRAG_ENDED) draggingId = null;
        return true;
      case DragEvent.ACTION_DROP:
        target.setBackground(null);
        String moving = draggingId;
        draggingId = null;
        if (moving != null && !moving.equals(targetId)) {
          int to = picked.indexOf(targetId);
          if (to >= 0) main.post(() -> move(moving, to));
        }
        return true;
      default:
        return true;
    }
  }

  private void move(String id, int to) {
    int from = picked.indexOf(id);
    if (from < 0 || to < 0 || to >= picked.size() || from == to) return;
    picked.remove(from);
    picked.add(to, id);
    renderFaces();
    renderPreview();
  }

  private void toggle(String id) {
    if (picked.contains(id)) {
      picked.remove(id);
    } else {
      if (picked.size() >= WidgetStore.MAX_FAVORITES) {
        Toast.makeText(this, R.string.cfg_limit, Toast.LENGTH_SHORT).show();
        return;
      }
      picked.add(id);
    }
    renderFaces();
    renderPreview();
  }

  // ---- servers (voice widget) -------------------------------------------------------------------

  private void renderServers() {
    if (kind != WidgetRenderer.KIND_VOICE) return;
    LinearLayout box = findViewById(R.id.cfg_servers);
    box.removeAllViews();
    for (String[] s : servers) {
      CheckBox cb = new CheckBox(this);
      cb.setText(s[1]);
      cb.setTextColor(ContextCompat.getColor(this, R.color.wcfg_text));
      cb.setTextSize(15.5f);
      cb.setMinHeight(dp(48));
      cb.setPadding(dp(8), 0, dp(8), 0);
      cb.setChecked(opts.servers.contains(s[0]));
      cb.setOnCheckedChangeListener((b, on) -> {
        if (on && !opts.servers.contains(s[0])) opts.servers.add(s[0]);
        if (!on) opts.servers.remove(s[0]);
        renderPreview();
      });
      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      lp.leftMargin = dp(8);
      lp.rightMargin = dp(8);
      box.addView(cb, lp);
    }
  }

  // ---- live preview ------------------------------------------------------------------------------

  private void renderPreview() {
    if (previewHost == null) return;
    try {
      RemoteViews rv = WidgetRenderer.buildPreview(getApplicationContext(), kind, widgetId, size, opts, new ArrayList<>(picked));
      View v = rv.apply(this, previewHost);
      previewHost.removeAllViews();
      int w = size == WidgetRenderer.SIZE_S ? 172 : 344;
      int h = size == WidgetRenderer.SIZE_L ? 344 : 172;
      DisplayMetrics dm = getResources().getDisplayMetrics();
      float avail = dm.widthPixels / dm.density - 64;
      float scale = Math.min(1f, avail / w);
      previewHost.addView(v, new FrameLayout.LayoutParams(dp(w), dp(h)));
      previewHost.setScaleX(scale);
      previewHost.setScaleY(scale);
      ViewGroup.LayoutParams lp = previewHost.getLayoutParams();
      lp.width = dp(w);
      lp.height = dp(h);
      previewHost.setLayoutParams(lp);
      previewHost.setPivotY(0);
      View stage = findViewById(R.id.cfg_preview_stage);
      stage.setMinimumHeight(Math.round(dp(h) * scale) + dp(32));
      previewHost.setContentDescription(getString(R.string.cfg_preview));
    } catch (RuntimeException e) {
      previewHost.removeAllViews();
    }
  }

  // ---- save --------------------------------------------------------------------------------------

  private void save() {
    final WidgetStore.Options out = opts;
    final List<String> favs = new ArrayList<>(picked);
    final String me = userId;
    final int id = widgetId;
    final android.content.Context app = getApplicationContext();
    WidgetStore.setOptions(app, id, out);
    if (kind == WidgetRenderer.KIND_FRIENDS && !me.isEmpty()) WidgetStore.setFavorites(app, me, favs);
    setResult(RESULT_OK, resultIntent());
    BaseWidgetProvider.RENDER.execute(() -> {
      WidgetUpdater.updateAll(app);
      WidgetScheduler.ensurePeriodic(app);
      if (WidgetStore.snapshot(app) == null) WidgetScheduler.refreshSoon(app);
    });
    finish();
  }
}
