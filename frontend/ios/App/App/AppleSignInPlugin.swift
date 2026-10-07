import Foundation
import Capacitor
import AuthenticationServices

/// Native Sign in with Apple (AuthenticationServices), exposed to JS as `AppleSignIn`.
///
/// `authorize()` resolves with:
///   identityToken      – JWT the backend verifies against Apple's keys (aud = bundle id)
///   authorizationCode  – one-time code the backend exchanges for a refresh token
///                        (needed to revoke the Apple token when the account is deleted)
///   user, email, givenName, familyName – Apple only sends email/name on the FIRST authorization.
/// Rejects with code "canceled" when the user closes the sheet.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.pendingCall != nil {
                call.reject("Sign in with Apple is already in progress.", "in_progress")
                return
            }
            self.pendingCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = call.getString("nonce"), !nonce.isEmpty {
                request.nonce = nonce
            }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Unexpected credential type.", "invalid_credential")
            return
        }
        guard let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return an identity token.", "no_token")
            return
        }
        var result: [String: Any] = [
            "identityToken": identityToken,
            "user": credential.user,
        ]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        if let email = credential.email { result["email"] = email }
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was canceled.", "canceled")
            return
        }
        call.reject(error.localizedDescription, "failed")
    }
}
