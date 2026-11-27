package com.descall.app.widget;

import android.net.Uri;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Tiny client for the native glance API (backend routes/native.js, /api/native/*), the
 * Android twin of DescallKit's DescallAPIClient: Bearer session, short timeouts, one retry
 * for a cold server on GET, small capped bodies, no cookies, nothing logged.
 * The token only ever goes to an https Descall host (validatedBase).
 */
public final class WidgetApi {
  public static final String PRODUCTION = "https://des-call.onrender.com";
  static final int CONNECT_TIMEOUT_MS = 10_000;
  static final int READ_TIMEOUT_MS = 12_000;
  static final int MAX_BODY = 512 * 1024;

  /** Every way a call can fail, so callers can choose what the widget says. */
  public enum Failure { SIGNED_OUT, UNAUTHORIZED, BANNED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, SERVER, OFFLINE, TIMEOUT, DECODING }

  public static final class ApiException extends Exception {
    public final Failure failure;
    public final int status;

    ApiException(Failure failure, int status) {
      super(failure.name());
      this.failure = failure;
      this.status = status;
    }
  }

  private final WidgetSessionStore.Session session;
  private final String clientName;

  public WidgetApi(WidgetSessionStore.Session session, String clientName) {
    this.session = session;
    this.clientName = clientName;
  }

  /** Same host rule as DescallKit DescallAPIBase: https Descall hosts only, else production. */
  public static boolean isAllowedHost(String host) {
    if (host == null) return false;
    String h = host.toLowerCase(Locale.ROOT);
    return h.equals("des-call.onrender.com") || h.equals("descall.com") || h.equals("www.descall.com")
      || (h.endsWith(".descall.com") && h.length() <= 64);
  }

  public static String validatedBase(String raw) {
    if (raw == null) return PRODUCTION;
    try {
      Uri uri = Uri.parse(raw.trim());
      if (!"https".equalsIgnoreCase(uri.getScheme()) || !isAllowedHost(uri.getHost()) || uri.getUserInfo() != null) {
        return PRODUCTION;
      }
      String out = "https://" + uri.getHost().toLowerCase(Locale.ROOT);
      int port = uri.getPort();
      if (port > 0 && port != 443) out += ":" + port;
      return out;
    } catch (RuntimeException e) {
      return PRODUCTION;
    }
  }

  /** Status code to failure (200..299 never reaches here). */
  static Failure failureFor(int status, String body) {
    if (status == 401) return Failure.UNAUTHORIZED;
    if (status == 403) return body != null && body.contains("\"banned\"") ? Failure.BANNED : Failure.FORBIDDEN;
    if (status == 404) return Failure.NOT_FOUND;
    if (status == 429) return Failure.RATE_LIMITED;
    return Failure.SERVER;
  }

  public JSONObject get(String path) throws ApiException {
    try {
      return request("GET", path, null);
    } catch (ApiException e) {
      boolean retry = e.failure == Failure.TIMEOUT || e.failure == Failure.SERVER && e.status >= 500;
      if (!retry) throw e;
      // A Render instance waking up answers the second request.
      return request("GET", path, null);
    }
  }

  public JSONObject post(String path, JSONObject body) throws ApiException {
    return request("POST", path, body);
  }

  private JSONObject request(String method, String path, JSONObject body) throws ApiException {
    if (session == null) throw new ApiException(Failure.SIGNED_OUT, 0);
    HttpURLConnection conn = null;
    try {
      URL url = new URL(validatedBase(session.apiBase) + path);
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod(method);
      conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
      conn.setReadTimeout(READ_TIMEOUT_MS);
      conn.setInstanceFollowRedirects(false);
      conn.setUseCaches(false);
      conn.setRequestProperty("Authorization", "Bearer " + session.token);
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("X-Descall-Client", clientName);
      if (body != null) {
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream out = conn.getOutputStream()) {
          out.write(bytes);
        }
      }
      int status = conn.getResponseCode();
      String text = readBody(status >= 400 ? conn.getErrorStream() : conn.getInputStream());
      if (status < 200 || status >= 300) throw new ApiException(failureFor(status, text), status);
      try {
        return text.isEmpty() ? new JSONObject() : new JSONObject(text);
      } catch (Exception e) {
        throw new ApiException(Failure.DECODING, status);
      }
    } catch (ApiException e) {
      throw e;
    } catch (SocketTimeoutException e) {
      throw new ApiException(Failure.TIMEOUT, 0);
    } catch (UnknownHostException e) {
      throw new ApiException(Failure.OFFLINE, 0);
    } catch (IOException e) {
      throw new ApiException(Failure.OFFLINE, 0);
    } catch (RuntimeException e) {
      throw new ApiException(Failure.OFFLINE, 0);
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String readBody(InputStream in) throws IOException {
    if (in == null) return "";
    try (InputStream stream = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[8192];
      int n;
      while ((n = stream.read(chunk)) != -1) {
        buf.write(chunk, 0, n);
        if (buf.size() > MAX_BODY) throw new IOException("body too large");
      }
      return new String(buf.toByteArray(), StandardCharsets.UTF_8);
    }
  }
}
