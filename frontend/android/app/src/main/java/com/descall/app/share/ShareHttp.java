package com.descall.app.share;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * HTTP for the share worker: the same calls as src/lib/share/shareApi.js. The upload is a
 * streamed multipart body (fixed length, 64 KB chunks: a 100 MB video never sits in memory).
 * A transport failure is an IOException (the worker waits for the network and retries);
 * an HTTP error is HttpError with the status and the server's error code.
 */
public final class ShareHttp {
  public interface Progress {
    void onProgress(long sent, long total);
  }

  public static final class HttpError extends IOException {
    public final int status;
    public final String code;

    HttpError(int status, String code) {
      super("HTTP " + status + " " + code);
      this.status = status;
      this.code = code;
    }
  }

  private final String base;
  private final String token;
  public volatile boolean cancelled;

  public ShareHttp(String apiBase, String token) {
    this.base = validBase(apiBase);
    this.token = token == null ? "" : token;
  }

  /** https Descall hosts only (the token never goes anywhere else); production otherwise. */
  static String validBase(String raw) {
    try {
      URL u = new URL(raw);
      String host = u.getHost().toLowerCase(java.util.Locale.ROOT);
      boolean ok = "https".equals(u.getProtocol())
        && (host.equals("des-call.onrender.com") || host.equals("descall.com") || host.equals("www.descall.com") || host.endsWith(".descall.com"));
      if (ok) return "https://" + host + (u.getPort() > 0 && u.getPort() != 443 ? ":" + u.getPort() : "");
    } catch (Exception ignored) {
      // fall through
    }
    return "https://des-call.onrender.com";
  }

  private HttpURLConnection open(String path, String method) throws IOException {
    HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
    c.setRequestMethod(method);
    c.setConnectTimeout(15000);
    c.setReadTimeout(60000);
    c.setUseCaches(false);
    c.setRequestProperty("Accept", "application/json");
    c.setRequestProperty("X-Descall-Client", "android-share");
    if (!token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
    return c;
  }

  private static JSONObject read(HttpURLConnection c) throws IOException {
    int status = c.getResponseCode();
    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
    String body = "";
    if (in != null) {
      try (InputStream s = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
        byte[] b = new byte[8192];
        int n;
        while ((n = s.read(b)) > 0 && buf.size() < 1024 * 1024) buf.write(b, 0, n);
        body = buf.toString("UTF-8");
      }
    }
    JSONObject json;
    try {
      json = body.isEmpty() ? new JSONObject() : new JSONObject(body);
    } catch (JSONException e) {
      json = new JSONObject();
    }
    if (status < 200 || status >= 300) {
      String code = json.optString("error", json.optString("code", status == 401 ? "unauthorized" : "http_" + status));
      if (status == 413) code = "too_large";
      if (status == 415) code = "type";
      throw new HttpError(status, code);
    }
    return json;
  }

  public JSONObject postJson(String path, JSONObject body) throws IOException {
    HttpURLConnection c = open(path, "POST");
    try {
      byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
      c.setDoOutput(true);
      c.setFixedLengthStreamingMode(bytes.length);
      c.setRequestProperty("Content-Type", "application/json");
      try (OutputStream o = c.getOutputStream()) {
        o.write(bytes);
      }
      return read(c);
    } finally {
      c.disconnect();
    }
  }

  /** POST /api/media/upload (purpose=message): { url, mediaType, mimeType, size, originalName }. */
  public JSONObject upload(File file, String name, String mime, Progress progress) throws IOException {
    String boundary = "----descall" + UUID.randomUUID().toString().replace("-", "");
    String safeName = name.replace("\"", "_").replace("\r", "_").replace("\n", "_");
    byte[] head = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nmessage\r\n"
      + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + safeName + "\"\r\n"
      + "Content-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
    long total = file.length();
    HttpURLConnection c = open("/api/media/upload", "POST");
    c.setReadTimeout(120000);
    try {
      c.setDoOutput(true);
      c.setFixedLengthStreamingMode(head.length + total + tail.length);
      c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      try (OutputStream o = c.getOutputStream(); InputStream in = new FileInputStream(file)) {
        o.write(head);
        byte[] buf = new byte[64 * 1024];
        long sent = 0;
        long lastTick = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
          if (cancelled) throw new IOException("cancelled");
          o.write(buf, 0, n);
          sent += n;
          long now = System.currentTimeMillis();
          if (progress != null && now - lastTick > 300) {
            lastTick = now;
            progress.onProgress(sent, total);
          }
        }
        o.write(tail);
        if (progress != null) progress.onProgress(total, total);
      }
      return read(c);
    } finally {
      c.disconnect();
    }
  }
}
