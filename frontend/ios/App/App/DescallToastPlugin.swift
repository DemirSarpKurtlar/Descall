import Capacitor
import UIKit

/// 3.0.0 (A4, native glass #07). JS name: DescallToast.
///   show({ id, title, sub, name, seed, avatar, color, online, action, duration }) → { id }
///   hide({ id })
/// Events: "capsule" { id, action: tap | double | message | dismiss | timeout | expand }.
/// Avatar: https URL or a data:image base64 (≤ 400 KB); anything else falls back to letters.
@objc(DescallToastPlugin)
public class DescallToastPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallToastPlugin"
    public let jsName = "DescallToast"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
    ]

    private weak var current: DescallToastCapsule?
    private static let images: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 4
        config.timeoutIntervalForResource = 6
        return URLSession(configuration: config)
    }()

    @objc func show(_ call: CAPPluginCall) {
        guard let args = DescallToast.parse(call.options as? [String: Any] ?? [:]) else {
            call.reject("invalid")
            return
        }
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController?.view, host.window != nil else {
                call.reject("no_view")
                return
            }
            self.present(args, in: host)
            call.resolve(["id": args.id])
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async {
            if let c = self.current, id == nil || c.args.id == id { c.leave(nil) }
            call.resolve()
        }
    }

    func present(_ args: DescallToast.Args, in host: UIView) {
        current?.leave(nil)
        let capsule = DescallToastCapsule(args: args)
        capsule.onEvent = { [weak self] event in
            self?.notifyListeners("capsule", data: ["id": args.id, "action": event.rawValue])
        }
        capsule.attach(to: host)
        current = capsule
        switch args.avatar {
        case .none:
            break
        case .inline(let data):
            capsule.setAvatar(UIImage(data: data))
        case .remote(let url):
            Self.images.dataTask(with: url) { [weak capsule] data, response, _ in
                guard let data, data.count <= 2 * 1024 * 1024,
                      (response as? HTTPURLResponse)?.statusCode ?? 0 == 200,
                      let image = UIImage(data: data) else { return }
                DispatchQueue.main.async { capsule?.setAvatar(image) }
            }.resume()
        }
        capsule.present()
    }
}

#if DEBUG
/// `-DescallToastDemo` (Debug builds only): shows the #07 capsule ("Mert çevrimiçi")
/// over the app and keeps it on screen, so CI can screenshot it on the simulator.
enum DescallToastDemo {
    private static var shown = false

    static func showIfAsked(in host: UIView) {
        guard !shown, ProcessInfo.processInfo.arguments.contains("-DescallToastDemo"), host.window != nil else { return }
        shown = true
        guard var args = DescallToast.parse([
            "id": "demo", "title": "Mert çevrimiçi", "sub": "Az önce bağlandı",
            "name": "Mert", "seed": "demo-mert4", "online": true, "action": "Mesaj",
        ]) else { return }
        args.duration = 3600
        let capsule = DescallToastCapsule(args: args)
        capsule.attach(to: host)
        capsule.present()
    }
}
#endif
