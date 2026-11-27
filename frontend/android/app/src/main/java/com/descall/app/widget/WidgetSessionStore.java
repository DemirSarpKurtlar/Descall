package com.descall.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The widgets' own copy of the signed-in session (token, API origin, user id).
 *
 * The web app keeps its token in the WebView's localStorage, which native code cannot read,
 * so the page hands a copy to DescallWidgetsPlugin on sign-in and removes it on sign-out.
 * It is stored in this app's private SharedPreferences (never exported, allowBackup=false),
 * encrypted with an AES-256-GCM key that lives in the Android Keystore and never leaves it
 * (the same scheme EncryptedSharedPreferences uses, without the deprecated library).
 * Nothing here logs a value. A Keystore failure (a device reset of the keystore, a
 * corrupted entry) reads as "signed out": the widgets ask the user to open the app once.
 */
public final class WidgetSessionStore {
  private static final String PREFS = "descall_widget_session";
  private static final String KEY_ALIAS = "descall_widget_session_v1";
  private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
  private static final String FIELD_BLOB = "blob";
  private static final int GCM_TAG_BITS = 128;
  private static final int MAX_TOKEN = 4096;
  private static final Pattern USER_ID = Pattern.compile("^[0-9A-Za-z-]{1,64}$");

  private static final Object LOCK = new Object();

  private WidgetSessionStore() {}

  /** The signed-in session the widgets use; immutable. */
  public static final class Session {
    public final String token;
    public final String apiBase;
    public final String userId;

    Session(String token, String apiBase, String userId) {
      this.token = token;
      this.apiBase = apiBase;
      this.userId = userId;
    }
  }

  /** True when the values are worth storing (the token is opaque, only its size is checked). */
  static boolean isValid(String token, String userId) {
    return token != null && !token.trim().isEmpty() && token.length() <= MAX_TOKEN
      && token.indexOf('\n') < 0 && token.indexOf('\r') < 0
      && userId != null && USER_ID.matcher(userId).matches();
  }

  public static boolean save(Context context, String token, String apiBase, String userId) {
    if (!isValid(token, userId)) return false;
    String base = WidgetApi.validatedBase(apiBase);
    String plain = userId + "\n" + base + "\n" + token.trim();
    synchronized (LOCK) {
      try {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        byte[] iv = cipher.getIV();
        byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        byte[] blob = new byte[1 + iv.length + sealed.length];
        blob[0] = (byte) iv.length;
        System.arraycopy(iv, 0, blob, 1, iv.length);
        System.arraycopy(sealed, 0, blob, 1 + iv.length, sealed.length);
        return prefs(context).edit().putString(FIELD_BLOB, Base64.encodeToString(blob, Base64.NO_WRAP)).commit();
      } catch (Exception e) {
        prefs(context).edit().remove(FIELD_BLOB).commit();
        return false;
      }
    }
  }

  /** The stored session, or null (signed out, or the Keystore entry is gone). */
  public static Session load(Context context) {
    synchronized (LOCK) {
      String stored = prefs(context).getString(FIELD_BLOB, null);
      if (stored == null) return null;
      try {
        byte[] blob = Base64.decode(stored, Base64.NO_WRAP);
        int ivLen = blob[0] & 0xFF;
        if (ivLen < 12 || ivLen > 32 || blob.length <= 1 + ivLen) return null;
        SecretKey key = key(false);
        if (key == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = new byte[ivLen];
        System.arraycopy(blob, 1, iv, 0, ivLen);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plain = cipher.doFinal(blob, 1 + ivLen, blob.length - 1 - ivLen);
        String[] parts = new String(plain, StandardCharsets.UTF_8).split("\n", 3);
        if (parts.length != 3 || !isValid(parts[2], parts[0])) return null;
        return new Session(parts[2], WidgetApi.validatedBase(parts[1]), parts[0]);
      } catch (Exception e) {
        return null;
      }
    }
  }

  public static boolean hasSession(Context context) {
    return prefs(context).contains(FIELD_BLOB);
  }

  /** Sign-out, a 401 from the API, or a different user signing in. */
  public static void clear(Context context) {
    synchronized (LOCK) {
      prefs(context).edit().clear().commit();
    }
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static SecretKey key(boolean create) throws Exception {
    KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
    ks.load(null);
    KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
    if (entry instanceof KeyStore.SecretKeyEntry) {
      return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
    }
    if (!create) return null;
    KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
    gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build());
    return gen.generateKey();
  }
}
