package com.descall.app.widget;

import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.List;

/**
 * Draws the faces of draft B ("Yuzler"): round avatars (photo, or the first letter on a
 * gradient picked from the id), the presence glyph cut into the face's corner, the unread
 * count badge, the green speaking ring and the overlapping voice-room clusters.
 *
 * Every gap around a glyph, badge or neighbouring face is cut out (transparent), so the
 * widget's own background shows through and the same bitmap is right on the dark, light and
 * Material You surfaces (and after a day/night switch the launcher does without us).
 */
public final class FacePainter {
  public static final int ONLINE = 0xFF23A55A;
  public static final int IDLE = 0xFFFF9F0A;
  public static final int DND = 0xFFDA373C;
  public static final int OFFLINE = 0xFF80848E;
  public static final int SPEAKING = 0xFF23A55A;
  public static final int BADGE = 0xFFDA373C;

  /** Gradient pairs of the draft's people (P[...].g), chosen by a stable hash of the id. */
  private static final int[][] GRADIENTS = {
    {0xFF7C93FF, 0xFF4A68E0}, {0xFFFF8FB1, 0xFFB05CFF}, {0xFF5AC8FA, 0xFF3B5BFF}, {0xFFC6A7FF, 0xFF6A4CFF},
    {0xFFFFA27A, 0xFFE0435F}, {0xFF7EE3D2, 0xFF1F8F86}, {0xFFFFD36E, 0xFFF2803A}, {0xFFFFB7D5, 0xFFD9468B},
    {0xFF9BE77C, 0xFF2E9B52}, {0xFFB8C4FF, 0xFF5D6BD6},
  };
  /** Server tiles (SRV[...].g). */
  private static final int[][] SERVER_GRADIENTS = {
    {0xFF3A3F8F, 0xFF7B5CFF}, {0xFF0F7A6B, 0xFF2AD4B8}, {0xFFB4432C, 0xFFF2803A}, {0xFF2C5BB4, 0xFF5AC8FA},
  };

  private FacePainter() {}

  static int hash(String id) {
    int h = 7;
    for (int i = 0; i < id.length(); i++) h = h * 31 + id.charAt(i);
    return h & 0x7fffffff;
  }

  /** Decorations drawn on top of a face. */
  public static final class Deco {
    String presence;     // null = no glyph
    int count;           // 0 = no badge
    boolean speaking;    // green ring

    public static Deco none() {
      return new Deco();
    }

    public static Deco presence(String p) {
      Deco d = new Deco();
      d.presence = p;
      return d;
    }

    public static Deco count(int n) {
      Deco d = new Deco();
      d.count = n;
      return d;
    }

    public static Deco speaking() {
      Deco d = new Deco();
      d.speaking = true;
      return d;
    }

    String key() {
      return presence + "|" + count + "|" + speaking;
    }
  }

  /**
   * One face at px size (the bitmap is px x px; a badge or a speaking ring shrink the face
   * a little so they fit inside the square, as the layouts size the image for them).
   */
  public static Bitmap face(String id, String name, Bitmap photo, int px, Deco deco) {
    Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(out);
    float inset = 0f;
    if (deco.speaking) inset = px * 0.08f;
    else if (deco.count > 0) inset = px * 0.10f;
    RectF box = new RectF(inset, inset, px - inset, px - inset);
    if (deco.count > 0) box.offset(-inset, inset);
    drawCircleFace(c, box, id, name, photo);
    if (deco.speaking) {
      Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
      ring.setStyle(Paint.Style.STROKE);
      ring.setColor(SPEAKING);
      ring.setStrokeWidth(px * 0.045f);
      float r = px / 2f - ring.getStrokeWidth() / 2f;
      c.drawCircle(px / 2f, px / 2f, r, ring);
    }
    if (deco.presence != null) {
      float d = box.width();
      float cx = box.left + d * 0.84f;
      float cy = box.top + d * 0.84f;
      cut(c, cx, cy, d * 0.19f);
      glyph(c, deco.presence, cx, cy, d * 0.13f);
    }
    if (deco.count > 0) badge(c, deco.count, box, px);
    return out;
  }

  /** Overlapping 2x2 pod of up to four faces (voice rooms), size px x px. */
  public static Bitmap cluster(List<WidgetModels.Person> people, List<Bitmap> photos, int px, String speakingId) {
    Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(out);
    int n = Math.min(4, people.size());
    if (n == 0) return out;
    float s = px / 1.72f;
    float[][] pos;
    if (n == 1) pos = new float[][] {{px / 2f - s * 0.6f, px / 2f - s * 0.6f}};
    else if (n == 2) pos = new float[][] {{0, 0}, {s * 0.72f, s * 0.72f}};
    else if (n == 3) pos = new float[][] {{0, 0}, {s * 0.72f, 0}, {s * 0.36f, s * 0.72f}};
    else pos = new float[][] {{0, 0}, {s * 0.72f, 0}, {0, s * 0.72f}, {s * 0.72f, s * 0.72f}};
    float size = n == 1 ? s * 1.2f : s;
    float gap = Math.max(1.5f, px * 0.03f);
    for (int i = 0; i < n; i++) {
      WidgetModels.Person p = people.get(i);
      RectF r = new RectF(pos[i][0], pos[i][1], pos[i][0] + size, pos[i][1] + size);
      if (i > 0) cut(c, r.centerX(), r.centerY(), size / 2f + gap);
      drawCircleFace(c, r, p.id, p.name, photos.size() > i ? photos.get(i) : null);
      if (p.id.equals(speakingId)) {
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setColor(SPEAKING);
        ring.setStrokeWidth(Math.max(2f, size * 0.07f));
        c.drawCircle(r.centerX(), r.centerY(), size / 2f - ring.getStrokeWidth() / 2f, ring);
      }
    }
    return out;
  }

