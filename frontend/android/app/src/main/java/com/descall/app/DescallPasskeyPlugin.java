package com.descall.app;

import android.app.Activity;
import android.os.Build;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Passkeys through Android Credential Manager (androidx.credentials), exposed to JS as
 * "DescallPasskey" (src/lib/passkeys/index.js). The WebView origin is not descall.com, so the
 * app runs the ceremony natively: Credential Manager checks
 * https://descall.com/.well-known/assetlinks.json (relation get_login_creds, this app's signing
 * certificate) and reports origin android:apk-key-hash:<sha256 of the signing cert> in
 * clientDataJSON, which the server accepts from PASSKEY_ANDROID_CERT_SHA256.
 *
 * isAvailable() -> { available, reason }   Android 9+ (Credential Manager with Google Play
 *                                          services on Android 9 to 13, the system API on 14+)
 * create({ options }) -> { response }      options: the server's creation options JSON,
 *                                          response: RegistrationResponseJSON
 * get({ options })    -> { response }      options: request options JSON (discoverable),
 *                                          response: AuthenticationResponseJSON
 * cancel()                                 closes an open request
 *
 * Rejects with codes the JS side maps (src/lib/passkeys/errors.js): canceled, no_credential,
 * already_registered, unsupported, domain, busy, timeout, failed.
 */
@CapacitorPlugin(name = "DescallPasskey")
public class DescallPasskeyPlugin extends Plugin {

  private CancellationSignal pending;

  private static boolean osSupported() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P;
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject result = new JSObject();
    boolean ok = osSupported();
    result.put("available", ok);
    if (!ok) result.put("reason", "os_too_old");
    call.resolve(result);
  }

  /** The options JSON must parse and name the expected relying party; returns null after rejecting. */
  private String readOptions(PluginCall call, boolean create) {
    String options = call.getString("options");
    if (options == null || options.length() > 64 * 1024) {
      call.reject("Missing passkey options.", "failed");
      return null;
    }
    try {
      JSONObject json = new JSONObject(options);
      String rpId = create ? json.getJSONObject("rp").optString("id", "") : json.optString("rpId", "");
      if (!"descall.com".equals(rpId)) {
        call.reject("Unexpected relying party.", "domain");
        return null;
      }
      if (json.optString("challenge", "").length() < 32) {
        call.reject("Missing challenge.", "failed");
        return null;
      }
    } catch (Exception e) {
      call.reject("Invalid passkey options.", "failed");
      return null;
    }
    return options;
  }

  private boolean begin(PluginCall call) {
    if (!osSupported()) {
      call.reject("Passkeys need Android 9 or newer.", "unsupported");
      return false;
    }
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("The app is not in the foreground.", "failed");
      return false;
    }
    synchronized (this) {
      if (pending != null) {
        call.reject("Another passkey request is open.", "busy");
        return false;
      }
      pending = new CancellationSignal();
    }
    return true;
  }

  private synchronized void end() {
    pending = null;
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    CancellationSignal signal;
    synchronized (this) {
      signal = pending;
    }
    if (signal != null) signal.cancel();
    call.resolve();
  }

  @PluginMethod
  public void create(PluginCall call) {
    String options = readOptions(call, true);
    if (options == null || !begin(call)) return;
    CancellationSignal signal;
    synchronized (this) {
      signal = pending;
    }
    try {
      CredentialManager manager = CredentialManager.create(getContext());
      CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(options);
      manager.createCredentialAsync(
        getActivity(),
        request,
        signal,
        ContextCompat.getMainExecutor(getContext()),
        new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
          @Override
          public void onResult(CreateCredentialResponse response) {
            end();
            if (response instanceof CreatePublicKeyCredentialResponse) {
              JSObject result = new JSObject();
              result.put("response", ((CreatePublicKeyCredentialResponse) response).getRegistrationResponseJson());
              call.resolve(result);
            } else {
              call.reject("Unexpected credential type.", "failed");
            }
          }

          @Override
          public void onError(CreateCredentialException e) {
            end();
            call.reject(messageOf(e), createCode(e));
          }
        }
      );
    } catch (Exception e) {
      end();
      call.reject("Could not start the passkey request.", "failed");
    }
  }

  @PluginMethod
  public void get(PluginCall call) {
    String options = readOptions(call, false);
    if (options == null || !begin(call)) return;
    CancellationSignal signal;
    synchronized (this) {
      signal = pending;
    }
    try {
      CredentialManager manager = CredentialManager.create(getContext());
      GetPublicKeyCredentialOption option = new GetPublicKeyCredentialOption(options);
      GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
      manager.getCredentialAsync(
        getActivity(),
        request,
        signal,
        ContextCompat.getMainExecutor(getContext()),
        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
          @Override
          public void onResult(GetCredentialResponse response) {
            end();
            Credential credential = response.getCredential();
            if (credential instanceof PublicKeyCredential) {
              JSObject result = new JSObject();
              result.put("response", ((PublicKeyCredential) credential).getAuthenticationResponseJson());
              call.resolve(result);
            } else {
              call.reject("Unexpected credential type.", "failed");
            }
          }

          @Override
          public void onError(GetCredentialException e) {
            end();
            call.reject(messageOf(e), getCode(e));
          }
        }
      );
    } catch (Exception e) {
      end();
      call.reject("Could not start the passkey request.", "failed");
    }
  }

  private static String messageOf(Exception e) {
    String m = e.getMessage();
    return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
  }

  /** DOM errors arrive as typed exceptions whose type string names the WebAuthn error. */
  private static String domCode(String type) {
    String t = type == null ? "" : type.toUpperCase();
    if (t.contains("INVALID_STATE")) return "already_registered";
    if (t.contains("NOT_ALLOWED")) return "canceled";
    if (t.contains("SECURITY")) return "domain";
    if (t.contains("NOT_SUPPORTED")) return "unsupported";
    if (t.contains("TIMEOUT")) return "timeout";
    if (t.contains("ABORT")) return "canceled";
    return null;
  }

  static String createCode(CreateCredentialException e) {
    if (e instanceof CreateCredentialCancellationException) return "canceled";
    if (e instanceof CreateCredentialProviderConfigurationException) return "unsupported";
    String dom = domCode(e.getType());
    if (dom != null) return dom;
    String type = e.getType() == null ? "" : e.getType();
    if (type.contains("NO_CREATE_OPTIONS")) return "unsupported";
    if (type.contains("USER_CANCELED")) return "canceled";
    return "failed";
  }

  static String getCode(GetCredentialException e) {
    if (e instanceof GetCredentialCancellationException) return "canceled";
    if (e instanceof NoCredentialException) return "no_credential";
    if (e instanceof GetCredentialProviderConfigurationException) return "unsupported";
    String dom = domCode(e.getType());
    if (dom != null) return dom;
    String type = e.getType() == null ? "" : e.getType();
    if (type.contains("NO_CREDENTIAL")) return "no_credential";
    if (type.contains("USER_CANCELED")) return "canceled";
    return "failed";
  }
}
