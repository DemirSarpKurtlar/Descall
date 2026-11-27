package com.descall.app.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * Downscaled avatar copies for the widgets and the call notification, in the app's private
 * no-backup directory. Downloads only from the refresh worker / a background thread (https,
 * 6 s, 1 MB cap, redirects off), stored as a 128 px square PNG; rendering only reads the disk.
 * Old files go after 14 days and the folder never holds more than MAX_FILES.
 */
public final class AvatarCache {
  static final int STORE_PX = 128;
  static final int MAX_FILES = 160;
  static final long MAX_AGE_MS = 14L * 24 * 60 * 60 * 1000;
  static final long REFETCH_MS = 24L * 60 * 60 * 1000;
  private static final int MAX_BYTES = 1024 * 1024;

  private AvatarCache() {}

  static File dir(Context c) {
    File d = new File(c.getApplicationContext().getNoBackupFilesDir(), "widget_avatars");
    if (!d.exists()) d.mkdirs();
    return d;
  }

  static String keyFor(String url) {
    try {
      byte[] h = MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < 16; i++) sb.append(String.format("%02x", h[i]));
      return sb.toString();
    } catch (Exception e) {
      return Integer.toHexString(url.hashCode());
    }
  }

  static File fileFor(Context c, String url) {
    return new File(dir(c), keyFor(url) + ".png");
  }

  /** The cached square avatar, or null (never touches the network). */
  public static Bitmap get(Context c, String url) {
    if (url == null || !url.startsWith("https://")) return null;
    File f = fileFor(c, url);
    if (!f.exists()) return null;
    try {
      return BitmapFactory.decodeFile(f.getAbsolutePath());
    } catch (OutOfMemoryError | RuntimeException e) {
      return null;
    }
  }

  /** Download what is missing or a day old. Call off the main thread. */
  public static void prefetch(Context c, List<String> urls) {
    long now = System.currentTimeMillis();
    int fetched = 0;
    for (String url : urls) {
      if (url == null || !url.startsWith("https://") || fetched >= 40) continue;
      File f = fileFor(c, url);
      if (f.exists() && now - f.lastModified() < REFETCH_MS) continue;
      Bitmap b = download(url);
      fetched++;
      if (b == null) continue;
      write(f, b);
      b.recycle();
    }
    prune(c, now);
  }

  /** One avatar now (the call notification), cached for next time. */
  public static Bitmap fetch(Context c, String url) {
    Bitmap cached = get(c, url);
    if (cached != null) return cached;
    if (url == null || !url.startsWith("https://")) return null;
    Bitmap b = download(url);
    if (b != null) write(fileFor(c, url), b);
    return b;
  }

  public static void clear(Context c) {
    File[] files = dir(c).listFiles();
    if (files == null) return;
    for (File f : files) f.delete();
  }

  private static void write(File f, Bitmap b) {
    File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
    try (FileOutputStream out = new FileOutputStream(tmp)) {
      b.compress(Bitmap.CompressFormat.PNG, 100, out);
      out.flush();
    } catch (Exception e) {
      tmp.delete();
      return;
    }
    if (!tmp.renameTo(f)) tmp.delete();
  }

  static void prune(Context c, long now) {
    File[] files = dir(c).listFiles();
    if (files == null) return;
    Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
    for (int i = 0; i < files.length; i++) {
      if (i >= MAX_FILES || now - files[i].lastModified() > MAX_AGE_MS) files[i].delete();
    }
  }

  /** Square center crop at STORE_PX. */
  static Bitmap download(String url) {
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) new URL(url).openConnection();
      conn.setConnectTimeout(6000);
      conn.setReadTimeout(6000);
      conn.setInstanceFollowRedirects(true);
      conn.setUseCaches(false);
      if (conn.getResponseCode() != 200) return null;
      byte[] bytes;
      try (InputStream in = conn.getInputStream(); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
        byte[] chunk = new byte[16 * 1024];
        int n;
        while ((n = in.read(chunk)) != -1) {
          buf.write(chunk, 0, n);
          if (buf.size() > MAX_BYTES) return null;
        }
        bytes = buf.toByteArray();
      }
      if (!conn.getURL().getProtocol().equals("https")) return null;
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
      int sample = 1;
      while (bounds.outWidth / (sample * 2) >= STORE_PX && bounds.outHeight / (sample * 2) >= STORE_PX) sample *= 2;
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inSampleSize = sample;
      Bitmap raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
      if (raw == null) return null;
      int side = Math.min(raw.getWidth(), raw.getHeight());
      Bitmap square = Bitmap.createBitmap(raw, (raw.getWidth() - side) / 2, (raw.getHeight() - side) / 2, side, side);
      Bitmap out = Bitmap.createScaledBitmap(square, STORE_PX, STORE_PX, true);
      // createBitmap / createScaledBitmap may hand back their input: recycle only what is not out.
      if (square != raw && square != out) square.recycle();
      if (raw != out) raw.recycle();
      return out;
    } catch (Exception | OutOfMemoryError e) {
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }
}
