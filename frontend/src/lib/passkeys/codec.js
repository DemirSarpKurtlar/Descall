/**
 * WebAuthn JSON <-> browser objects (no dependency). The server speaks the WebAuthn L3
 * JSON forms (PublicKeyCredentialCreationOptionsJSON / RequestOptionsJSON in,
 * RegistrationResponseJSON / AuthenticationResponseJSON out, every binary as base64url).
 * The native paths (Android Credential Manager, iOS plugin, Windows webauthn.dll) take and
 * return the same JSON, so only the web path needs this conversion.
 */

export function base64urlToBuffer(value) {
  const s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function bufferToBase64url(buffer) {
  if (buffer == null) return null;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(ArrayBuffer.isView(buffer) ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const descriptor = (d) => ({ type: "public-key", id: base64urlToBuffer(d.id), ...(Array.isArray(d.transports) && d.transports.length ? { transports: d.transports } : {}) });

/** Server creation options JSON -> PublicKeyCredentialCreationOptions. */
export function toCreationOptions(json) {
  if (!json || typeof json !== "object") throw new TypeError("creation options missing");
  return {
    ...json,
    challenge: base64urlToBuffer(json.challenge),
    user: { ...json.user, id: base64urlToBuffer(json.user?.id) },
    excludeCredentials: (json.excludeCredentials || []).map(descriptor),
  };
}

/** Server request options JSON -> PublicKeyCredentialRequestOptions. */
export function toRequestOptions(json) {
  if (!json || typeof json !== "object") throw new TypeError("request options missing");
  const out = { ...json, challenge: base64urlToBuffer(json.challenge) };
  if (Array.isArray(json.allowCredentials)) out.allowCredentials = json.allowCredentials.map(descriptor);
  return out;
}

function extensionResults(cred) {
  try {
    const r = typeof cred.getClientExtensionResults === "function" ? cred.getClientExtensionResults() : {};
    return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : {};
  } catch {
    return {};
  }
}

/** PublicKeyCredential (from create) -> RegistrationResponseJSON. */
export function registrationToJSON(cred) {
  const r = cred.response;
  let transports = [];
  try {
    transports = typeof r.getTransports === "function" ? r.getTransports() || [] : [];
  } catch {
    transports = [];
  }
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(r.clientDataJSON),
      attestationObject: bufferToBase64url(r.attestationObject),
      transports,
    },
    clientExtensionResults: extensionResults(cred),
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
  };
}

/** PublicKeyCredential (from get) -> AuthenticationResponseJSON. */
export function authenticationToJSON(cred) {
  const r = cred.response;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(r.clientDataJSON),
      authenticatorData: bufferToBase64url(r.authenticatorData),
      signature: bufferToBase64url(r.signature),
      ...(r.userHandle && r.userHandle.byteLength ? { userHandle: bufferToBase64url(r.userHandle) } : {}),
    },
    clientExtensionResults: extensionResults(cred),
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
  };
}