  /** A row of overlapping faces (call participants), heightPx tall. */
  public static Bitmap stack(List<WidgetModels.Person> people, List<Bitmap> photos, int heightPx, int max) {
    int n = Math.min(max, people.size());
    float step = heightPx * 0.72f;
    int width = Math.max(1, Math.round(n == 0 ? 1 : heightPx + step * (n - 1)));
    Bitmap out = Bitmap.createBitmap(width, heightPx, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(out);
    float gap = Math.max(1.5f, heightPx * 0.07f);
    for (int i = 0; i < n; i++) {
      WidgetModels.Person p = people.get(i);
      RectF r = new RectF(i * step, 0, i * step + heightPx, heightPx);
      if (i > 0) cut(c, r.centerX(), r.centerY(), heightPx / 2f + gap);
      drawCircleFace(c, r, p.id, p.name, photos.size() > i ? photos.get(i) : null);
    }
    return out;
  }

  /** Rounded server tile with its initials (voice widget header). */
  public static Bitmap serverTile(String id, String name, int px) {
    Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(out);
    int[] g = SERVER_GRADIENTS[hash(id) % SERVER_GRADIENTS.length];
    Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    bg.setShader(new LinearGradient(0, 0, px, px, g[0], g[1], Shader.TileMode.CLAMP));
    c.drawRoundRect(new RectF(0, 0, px, px), px * 0.3f, px * 0.3f, bg);
    drawLetters(c, new RectF(0, 0, px, px), WidgetModels.initials(name), 0.38f);
    return out;
  }

  // ---- pieces ----------------------------------------------------------------------------------

  static void drawCircleFace(Canvas c, RectF box, String id, String name, Bitmap photo) {
    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    if (photo != null && !photo.isRecycled()) {
      BitmapShader shader = new BitmapShader(photo, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
      Matrix m = new Matrix();
      float scale = box.width() / Math.min(photo.getWidth(), photo.getHeight());
      m.setScale(scale, scale);
      m.postTranslate(box.left, box.top);
      shader.setLocalMatrix(m);
      p.setShader(shader);
      c.drawOval(box, p);
      return;
    }
    int[] g = GRADIENTS[hash(id) % GRADIENTS.length];
    p.setShader(new LinearGradient(box.left, box.top, box.right, box.bottom, g[0], g[1], Shader.TileMode.CLAMP));
    c.drawOval(box, p);
    drawLetters(c, box, WidgetModels.letter(name), 0.42f);
  }

  static void drawLetters(Canvas c, RectF box, String text, float ratio) {
    Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
    t.setColor(Color.WHITE);
    t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
    t.setTextAlign(Paint.Align.CENTER);
    t.setTextSize(box.height() * ratio);
    Paint.FontMetrics fm = t.getFontMetrics();
    c.drawText(text, box.centerX(), box.centerY() - (fm.ascent + fm.descent) / 2f, t);
  }

  static void cut(Canvas c, float cx, float cy, float r) {
    Paint clear = new Paint(Paint.ANTI_ALIAS_FLAG);
    clear.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
    c.drawCircle(cx, cy, r, clear);
  }

  /** The draft's presence glyphs (pg): the shape carries the meaning, not only the colour. */
  static void glyph(Canvas c, String presence, float cx, float cy, float r) {
    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    switch (presence) {
      case "online":
        p.setColor(ONLINE);
        c.drawCircle(cx, cy, r, p);
        break;
      case "idle": {
        p.setColor(IDLE);
        Path moon = new Path();
        moon.addCircle(cx, cy, r, Path.Direction.CW);
        Path bite = new Path();
        bite.addCircle(cx - r * 0.55f, cy - r * 0.55f, r * 0.72f, Path.Direction.CW);
        moon.op(bite, Path.Op.DIFFERENCE);
        c.drawPath(moon, p);
        break;
      }
      case "dnd": {
        p.setColor(DND);
        c.drawCircle(cx, cy, r, p);
        Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        bar.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
        c.drawRoundRect(new RectF(cx - r * 0.56f, cy - r * 0.19f, cx + r * 0.56f, cy + r * 0.19f), r * 0.1f, r * 0.1f, bar);
        break;
      }
      default: {
        p.setColor(OFFLINE);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(r * 0.54f);
        c.drawCircle(cx, cy, r - p.getStrokeWidth() / 2f, p);
        break;
      }
    }
  }

  static void badge(Canvas c, int count, RectF face, int px) {
    String text = count > 99 ? "99+" : String.valueOf(count);
    float h = px * 0.40f;
    Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
    t.setColor(Color.WHITE);
    t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
    t.setTextAlign(Paint.Align.CENTER);
    t.setTextSize(h * 0.62f);
    float w = Math.max(h, t.measureText(text) + h * 0.55f);
    float right = px;
    float top = 0;
    RectF pill = new RectF(right - w, top, right, top + h);
    RectF gap = new RectF(pill);
    float g = Math.max(1.5f, px * 0.045f);
    gap.inset(-g, -g);
    Paint clear = new Paint(Paint.ANTI_ALIAS_FLAG);
    clear.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
    c.drawRoundRect(gap, gap.height() / 2f, gap.height() / 2f, clear);
    Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    bg.setColor(BADGE);
    c.drawRoundRect(pill, h / 2f, h / 2f, bg);
    Paint.FontMetrics fm = t.getFontMetrics();
    c.drawText(text, pill.centerX(), pill.centerY() - (fm.ascent + fm.descent) / 2f, t);
  }

  /** Round bitmap for the notification's Person icon. */
  public static Bitmap round(String id, String name, Bitmap photo, int px) {
    return face(id, name, photo, px, Deco.none());
  }
}
