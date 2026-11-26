import Foundation
import Capacitor
import AuthenticationServices

/// Passkeys (WebAuthn) for rp id descall.com, exposed to JS as `DescallPasskey`
/// (src/lib/passkeys/index.js). The WKWebView origin is capacitor://localhost, so the
/// ceremony runs natively with ASAuthorizationPlatformPublicKeyCredentialProvider (iCloud
/// Keychain, other passkey providers, a nearby phone) plus security keys for sign-in. iOS
/// checks the associated domain webcredentials:descall.com (App.*.entitlements) against
/// https://descall.com/.well-known/apple-app-site-association (webcredentials Q9R78TPNXS.com.descall.app).
/// clientDataJSON then carries origin https://descall.com, which the server accepts.
///
///   isAvailable() -> { available, reason }   iOS 16+ (passkeys); older iOS hides the feature
///   create({ options }) -> { response }      creation options JSON -> RegistrationResponseJSON
///   get({ options })    -> { response }      request options JSON  -> AuthenticationResponseJSON
///   cancel()
///   autofill({ options }) -> { response }   iOS 16+: the passkey suggestion above the keyboard
///                                         (QuickType bar) while the username field is focused;
///                                         resolves when the person picks it, rejects "canceled"
///                                         on autofillCancel() or when a modal request starts.
///   autofillCancel()
///
/// Rejects with codes src/lib/passkeys/errors.js maps: canceled, already_registered, domain,
/// unsupported, busy, failed (DescallPasskeyLogic.errorCode).
@objc(DescallPasskeyPlugin)
public class DescallPasskeyPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "DescallPasskeyPlugin"
    public let jsName = "DescallPasskey"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "autofill", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "autofillCancel", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?
    // The keyboard (AutoFill-assisted) request runs on its own controller so a modal
    // request can replace it without the two answers crossing.
    private var autofillCall: CAPPluginCall?
    private var autofillController: ASAuthorizationController?

    @objc func autofill(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys need iOS 16 or newer.", "unsupported")
            return
        }
        guard let json = call.getString("options") else {
            call.reject("Missing passkey options.", "failed")
            return
        }
        let parsed: DescallPasskeyLogic.RequestOptions
        switch DescallPasskeyLogic.parseRequestOptions(json) {
        case let .success(o): parsed = o
        case .failure(.wrongRelyingParty):
            call.reject("Unexpected relying party.", "domain")
            return
        case .failure:
            call.reject("Invalid passkey options.", "failed")
            return
        }
        DispatchQueue.main.async {
            self.stopAutofill(reason: "aborted")
            if self.pendingCall != nil {
                call.reject("Another passkey request is open.", "busy")
                return
            }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: parsed.rpId)
            let request = provider.createCredentialAssertionRequest(challenge: parsed.challenge)
            request.userVerificationPreference = .required
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.autofillCall = call
            self.autofillController = controller
            controller.performAutoFillAssistedRequests()
        }
    }

    @objc func autofillCancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopAutofill(reason: "aborted")
            call.resolve()
        }
    }

    /// Main thread only. Ends the keyboard request (if any) and answers its call once.
    private func stopAutofill(reason: String) {
        guard let c = autofillController else { return }
        let pending = autofillCall
        autofillCall = nil
        autofillController = nil
        if #available(iOS 16.0, *) {
            c.cancel()
        }
        pending?.reject("The passkey suggestion was closed.", reason)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false, "reason": "os_too_old"])
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 16.0, *) {
                self.controller?.cancel()
            }
            call.resolve()
        }
    }

    @objc func create(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys need iOS 16 or newer.", "unsupported")
            return
        }
        guard let json = call.getString("options") else {
            call.reject("Missing passkey options.", "failed")
            return
        }
        let parsed: DescallPasskeyLogic.CreationOptions
        switch DescallPasskeyLogic.parseCreationOptions(json) {
        case let .success(o): parsed = o
        case .failure(.wrongRelyingParty):
            call.reject("Unexpected relying party.", "domain")
            return
        case .failure:
            call.reject("Invalid passkey options.", "failed")
            return
        }
        DispatchQueue.main.async {
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: parsed.rpId)
            let request = provider.createCredentialRegistrationRequest(challenge: parsed.challenge, name: parsed.userName, userID: parsed.userId)
            request.userVerificationPreference = .required
            if #available(iOS 17.4, *) {
                request.excludedCredentials = parsed.excludeCredentialIds.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
            }
            self.startRequests([request], call: call)
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys need iOS 16 or newer.", "unsupported")
            return
        }
        guard let json = call.getString("options") else {
            call.reject("Missing passkey options.", "failed")
            return
        }
        let parsed: DescallPasskeyLogic.RequestOptions
        switch DescallPasskeyLogic.parseRequestOptions(json) {
        case let .success(o): parsed = o
        case .failure(.wrongRelyingParty):
            call.reject("Unexpected relying party.", "domain")
            return
        case .failure:
            call.reject("Invalid passkey options.", "failed")
            return
        }
        DispatchQueue.main.async {
            let platform = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: parsed.rpId)
            let request = platform.createCredentialAssertionRequest(challenge: parsed.challenge)
            request.userVerificationPreference = .required
            if !parsed.allowCredentialIds.isEmpty {
                request.allowedCredentials = parsed.allowCredentialIds.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
            }
            var requests: [ASAuthorizationRequest] = [request]
            if parsed.allowCredentialIds.isEmpty {
                // Discoverable sign-in: security keys (USB-C / Lightning / NFC) work too.
                let keys = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: parsed.rpId)
                let keyRequest = keys.createCredentialAssertionRequest(challenge: parsed.challenge)
                keyRequest.userVerificationPreference = .required
                requests.append(keyRequest)
            }
            self.startRequests(requests, call: call)
        }
    }

    /// Main thread only.
    private func startRequests(_ requests: [ASAuthorizationRequest], call: CAPPluginCall) {
        if pendingCall != nil {
            call.reject("Another passkey request is open.", "busy")
            return
        }
        stopAutofill(reason: "aborted")
        pendingCall = call
        let controller = ASAuthorizationController(authorizationRequests: requests)
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    private func finish() -> CAPPluginCall? {
        let call = pendingCall
        pendingCall = nil
        controller = nil
        return call
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.webView?.window ?? ASPresentationAnchor()
    }

    @available(iOS 16.0, *)
    private func attachmentName(_ credential: Any) -> String? {
        if #available(iOS 16.6, *) {
            if let reg = credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
                return reg.attachment == .crossPlatform ? "cross-platform" : "platform"
            }
            if let assertion = credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
                return assertion.attachment == .crossPlatform ? "cross-platform" : "platform"
            }
        }
        if credential is ASAuthorizationSecurityKeyPublicKeyCredentialAssertion { return "cross-platform" }
        return nil
    }

    /// The call that belongs to `controller`: the keyboard request or the modal one.
    private func callFor(_ controller: ASAuthorizationController) -> CAPPluginCall? {
        if let a = autofillController, a === controller {
            let call = autofillCall
            autofillCall = nil
            autofillController = nil
            return call
        }
        guard self.controller == nil || self.controller === controller else { return nil }
        return finish()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = callFor(controller) else { return }
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys need iOS 16 or newer.", "unsupported")
            return
        }
        let credential = authorization.credential
        if let reg = credential as? ASAuthorizationPublicKeyCredentialRegistration {
            let attestationObject: Data? = reg.rawAttestationObject
            guard let attestation = attestationObject else {
                call.reject("The passkey returned no attestation.", "failed")
                return
            }
            let json = DescallPasskeyLogic.registrationJSON(
                credentialID: reg.credentialID,
                clientDataJSON: reg.rawClientDataJSON,
                attestationObject: attestation,
                attachment: attachmentName(credential)
            )
            call.resolve(["response": json])
            return
        }
        if let assertion = credential as? ASAuthorizationPublicKeyCredentialAssertion {
            // Data or Data! depending on the SDK: read through optionals either way.
            let authDataOpt: Data? = assertion.rawAuthenticatorData
            let signatureOpt: Data? = assertion.signature
            let userHandle: Data? = assertion.userID
            guard let authData = authDataOpt, let signature = signatureOpt else {
                call.reject("The passkey returned no signature.", "failed")
                return
            }
            let json = DescallPasskeyLogic.assertionJSON(
                credentialID: assertion.credentialID,
                clientDataJSON: assertion.rawClientDataJSON,
                authenticatorData: authData,
                signature: signature,
                userHandle: userHandle,
                attachment: attachmentName(credential)
            )
            call.resolve(["response": json])
            return
        }
        call.reject("Unexpected credential type.", "failed")
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = callFor(controller) else { return }
        let ns = error as NSError
        let code = DescallPasskeyLogic.errorCode(domain: ns.domain, code: ns.code, message: ns.localizedDescription)
        call.reject(ns.localizedDescription, code)
    }
}
