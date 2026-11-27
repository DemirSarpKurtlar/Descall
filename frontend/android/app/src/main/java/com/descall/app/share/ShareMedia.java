package com.descall.app.share;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.exifinterface.media.ExifInterface;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Shared files on Android: copy out of the sending app, thumbnails, exact sizes per quality,
 * and the file that is really uploaded (src/lib/share/shareModel.js QUALITY_SPEC: high =
 * 2560 px JPEG 0.82, saver = 1280 px JPEG 0.70, original = as is). Re-encoded images carry no
 * EXIF at all (no GPS); an original JPEG / PNG / WebP keeps its pixels and loses only the
 * location tags when "Konum bilgisini kaldır" is on. HEIC and other image types the upload
 * does not take become JPEG. Videos go as they are (MP4 / WebM only: Android has no
 * built-in transcoder this app ships), documents as they are.
 */
public final class ShareMedia {
  public static final long MAX_BYTES = 100L * 1024 * 1024;
  static final int THUMB_EDGE = 240;

  private ShareMedia() {}

  public static String mimeOf(ContentResolver cr, Uri uri, String name) {
    String m = cr.getType(uri);
    if (m == null || m.isEmpty() || "application/octet-stream".equals(m)) {
      String ext = MimeTypeMap.getFileExtensionFromUrl(name == null ? "" : name.replace(' ', '_'));
      String guess = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.ROOT));
      if (guess != null) m = guess;
    }
    return m == null ? "application/octet-stream" : m.toLowerCase(Locale.ROOT);
  }

  public static String nameOf(ContentResolver cr, Uri uri) {
    String name = null;
    try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
      if (c != null && c.moveToFirst()) name = c.getString(0);
    } catch (RuntimeException ignored) {
      // a provider without OpenableColumns
    }
    if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
    if (name == null || name.trim().isEmpty()) name = "file";
    name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
    return name.length() > 120 ? name.substring(name.length() - 120) : name;
  }

  /** Copies the shared content into dst; false when it is over the limit or unreadable. */
  public static boolean copy(ContentResolver cr, Uri uri, File dst) {
    try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(dst)) {
      if (in == null) return false;
      byte[] buf = new byte[64 * 1024];
      long total = 0;
      int n;
      while ((n = in.read(buf)) > 0) {
        total += n;
        if (total > MAX_BYTES * 4) return false; // even a big video gets no further
        out.write(buf, 0, n);
      }
      return true;
    } catch (IOException | SecurityException e) {
      return false;
    }
  }

  public static String kindOf(String mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "file";
  }

  static boolean uploadableImage(String mime) {
    return "image/jpeg".equals(mime) || "image/png".equals(mime) || "image/webp".equals(mime) || "image/gif".equals(mime);
  }

  static boolean uploadableVideo(String mime) {
    return "video/mp4".equals(mime) || "video/webm".equals(mime);
  }

  static int orientation(File f) {
    try {
      return new ExifInterface(f.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
    } catch (IOException | RuntimeException e) {
      return ExifInterface.ORIENTATION_NORMAL;
    }
  }

  static Bitmap rotate(Bitmap b, int orientation) {
    Matrix m = new Matrix();
    switch (orientation) {
      case ExifInterface.ORIENTATION_ROTATE_90: m.postRotate(90); break;
      case ExifInterface.ORIENTATION_ROTATE_180: m.postRotate(180); break;
      case ExifInterface.ORIENTATION_ROTATE_270: m.postRotate(270); break;
      case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: m.postScale(-1, 1); break;
      case ExifInterface.ORIENTATION_FLIP_VERTICAL: m.postScale(1, -1); break;
      default: return b;
    }
    Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
    if (r != b) b.recycle();
    return r;
  }

  /** Decoded at most maxEdge on the long side (0 = full size), upright. */
  static Bitmap decode(File f, int maxEdge) {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(f.getPath(), bounds);
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
    int sample = 1;
    if (maxEdge > 0) {
      while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2;
    }
    BitmapFactory.Options opts = new BitmapFactory.Options();
    opts.inSampleSize = sample;
    Bitmap b;
    try {
      b = BitmapFactory.decodeFile(f.getPath(), opts);
    } catch (OutOfMemoryError e) {
      return null;
    }
    if (b == null) return null;
    if (maxEdge > 0) {
      int edge = Math.max(b.getWidth(), b.getHeight());
      if (edge > maxEdge) {
        float s = (float) maxEdge / edge;
        Bitmap scaled = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * s)), Math.max(1, Math.round(b.getHeight() * s)), true);
        if (scaled != b) b.recycle();
        b = scaled;
      }
    }
    return rotate(b, orientation(f));
  }

  static final class CountingStream extends OutputStream {
    long count;
    @Override public void write(int b) { count++; }
    @Override public void write(byte[] b, int off, int len) { count += len; }
  }

  static int edgeFor(String quality) {
    return "saver".equals(quality) ? 1280 : "high".equals(quality) ? 2560 : 0;
  }

  static int jpegFor(String quality) {
    return "saver".equals(quality) ? 70 : "high".equals(quality) ? 82 : 92;
  }

  /** Bytes the image takes at a quality (exact: encoded into a counter). */
  public static long imageBytes(File f, String mime, String quality) {
    if ("original".equals(quality) && uploadableImage(mime)) return f.length();
    if ("image/gif".equals(mime)) return f.length();
    Bitmap b = decode(f, edgeFor(quality));
    if (b == null) return f.length();
    CountingStream c = new CountingStream();
    b.compress(b.hasAlpha() ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, jpegFor(quality), c);
    b.recycle();
    return Math.max(1, c.count);
  }

  /** data:image/jpeg thumbnail (≈240 px) for the attachment strip. */
  public static String thumb(File f, String kind) {
    Bitmap b = null;
    if ("image".equals(kind)) b = decode(f, THUMB_EDGE);
    else if ("video".equals(kind)) {
      MediaMetadataRetriever r = new MediaMetadataRetriever();
      try {
        r.setDataSource(f.getPath());
        Bitmap frame = r.getFrameAtTime(0);
        if (frame != null) {
          int edge = Math.max(frame.getWidth(), frame.getHeight());
          float s = Math.min(1f, (float) THUMB_EDGE / edge);
          b = Bitmap.createScaledBitmap(frame, Math.max(1, Math.round(frame.getWidth() * s)), Math.max(1, Math.round(frame.getHeight() * s)), true);
          if (b != frame) frame.recycle();
        }
      } catch (RuntimeException ignored) {
        // not a video the platform can read
      } finally {
        try { r.release(); } catch (Exception ignored) { /* ignore */ }
      }
    }
    if (b == null) return null;
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    b.compress(Bitmap.CompressFormat.JPEG, 72, out);
    b.recycle();
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
  }

  public static long videoDurationMs(File f) {
    MediaMetadataRetriever r = new MediaMetadataRetriever();
    try {
      r.setDataSource(f.getPath());
      String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
      return d == null ? 0 : Long.parseLong(d);
    } catch (RuntimeException e) {
      return 0;
    } finally {
      try { r.release(); } catch (Exception ignored) { /* ignore */ }
    }
  }

  /** The file that goes up for this quality: { file, mime, name }. */
  public static JSONObject prepare(Context ctx, String jobId, int index, File src, String mime, String name, String quality, boolean stripLocation) throws IOException {
    JSONObject out = new JSONObject();
    String kind = kindOf(mime);
    File work = ShareStore.work(ctx, jobId);
    try {
      if ("image".equals(kind) && !"image/gif".equals(mime)) {
        boolean keep = "original".equals(quality) && uploadableImage(mime);
        if (keep) {
          File dst = new File(work, index + "-" + ShareStore.safe(name));
          copyFile(src, dst);
          if (stripLocation && !"image/gif".equals(mime)) stripGps(dst);
          out.put("file", dst.getPath()).put("mime", mime).put("name", name);
          return out;
        }
        Bitmap b = decode(src, edgeFor(quality));
        if (b == null) throw new IOException("decode");
        boolean png = b.hasAlpha();
        File dst = new File(work, index + (png ? ".png" : ".jpg"));
        try (OutputStream o = new FileOutputStream(dst)) {
          b.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, jpegFor(quality), o);
        } finally {
          b.recycle();
        }
        String base = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name;
        out.put("file", dst.getPath()).put("mime", png ? "image/png" : "image/jpeg").put("name", base + (png ? ".png" : ".jpg"));
        return out;
      }
      out.put("file", src.getPath()).put("mime", mime).put("name", name);
      return out;
    } catch (org.json.JSONException e) {
      throw new IOException(e);
    }
  }

  static void stripGps(File f) {
    try {
      ExifInterface exif = new ExifInterface(f.getPath());
      String[] tags = {
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE,
        ExifInterface.TAG_GPS_LONGITUDE_REF, ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
        ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP, ExifInterface.TAG_GPS_PROCESSING_METHOD,
        ExifInterface.TAG_GPS_AREA_INFORMATION, ExifInterface.TAG_GPS_SPEED, ExifInterface.TAG_GPS_SPEED_REF,
        ExifInterface.TAG_GPS_IMG_DIRECTION, ExifInterface.TAG_GPS_IMG_DIRECTION_REF, ExifInterface.TAG_GPS_DEST_LATITUDE,
        ExifInterface.TAG_GPS_DEST_LONGITUDE, ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_SOFTWARE,
        ExifInterface.TAG_CAMERA_OWNER_NAME, ExifInterface.TAG_BODY_SERIAL_NUMBER, ExifInterface.TAG_LENS_SERIAL_NUMBER,
      };
      for (String t : tags) exif.setAttribute(t, null);
      exif.saveAttributes();
    } catch (IOException | RuntimeException ignored) {
      // a format ExifInterface cannot write: the pixels still go, unchanged
    }
  }

  static void copyFile(File src, File dst) throws IOException {
    try (InputStream in = new java.io.FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
      byte[] buf = new byte[64 * 1024];
      int n;
      while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
  }

  public static boolean unsupportedVideo(String mime) {
    return mime.startsWith("video/") && !uploadableVideo(mime);
  }
}
