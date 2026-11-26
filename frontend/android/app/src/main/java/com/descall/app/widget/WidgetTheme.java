package com.descall.app.widget;

import android.os.Build;
import android.widget.RemoteViews;

import com.descall.app.R;

/**
 * Colours of one widget. Descall dark and light are the draft B palettes (fixed ints);
 * Material You hands colour resources to the launcher (RemoteViews.setColor, Android 12+),
 * so the wallpaper palette and day / night apply without a refresh. Before Android 12 the
 * dynamic choice renders as Descall dark.
 */
final class WidgetTheme {
  static final int TEXT = 0;
  static final int TEXT2 = 1;
  static final int TEXT3 = 2;
  static final int ACCENT = 3;
  static final int ON_ACCENT = 4;
  static final int SUCCESS = 5;

  final int kind;
  private final int[] colors;
  private final int[] colorRes;

  private WidgetTheme(int kind, int[] colors, int[] colorRes) {
    this.kind = kind;
    this.colors = colors;
    this.colorRes = colorRes;
  }

  static boolean dynamicAvailable() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
  }

  static WidgetTheme of(int theme) {
    if (theme == WidgetStore.THEME_DYNAMIC && dynamicAvailable()) {
      return new WidgetTheme(WidgetStore.THEME_DYNAMIC, null, new int[] {
        R.color.wdyn_text, R.color.wdyn_text2, R.color.wdyn_text3, R.color.wdyn_accent, R.color.wdyn_on_accent, R.color.wdyn_success,
      });
    }
    if (theme == WidgetStore.THEME_LIGHT) {
      return new WidgetTheme(WidgetStore.THEME_LIGHT, new int[] {
        0xFF151827, 0xFF4F5570, 0xFF7A809B, 0xFF587AF5, 0xFFFFFFFF, 0xFF0F6634,
      }, null);
    }
    return new WidgetTheme(WidgetStore.THEME_DARK, new int[] {
      0xFFFFFFFF, 0xFFC9CDE0, 0xFF9EA3BC, 0xFF587AF5, 0xFFFFFFFF, 0xFF3DDC84,
    }, null);
  }

  boolean isDynamic() {
    return kind == WidgetStore.THEME_DYNAMIC;
  }

  void text(RemoteViews rv, int viewId, int role) {
    if (colorRes != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) rv.setColor(viewId, "setTextColor", colorRes[role]);
    } else {
      rv.setTextColor(viewId, colors[role]);
    }
  }

  void tint(RemoteViews rv, int viewId, int role) {
    if (colorRes != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) rv.setColor(viewId, "setColorFilter", colorRes[role]);
    } else {
      rv.setInt(viewId, "setColorFilter", colors[role]);
    }
  }

  /** Accent button colour for a fixed theme (#587AF5 for both Descall themes). */
  void accentButton(RemoteViews rv, int viewId) {
    rv.setInt(viewId, "setBackgroundResource", isDynamic() ? R.drawable.wbtn_accent_dynamic : R.drawable.wbtn_accent);
  }

  void onAccentText(RemoteViews rv, int viewId) {
    if (isDynamic()) text(rv, viewId, ON_ACCENT);
    else rv.setTextColor(viewId, 0xFFFFFFFF);
  }

  void onAccentTint(RemoteViews rv, int viewId) {
    if (isDynamic()) tint(rv, viewId, ON_ACCENT);
    else rv.setInt(viewId, "setColorFilter", 0xFFFFFFFF);
  }

  int background() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.wbg_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.wbg_dynamic;
      default: return R.drawable.wbg_dark;
    }
  }

  int chip() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.wchip_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.wchip_dynamic;
      default: return R.drawable.wchip_dark;
    }
  }

  int pill() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.wpill_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.wpill_dynamic;
      default: return R.drawable.wpill_dark;
    }
  }

  int bubble(boolean mention) {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return mention ? R.drawable.wbubble_mention_light : R.drawable.wbubble_light;
      case WidgetStore.THEME_DYNAMIC: return mention ? R.drawable.wbubble_mention_dynamic : R.drawable.wbubble_dynamic;
      default: return mention ? R.drawable.wbubble_mention_dark : R.drawable.wbubble_dark;
    }
  }

  int speakingTile() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.wtile_speak_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.wtile_speak_dynamic;
      default: return R.drawable.wtile_speak_dark;
    }
  }

  int dashed() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.wdashed_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.wdashed_dynamic;
      default: return R.drawable.wdashed_dark;
    }
  }

  int hand() {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return R.drawable.whand_light;
      case WidgetStore.THEME_DYNAMIC: return R.drawable.whand_dynamic;
      default: return R.drawable.whand_dark;
    }
  }

  int skeleton(boolean round) {
    switch (kind) {
      case WidgetStore.THEME_LIGHT: return round ? R.drawable.wskel_round_light : R.drawable.wskel_light;
      case WidgetStore.THEME_DYNAMIC: return round ? R.drawable.wskel_round_dynamic : R.drawable.wskel_dynamic;
      default: return round ? R.drawable.wskel_round_dark : R.drawable.wskel_dark;
    }
  }
}
